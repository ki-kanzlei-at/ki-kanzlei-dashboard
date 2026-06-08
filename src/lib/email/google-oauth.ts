/* ── Google OAuth-Login (delegiert) — "Mit Google anmelden" ──
 * Authorization-Code-Flow. Speichert Refresh-Token pro Konto,
 * sendet via Gmail API (users.messages.send) mit Auto-Token-Refresh.
 * Spiegelt das Microsoft-OAuth-Pattern (microsoft-oauth.ts).
 */
import type { EmailAccount } from "@/lib/supabase/email-accounts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

const SCOPES = [
  "openid", "email", "profile",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

export function isGoogleOAuthConfigured(): boolean {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function buildGoogleAuthUrl(state: string, redirectUri: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
    access_type: "offline",   // Refresh-Token erhalten
    prompt: "consent",        // erzwingt refresh_token auch bei erneutem Login
    include_granted_scopes: "true",
  });
  return `${AUTH_URL}?${p.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      ...body,
    }).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Google Token-Fehler: ${data.error_description || data.error || res.status}`);
  return data as TokenResponse;
}

export function exchangeGoogleCode(code: string, redirectUri: string): Promise<TokenResponse> {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}
export function refreshGoogleToken(refreshToken: string): Promise<TokenResponse> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

export async function getGoogleProfile(accessToken: string): Promise<{ email: string; name: string | null }> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`Google userinfo-Fehler: ${data.error?.message || data.error || res.status}`);
  return { email: (data.email || "").toLowerCase(), name: data.name || null };
}

/** Gibt ein gültiges Access-Token zurück; refresht + persistiert bei Bedarf. */
async function ensureAccessToken(account: EmailAccount): Promise<string> {
  const exp = account.oauth_token_expires_at ? new Date(account.oauth_token_expires_at).getTime() : 0;
  if (account.oauth_access_token && exp > Date.now() + 60_000) return account.oauth_access_token;
  if (!account.oauth_refresh_token) throw new Error("Kein Refresh-Token — Google-Konto neu verbinden.");

  const t = await refreshGoogleToken(account.oauth_refresh_token);
  const admin = getSupabaseAdmin();
  const expiresAt = new Date(Date.now() + t.expires_in * 1000).toISOString();
  await admin.from("email_accounts").update({
    oauth_access_token: t.access_token,
    oauth_token_expires_at: expiresAt,
    ...(t.refresh_token ? { oauth_refresh_token: t.refresh_token } : {}),
  }).eq("id", account.id);
  account.oauth_access_token = t.access_token;
  account.oauth_token_expires_at = expiresAt;
  if (t.refresh_token) account.oauth_refresh_token = t.refresh_token;
  return t.access_token;
}

/** RFC-2047-Encoded-Word (UTF-8 Base64) für Header mit Umlauten/Emoji. */
function encodeWord(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

interface SendOptions { to: string; subject: string; htmlBody: string; replyTo?: string }

/** Versand über die Gmail API (Auto-Refresh).
 *  Mit send_as_email (Shared-/Alias): aus dieser Adresse senden — sie muss als
 *  „Senden als"-Alias im Gmail-Konto verifiziert sein, sonst weist Google ab. */
export async function sendViaGoogleOAuth(account: EmailAccount, options: SendOptions): Promise<void> {
  const accessToken = await ensureAccessToken(account);
  const fromAddress = account.send_as_email?.trim() || account.sender_email;
  const from = account.sender_name
    ? `${encodeWord(account.sender_name)} <${fromAddress}>`
    : fromAddress;
  const replyTo = options.replyTo || account.reply_to || undefined;

  const headers = [
    `From: ${from}`,
    `To: ${options.to}`,
    `Subject: ${encodeWord(options.subject)}`,
    replyTo ? `Reply-To: ${replyTo}` : "",
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ].filter(Boolean).join("\r\n");
  const body = Buffer.from(options.htmlBody, "utf-8").toString("base64").replace(/(.{76})/g, "$1\r\n");
  const raw = Buffer.from(`${headers}\r\n\r\n${body}`, "utf-8")
    .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const res = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Gmail send-Fehler: ${data.error?.message || res.status}`);
  }
}

/** Verbindungstest: gültiges Access-Token holen + Profil lesen. */
export async function testGoogleOAuth(account: EmailAccount): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = await ensureAccessToken(account);
    await getGoogleProfile(token);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Verbindung fehlgeschlagen" };
  }
}
