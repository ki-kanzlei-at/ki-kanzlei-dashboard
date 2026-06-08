import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLeadById, updateLead, deleteLead } from "@/lib/supabase/leads";
import type { LeadUpdate } from "@/types/leads";

const VALID_STATUSES = ["new", "contacted", "interested", "not_interested", "converted"];

async function authenticate() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticate();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;
    const lead = await getLeadById(id);
    if (!lead) return NextResponse.json({ error: "Lead nicht gefunden" }, { status: 404 });

    return NextResponse.json({ data: lead });
  } catch (error) {
    console.error("[API /api/leads/[id]] GET Fehler:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticate();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;
    const body = await request.json() as LeadUpdate;

    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Ungültiger Status" }, { status: 400 });
    }

    const lead = await updateLead(id, body);
    return NextResponse.json({ data: lead });
  } catch (error) {
    console.error("[API /api/leads/[id]] PATCH Fehler:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticate();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;
    // Sync: verknüpfte AI-Researcher-Sessions entkoppeln, damit keine toten
    // „gespeichert"-Links auf einen gelöschten Lead zeigen (RLS scoped den User).
    try {
      const supabase = await createClient();
      await supabase.from("research_sessions").update({ saved_lead_id: null }).eq("saved_lead_id", id);
      await supabase.from("research_sessions").update({ lead_id: null }).eq("lead_id", id);
    } catch (e) {
      console.error("[API /api/leads/[id]] DELETE: Session-Sync fehlgeschlagen", e);
    }
    await deleteLead(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /api/leads/[id]] DELETE Fehler:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
