/* ── API Route: GET /api/research/[id] ──
 * Eine Recherche-Session inkl. Chat-Verlauf.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionWithMessages, deleteSession } from "@/lib/supabase/research";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;
    const session = await getSessionWithMessages(id);
    if (!session) return NextResponse.json({ error: "Recherche nicht gefunden" }, { status: 404 });

    return NextResponse.json({ data: session });
  } catch (error) {
    console.error("[API GET /api/research/[id]]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;
    // Sync: verknüpfte Leads entkoppeln, damit das Sheet keinen toten „Im AI Researcher
    // öffnen"-Link mehr zeigt (Session existiert nicht mehr).
    try {
      const { data: linked } = await supabase
        .from("leads").select("id, raw_data")
        .eq("raw_data->ai_research->>session_id", id);
      for (const l of linked ?? []) {
        const raw = (l.raw_data ?? {}) as Record<string, unknown>;
        const air = (raw.ai_research ?? {}) as Record<string, unknown>;
        await supabase.from("leads").update({
          raw_data: { ...raw, ai_research: { ...air, session_id: null } },
        }).eq("id", l.id);
      }
    } catch (e) {
      console.error("[research DELETE] Lead-Sync fehlgeschlagen", e);
    }
    // RLS stellt sicher, dass nur eigene Recherchen gelöscht werden können.
    await deleteSession(id);
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error("[API DELETE /api/research/[id]]", error);
    return NextResponse.json({ error: "Recherche konnte nicht gelöscht werden" }, { status: 500 });
  }
}
