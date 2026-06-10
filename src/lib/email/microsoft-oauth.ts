/* ── Microsoft OAuth-Login (delegiert) — "Mit Microsoft anmelden" ──
 * Authorization-Code-Flow (multi-tenant). Speichert Refresh-Token pro Konto,
 * sendet via Graph /me/sendMail mit Auto-Token-Refresh.
 */
import type { EmailAccount } from "@/lib/supabase/email-accounts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";
const SCOPES = [
  "offline_access", "openid", "email", "profile",
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/Mail.Read",
  "https://graph.microsoft.com/User.Read",
].join(" ");

export function isMicrosoftOAuthConfigured(): boolean {
  return !!(process.env.MS_OAUTH_CLIENT_ID && process.env.MS_OAUTH_CLIENT_SECRET);
}

export function buildMicrosoftAuthUrl(state: string, redirectUri: string): string {
  const p = new URLSearchParams({
    client_id: process.env.MS_OAUTH_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: SCOPES,
    state,
    prompt: "select_account",
  });
  return `${AUTHORITY}/authorize?${p.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_OAUTH_CLIENT_ID!,
      client_secret: process.env.MS_OAUTH_CLIENT_SECRET!,
      ...body,
    }).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Microsoft Token-Fehler: ${data.error_description || data.error || res.status}`);
  return data as TokenResponse;
}

export function exchangeMicrosoftCode(code: string, redirectUri: string): Promise<TokenResponse> {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

export function refreshMicrosoftToken(refreshToken: string): Promise<TokenResponse> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

export async function getMicrosoftProfile(accessToken: string): Promise<{ email: string; name: string | null }> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Graph /me-Fehler: ${data.error?.message || res.status}`);
  return { email: (data.mail || data.userPrincipalName || "").toLowerCase(), name: data.displayName || null };
}

/** Gibt ein gültiges Access-Token zurück; refresht + persistiert bei Bedarf. */
async function ensureAccessToken(account: EmailAccount): Promise<string> {
  const exp = account.oauth_token_expires_at ? new Date(account.oauth_token_expires_at).getTime() : 0;
  if (account.oauth_access_token && exp > Date.now() + 60_000) {
    return account.oauth_access_token;
  }
  if (!account.oauth_refresh_token) throw new Error("Kein Refresh-Token — Konto neu verbinden.");
  const t = await refreshMicrosoftToken(account.oauth_refresh_token);
  const admin = getSupabaseAdmin();
  await admin.from("email_accounts").update({
    oauth_access_token: t.access_token,
    oauth_token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    ...(t.refresh_token ? { oauth_refresh_token: t.refresh_token } : {}),
  }).eq("id", account.id);
  // lokales Objekt aktualisieren (für Folge-Sends im selben Lauf)
  account.oauth_access_token = t.access_token;
  account.oauth_token_expires_at = new Date(Date.now() + t.expires_in * 1000).toISOString();
  if (t.refresh_token) account.oauth_refresh_token = t.refresh_token;
  return t.access_token;
}

interface SendOptions { to: string; subject: string; htmlBody: string; replyTo?: string }

/** Versand über delegiertes Microsoft-Graph (Auto-Refresh).
 *  Mit send_as_email (Shared-Postfach): aus dieser Adresse senden — der/die
 *  angemeldete Nutzer:in braucht „Senden als"/Vollzugriff auf das Postfach. */
export async function sendViaMicrosoftOAuth(account: EmailAccount, options: SendOptions): Promise<void> {
  const accessToken = await ensureAccessToken(account);
  const sendAs = account.send_as_email?.trim();
  const message: Record<string, unknown> = {
    subject: options.subject,
    body: { contentType: "HTML", content: options.htmlBody },
    toRecipients: [{ emailAddress: { address: options.to } }],
  };
  if (sendAs) {
    message.from = { emailAddress: { address: sendAs, name: account.sender_name || sendAs } };
  }
  const replyTo = options.replyTo || account.reply_to;
  if (replyTo) message.replyTo = [{ emailAddress: { address: replyTo } }];

  // Bei Send-As über /users/{shared}/sendMail, sonst /me/sendMail
  const endpoint = sendAs
    ? `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sendAs)}/sendMail`
    : "https://graph.microsoft.com/v1.0/me/sendMail";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Graph sendMail-Fehler: ${data.error?.message || res.status}`);
  }
}

/* ── Posteingang lesen (Antwort-Erkennung / Auto-Stop) ── */

interface MsOAuthInboundMessage {
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  text: string;
  receivedAt: string;
  messageId: string;
}

/**
 * Holt eingegangene Mails seit `since` über delegiertes Graph (/me).
 * Der Mail.Read-Scope wird beim Verbinden bereits angefordert.
 */
export async function fetchRecentInboundMicrosoftOAuth(
  account: EmailAccount,
  since: Date,
  limit = 30,
): Promise<MsOAuthInboundMessage[]> {
  const accessToken = await ensureAccessToken(account);

  const url = new URL("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages");
  url.searchParams.set("$top", String(limit));
  url.searchParams.set("$orderby", "receivedDateTime desc");
  url.searchParams.set("$select", "from,subject,bodyPreview,receivedDateTime,internetMessageId");
  url.searchParams.set("$filter", `receivedDateTime ge ${since.toISOString()}`);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error(
        "Posteingang-Berechtigung fehlt — bitte das Microsoft-Konto in den E-Mail-Einstellungen einmal neu verbinden.",
      );
    }
    throw new Error(`Graph Inbox-Fehler: ${data.error?.message || res.status}`);
  }

  const items = (data.value ?? []) as Array<{
    from?: { emailAddress?: { address?: string; name?: string } };
    subject?: string;
    bodyPreview?: string;
    receivedDateTime?: string;
    internetMessageId?: string;
  }>;

  return items
    .map((m) => ({
      fromEmail: (m.from?.emailAddress?.address ?? "").toLowerCase(),
      fromName: m.from?.emailAddress?.name ?? null,
      subject: m.subject ?? null,
      text: m.bodyPreview ?? "",
      receivedAt: m.receivedDateTime ?? new Date().toISOString(),
      messageId: m.internetMessageId || `graph:${m.receivedDateTime}:${m.from?.emailAddress?.address}`,
    }))
    .filter((m) => m.fromEmail.length > 0);
}

/** Verbindungstest: gültiges Access-Token holen + Profil lesen. */
export async function testMicrosoftOAuth(account: EmailAccount): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = await ensureAccessToken(account);
    await getMicrosoftProfile(token);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Verbindung fehlgeschlagen" };
  }
}
