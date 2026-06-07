/* ── Supabase Data Access Layer: User Settings ── */

import { createClient } from "./server";
import { getSupabaseAdmin } from "./admin";
import type { SendWindow } from "@/lib/campaigns/send-window";

export type { SendWindow } from "@/lib/campaigns/send-window";
export { DEFAULT_SEND_WINDOW, normalizeSendWindow, isWithinSendWindow } from "@/lib/campaigns/send-window";

export interface LinkedInSenderProfile {
  name?: string;
  position?: string;
  company?: string;
  specialization?: string;
  tone?: string;
}

export interface LeadSettings {
  default_country?: string;
  default_countries?: string[];
  default_status?: string;
  default_industries?: string[];
  require_ceo?: boolean;
  require_email?: boolean;
  dedup?: boolean;
  dedup_field?: string;
  page_size?: number;
  auto_score?: boolean;
  score_threshold?: number;
}

export interface CampaignSettings {
  daily_limit?: number;
  /** Tages-Gesamtlimit über ALLE aktiven Postfächer (0/undefined = aus). */
  total_daily_limit?: number;
  delay_minutes?: number;
  /** Zufalls-Variation auf Pause & Follow-up-Timing in Prozent (0–50). */
  send_jitter?: number;
  reply_to?: string;
  /** Legacy: früher "business"|"extended"|"always"; jetzt strukturiertes Objekt.
   *  String-Werte werden beim Laden/Im Cron migriert. */
  send_window?: SendWindow | string;
  warmup?: boolean;
  warmup_start?: number;
  warmup_increment?: number;
  track_opens?: boolean;
  track_clicks?: boolean;
  unsub_link?: boolean;
  bounce_action?: string;
  /** Anzahl Bounces (rollierend 7 Tage), ab der bounce_action greift. */
  bounce_threshold?: number;
  signature?: string;
  /* Microsoft Graph E-Mail-Versand */
  ms_tenant_id?: string;
  ms_client_id?: string;
  ms_client_secret?: string;
  sender_email?: string;
  sender_name?: string;
}

export interface SeoSettings {
  auto_publish?: boolean;
  default_category?: string;
  min_word_count?: number;
  max_word_count?: number;
  target_keywords?: number;
  meta_desc_length?: number;
  internal_links?: boolean;
  featured_image?: boolean;
  language?: string;
}

export interface NotificationSettings {
  email_new_lead?: boolean;
  email_campaign_done?: boolean;
  email_linkedin_reply?: boolean;
  push_new_lead?: boolean;
  push_campaign_error?: boolean;
}

export interface BrandSettings {
  company_name?: string;
  website?: string;
  primary_color?: string;
  accent_color?: string;
  dark_bg?: string;
  text_color?: string;
  muted_color?: string;
  font_family?: string;
  font_cdn_url?: string;
  logo_svg?: string;
  logo_url?: string;
  tagline?: string;
  /* Angebot / Positionierung — genutzt von AI Researcher (Produkt-Fit) & LinkedIn-Outreach */
  offering?: string;        // Produkte & Dienstleistungen
  value_prop?: string;      // Nutzenversprechen / USP
  target_customer?: string; // Zielkunden / ICP
  /* Onboarding-Profil */
  business_type?: string;
  team_size?: string;
  role?: string;            // founder | marketing | sales | ops | other
  primary_goal?: string;    // demos | pipeline | customers | investors | talent
  monthly_volume?: string;  // lt500 | 500-2500 | 2500-10000 | gt10000
  plan_intent?: string;     // starter | growth | pro | enterprise | later
  plan_selected_at?: string;
}

