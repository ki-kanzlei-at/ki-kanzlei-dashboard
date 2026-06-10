/* ── Unified E-Mail Sender mit Account-Rotation ── */

import type { EmailAccount } from "@/lib/supabase/email-accounts";
import { sendEmail as sendViaGraph } from "./microsoft-graph";
import { sendEmail as sendViaSmtp } from "./smtp";
import { sendViaMicrosoftOAuth } from "./microsoft-oauth";
import { sendViaGoogleOAuth } from "./google-oauth";

interface SendOptions {
  to: string;
  subject: string;
  htmlBody: string;
  replyTo?: string;
  /** Zusätzliche Mail-Header (z. B. List-Unsubscribe).
   *  Hinweis: Microsoft Graph erlaubt über sendMail nur x-…-Header —
   *  Standard-Header werden dort bewusst nicht gesetzt. */
  headers?: Record<string, string>;
}

/**
 * Sendet eine E-Mail über den passenden Provider des Accounts.
 */
export async function sendEmailViaAccount(
  account: EmailAccount,
  options: SendOptions,
): Promise<void> {
  const replyTo = options.replyTo || account.reply_to || undefined;

  switch (account.provider) {
    case "microsoft_oauth": {
      await sendViaMicrosoftOAuth(account, { ...options, replyTo });
      break;
    }

    case "google_oauth": {
      await sendViaGoogleOAuth(account, { ...options, replyTo });
      break;
    }

    case "microsoft_graph": {
      if (!account.ms_tenant_id || !account.ms_client_id || !account.ms_client_secret) {
        throw new Error("Microsoft Graph Credentials unvollständig");
      }
      await sendViaGraph(
        {
          tenantId: account.ms_tenant_id,
          clientId: account.ms_client_id,
          clientSecret: account.ms_client_secret,
          senderEmail: account.sender_email,
          senderName: account.sender_name || undefined,
        },
        { ...options, replyTo },
      );
      break;
    }

    case "smtp": {
      if (!account.smtp_host || !account.smtp_username || !account.smtp_password) {
        throw new Error("SMTP Credentials unvollständig");
      }
      await sendViaSmtp(
        {
          host: account.smtp_host,
          port: account.smtp_port || 587,
          username: account.smtp_username,
          password: account.smtp_password,
          encryption: account.smtp_encryption || "tls",
          senderEmail: account.sender_email,
          senderName: account.sender_name || undefined,
        },
        { ...options, replyTo },
      );
      break;
    }

    default:
      throw new Error(`Unbekannter Provider: ${account.provider}`);
  }
}
