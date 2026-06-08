/* ── API Route: PATCH /api/inbox/[id] ──
 * Inbox-Status einer Konversation ändern: unread/starred/done/status/snooze.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const STATUSES = new Set(["new", "interested", "meeting", "question", "declined"]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const body = await request.json();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.unread === "boolean") patch.unread = body.unread;
    if (typeof body.starred === "boolean") patch.starred = body.starred;
    if (typeof body.done === "boolean") patch.done = body.done;
    if (typeof body.status === "string" && STATUSES.has(body.status)) patch.status = body.status;
    if ("snoozed_until" in body) {
      const v = body.snoozed_until;
      if (v === null) patch.snoozed_until = null;
      else if (typeof v === "string" && !Number.isNaN(Date.parse(v))) patch.snoozed_until = v;
      else return NextResponse.json({ error: "Ungültiger snoozed_until-Wert" }, { status: 400 });
    }

    // user_id-Scope als Defense-in-Depth (zusätzlich zu RLS) + 404 wenn nichts getroffen.
    const { data, error } = await supabase
      .from("inbox_conversations").update(patch).eq("id", id).eq("user_id", user.id).select("id");
    if (error) {
      console.error("[API PATCH /api/inbox/[id]] db:", error.message);
      return NextResponse.json({ error: "Aktualisierung fehlgeschlagen" }, { status: 500 });
    }
    if (!data || data.length === 0) return NextResponse.json({ error: "Konversation nicht gefunden" }, { status: 404 });
    return NextResponse.json({ data: { ok: true } });
  } catch (e) {
    console.error("[API PATCH /api/inbox/[id]]", e);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