export interface UserSettings {
  user_id: string;
  gemini_api_key: string | null;
  /* CRM-Export */
  hubspot_api_key: string | null;
  pipedrive_api_key: string | null;
  pipedrive_domain: string | null;
  salesforce_instance_url: string | null;
  salesforce_access_token: string | null;
  zoho_client_id: string | null;
  zoho_client_secret: string | null;
  zoho_refresh_token: string | null;
  webhook_url: string | null;
  /* ConnectSafely / LinkedIn */
  connectsafely_api_key: string | null;
  connectsafely_account_id: string | null;
  connectsafely_webhook_secret: string | null;
  /* Unipile (DEPRECATED — kept transient for migration only) */
  unipile_api_key: string | null;
  unipile_dsn: string | null;
  unipile_account_id: string | null;
  linkedin_daily_limit: number | null;
  linkedin_auto_outreach: boolean | null;
  linkedin_follow_up_days: number | null;
  linkedin_sender_profile: LinkedInSenderProfile | null;
  linkedin_outreach_template: string | null;
  /* AI */
  anthropic_api_key: string | null;
  /* Grouped settings */
  lead_settings: LeadSettings | null;
  campaign_settings: CampaignSettings | null;
  seo_settings: SeoSettings | null;
  notification_settings: NotificationSettings | null;
  brand_settings: BrandSettings | null;
  created_at: string;
  updated_at: string;
}

export type UserSettingsUpdate = Partial<
  Pick<UserSettings,
    | "gemini_api_key"
    | "anthropic_api_key"
    | "hubspot_api_key"
    | "pipedrive_api_key"
    | "pipedrive_domain"
    | "salesforce_instance_url"
    | "salesforce_access_token"
    | "zoho_client_id"
    | "zoho_client_secret"
    | "zoho_refresh_token"
    | "webhook_url"
    | "connectsafely_api_key"
    | "connectsafely_account_id"
    | "connectsafely_webhook_secret"
    | "unipile_api_key"
    | "unipile_dsn"
    | "unipile_account_id"
    | "linkedin_daily_limit"
    | "linkedin_auto_outreach"
    | "linkedin_follow_up_days"
    | "linkedin_sender_profile"
    | "linkedin_outreach_template"
    | "lead_settings"
    | "campaign_settings"
    | "seo_settings"
    | "notification_settings"
    | "brand_settings"
  >
>;

export async function getUserSettings(
  userId: string,
): Promise<UserSettings | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Fehler beim Laden der Einstellungen: ${error.message}`);
  }

  return data as UserSettings;
}

export async function upsertUserSettings(
  userId: string,
  data: UserSettingsUpdate,
): Promise<UserSettings> {
  const supabase = await createClient();

  const { data: settings, error } = await supabase
    .from("user_settings")
    .upsert({ user_id: userId, ...data })
    .select()
    .single();

  if (error) {
    throw new Error(`Fehler beim Speichern der Einstellungen: ${error.message}`);
  }

  return settings as UserSettings;
}

/* ── Admin-Zugriff (für Cron Jobs ohne Auth-Cookie) ── */
export async function getUserSettingsByUserId(
  userId: string,
): Promise<UserSettings | null> {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(error.message);
  }

  return data as UserSettings;
}

/* ── Alle User mit auto_outreach holen (für Cron Jobs) ── */
export async function getAllAutoOutreachUsers(): Promise<UserSettings[]> {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("user_settings")
    .select("*")
    .eq("linkedin_auto_outreach", true)
    .not("connectsafely_api_key", "is", null)
    .not("connectsafely_account_id", "is", null);

  if (error) {
    throw new Error(`Fehler beim Laden der Auto-Outreach User: ${error.message}`);
  }

  return (data ?? []) as UserSettings[];
}

/* ── Hilfen für die LinkedIn-Integration ───────────────────────
 * Single Source of Truth ob die LinkedIn-Integration einsatzbereit ist
 * und welcher API-Key/Account zu verwenden ist. */

export interface LinkedInIntegration {
  apiKey: string;
  accountId: string;
  webhookSecret: string | null;
}

export function getLinkedInIntegration(
  settings: Partial<UserSettings> | null | undefined,
): LinkedInIntegration | null {
  const apiKey    = settings?.connectsafely_api_key?.trim();
  const accountId = settings?.connectsafely_account_id?.trim();
  if (!apiKey || !accountId) return null;
  return {
    apiKey,
    accountId,
    webhookSecret: settings?.connectsafely_webhook_secret ?? null,
  };
}

export function isLinkedInConfigured(
  settings: Partial<UserSettings> | null | undefined,
): boolean {
  return !!getLinkedInIntegration(settings);
}
