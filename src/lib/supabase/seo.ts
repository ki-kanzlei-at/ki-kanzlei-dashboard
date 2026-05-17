/* ── Supabase Data Access Layer: SEO Posts ── */

import { createClient } from "./server";
import { getSupabaseAdmin } from "./admin";
import type { SeoPost, SeoPostInsert, SeoPostStats, SeoPostStatus } from "@/types/seo";

/* ── Pagination ── */

export interface SeoPaginationOptions {
  page?: number;
  pageSize?: number;
}

export interface SeoPaginatedResult {
  data: SeoPost[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SeoFilters {
  status?: SeoPostStatus;
  category?: string;
  search?: string;
}

/* ── Read (authenticated user) ── */

export async function getSeoPostsPaginated(
  userId: string,
  filters: SeoFilters = {},
  pagination: SeoPaginationOptions = {},
): Promise<SeoPaginatedResult> {
  const supabase = await createClient();

  const page = pagination.page ?? 1;
  const pageSize = pagination.pageSize ?? 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("seo_posts")
    .select("*", { count: "exact" })
    .eq("user_id", userId);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.category) {
    query = query.eq("category", filters.category);
  }
  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(`title.ilike.${term},meta_description.ilike.${term},category.ilike.${term}`);
  }

  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Fehler beim Laden der SEO-Posts: ${error.message}`);
  }

  const total = count ?? 0;
  return {
    data: (data ?? []) as SeoPost[],
    count: total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getSeoPost(id: string): Promise<SeoPost | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("seo_posts")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Fehler beim Laden des SEO-Posts: ${error.message}`);
  }

  return data as SeoPost;
}

export async function deleteSeoPost(id: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("seo_posts")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Fehler beim Löschen: ${error.message}`);
  }
}

/* ── Bulk Operations ── */

export async function bulkUpdateSeoPostStatus(
  ids: string[],
  status: SeoPostStatus,
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("seo_posts")
    .update({ status, updated_at: new Date().toISOString() })
    .in("id", ids);

  if (error) {
    throw new Error(`Fehler beim Aktualisieren: ${error.message}`);
  }
}

export async function bulkDeleteSeoPosts(ids: string[]): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("seo_posts")
    .delete()
    .in("id", ids);

  if (error) {
    throw new Error(`Fehler beim Löschen: ${error.message}`);
  }
}

/* ── Stats ── */

export async function getSeoPostStats(userId: string): Promise<SeoPostStats> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("seo_posts")
    .select("status, word_count, category, created_at")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Fehler beim Laden der SEO-Statistiken: ${error.message}`);
  }

  const rows = data ?? [];
  const stats: SeoPostStats = {
    total: rows.length,
    draft: 0,
    published: 0,
    error: 0,
    total_words: 0,
    categories: [],
    posts_per_week: [],
    posts_per_category: [],
  };

  const catSet = new Set<string>();
  const catCount = new Map<string, number>();
  const weekCount = new Map<string, number>();

  for (const row of rows) {
    const s = row.status as string;
    if (s === "draft") stats.draft++;
    else if (s === "published") stats.published++;
    else if (s === "error") stats.error++;
    stats.total_words += (row.word_count as number) || 0;

    if (row.category) {
      catSet.add(row.category as string);
      catCount.set(row.category as string, (catCount.get(row.category as string) ?? 0) + 1);
    }

    // Week calculation
    if (row.created_at) {
      const d = new Date(row.created_at as string);
      const yearStart = new Date(d.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
      const weekKey = `KW ${weekNum}`;
      weekCount.set(weekKey, (weekCount.get(weekKey) ?? 0) + 1);
    }
  }

  stats.categories = [...catSet].sort();

  // Posts per category (sorted desc by count)
  stats.posts_per_category = [...catCount.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  // Posts per week (sorted by week number)
  stats.posts_per_week = [...weekCount.entries()]
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => {
      const numA = parseInt(a.week.replace("KW ", ""));
      const numB = parseInt(b.week.replace("KW ", ""));
      return numA - numB;
    });

  return stats;
}

/* ── Admin: Insert (bypasses RLS) ── */

export async function adminInsertSeoPost(post: SeoPostInsert): Promise<SeoPost> {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("seo_posts")
    .insert(post)
    .select()
    .single();

  if (error) {
    throw new Error(`Fehler beim Erstellen des SEO-Posts: ${error.message}`);
  }

  return data as SeoPost;
}
