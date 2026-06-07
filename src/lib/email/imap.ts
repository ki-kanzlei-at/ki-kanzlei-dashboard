/* ── IMAP-Inbound für SMTP-Konten (Reply-Sync) ──
 * Liest die letzten eingegangenen Mails. IMAP-Host wird aus dem SMTP-Host
 * abgeleitet (smtp.* → imap.*), Port 993/SSL.
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { EmailAccount } from "@/lib/supabase/email-accounts";

export interface InboundEmail {
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  text: string;
  receivedAt: string;
  messageId: string;
}

function imapHostFromSmtp(host: string): string {
  return host.replace(/^smtp\./i, "imap.");
}

export async function fetchRecentInboundImap(
  account: EmailAccount,
  since: Date,
  limit = 30,
): Promise<InboundEmail[]> {
  if (!account.smtp_host || !account.smtp_username || !account.smtp_password) return [];

  const client = new ImapFlow({
    host: imapHostFromSmtp(account.smtp_host),
    port: 993,
    secure: true,
    auth: { user: account.smtp_username, pass: account.smtp_password },
    logger: false,
  });

  const out: InboundEmail[] = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const found = await client.search({ since });
      const seqs = Array.isArray(found) ? found.slice(-limit) : [];
      if (!seqs.length) return out;
      for await (const msg of client.fetch(seqs, { source: true })) {
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source as Buffer);
        const fromAddr = parsed.from?.value?.[0];
        const fromEmail = (fromAddr?.address || "").toLowerCase();
        if (!fromEmail) continue;
        const text = (parsed.text || (parsed.html ? String(parsed.html).replace(/<[^>]+>/g, " ") : "") || "").trim();
        out.push({
          fromEmail,
          fromName: fromAddr?.name || null,
          subject: parsed.subject || null,
          text: text.slice(0, 8000),
          receivedAt: (parsed.date || new Date()).toISOString(),
          messageId: parsed.messageId || `${fromEmail}:${(parsed.date || new Date()).getTime()}`,
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return out;
}
