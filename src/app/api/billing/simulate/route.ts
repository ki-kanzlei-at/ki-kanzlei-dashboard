/* ── DEV ONLY: /api/billing/simulate ──
 *
 * Simuliert Stripe-Status-Wechsel ohne echtes Stripe.
 * Body: { status: 'active' | 'pending_checkout' | 'canceled' | 'free' | 'trialing' | 'past_due' }
 *
 * In Production gibt der Endpunkt 404 zurück — der echte Webhook
 * (späterer `/api/billing/webhook`) schreibt subscription_status.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const VALID = [
  "active", "trialing", "past_due",
  "pending_checkout", "free", "canceled",
] as const;
type SimStatus = typeof VALID[number];

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const status = String(body.status ?? "");
    if (!(VALID as readonly string[]).includes(status)) {
      return NextResponse.json(
        { error: `status muss einer von ${VALID.join(", ")} sein` },
        { status: 400 },
      );
    }

    // user_metadata via Admin-Client schreiben (Service-Role) — der User-Client
    // updated nur die eigene Metadata via auth.updateUser, was hier auch ginge,
    // aber Admin ist konsistent zum späteren Stripe-Webhook-Pfad.
    const admin = getSupabaseAdmin();
    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        subscription_status: status as SimStatus,
        subscription_simulated_at: new Date().toISOString(),
      },
    });
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      subscription_status: status,
      note: "Dev-Simulation — in Production schreibt das nur der Stripe-Webhook.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interner Fehler" },
      { status: 500 },
    );
  }
}
