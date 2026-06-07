/* ── Supabase Data Access Layer: Campaigns ──
 *
 * Datenbankzugriffe für `campaigns` und `campaign_leads`.
 * Tracking-Endpunkte verwenden den Admin Client (kein Auth-Cookie bei Pixel-Requests).
 */

import { createClient } from "./server";
import { getSupabaseAdmin } from "./admin";
import type {
  Campaign,
  CampaignInsert,
  CampaignUpdate,
  CampaignLead,
  CampaignLeadStatus,
  CampaignStatus,
  SequenceStep,
  SequenceDelay,
} from "@/types/campaigns";
import { DEFAULT_SCHEDULE, DEFAULT_TRACKING } from "@/types/campaigns";
import type { PaginatedResult, PaginationOptions } from "./leads";

/* ─────────────────────────── Typen ─────────────────────────── */

export interface CampaignFilters {
  status?: CampaignStatus;
  search?: string;
}

const DEFAULT_SEQUENCE: SequenceStep[] = [
  { id: "s1", intent: "Erstkontakt", desc: "Kurzer Pitch + konkreter Bezug auf den Empfänger" },
];
const DEFAULT_DELAYS: SequenceDelay[] = [];

/* ───────────────────────── Campaigns ───────────────────────── */

export async function getCampaigns(
  userId: string,
  filters: CampaignFilters = {},
  pagination: PaginationOptions = {},
): Promise<PaginatedResult<Campaign>> {
  const supabase = await createClient();

  const page = pagination.page ?? 1;
  const pageSize = pagination.pageSize ?? 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("campaigns")
    .select("*", { count: "exact" })
    .eq("user_id", userId);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.search) {
    query = query.ilike("name", `%${filters.search}%`);
  }

  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Fehler beim Laden der Kampagnen: ${error.message}`);
  }

  const total = count ?? 0;
  const enriched = (data ?? []).map((c) => normalizeCampaign(c as Record<string, unknown>));
  return {
    data: enriched,
    count: total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getCampaignById(
  id: string,
  userId: string,
): Promise<Campaign | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Fehler beim Laden der Kampagne: ${error.message}`);
  }

  return normalizeCampaign(data as Record<string, unknown>);
}

