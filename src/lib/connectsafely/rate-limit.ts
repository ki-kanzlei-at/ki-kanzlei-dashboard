/* ──────────────────────────────────────────────────────────────
   ConnectSafely Rate-Limit Guard

   Vor jedem riskanten LinkedIn-Call wird hier geprüft, ob unser
   weiches Limit noch nicht überschritten ist. So vermeiden wir
   429s und vor allem den 24h-Hold nach >90 Connects/Woche.

   Zählwerte kommen aus:
   - linkedin_leads (connection_sent_at, follow_up_sent_at) für
     Connects / Messages (echte Aktionen, persistiert)
   - linkedin_action_log (neue Tabelle) für Profile-Lookups + Search

   Reset-Zeitpunkte respektieren UTC-Tag/Woche/Monat-Grenzen
   gemäß ConnectSafely-Docs.
   ────────────────────────────────────────────────────────────── */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { CS_LIMITS, type CSActionKind } from "./types";

export interface QuotaStatus {
  action: CSActionKind;
  used: number;
  soft: number;
  hard: number;
  remaining: number;
  resetAt: Date;
  shouldBlock: boolean;
}

/* ── Window helpers (UTC) ──────────────────────────────────────── */

function startOfUTCDay(d = new Date()): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function startOfUTCWeekMonday(d = new Date()): Date {
  // ConnectSafely: connect limit resets Mondays 00:00 UTC
  const x = startOfUTCDay(d);
  const dayOfWeek = x.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dayOfWeek + 6) % 7; // Sun→6, Mon→0, Tue→1...
  x.setUTCDate(x.getUTCDate() - daysSinceMonday);
  return x;
}

function startOfUTCMonth(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function nextResetFor(window: "day" | "week" | "month"): Date {
  const now = new Date();
  if (window === "day") {
    const d = startOfUTCDay(now);
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }
  if (window === "week") {
    const d = startOfUTCWeekMonday(now);
    d.setUTCDate(d.getUTCDate() + 7);
    return d;
  }
  const d = startOfUTCMonth(now);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

function windowStartFor(window: "day" | "week" | "month"): Date {
  if (window === "day") return startOfUTCDay();
  if (window === "week") return startOfUTCWeekMonday();
  return startOfUTCMonth();
}

/* ── DB-backed counters ───────────────────────────────────────── */

async function countLinkedInLeadColumn(
  userId: string,
  column: "connection_sent_at" | "follow_up_sent_at",
  since: Date,
): Promise<number> {
  const admin = getSupabaseAdmin();
  const { count } = await admin
    .from("linkedin_leads")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte(column, since.toISOString());
  return count ?? 0;
}

async function countActionLog(
  userId: string,
  action: CSActionKind,
  since: Date,
): Promise<number> {
  const admin = getSupabaseAdmin();
  const { count } = await admin
    .from("linkedin_action_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", action)
    .gte("created_at", since.toISOString());
  return count ?? 0;
}

/* ── Public API ────────────────────────────────────────────────── */

/** Returns current quota status for an action without consuming it. */
export async function getQuota(
  userId: string,
  action: CSActionKind,
): Promise<QuotaStatus> {
  const cfg = CS_LIMITS[action];
  const since = windowStartFor(cfg.window);
  let used = 0;

  if (action === "connectPerWeek") {
    used = await countLinkedInLeadColumn(userId, "connection_sent_at", since);
  } else if (action === "messagePerDay") {
    used = await countLinkedInLeadColumn(userId, "follow_up_sent_at", since);
  } else {
    used = await countActionLog(userId, action, since);
  }

  const remaining = Math.max(0, cfg.soft - used);
  return {
    action,
    used,
    soft: cfg.soft,
    hard: cfg.hard,
    remaining,
    resetAt: nextResetFor(cfg.window),
    shouldBlock: used >= cfg.soft,
  };
}

/** Throws a Rate-Limit-Error if soft quota is exhausted. */
export async function enforceQuota(userId: string, action: CSActionKind): Promise<QuotaStatus> {
  const q = await getQuota(userId, action);
  if (q.shouldBlock) {
    const err = new Error(
      `Tageslimit für ${action} erreicht (${q.used}/${q.soft}). ` +
      `Reset: ${q.resetAt.toISOString()}`,
    ) as Error & { status: number; resetAt: string; action: string };
    err.status = 429;
    err.resetAt = q.resetAt.toISOString();
    err.action = action;
    throw err;
  }
  return q;
}

/** Log a consumed action (used for actions we don't otherwise persist). */
export async function logAction(
  userId: string,
  action: CSActionKind,
  meta?: Record<string, unknown>,
): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin.from("linkedin_action_log").insert({
    user_id: userId,
    action,
    meta: meta ?? null,
    created_at: new Date().toISOString(),
  });
}

/** Convenience: fetches quotas for all relevant actions in one go. */
export async function getAllQuotas(userId: string): Promise<Record<CSActionKind, QuotaStatus>> {
  const actions: CSActionKind[] = [
    "connectPerWeek",
    "messagePerDay",
    "profilePerDay",
    "searchPerMonth",
    "followPerDay",
    "commentPerDay",
  ];
  const entries = await Promise.all(
    actions.map(async (a) => [a, await getQuota(userId, a)] as const),
  );
  return Object.fromEntries(entries) as Record<CSActionKind, QuotaStatus>;
}
