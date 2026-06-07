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
    // RLS stellt sicher, dass nur eigene Recherchen gelöscht werden können.
    await deleteSession(id);
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error("[API DELETE /api/research/[id]]", error);
    return NextResponse.json({ error: "Recherche konnte nicht gelöscht werden" }, { status: 500 });
  }
}