export async function createCampaign(
  input: CampaignInsert,
  userId: string,
): Promise<Campaign> {
  const supabase = await createClient();

  const sequenceSteps  = input.sequence_steps  && input.sequence_steps.length > 0
    ? input.sequence_steps
    : DEFAULT_SEQUENCE;
  const sequenceDelays = input.sequence_delays ?? DEFAULT_DELAYS;
  const schedule = { ...DEFAULT_SCHEDULE, ...(input.schedule ?? {}) };
  const tracking = { ...DEFAULT_TRACKING, ...(input.tracking ?? {}) };
  const startsActive = input.status === "active";
  const initialNextSend = startsActive ? new Date().toISOString() : null;

  // 1. Kampagne erstellen
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      user_id:            userId,
      name:               input.name,
      daily_limit:        input.daily_limit  ?? 200,
      delay_minutes:      input.delay_minutes ?? 8,
      reply_to:           input.reply_to     ?? "info@ki-kanzlei.at",
      mailbox_id:         input.mailbox_id   ?? null,
      sender_name:        input.sender_name  ?? null,
      goal:               input.goal         ?? null,
      language:           input.language     ?? "de-AT",
      tone:               input.tone         ?? "professional",
      system_prompt:      input.system_prompt ?? null,
      sequence_steps:     sequenceSteps,
      sequence_delays:    sequenceDelays,
      schedule,
      tracking,
      auto_stop_on_reply: input.auto_stop_on_reply ?? true,
      steps_total:        sequenceSteps.length,
      status:             input.status ?? "draft",
      total_count:        input.lead_ids.length,
      started_at:         startsActive ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Fehler beim Erstellen der Kampagne: ${error.message}`);
  }

  // 2. Campaign Leads erstellen
  if (input.lead_ids.length > 0) {
    const campaignLeads = input.lead_ids.map((lead_id) => ({
      campaign_id: campaign.id,
      lead_id,
      user_id: userId,
      step_index: 0,
      next_send_at: initialNextSend,
    }));

    // Chunked insert (Supabase Limit ~1000 rows)
    const CHUNK = 500;
    for (let i = 0; i < campaignLeads.length; i += CHUNK) {
      const slice = campaignLeads.slice(i, i + CHUNK);
      const { error: leadsError } = await supabase
        .from("campaign_leads")
        .insert(slice);
      if (leadsError) {
        // Rollback
        await supabase.from("campaigns").delete().eq("id", campaign.id);
        throw new Error(`Fehler beim Hinzufügen der Leads: ${leadsError.message}`);
      }
    }
  }

  return normalizeCampaign(campaign as Record<string, unknown>);
}

export async function updateCampaign(
  id: string,
  data: CampaignUpdate,
  userId: string,
): Promise<Campaign> {
  const supabase = await createClient();

  const updatePayload: Record<string, unknown> = { ...data };

  // Timestamps für Statuswechsel
  if (data.status === "active") {
    updatePayload.started_at = new Date().toISOString();
  } else if (data.status === "completed") {
    updatePayload.completed_at = new Date().toISOString();
  }
  if (data.sequence_steps) {
    updatePayload.steps_total = data.sequence_steps.length;
  }

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .update(updatePayload)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    throw new Error(`Fehler beim Aktualisieren der Kampagne: ${error.message}`);
  }

  // Beim Aktivieren: wartende Leads auf "ready" stellen
  if (data.status === "active") {
    await supabase
      .from("campaign_leads")
      .update({ next_send_at: new Date().toISOString() })
      .eq("campaign_id", id)
      .eq("user_id", userId)
      .eq("status", "pending")
      .is("next_send_at", null);
  }

  return normalizeCampaign(campaign as Record<string, unknown>);
}

export async function deleteCampaign(
  id: string,
  userId: string,
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Fehler beim Löschen der Kampagne: ${error.message}`);
  }
}

/* ───────────────────── Campaign Leads ───────────────────── */

