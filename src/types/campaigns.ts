/* ── Campaign Typen ── */

export type CampaignStatus = "draft" | "active" | "paused" | "completed" | "archived";
export type CampaignLeadStatus =
  | "pending"
  | "sent"
  | "failed"
  | "opened"
  | "bounced"
  | "replied"
  | "completed";

export type CampaignActivityKind =
  | "reply" | "open" | "send" | "pause" | "completed" | "draft" | "click"
  | "start" | "archived";

export type CampaignTone = "formal" | "professional" | "casual";

/* ── Wizard sub-shapes (persisted as JSONB) ──────────────────── */
export interface SequenceStep {
  id: string;
  intent: string;
  desc: string;
}

export interface SequenceDelay {
  value: number;
  unit: "day";
}

export interface CampaignSchedule {
  days: boolean[];          // length 7, Mo..So
  time_from: string;        // "09:00"
  time_to: string;          // "17:00"
  timezone: string;         // "Europe/Vienna"
  gap_seconds: number;      // 180 default
}

export interface CampaignTracking {
  opens: boolean;
  clicks: boolean;
  replies: boolean;
}

/* ── Hauptobjekt ─────────────────────────────────────────────── */
export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  status: CampaignStatus;
  total_count: number;
  sent_count: number;
  failed_count: number;
  open_count: number;
  click_count: number;
  bounce_count: number;
  reply_count: number;
  conversion_count: number;
  daily_limit: number;
  delay_minutes: number;
  reply_to: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;

  /* ── Wizard fields (new) ── */
  mailbox_id: string | null;
  /** Mehrere Mailboxen → automatische Rotation beim Versand. Leer = mailbox_id bzw. alle aktiven Konten. */
  mailbox_ids: string[];
  sender_name: string | null;
  sender_email?: string | null;
  goal: string | null;
  language: string;
  tone: CampaignTone;
  system_prompt: string | null;
  sequence_steps: SequenceStep[];
  sequence_delays: SequenceDelay[];
  schedule: CampaignSchedule;
  tracking: CampaignTracking;
  auto_stop_on_reply: boolean;
  steps_total: number;
  last_activity_at: string | null;
  last_activity_kind: CampaignActivityKind | null;

  /* legacy alias kept for UI */
  steps?: number | null;
}

export interface CampaignInsert {
  /* required */
  name: string;
  lead_ids: string[];
  /* optional / wizard */
  daily_limit?: number;
  delay_minutes?: number;
  reply_to?: string;
  mailbox_id?: string | null;
  mailbox_ids?: string[];
  sender_name?: string | null;
  goal?: string | null;
  language?: string;
  tone?: CampaignTone;
  system_prompt?: string | null;
  sequence_steps?: SequenceStep[];
  sequence_delays?: SequenceDelay[];
  schedule?: Partial<CampaignSchedule>;
  tracking?: Partial<CampaignTracking>;
  auto_stop_on_reply?: boolean;
  status?: CampaignStatus;
}

export type CampaignUpdate = Partial<
  Pick<
    Campaign,
    | "name"
    | "status"
    | "daily_limit"
    | "delay_minutes"
    | "reply_to"
    | "error_message"
    | "mailbox_id"
    | "mailbox_ids"
    | "sender_name"
    | "goal"
    | "language"
    | "tone"
    | "system_prompt"
    | "sequence_steps"
    | "sequence_delays"
    | "schedule"
    | "tracking"
    | "auto_stop_on_reply"
  >
>;

export interface CampaignLead {
  id: string;
  campaign_id: string;
  lead_id: string;
  user_id: string;
  tracking_token: string;
  status: CampaignLeadStatus;
  email_subject: string | null;
  email_text: string | null;
  sender_email: string | null;
  sent_at: string | null;
  last_sent_at: string | null;
  next_send_at: string | null;
  step_index: number;
  open_count: number;
  first_opened_at: string | null;
  last_opened_at: string | null;
  clicked_count: number;
  first_clicked_at: string | null;
  bounced_at: string | null;
  bounce_type: string | null;
  replied_at: string | null;
  reply_preview: string | null;
  error_message: string | null;
  created_at: string;
  lead?: {
    company: string;
    email: string | null;
    ceo_name: string | null;
    website?: string | null;
    city?: string | null;
    industry?: string | null;
  };
}

/** Maximale Anzahl Sequenz-Schritte je Kampagne (Wizard, Edit & API). */
export const MAX_SEQUENCE_STEPS = 3;

/* ── Defaults für Wizard-Insert ───────────────────────────────── */
export const DEFAULT_SCHEDULE: CampaignSchedule = {
  days: [true, true, true, true, true, false, false],
  time_from: "09:00",
  time_to: "17:00",
  timezone: "Europe/Vienna",
  gap_seconds: 180,
};

export const DEFAULT_TRACKING: CampaignTracking = {
  opens: true,
  clicks: true,
  replies: true,
};
