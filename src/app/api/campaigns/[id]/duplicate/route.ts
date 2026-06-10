/* ── API: POST /api/campaigns/[id]/duplicate ──
 * Dupliziert eine Kampagne als Entwurf (gleiche Konfiguration & Leads,
 * Zähler auf 0).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { duplicateCampaign } from "@/lib/supabase/campaigns";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const copy = await duplicateCampaign(id, user.id);
    return NextResponse.json({ data: copy }, { status: 201 });
  } catch (err) {
    console.error("[API /api/campaigns/:id/duplicate POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interner Serverfehler" },
      { status: 500 },
    );
  }
}
