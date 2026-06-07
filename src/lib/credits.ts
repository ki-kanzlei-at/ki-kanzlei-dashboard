/* ── Credits-Library ──
 *
 * Atomares Consume/Grant über Supabase-RPCs (consume_credits, grant_credits).
 * Schreibt automatisch in credit_balance + credit_ledger.
 *
 * Verwendung in Server-Routes / Server-Actions:
 *   const result = await consumeCredits(userId, 'lead_enrich', { ref: leadId });
 *   if (!result.ok) return { error: 'Nicht genug Credits' };
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  CREDIT_COSTS,
  type CreditAction,
} from "@/lib/billing/plans";

export interface ConsumeResult {
  ok:           boolean;
  remaining:    number;
  reason?:      "insufficient_credits" | "internal_error" | "unauthenticated";
}

export interface GrantResult {
  ok:        boolean;
  balance:   number;
  error?:    string;
}

/**
 * Konsumiert Credits für eine bestimmte Aktion. Atomar via RPC — verhindert
 * Race Conditions wenn mehrere Aktionen gleichzeitig laufen.
 */
export async function consumeCredits(
  userId: string,
  action: CreditAction,
  opts: { ref?: string; metadata?: Record<string, unknown>; overrideAmount?: number } = {},
): Promise<ConsumeResult> {
  const amount = opts.overrideAmount ?? CREDIT_COSTS[action];

  // 0-Credit Aktionen (z.B. mail_send) durchwinken ohne Ledger-Eintrag
  if (amount <= 0) {
    return { ok: true, remaining: await getBalance(userId) };
  }

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("consume_credits", {
      p_user_id:     userId,
      p_amount:      amount,
      p_action_type: action,
      p_action_ref:  opts.ref ?? null,
      p_metadata:    opts.metadata ?? null,
    });

    if (error) {
      console.error("[credits.consume]", error);
      return { ok: false, remaining: 0, reason: "internal_error" };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.ok) {
      return { ok: false, remaining: row?.balance_after ?? 0, reason: "insufficient_credits" };
    }
    return { ok: true, remaining: row.balance_after ?? 0 };
  } catch (err) {
    console.error("[credits.consume] exception", err);
    return { ok: false, remaining: 0, reason: "internal_error" };
  }
}

/**
 * Gutschrift (Plan-Grant beim Subscription-Start / Renewal, Top-Up-Kauf, Refund).
 */
export async function grantCredits(
  userId: string,
  amount: number,
  actionType: "plan_grant" | "topup" | "refund" | "admin_adjust",
  opts: { ref?: string; metadata?: Record<string, unknown> } = {},
): Promise<GrantResult> {
  if (amount <= 0) return { ok: false, balance: 0, error: "amount must be > 0" };

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("grant_credits", {
      p_user_id:     userId,
      p_amount:      amount,
      p_action_type: actionType,
      p_action_ref:  opts.ref ?? null,
      p_metadata:    opts.metadata ?? null,
    });
    if (error) {
      console.error("[credits.grant]", error);
      return { ok: false, balance: 0, error: error.message };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: true, balance: row?.balance_after ?? 0 };
  } catch (err) {
    console.error("[credits.grant] exception", err);
    return { ok: false, balance: 0, error: err instanceof Error ? err.message : "unknown" };
  }
}

/**
 * Aktueller Credit-Stand (schnell, denormalisiert). Returns 0 wenn kein Eintrag existiert.
 */
export async function getBalance(userId: string): Promise<number> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("credit_balance")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.balance as number | undefined) ?? 0;
}

/**
 * Helper: User aus Auth-Cookie ableiten + Balance holen (für UI-Endpoints).
 */
export async function getMyBalance(): Promise<number | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return getBalance(user.id);
}

/**
 * Setzt Plan-Credits zurück auf monthly_credits (Monats-Reset).
 * Wird vom Stripe-Webhook invoice.payment_succeeded und vom Cron aufgerufen.
 */
export async function resetMonthlyCredits(
  userId: string,
  monthlyCredits: number,
  opts: { subscriptionId?: string } = {},
): Promise<GrantResult> {
  const admin = getSupabaseAdmin();
  // Aktuellen Stand auf 0 setzen (verfallende Plan-Credits) und neu grant'en.
  // Top-Up-Credits aus früheren Käufen verfallen nicht — daher nicht löschen,
  // sondern nur die Differenz auf monthly_credits aufstocken? Simpler MVP:
  // immer aufstocken bis monthly_credits, NICHT runtersetzen.
  const { data: balRow } = await admin
    .from("credit_balance").select("balance").eq("user_id", userId).maybeSingle();
  const current = (balRow?.balance as number | undefined) ?? 0;
  if (current >= monthlyCredits) {
    // User hat schon mehr (z.B. durch Top-Ups) → nichts gutschreiben, nur Ledger-Marker
    await admin.from("credit_ledger").insert({
      user_id: userId,
      delta: 0,
      balance_after: current,
      action_type: "plan_grant",
      action_ref: opts.subscriptionId ?? null,
      metadata: { note: "monthly_reset_skipped", existing_balance: current, monthly_credits: monthlyCredits },
    });
    return { ok: true, balance: current };
  }
  const delta = monthlyCredits - current;
  return grantCredits(userId, delta, "plan_grant", {
    ref: opts.subscriptionId,
    metadata: { note: "monthly_reset", topped_up_to: monthlyCredits },
  });
}
