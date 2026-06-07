/* ── Unified Inbox — Supabase-Helfer ──
 * Funktioniert sowohl mit dem authentifizierten Server-Client (RLS, Read-API)
 * als auch mit dem Admin-Client (Service-Role, Webhook/Cron/Sync).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboxChannel, InboxStatus, InboxDirection } from "./types";

type DB = SupabaseClient;

/* ── Status-Mapping bestehender Pipeline-Status → Inbox-Status ── */
export function emailStatusToInbox(s: string | null | undefined): InboxStatus {
  switch (s) {
    case "replied": return "interested";
    default: return "new";
  }
}
export function linkedinStatusToInbox(s: string | null | undefined): InboxStatus {
  switch (s) {
    case "replied": return "interested";
    case "declined": return "declined";
    default: return "new";
  }
}

function snippetOf(body: string, direction: InboxDirection): string {
  const clean = (body || "").replace(/\s+/g, " ").trim();
  return (direction === "out" ? "Du: " : "") + clean.slice(0, 160);
}

interface ConvIdentity {
  userId: string;
  channel: InboxChannel;
  linkedinLeadId?: string | null;
  contactEmail?: string | null;
}

/** Findet eine bestehende Conversation über den jeweiligen Upsert-Schlüssel. */
export async function findConversationId(db: DB, key: ConvIdentity): Promise<string | null> {
  let q = db.from("inbox_conversations").select("id").eq("user_id", key.userId);
  if (key.linkedinLeadId) {
    q = q.eq("linkedin_lead_id", key.linkedinLeadId);
  } else if (key.contactEmail) {
    q = q.eq("channel", "email").eq("contact_email", key.contactEmail.toLowerCase());
  } else {
    return null;
  }
  const { data } = await q.limit(1).maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

export interface ConversationUpsert extends ConvIdentity {
  contactName?: string | null;
  contactCompany?: string | null;
  contactRole?: string | null;
  linkedinUrl?: string | null;
  avatarUrl?: string | null;
  leadId?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  externalThreadId?: string | null;
  status?: InboxStatus;
  lastMessageAt?: string;
}

/** Legt eine Conversation an oder aktualisiert die Stammdaten — gibt die id zurück. */
export async function upsertConversation(db: DB, c: ConversationUpsert): Promise<string | null> {
  const existingId = await findConversationId(db, c);
  const now = new Date().toISOString();

  if (existingId) {
    const patch: Record<string, unknown> = { updated_at: now };
    if (c.contactName) patch.contact_name = c.contactName;
    if (c.contactCompany !== undefined) patch.contact_company = c.contactCompany;
    if (c.contactRole !== undefined) patch.contact_role = c.contactRole;
    if (c.linkedinUrl !== undefined) patch.linkedin_url = c.linkedinUrl;
    if (c.avatarUrl !== undefined) patch.avatar_url = c.avatarUrl;
    if (c.leadId !== undefined && c.leadId) patch.lead_id = c.leadId;
    if (c.campaignId !== undefined && c.campaignId) patch.campaign_id = c.campaignId;
    if (c.campaignName !== undefined && c.campaignName) patch.campaign_name = c.campaignName;
    if (c.externalThreadId !== undefined && c.externalThreadId) patch.external_thread_id = c.externalThreadId;
    if (c.status) patch.status = c.status;
    await db.from("inbox_conversations").update(patch).eq("id", existingId);
    return existingId;
  }

  const { data, error } = await db
    .from("inbox_conversations")
    .insert({
      user_id: c.userId,
      channel: c.channel,
      contact_name: c.contactName ?? "",
      contact_company: c.contactCompany ?? null,
      contact_role: c.contactRole ?? null,
      contact_email: c.contactEmail ? c.contactEmail.toLowerCase() : null,
      linkedin_url: c.linkedinUrl ?? null,
      avatar_url: c.avatarUrl ?? null,
      lead_id: c.leadId ?? null,
      linkedin_lead_id: c.linkedinLeadId ?? null,
      campaign_id: c.campaignId ?? null,
      campaign_name: c.campaignName ?? null,
      external_thread_id: c.externalThreadId ?? null,
      status: c.status ?? "new",
      last_message_at: c.lastMessageAt ?? now,
    })
    .select("id")
    .single();
  if (error) {
    // Race: parallel angelegt → erneut suchen
    return findConversationId(db, c);
  }
  return (data as { id: string }).id;
}

export interface RecordMessageInput extends ConversationUpsert {
  direction: InboxDirection;
  body: string;
  fromName?: string | null;
  subject?: string | null;
  senderEmail?: string | null;
  externalId?: string | null;
  sentAt?: string;
}

/**
 * Zentrale Schreiboperation: Conversation upserten + Nachricht anhängen +
 * last_message_at/snippet/unread/status nachziehen. Dedupe über external_id.
 */
export async function recordMessage(
  db: DB,
  m: RecordMessageInput,
): Promise<{ conversationId: string | null; inserted: boolean }> {
  const sentAt = m.sentAt ?? new Date().toISOString();
  const conversationId = await upsertConversation(db, { ...m, lastMessageAt: sentAt });
  if (!conversationId) return { conversationId: null, inserted: false };

  if (m.externalId) {
    const { data: dup } = await db
      .from("inbox_messages")
      .select("id")
      .eq("user_id", m.userId)
      .eq("channel", m.channel)
      .eq("external_id", m.externalId)
      .limit(1)
      .maybeSingle();
    if (dup) return { conversationId, inserted: false };
  }

  const { error: msgErr } = await db.from("inbox_messages").insert({
    conversation_id: conversationId,
    user_id: m.userId,
    direction: m.direction,
    channel: m.channel,
    from_name: m.fromName ?? null,
    subject: m.subject ?? null,
    body: m.body,
    sender_email: m.senderEmail ?? null,
    external_id: m.externalId ?? null,
    sent_at: sentAt,
  });
  if (msgErr) {
    // 23505 = Race auf dem uq_inbox_msg_external Index → derselbe Nachricht, kein Doppel.
    if ((msgErr as { code?: string }).code !== "23505") {
      console.error("[inbox.recordMessage] insert failed:", msgErr.message);
    }
    return { conversationId, inserted: false }; // Snippet/last_message_at NICHT mit Stale-Daten überschreiben
  }

  const patch: Record<string, unknown> = {
    last_message_at: sentAt,
    last_snippet: snippetOf(m.body, m.direction),
    updated_at: new Date().toISOString(),
  };
  if (m.direction === "in") {
    patch.unread = true;
    patch.has_inbound = true; // erst jetzt erscheint die Conversation in der Inbox
  }
  if (m.status) patch.status = m.status;
  await db.from("inbox_conversations").update(patch).eq("id", conversationId);

  return { conversationId, inserted: true };
}