export async function getCampaignLeads(
  campaignId: string,
  userId: string,
  pagination: PaginationOptions = {},
  filters: { status?: CampaignLeadStatus; search?: string } = {},
): Promise<PaginatedResult<CampaignLead>> {
  const supabase = await createClient();

  const page = pagination.page ?? 1;
  const pageSize = pagination.pageSize ?? 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("campaign_leads")
    .select("*, lead:leads(company, email, ceo_name, website, city, industry)", { count: "exact" })
    .eq("campaign_id", campaignId)
    .eq("user_id", userId);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Fehler beim Laden der Campaign Leads: ${error.message}`);
  }

  const total = count ?? 0;
  return {
    data: (data ?? []) as CampaignLead[],
    count: total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/* ──────────────── Tracking (Admin Client) ──────────────── */

export async function trackOpen(token: string): Promise<boolean> {
  const admin = getSupabaseAdmin();

  const { data: cl, error: findError } = await admin
    .from("campaign_leads")
    .select("id, campaign_id, open_count, status")
    .eq("tracking_token", token)
    .single();

  if (findError || !cl) return false;

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    open_count: (cl.open_count ?? 0) + 1,
    last_opened_at: now,
  };

  if (cl.open_count === 0) {
    updates.first_opened_at = now;
  }

  if (cl.status === "sent") {
    updates.status = "opened";
  }

  await admin
    .from("campaign_leads")
    .update(updates)
    .eq("id", cl.id);

  if (cl.open_count === 0) {
    await incrementCampaignCounter(cl.campaign_id, "open_count");
  }

  return true;
}

/** Zählt einen Klick auf einen umgeschriebenen Link.
 *  Atomar via RPC: campaign_leads.clicked_count++ (lost-update-sicher) und
 *  campaigns.click_count nur beim ersten Klick (doppel-rollup-sicher). */
export async function trackClick(token: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { error } = await admin.rpc("track_lead_click", { p_token: token });
  if (error) {
    console.error("[trackClick] RPC-Fehler:", error.message);
    return false;
  }
  return true;
}

export async function trackBounce(
  email: string,
  bounceType?: string,
): Promise<boolean> {
  const admin = getSupabaseAdmin();

  const { data: leads } = await admin
    .from("leads")
    .select("id")
    .eq("email", email);

  if (!leads || leads.length === 0) return false;

  const leadIds = leads.map((l) => l.id);
  const now = new Date().toISOString();

  const { data: cl } = await admin
    .from("campaign_leads")
    .select("id, campaign_id, sender_email")
    .in("lead_id", leadIds)
    .in("status", ["sent", "opened"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!cl) return false;

  await admin
    .from("campaign_leads")
    .update({
      status: "bounced",
      bounced_at: now,
      bounce_type: bounceType ?? "hard",
      next_send_at: null,
    })
    .eq("id", cl.id);

  await incrementCampaignCounter(cl.campaign_id, "bounce_count");

  /* ── Bounce-Aktion: Postfach schützen, wenn die Schwelle erreicht ist ── */
  await maybeApplyBounceAction(cl.campaign_id, cl.sender_email as string | null);

  return true;
}

/**
 * Liest die globale Bounce-Aktion + Schwelle des Kampagnen-Users und pausiert/
 * deaktiviert das sendende Postfach, sobald in den letzten 7 Tagen genug
 * Bounces über dieses Postfach aufgelaufen sind. Fehler werden geschluckt —
 * Bounce-Tracking selbst soll dadurch nie scheitern.
 */
async function maybeApplyBounceAction(
  campaignId: string,
  senderEmail: string | null,
): Promise<void> {
  if (!senderEmail) return;
  try {
    const admin = getSupabaseAdmin();

    const { data: camp } = await admin
      .from("campaigns")
      .select("user_id")
      .eq("id", campaignId)
      .single();
    if (!camp?.user_id) return;

    const { data: us } = await admin
      .from("user_settings")
      .select("campaign_settings")
      .eq("user_id", camp.user_id)
      .single();
    const cs = (us?.campaign_settings ?? {}) as { bounce_action?: string; bounce_threshold?: number };

    const action = cs.bounce_action ?? "pause";
    const threshold = Math.max(1, cs.bounce_threshold ?? 5);
    if (action === "ignore") return;

    // Das betroffene Postfach finden
    const { data: account } = await admin
      .from("email_accounts")
      .select("id, is_active")
      .eq("user_id", camp.user_id)
      .eq("sender_email", senderEmail)
      .maybeSingle();
    if (!account || !account.is_active) return; // schon aus → nichts zu tun

    // Bounces dieses Postfachs in den letzten 7 Tagen zählen
    const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { count } = await admin
      .from("campaign_leads")
      .select("id", { count: "exact", head: true })
      .eq("sender_email", senderEmail)
      .eq("status", "bounced")
      .gte("bounced_at", cutoff);

    if ((count ?? 0) < threshold) return;

    // Schwelle erreicht → Postfach deaktivieren (pause & deactivate => is_active false)
    await admin
      .from("email_accounts")
      .update({
        is_active: false,
        health_status: "bad",
        last_error: `Automatisch ${action === "deactivate" ? "deaktiviert" : "pausiert"}: ${count} Bounces in 7 Tagen (Schwelle ${threshold}).`,
      })
      .eq("id", account.id);
  } catch (err) {
    console.error("[trackBounce] bounce-action fehlgeschlagen:", err);
  }
}

export async function trackReply(
  email: string,
  replyPreview?: string,
): Promise<boolean> {
  const admin = getSupabaseAdmin();

  const { data: leads } = await admin
    .from("leads")
    .select("id")
    .eq("email", email);

  if (!leads || leads.length === 0) return false;

  const leadIds = leads.map((l) => l.id);
  const now = new Date().toISOString();

  const { data: cl } = await admin
    .from("campaign_leads")
    .select("id, campaign_id")
    .in("lead_id", leadIds)
    .in("status", ["sent", "opened"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!cl) return false;

  await admin
    .from("campaign_leads")
    .update({
      status: "replied",
      replied_at: now,
      reply_preview: replyPreview ?? null,
      next_send_at: null, // Sequenz stoppen
    })
    .eq("id", cl.id);

  await incrementCampaignCounter(cl.campaign_id, "reply_count");

  return true;
}

async function incrementCampaignCounter(
  campaignId: string,
  field: string,
): Promise<void> {
  const admin = getSupabaseAdmin();

  const rpcName = `increment_${field}`;
  const { error } = await admin.rpc(rpcName, { p_campaign_id: campaignId });

  if (error) {
    const { data } = await admin
      .from("campaigns")
      .select(field)
      .eq("id", campaignId)
      .single();

    if (!data) return;

    await admin
      .from("campaigns")
      .update({ [field]: ((data as unknown as Record<string, number>)[field] ?? 0) + 1 })
      .eq("id", campaignId);
  }
}

/* ── Normalizer: garantiert konsistente Felder im Frontend ── */
function normalizeCampaign(raw: Record<string, unknown>): Campaign {
  const sequenceSteps = (raw.sequence_steps as SequenceStep[] | null) ?? [];
  const sequenceDelays = (raw.sequence_delays as SequenceDelay[] | null) ?? [];
  return {
    id:              raw.id              as string,
    user_id:         raw.user_id         as string,
    name:            raw.name            as string,
    status:          (raw.status         as CampaignStatus) ?? "draft",
    total_count:     (raw.total_count    as number) ?? 0,
    sent_count:      (raw.sent_count     as number) ?? 0,
    failed_count:    (raw.failed_count   as number) ?? 0,
    open_count:      (raw.open_count     as number) ?? 0,
    click_count:     (raw.click_count    as number) ?? 0,
    bounce_count:    (raw.bounce_count   as number) ?? 0,
    reply_count:     (raw.reply_count    as number) ?? 0,
    conversion_count:(raw.conversion_count as number) ?? 0,
    daily_limit:     (raw.daily_limit    as number) ?? 200,
    delay_minutes:   (raw.delay_minutes  as number) ?? 8,
    reply_to:        (raw.reply_to       as string) ?? "",
    created_at:      raw.created_at      as string,
    updated_at:      raw.updated_at      as string,
    started_at:      (raw.started_at     as string | null) ?? null,
    completed_at:    (raw.completed_at   as string | null) ?? null,
    error_message:   (raw.error_message  as string | null) ?? null,
    mailbox_id:      (raw.mailbox_id     as string | null) ?? null,
    sender_name:     (raw.sender_name    as string | null) ?? null,
    goal:            (raw.goal           as string | null) ?? null,
    language:        (raw.language       as string) ?? "de-AT",
    tone:            (raw.tone           as Campaign["tone"]) ?? "professional",
    system_prompt:   (raw.system_prompt  as string | null) ?? null,
    sequence_steps:  sequenceSteps,
    sequence_delays: sequenceDelays,
    schedule:        (raw.schedule       as Campaign["schedule"]) ?? DEFAULT_SCHEDULE,
    tracking:        (raw.tracking       as Campaign["tracking"]) ?? DEFAULT_TRACKING,
    auto_stop_on_reply: (raw.auto_stop_on_reply as boolean) ?? true,
    steps_total:     (raw.steps_total    as number) ?? sequenceSteps.length,
    last_activity_at:   (raw.last_activity_at as string | null) ?? null,
    last_activity_kind: (raw.last_activity_kind as Campaign["last_activity_kind"]) ?? null,
    steps:           sequenceSteps.length, // UI-alias
  };
}
