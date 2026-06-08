/* ── GET /api/credits/balance ── */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const [{ data: balRow }, { data: subRow }] = await Promise.all([
      admin.from("credit_balance").select("balance, updated_at").eq("user_id", user.id).maybeSingle(),
      admin.from("subscriptions")
        .select("plan, status, monthly_credits, current_period_end, cancel_at_period_end")
        .eq("user_id", user.id).maybeSingle(),
    ]);

    return NextResponse.json({
      balance:      (balRow?.balance as number | undefined) ?? 0,
      updated_at:   balRow?.updated_at ?? null,
      subscription: subRow ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interner Fehler" },
      { status: 500 },
    );
  }
}
