/* ── Social Media Types ── */

export type SocialMediaPostStatus = "draft" | "scheduled" | "published" | "failed";

export type SocialPlatform = "linkedin" | "instagram" | "facebook";

/* ── Posts ── */

export interface SocialMediaPost {
  id: string;
  user_id: string;
  title: string;
  caption: string | null;
  html_content: string | null;
  image_url: string | null;
  platform: SocialPlatform[];
  status: SocialMediaPostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  publish_results: Record<string, unknown>;
  tags: string[];
  chat_history: unknown[] | null;
  account_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface SocialMediaPostInsert {
  user_id: string;
  title: string;
  caption?: string | null;
  html_content?: string | null;
  image_url?: string | null;
  platform?: SocialPlatform[];
  status?: SocialMediaPostStatus;
  scheduled_at?: string | null;
  tags?: string[];
  chat_history?: unknown[];
  account_ids?: string[];
}

export interface SocialMediaPostUpdate {
  title?: string;
  caption?: string;
  html_content?: string;
  image_url?: string;
  platform?: SocialPlatform[];
  status?: SocialMediaPostStatus;
  scheduled_at?: string | null;
  tags?: string[];
  chat_history?: unknown[];
  account_ids?: string[];
  updated_at?: string;
}

export interface SocialMediaPostStats {
  total: number;
  draft: number;
  scheduled: number;
  published: number;
  failed: number;
  platforms: Record<string, number>;
}

/* ── Accounts ── */

export type AccountHealthStatus = "good" | "warning" | "bad" | "unknown";

export interface SocialMediaAccount {
  id: string;
  user_id: string;
  label: string;
  platform: SocialPlatform;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  platform_user_id: string | null;
  platform_username: string | null;
  platform_avatar_url: string | null;
  page_id: string | null;
  page_name: string | null;
  page_access_token: string | null;
  instagram_business_account_id: string | null;
  scopes: string[];
  is_active: boolean;
  health_status: AccountHealthStatus;
  last_error: string | null;
  total_posts_published: number;
  created_at: string;
  updated_at: string;
}

export interface SocialMediaAccountInsert {
  label: string;
  platform: SocialPlatform;
  access_token?: string | null;
  refresh_token?: string | null;
  token_expires_at?: string | null;
  platform_user_id?: string | null;
  platform_username?: string | null;
  platform_avatar_url?: string | null;
  page_id?: string | null;
  page_name?: string | null;
  page_access_token?: string | null;
  instagram_business_account_id?: string | null;
  scopes?: string[];
  is_active?: boolean;
}

/* ── Config Objects ── */

export const SOCIAL_STATUS_CONFIG: Record<
  SocialMediaPostStatus,
  { label: string; className: string; dot: string }
> = {
  draft:     { label: "Entwurf",        className: "bg-amber-500/10 text-amber-700 border border-amber-500/15",       dot: "bg-amber-500" },
  scheduled: { label: "Geplant",        className: "bg-blue-500/10 text-blue-700 border border-blue-500/15",          dot: "bg-blue-500" },
  published: { label: "Veröffentlicht", className: "bg-emerald-500/10 text-emerald-700 border border-emerald-500/15", dot: "bg-emerald-500" },
  failed:    { label: "Fehlgeschlagen", className: "bg-destructive/10 text-destructive border border-destructive/15", dot: "bg-destructive" },
};

export const PLATFORM_CONFIG: Record<SocialPlatform, { label: string; color: string; icon: string }> = {
  linkedin:  { label: "LinkedIn",  color: "bg-blue-600/10 text-blue-700 border-blue-600/15",  icon: "linkedin" },
  instagram: { label: "Instagram", color: "bg-pink-500/10 text-pink-700 border-pink-500/15",  icon: "instagram" },
  facebook:  { label: "Facebook",  color: "bg-blue-500/10 text-blue-600 border-blue-500/15",  icon: "facebook" },
};
