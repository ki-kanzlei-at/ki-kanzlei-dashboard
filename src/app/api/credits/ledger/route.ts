/* ── GET /api/credits/ledger ──
 *
 * Paginierte Ledger-History des eingeloggten Users.
 * Query: ?page=1&limit=30&action_type=lead_enrich
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function clampInt(v: unknown, min: number, max: number, def: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const url = new URL(request.url);
    const page     = clampInt(url.searchParams.get("page"), 1, 10_000, 1);
    const pageSize = clampInt(url.searchParams.get("limit"), 1, 200, 30);
    const actionType = url.searchParams.get("action_type") ?? undefined;
    const from = (page - 1) * pageSize;
    const to   = from + pageSize - 1;

    const admin = getSupabaseAdmin();
    let query = admin
      .from("credit_ledger")
      .select("id, delta, balance_after, action_type, action_ref, metadata, created_at", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (actionType) query = query.eq("action_type", actionType);

    const { data, count, error: qErr } = await query;
    if (qErr) throw qErr;

    return NextResponse.json({
      data:      data ?? [],
      count:     count ?? 0,
      page,
      pageSize,
      totalPages: Math.ceil((count ?? 0) / pageSize),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interner Fehler" },
      { status: 500 },
    );
  }
}
