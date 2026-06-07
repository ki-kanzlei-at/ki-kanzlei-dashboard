/* ── Unified E-Mail-Inbound (Reply-Sync) ──
 * Routet je Provider: Microsoft Graph (Inbox-API) bzw. SMTP-Konto via IMAP.
 */
import type { EmailAccount } from "@/lib/supabase/email-accounts";
import { fetchRecentInbound as fetchGraphInbound } from "./microsoft-graph";
import { fetchRecentInboundImap, type InboundEmail } from "./imap";

export type { InboundEmail };

export async function fetchInbound(account: EmailAccount, since: Date): Promise<InboundEmail[]> {
  if (account.provider === "microsoft_graph") {
    if (!account.ms_tenant_id || !account.ms_client_id || !account.ms_client_secret) return [];
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
  if (account.provider === "smtp") {
    return fetchRecentInboundImap(account, since);
  }
  return [];
}
