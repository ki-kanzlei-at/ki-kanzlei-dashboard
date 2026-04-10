/* ── SMTP E-Mail-Versand via Nodemailer ── */

import nodemailer from "nodemailer";

interface SmtpCredentials {
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: "tls" | "ssl" | "none";
  senderEmail: string;
  senderName?: string;
}

interface SendEmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
  replyTo?: string;
}

function createTransport(creds: SmtpCredentials) {
  return nodemailer.createTransport({
    host: creds.host,
    port: creds.port,
    secure: creds.encryption === "ssl",
    auth: {
      user: creds.username,
      pass: creds.password,
    },
    tls: creds.encryption === "none" ? { rejectUnauthorized: false } : undefined,
  });
}

export async function sendEmail(
  creds: SmtpCredentials,
  options: SendEmailOptions,
): Promise<void> {
  const transport = createTransport(creds);

  await transport.sendMail({
    from: creds.senderName
      ? `"${creds.senderName}" <${creds.senderEmail}>`
      : creds.senderEmail,
    to: options.to,
    subject: options.subject,
    html: options.htmlBody,
    replyTo: options.replyTo,
  });
}

export async function testConnection(
  creds: SmtpCredentials,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const transport = createTransport(creds);
    await transport.verify();
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Verbindungsfehler";
    if (msg.includes("ENOTFOUND")) return { ok: false, error: `Host "${creds.host}" nicht erreichbar` };
    if (msg.includes("ECONNREFUSED")) return { ok: false, error: `Verbindung auf Port ${creds.port} abgelehnt` };
    if (msg.includes("auth") || msg.includes("AUTH") || msg.includes("535")) return { ok: false, error: "Ungültige Zugangsdaten" };
    return { ok: false, error: msg };
  }
}
