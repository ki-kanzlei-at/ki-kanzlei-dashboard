/* ── Microsoft Graph API: E-Mail-Versand via OAuth2 Client Credentials ── */

interface GraphCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  senderEmail: string;
  senderName?: string;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
  replyTo?: string;
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCache>();

/**
 * Holt ein Access Token via OAuth2 Client Credentials Flow.
 * Tokens werden gecacht (gültig für ~1h).
 */
async function getAccessToken(creds: GraphCredentials): Promise<string> {
  const cacheKey = `${creds.tenantId}:${creds.clientId}`;
  const cached = tokenCache.get(cacheKey);

  // 5 Minuten Puffer vor Ablauf
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.accessToken;
  }

  const tokenUrl = `https://login.microsoftonline.com/${creds.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Microsoft Graph Token-Fehler: ${err.error_description || err.error || `HTTP ${res.status}`}`,
    );
  }

  const data = await res.json();
  const accessToken = data.access_token as string;
  const expiresIn = (data.expires_in as number) ?? 3600;

  tokenCache.set(cacheKey, {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
  });

  return accessToken;
}

export interface GraphInboundMessage {
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  text: string;
  receivedAt: string;
  messageId: string;
}

/**
 * Holt die letzten eingehenden Mails aus dem Posteingang (für Reply-Sync).
 */
export async function fetchRecentInbound(
  creds: GraphCredentials,
  sinceISO: string,
  limit = 30,
): Promise<GraphInboundMessage[]> {
  const accessToken = await getAccessToken(creds);
  const url = new URL(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(creds.senderEmail)}/mailFolders/inbox/messages`,
  );
  url.searchParams.set("$top", String(limit));
  url.searchParams.set("$orderby", "receivedDateTime desc");
  url.searchParams.set("$select", "from,subject,bodyPreview,receivedDateTime,internetMessageId");
  url.searchParams.set("$filter", `receivedDateTime ge ${sinceISO}`);

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Graph Inbox-Fehler: ${err.error?.message || `HTTP ${res.status}`}`);
  }
  const data = await res.json();
  const items = (data.value ?? []) as Array<{
    from?: { emailAddress?: { address?: string; name?: string } };
    subject?: string; bodyPreview?: string; receivedDateTime?: string; internetMessageId?: string; id?: string;
  }>;
  return items
    .map((m) => ({
      fromEmail: (m.from?.emailAddress?.address || "").toLowerCase(),
      fromName: m.from?.emailAddress?.name || null,
      subject: m.subject || null,
      text: m.bodyPreview || "",
      receivedAt: m.receivedDateTime || new Date().toISOString(),
      messageId: m.internetMessageId || m.id || "",
    }))
    .filter((m) => m.fromEmail);
}

/**
 * Sendet eine E-Mail über Microsoft Graph API.
 */
export async function sendEmail(
  creds: GraphCredentials,
  options: SendEmailOptions,
): Promise<void> {
  const accessToken = await getAccessToken(creds);

  const message: Record<string, unknown> = {
    subject: options.subject,
    body: {
      contentType: "HTML",
      content: options.htmlBody,
    },
    toRecipients: [
      {
        emailAddress: { address: options.to },
      },
    ],
    from: {
      emailAddress: {
        address: creds.senderEmail,
        name: creds.senderName || creds.senderEmail,
      },
    },
  };

  if (options.replyTo) {
    message.replyTo = [
      {
        emailAddress: { address: options.replyTo },
      },
    ];
  }

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(creds.senderEmail)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, saveToSentItems: true }),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const errMsg = err.error?.message || `HTTP ${res.status}`;
    throw new Error(`Graph API Sendefehler: ${errMsg}`);
  }
}

/**
 * Prüft die Microsoft Graph Credentials (Token holen + Mailbox-Zugriff testen).
 */
export async function testConnection(
  creds: GraphCredentials,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const accessToken = await getAccessToken(creds);

    // Teste Mailbox-Zugriff
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(creds.senderEmail)}/mailFolders/inbox?$select=id`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (res.ok) return { ok: true };
    if (res.status === 403) return { ok: false, error: "Fehlende Mail.Send Berechtigung. Bitte App-Permissions in Azure AD prüfen." };
    if (res.status === 404) return { ok: false, error: `Postfach für ${creds.senderEmail} nicht gefunden.` };
    return { ok: false, error: `Mailbox-Test fehlgeschlagen: HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Verbindungsfehler" };
  }
}
