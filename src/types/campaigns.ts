/* ── Campaign Typen ── */

export type CampaignStatus = "draft" | "active" | "paused" | "completed";
export type CampaignLeadStatus = "pending" | "sent" | "failed" | "opened" | "bounced" | "replied";

/* Aktivitätstyp für die "Letzte Aktivität"-Spalte.
 * Backend kann diesen Wert später aus dem letzten campaign_lead-Event ableiten. */
export type CampaignActivityKind =
  | "reply" | "open" | "send" | "pause" | "completed" | "draft";

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  status: CampaignStatus;
  total_count: number;
  sent_count: number;
  failed_count: number;
  open_count: number;
  bounce_count: number;
  reply_count: number;
  daily_limit: number;
  delay_minutes: number;
  reply_to: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;

  /* Backend-optionale Felder (UI-ready, später vom API zu liefern) */
  goal?: string | null;
  steps?: number | null;
  sender_name?: string | null;
  sender_email?: string | null;
  conversion_count?: number | null;
  last_activity_at?: string | null;
  last_activity_kind?: CampaignActivityKind | null;
}

export type CampaignInsert = Pick<Campaign, "name" | "daily_limit" | "delay_minutes" | "reply_to"> & {
  lead_ids: string[];
};

export type CampaignUpdate = Partial<Pick<Campaign, "name" | "status" | "daily_limit" | "delay_minutes" | "reply_to" | "error_message">>;

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
  open_count: number;
  first_opened_at: string | null;
  last_opened_at: string | null;
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
  };
}
