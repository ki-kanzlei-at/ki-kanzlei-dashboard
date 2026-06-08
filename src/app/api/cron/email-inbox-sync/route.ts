/* ── API Route: GET /api/cron/email-inbox-sync ──
 * Holt eingehende E-Mails aller aktiven Konten (IMAP/Graph) und schreibt
 * Antworten auf unser Outreach in die Inbox. Nur Absender, an die wir bereits
 * gesendet haben (bestehende E-Mail-Conversation), landen in der Inbox.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { EmailAccount } from "@/lib/supabase/email-accounts";
import { fetchInbound, type InboundEmail } from "@/lib/email/inbound";
import { recordMessage } from "@/lib/inbox/store";

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  /* ── Cron-Auth ── */
  if (!process.env.CRON_SECRET) {
    console.error("[email-inbox-sync] CRON_SECRET not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { data: accounts } = await admin.from("email_accounts").select("*").eq("is_active", true);
  const since = new Date(Date.now() - 3 * 86_400_000); // letzte 3 Tage

  let scanned = 0;
  let matched = 0;
  const errors: string[] = [];

  for (const account of (accounts ?? []) as EmailAccount[]) {
    let inbound: InboundEmail[] = [];
    try {
      inbound = await fetchInbound(account, since);
    } catch (e) {
      errors.push(`${account.sender_email}: ${e instanceof Error ? e.message : "fetch error"}`);
      continue;
    }

    const ownAddr = (account.sender_email || "").toLowerCase();
    for (const msg of inbound) {
      scanned++;
      if (!msg.fromEmail) continue;
      if (msg.fromEmail === ownAddr) continue; // eigene Adresse / Loopback / NDR an sich selbst ignorieren

      // Nur Antworten auf unser Outreach: es muss bereits eine E-Mail-Conversation
      // mit dieser Adresse existieren (durch den Send-Cron angelegt).
      const { data: conv } = await admin
        .from("inbox_conversations")
        .select("id")
        .eq("user_id", account.user_id)
        .eq("channel", "email")
        .eq("contact_email", msg.fromEmail)
        .limit(1)
        .maybeSingle();
      if (!conv) continue;

      const res = await recordMessage(admin, {
        userId: account.user_id,
        channel: "email",
        direction: "in",
        contactEmail: msg.fromEmail,
        contactName: msg.fromName || msg.fromEmail,
        subject: msg.subject,
        body: msg.text || "(leerer Inhalt)",
        fromName: msg.fromName,
        senderEmail: msg.fromEmail,
        externalId: msg.messageId,
        sentAt: msg.receivedAt,
        status: "interested",
      });
      if (res.inserted) {
        matched++;
        // Pipeline-Status nachziehen (Auto-Stop greift im Send-Cron).
        // EXAKTER Mail-Vergleich (ilike würde `_`/`%` als Wildcards behandeln → falsche Leads).
        const { data: leadRows } = await admin
          .from("leads").select("id").eq("user_id", account.user_id).eq("email", msg.fromEmail);
        const leadIds = (leadRows ?? []).map((l) => l.id);
        if (leadIds.length) {
          await admin
            .from("campaign_leads")
            .update({ status: "replied", replied_at: msg.receivedAt, reply_preview: (msg.text || "").slice(0, 280) })
            .eq("user_id", account.user_id)
            .neq("status", "replied")
            .in("lead_id", leadIds);
        }
      }
    }
  }

  return NextResponse.json({ ok: true, scanned, matched, accounts: (accounts ?? []).length, errors });
}
