/* ── API Route: POST /api/leads/search/[id]/retry ──
 * Fehlgeschlagenen SearchJob zurücksetzen und Pipeline erneut starten.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enqueueJob } from "@/lib/jobs/scheduler";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Nicht authentifiziert" },
        { status: 401 },
      );
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: "Ungültige Job-ID" },
        { status: 400 },
      );
    }

    // Admin-Client für alle DB-Operationen (kein RLS-Problem)
    const admin = getSupabaseAdmin();

    // Job laden
    const { data: searchJob, error: fetchError } = await admin
      .from("search_jobs")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !searchJob) {
      console.error("[API Retry] Job laden fehlgeschlagen:", fetchError?.message);
      return NextResponse.json(
        { error: "SearchJob nicht gefunden" },
        { status: 404 },
      );
    }

    if (searchJob.user_id !== user.id) {
      return NextResponse.json(
        { error: "Zugriff verweigert" },
        { status: 403 },
      );
    }

    if (searchJob.status !== "failed") {
      return NextResponse.json(
        { error: "Nur fehlgeschlagene Jobs können wiederholt werden" },
        { status: 400 },
      );
    }

    // Job zurücksetzen auf "pending"
    const { data: updated, error: updateError } = await admin
      .from("search_jobs")
      .update({
        status: "pending",
        error_message: null,
        completed_at: null,
        started_at: null,
        results_count: 0,
        total_count: 0,
        estimated_end_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("[API Retry] Update fehlgeschlagen:", updateError.message);
      return NextResponse.json(
        { error: "Job konnte nicht zurückgesetzt werden" },
        { status: 500 },
      );
    }

    // Über Scheduler einreihen
    const state = enqueueJob({
      jobId: id,
      userId: user.id,
      query: searchJob.query,
      location: searchJob.location,
      country: searchJob.country,
    });

    return NextResponse.json({ data: updated, queued: state === "queued" });
  } catch (error) {
    console.error("[API POST /api/leads/search/[id]/retry] Fehler:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 },
    );
  }
}
