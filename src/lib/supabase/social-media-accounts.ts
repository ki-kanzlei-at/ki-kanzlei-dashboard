/* ── Supabase Data Access Layer: Social Media Accounts ── */

import { createClient } from "./server";
import { getSupabaseAdmin } from "./admin";
import type { SocialMediaAccount, SocialMediaAccountInsert } from "@/types/social-media";

/* ── User-facing CRUD (mit Auth) ── */

export async function getSocialMediaAccounts(userId: string): Promise<SocialMediaAccount[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("social_media_accounts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Fehler beim Laden der Social-Media-Konten: ${error.message}`);
  return (data ?? []) as SocialMediaAccount[];
}

export async function getSocialMediaAccountById(
  id: string,
  userId: string,
): Promise<SocialMediaAccount | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("social_media_accounts")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(error.message);
  }
  return data as SocialMediaAccount;
}

export async function createSocialMediaAccount(
  userId: string,
  input: SocialMediaAccountInsert,
): Promise<SocialMediaAccount> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("social_media_accounts")
    .insert({ user_id: userId, ...input })
    .select()
    .single();

  if (error) throw new Error(`Fehler beim Erstellen: ${error.message}`);
  return data as SocialMediaAccount;
}

export async function updateSocialMediaAccount(
  id: string,
  userId: string,
  updates: Partial<SocialMediaAccountInsert & {
    health_status: SocialMediaAccount["health_status"];
    last_error: string | null;
    access_token: string | null;
    refresh_token: string | null;
    token_expires_at: string | null;
    page_access_token: string | null;
  }>,
): Promise<SocialMediaAccount> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("social_media_accounts")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw new Error(`Fehler beim Aktualisieren: ${error.message}`);
  return data as SocialMediaAccount;
}

export async function deleteSocialMediaAccount(id: string, userId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("social_media_accounts")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw new Error(`Fehler beim Löschen: ${error.message}`);
}

/* ── Admin access (for cron/publishing) ── */

export async function getActiveAccountsByIds(accountIds: string[]): Promise<SocialMediaAccount[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("social_media_accounts")
    .select("*")
    .in("id", accountIds)
    .eq("is_active", true);

  if (error) throw new Error(error.message);
  return (data ?? []) as SocialMediaAccount[];
}

export async function incrementAccountPostCount(accountId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("social_media_accounts")
    .select("total_posts_published")
    .eq("id", accountId)
    .single();

  if (data) {
    await admin
      .from("social_media_accounts")
      .update({
        total_posts_published: (data.total_posts_published ?? 0) + 1,
        health_status: "good",
        last_error: null,
      })
      .eq("id", accountId);
  }
}

export async function markSocialAccountError(accountId: string, error: string): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin
    .from("social_media_accounts")
    .update({ health_status: "warning", last_error: error.slice(0, 500) })
    .eq("id", accountId);
}
