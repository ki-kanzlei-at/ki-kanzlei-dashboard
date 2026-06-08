/* Backfill: bestehende Outreach-Daten → inbox_conversations/messages.
 * Idempotent (Dedupe über external_id). Usage: npx tsx scripts/inbox-backfill.ts */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { recordMessage, emailStatusToInbox, linkedinStatusToInbox } from "../src/lib/inbox/store";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function backfillEmail() {
  // Nur campaign_leads, bei denen wirklich gesendet wurde (Konversation existiert).
  const { data, error } = await db
    .from("campaign_leads")
    .select("id, user_id, campaign_id, status, email_subject, email_text, sent_at, last_sent_at, created_at, replied_at, reply_preview, lead:leads(name, company, company_name, email), campaign:campaigns(name)")
    .in("status", ["sent", "opened", "replied", "bounced", "failed"]);
  if (error) { console.error("email query", error.message); return 0; }
  let n = 0;
  for (const cl of (data ?? []) as Record<string, any>[]) {
    const lead = cl.lead || {};
    const email = (lead.email || "").trim();
    if (!email) continue; // ohne Empfänger-Adresse keine E-Mail-Conversation
    const base = {
      userId: cl.user_id,
      channel: "email" as const,
      contactEmail: email,
      contactName: lead.name || email,
      contactCompany: lead.company || lead.company_name || null,
      leadId: undefined as string | undefined,
      campaignId: cl.campaign_id || null,
      campaignName: cl.campaign?.name || null,
      status: emailStatusToInbox(cl.status),
    };
    // ausgehende Mail
    if (cl.email_text || cl.email_subject) {
      await recordMessage(db as any, {
        ...base, direction: "out",
        subject: cl.email_subject || null,
        body: cl.email_text || cl.email_subject || "",
        externalId: `cl-out:${cl.id}`,
        sentAt: cl.last_sent_at || cl.sent_at || cl.created_at,
      });
      n++;
    }
    // eingegangene Antwort (nur Preview verfügbar)
    if (cl.reply_preview) {
      await recordMessage(db as any, {
        ...base, direction: "in",
        body: cl.reply_preview,
        externalId: `cl-in:${cl.id}`,
        sentAt: cl.replied_at || cl.last_sent_at || cl.created_at,
        status: "interested",
      });
      n++;
    }
  }
  return n;
}

async function backfillLinkedIn() {
  // „invited" zählt als (einseitige) Konversation: Anfrage raus, Antwort offen.
  // Reine Pipeline-Stati (new/queued/analyzed) bleiben außen vor.
  const { data, error } = await db
    .from("linkedin_leads")
    .select("id, user_id, full_name, company, headline, position, linkedin_url, profile_picture_url, status, invite_message, follow_up_message, connection_sent_at, follow_up_sent_at, created_at, matched_lead_id")
    .in("status", ["invited", "accepted", "messaged", "replied"])
    .not("connection_sent_at", "is", null);
  if (error) { console.error("linkedin query", error.message); return 0; }
  let n = 0;
  for (const l of (data ?? []) as Record<string, any>[]) {
    const base = {
      userId: l.user_id,
      channel: "linkedin" as const,
      linkedinLeadId: l.id,
      contactName: l.full_name || "Unbekannt",
      contactCompany: l.company || null,
      contactRole: l.headline || l.position || null,
      linkedinUrl: l.linkedin_url || null,
      avatarUrl: l.profile_picture_url || null,
      leadId: l.matched_lead_id || null,
      status: linkedinStatusToInbox(l.status),
    };
    await recordMessage(db as any, { ...base, direction: "out", body: l.invite_message || "Vernetzungsanfrage gesendet.", externalId: `li-invite:${l.id}`, sentAt: l.connection_sent_at || l.created_at });
    n++;
    if (l.follow_up_message) {
      await recordMessage(db as any, { ...base, direction: "out", body: l.follow_up_message, externalId: `li-followup:${l.id}`, sentAt: l.follow_up_sent_at || l.connection_sent_at || l.created_at });
      n++;
    }
  }
  return n;
}

async function main() {
  const e = await backfillEmail();
  const li = await backfillLinkedIn();
  const { count: convs } = await db.from("inbox_conversations").select("id", { count: "exact", head: true });
  const { count: msgs } = await db.from("inbox_messages").select("id", { count: "exact", head: true });
  console.log(`✅ Backfill fertig — E-Mail-Msgs: ${e}, LinkedIn-Msgs: ${li}`);
  console.log(`   inbox_conversations: ${convs} · inbox_messages: ${msgs}`);
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
