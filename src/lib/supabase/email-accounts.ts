/* ── Supabase Data Access Layer: Email Accounts ── */

import { createClient } from "./server";
import { getSupabaseAdmin } from "./admin";

export interface EmailAccount {
  id: string;
  user_id: string;
  label: string;
  provider: "smtp" | "microsoft_graph";
  sender_email: string;
  sender_name: string | null;
  reply_to: string | null;
  /* SMTP */
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  smtp_password: string | null;
  smtp_encryption: "tls" | "ssl" | "none" | null;
  /* Microsoft Graph */
  ms_tenant_id: string | null;
  ms_client_id: string | null;
  ms_client_secret: string | null;
  /* Limits & Rotation */
  daily_limit: number;
  is_active: boolean;
  priority: number;
  /* Warmup */
  warmup_enabled: boolean;
  warmup_day: number;
  warmup_start: number;
  warmup_increment: number;
  /* Health */
  health_status: "good" | "warning" | "bad" | "unknown";
  last_error: string | null;
  /* Tracking */
  sent_today: number;
  sent_today_date: string;
  total_sent: number;
  /* Timestamps */
  created_at: string;
  updated_at: string;
}

export type EmailAccountInsert = Pick<
  EmailAccount,
  | "label" | "provider" | "sender_email" | "sender_name" | "reply_to"
  | "smtp_host" | "smtp_port" | "smtp_username" | "smtp_password" | "smtp_encryption"
  | "ms_tenant_id" | "ms_client_id" | "ms_client_secret"
  | "daily_limit" | "is_active" | "priority"
  | "warmup_enabled" | "warmup_start" | "warmup_increment"
>;

export type EmailAccountUpdate = Partial<EmailAccountInsert & {
  health_status: EmailAccount["health_status"];
  last_error: string | null;
  sent_today: number;
  sent_today_date: string;
  warmup_day: number;
}>;

/* ── User-facing CRUD (mit Auth) ── */

export async function getEmailAccounts(userId: string): Promise<EmailAccount[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_accounts")
    .select("*")
    .eq("user_id", userId)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Fehler beim Laden der E-Mail-Konten: ${error.message}`);
  return (data ?? []) as EmailAccount[];
}

export async function getEmailAccountById(id: string, userId: string): Promise<EmailAccount | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_accounts")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(error.message);
  }
  return data as EmailAccount;
}

export async function createEmailAccount(userId: string, input: EmailAccountInsert): Promise<EmailAccount> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_accounts")
    .insert({ user_id: userId, ...input })
    .select()
    .single();

  if (error) throw new Error(`Fehler beim Erstellen: ${error.message}`);
  return data as EmailAccount;
}

export async function updateEmailAccount(id: string, userId: string, updates: EmailAccountUpdate): Promise<EmailAccount> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_accounts")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw new Error(`Fehler beim Aktualisieren: ${error.message}`);
  return data as EmailAccount;
}

export async function deleteEmailAccount(id: string, userId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_accounts")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw new Error(`Fehler beim Löschen: ${error.message}`);
}

/* ── Admin-Zugriff (Cron Jobs) ── */

export async function getActiveAccountsForUser(userId: string): Promise<EmailAccount[]> {
  const admin = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await admin
    .from("email_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .order("sent_today", { ascending: true }); // least-used first

  if (error) throw new Error(error.message);

  // Reset sent_today wenn neuer Tag
  const accounts = (data ?? []) as EmailAccount[];
  for (const acc of accounts) {
    if (acc.sent_today_date !== today) {
      await admin
        .from("email_accounts")
        .update({ sent_today: 0, sent_today_date: today })
        .eq("id", acc.id);
      acc.sent_today = 0;
      acc.sent_today_date = today;
    }
  }

  return accounts;
}

/**
 * Effektives Tageslimit unter Berücksichtigung von Warmup.
 */
export function getEffectiveDailyLimit(account: EmailAccount): number {
  if (!account.warmup_enabled) return account.daily_limit;
  const warmupLimit = account.warmup_start + account.warmup_day * account.warmup_increment;
  return Math.min(warmupLimit, account.daily_limit);
}

/**
 * Wählt das nächste Konto per Round-Robin (least-used) aus verfügbaren Konten.
 */
export function pickNextAccount(accounts: EmailAccount[]): EmailAccount | null {
  const available = accounts.filter((a) => {
    const limit = getEffectiveDailyLimit(a);
    return a.sent_today < limit && a.health_status !== "bad";
  });

  if (available.length === 0) return null;

  // Round-Robin: Konto mit wenigsten Sends heute
  available.sort((a, b) => a.sent_today - b.sent_today);
  return available[0];
}

/**
 * Inkrementiert sent_today + total_sent nach erfolgreichem Versand.
 */
export async function incrementAccountSentCount(accountId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("email_accounts")
    .select("sent_today, total_sent, warmup_enabled, warmup_day")
    .eq("id", accountId)
    .single();

  if (!data) return;

  const updates: Record<string, unknown> = {
    sent_today: (data.sent_today ?? 0) + 1,
    total_sent: (data.total_sent ?? 0) + 1,
    health_status: "good",
    last_error: null,
  };

  await admin
    .from("email_accounts")
    .update(updates)
    .eq("id", accountId);
}

/**
 * Markiert einen Fehler am Konto.
 */
export async function markAccountError(accountId: string, error: string): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin
    .from("email_accounts")
    .update({ health_status: "warning", last_error: error.slice(0, 500) })
    .eq("id", accountId);
}

/**
 * Inkrementiert Warmup-Tag (täglich via Cron).
 */
export async function advanceWarmupDay(accountId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("email_accounts")
    .select("warmup_day")
    .eq("id", accountId)
    .single();

  if (data) {
    await admin
      .from("email_accounts")
      .update({ warmup_day: (data.warmup_day ?? 0) + 1 })
      .eq("id", accountId);
  }
}
