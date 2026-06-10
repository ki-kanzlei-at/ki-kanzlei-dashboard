/* ── Unified E-Mail-Inbound (Reply-Sync) ──
 * Routet je Provider: Microsoft Graph (App), Microsoft/Google OAuth (delegiert)
 * bzw. SMTP-Konto via IMAP.
 */
import type { EmailAccount } from "@/lib/supabase/email-accounts";
import { fetchRecentInbound as fetchGraphInbound } from "./microsoft-graph";
import { fetchRecentInboundMicrosoftOAuth } from "./microsoft-oauth";
import { fetchRecentInboundGoogle } from "./google-oauth";
import { fetchRecentInboundImap, type InboundEmail } from "./imap";

export type { InboundEmail };

export async function fetchInbound(account: EmailAccount, since: Date): Promise<InboundEmail[]> {
  switch (account.provider) {
    case "microsoft_graph": {
      if (!account.ms_tenant_id || !account.ms_client_id || !account.ms_client_secret) {
        throw new Error("Microsoft-Zugangsdaten unvollständig — Konto neu verbinden.");
      }
      return fetchGraphInbound(
        {
          tenantId: account.ms_tenant_id,
          clientId: account.ms_client_id,
          clientSecret: account.ms_client_secret,
          senderEmail: account.sender_email,
        },
        since.toISOString(),
      );
    }
    case "microsoft_oauth":
      return fetchRecentInboundMicrosoftOAuth(account, since);
    case "google_oauth":
      return fetchRecentInboundGoogle(account, since);
    case "smtp":
      return fetchRecentInboundImap(account, since);
    default:
      return [];
  }
}
