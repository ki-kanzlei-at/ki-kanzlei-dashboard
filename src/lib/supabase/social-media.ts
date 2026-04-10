/* ── Supabase Data Access Layer: Social Media Posts ── */

import { createClient } from "./server";
import type {
  SocialMediaPost,
  SocialMediaPostInsert,
  SocialMediaPostUpdate,
  SocialMediaPostStats,
  SocialMediaPostStatus,
} from "@/types/social-media";

/* ── Pagination ── */

export interface SocialMediaPaginationOptions {
  page?: number;
  pageSize?: number;
}

export interface SocialMediaPaginatedResult {
  data: SocialMediaPost[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SocialMediaFilters {
  status?: SocialMediaPostStatus;
  platform?: string;
  search?: string;
}

/* ── Read (authenticated user) ── */

export async function getSocialMediaPostsPaginated(
  userId: string,
  filters: SocialMediaFilters = {},
  pagination: SocialMediaPaginationOptions = {},
): Promise<SocialMediaPaginatedResult> {
  const supabase = await createClient();

  const page = pagination.page ?? 1;
  const pageSize = pagination.pageSize ?? 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("social_media_posts")
    .select("*", { count: "exact" })
    .eq("user_id", userId);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.platform) {
    query = query.contains("platform", [filters.platform]);
  }
  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(`title.ilike.${term},caption.ilike.${term}`);
  }

  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Fehler beim Laden der Social-Media-Posts: ${error.message}`);
  }

  const total = count ?? 0;
  return {
    data: (data ?? []) as SocialMediaPost[],
    count: total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getSocialMediaPost(id: string): Promise<SocialMediaPost | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("social_media_posts")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Fehler beim Laden des Posts: ${error.message}`);
  }

  return data as SocialMediaPost;
}

/* ── Create ── */

export async function createSocialMediaPost(post: SocialMediaPostInsert): Promise<SocialMediaPost> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("social_media_posts")
    .insert(post)
    .select()
    .single();

  if (error) {
    throw new Error(`Fehler beim Erstellen des Posts: ${error.message}`);
  }

  return data as SocialMediaPost;
}

/* ── Update ── */

export async function updateSocialMediaPost(
  id: string,
  update: SocialMediaPostUpdate,
): Promise<SocialMediaPost> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("social_media_posts")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Fehler beim Aktualisieren des Posts: ${error.message}`);
  }

  return data as SocialMediaPost;
}

/* ── Delete ── */

export async function deleteSocialMediaPost(id: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("social_media_posts")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Fehler beim Löschen: ${error.message}`);
  }
}

/* ── Stats ── */

export async function getSocialMediaPostStats(userId: string): Promise<SocialMediaPostStats> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("social_media_posts")
    .select("status, platform")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Fehler beim Laden der Statistiken: ${error.message}`);
  }

  const rows = data ?? [];
  const stats: SocialMediaPostStats = {
    total: rows.length,
    draft: 0,
    scheduled: 0,
    published: 0,
    failed: 0,
    platforms: {},
  };

  for (const row of rows) {
    const s = row.status as string;
    if (s === "draft") stats.draft++;
    else if (s === "scheduled") stats.scheduled++;
    else if (s === "published") stats.published++;
    else if (s === "failed") stats.failed++;

    const platforms = (row.platform as string[]) ?? [];
    for (const p of platforms) {
      stats.platforms[p] = (stats.platforms[p] ?? 0) + 1;
    }
  }

  return stats;
}
