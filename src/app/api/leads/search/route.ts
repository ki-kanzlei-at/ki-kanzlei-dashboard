/* ── API Route: POST /api/leads/search ──
 * Neue Lead-Suche starten: Erstellt einen SearchJob und startet die Enrichment Pipeline.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSearchJob, getSearchJobs } from "@/lib/supabase/leads";
import { enqueueJob } from "@/lib/jobs/scheduler";

/* ── GET: Alle Search Jobs des Users abrufen ── */
export async function GET() {
  try {
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

    const jobs = await getSearchJobs();
    return NextResponse.json({ data: jobs });
  } catch (error) {
    console.error("[API GET /api/leads/search] Fehler:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 },
    );
  }
}

/* ── POST: Neue Suche starten ── */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Authentifizierung prüfen
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

    // Request-Body parsen und validieren
    let body: {
      query?: string;
      location?: string;
      country?: string;
      company_type?: string;
      city?: string;
      require_ceo?: boolean;
      require_email?: boolean;
      require_website?: boolean;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Ungültiger JSON-Body" },
        { status: 400 },
      );
    }

    const {
      query,
      location,
      country = "AT",
      company_type = "all",
      city,
      require_ceo = false,
      require_email = false,
      require_website = false,
    } = body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json(
        { error: "Suchbegriff (query) ist erforderlich" },
        { status: 400 },
      );
    }

    const hasLocation = location && typeof location === "string" && location.trim().length > 0;
    const hasCity = city && typeof city === "string" && city.trim().length > 0;

    if (!hasLocation && !hasCity) {
      return NextResponse.json(
        { error: "Standort (location) oder Stadt (city) ist erforderlich" },
        { status: 400 },
      );
    }

    // Wenn keine Region gewählt aber Stadt angegeben → Stadt als Location verwenden
    const effectiveLocation = hasLocation ? location!.trim() : city!.trim();

    // SearchJob in der Datenbank erstellen
    const displayLocation = hasCity
      ? hasLocation ? `${city!.trim()} (${location!.trim()})` : city!.trim()
      : effectiveLocation;
    const searchJob = await createSearchJob({
      user_id: user.id,
      query: query.trim(),
      location: displayLocation,
      country,
    });

    // Über Scheduler einreihen — startet direkt oder bleibt pending (Queue)
    const state = enqueueJob({
      jobId: searchJob.id,
      userId: user.id,
      query: query.trim(),
      location: effectiveLocation,
      country,
      companyType: company_type,
      city: hasCity ? city!.trim() : undefined,
      requireCeo: require_ceo,
      requireEmail: require_email,
      requireWebsite: require_website,
    });

    return NextResponse.json(
      { data: searchJob, queued: state === "queued" },
      { status: 201 },
    );
  } catch (error) {
    console.error("[API /api/leads/search] Fehler:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 },
    );
  }
}
