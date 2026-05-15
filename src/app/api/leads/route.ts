/* ── API Route: GET /api/leads ──
 * Leads abrufen mit optionalen Query-Parametern für Filterung und Pagination.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLeads } from "@/lib/supabase/leads";
import type { LeadStatus } from "@/types/leads";

const VALID_STATUSES: LeadStatus[] = [
  "new", "contacted", "interested", "not_interested", "converted",
];

export async function GET(request: NextRequest) {
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

    // Query-Parameter auslesen
    const { searchParams } = request.nextUrl;
    const statusParam = searchParams.get("status");
    const searchQuery = searchParams.get("search_query");
    const search = searchParams.get("search");
    const industryRaw = searchParams.get("industry");
    const cityRaw = searchParams.get("city");
    const industry = industryRaw ? industryRaw.split(",").filter(Boolean) : undefined;
    const city = cityRaw ? cityRaw.split(",").filter(Boolean) : undefined;
    const country = searchParams.get("country");
    const legalFormRaw = searchParams.get("legal_form");
    const legalForm = legalFormRaw ? legalFormRaw.split(",").filter(Boolean) : undefined;
    const stateRaw = searchParams.get("state");
    const state = stateRaw ? stateRaw.split(",").filter(Boolean) : undefined;
    const sortBy = searchParams.get("sort_by");
    const sortDir = searchParams.get("sort_dir");
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const limit = parseInt(searchParams.get("limit") ?? "20", 10);

    // Validierung
    if (statusParam && !VALID_STATUSES.includes(statusParam as LeadStatus)) {
      return NextResponse.json(
        { error: `Ungültiger Status. Erlaubt: ${VALID_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }

    if (isNaN(page) || page < 1) {
      return NextResponse.json(
        { error: "Ungültiger page-Parameter" },
        { status: 400 },
      );
    }

    if (isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: "Ungültiger limit-Parameter (1-100)" },
        { status: 400 },
      );
    }

    // Leads aus der Datenbank abrufen (DAL nutzt intern Server-Client mit RLS)
    const result = await getLeads(
      {
        status: statusParam as LeadStatus | undefined,
        search_query: searchQuery ?? undefined,
        search: search ?? undefined,
        industry: industry ?? undefined,
        city: city ?? undefined,
        country: country ?? undefined,
        state: state ?? undefined,
        legal_form: legalForm ?? undefined,
      },
      { page, pageSize: limit },
      {
        sort_by: sortBy ?? undefined,
        sort_dir: sortDir === "asc" || sortDir === "desc" ? sortDir : undefined,
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("[API /api/leads] Fehler:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler" },
      { status: 500 },
    );
  }
}
