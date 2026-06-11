/* ── API: GET /api/campaigns/targeted-leads ──
 *
 * Liefert alle Lead-IDs, die bereits in irgendeiner Kampagne des Users
 * stecken — Grundlage für den Doppelkontakt-Schutz im Kampagnen-Wizard.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    /* RLS-scoped, chunked über range — auch bei zehntausenden Einträgen stabil */
    const ids = new Set<string>();
    const CHUNK = 1000;
    for (let offset = 0; ; offset += CHUNK) {
      const { data, error: qErr } = await supabase
        .from("campaign_leads")
        .select("lead_id")
        .eq("user_id", user.id)
        .range(offset, offset + CHUNK - 1);
      if (qErr) {
        return NextResponse.json({ error: qErr.message }, { status: 500 });
      }
      (data ?? []).forEach((r) => { if (r.lead_id) ids.add(r.lead_id as string); });
      if (!data || data.length < CHUNK) break;
    }

    return NextResponse.json({ data: Array.from(ids) });
  } catch (err) {
    console.error("[API /api/campaigns/targeted-leads GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interner Serverfehler" },
      { status: 500 },
    );
  }
}
