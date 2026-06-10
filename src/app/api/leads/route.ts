/* ── API Route: GET & POST /api/leads ──
 * GET: Leads abrufen mit optionalen Query-Parametern für Filterung und Pagination.
 * POST: Einen oder mehrere Leads erstellen.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLeads, getLeadIds, insertLeads } from "@/lib/supabase/leads";
import type { LeadStatus, LeadInsert } from "@/types/leads";

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
    const searchJobId = searchParams.get("search_job_id");
    const hasCeo = searchParams.get("has_ceo");
    const hasEmail = searchParams.get("has_email");
    const hasPhone = searchParams.get("has_phone");
    const hasWebsite = searchParams.get("has_website");
    const hasSocial = searchParams.get("has_social");
    const sortBy = searchParams.get("sort_by");
    const sortDir = searchParams.get("sort_dir");
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const limit = parseInt(searchParams.get("limit") ?? "20", 10);
    const idsOnly = searchParams.get("ids_only") === "true";
    const excludeStatusRaw = searchParams.get("exclude_status");
    const excludeStatus = excludeStatusRaw
      ? (excludeStatusRaw.split(",").filter((s) => VALID_STATUSES.includes(s as LeadStatus)) as LeadStatus[])
      : undefined;

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

    if (isNaN(limit) || limit < 1 || limit > 500) {
      return NextResponse.json(
        { error: "Ungültiger limit-Parameter (1-500)" },
        { status: 400 },
      );
    }

    const filters = {
      status: statusParam as LeadStatus | undefined,
      exclude_status: excludeStatus,
      search_query: searchQuery ?? undefined,
      search: search ?? undefined,
      industry: industry ?? undefined,
      city: city ?? undefined,
      country: country ?? undefined,
      state: state ?? undefined,
      legal_form: legalForm ?? undefined,
      search_job_id: searchJobId ?? undefined,
      has_ceo: hasCeo === "true" ? true : undefined,
      has_email: hasEmail === "true" ? true : undefined,
      has_phone: hasPhone === "true" ? true : undefined,
      has_website: hasWebsite === "true" ? true : undefined,
      has_social: hasSocial === "true" ? true : undefined,
    };

    /* IDs-only-Modus: alle Treffer-IDs (für "Alle auswählen" im Kampagnen-Wizard) */
    if (idsOnly) {
      const { ids, count } = await getLeadIds(filters);
      return NextResponse.json({ data: ids, count });
    }

    // Leads aus der Datenbank abrufen (DAL nutzt intern Server-Client mit RLS)
    const result = await getLeads(
      filters,
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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const body = await request.json();

    // Support single lead or array of leads
    const leadsInput: LeadInsert[] = Array.isArray(body) ? body : [body];

    if (leadsInput.length === 0) {
      return NextResponse.json({ error: "Keine Leads übergeben" }, { status: 400 });
    }

    // Validate: company is required
    for (const lead of leadsInput) {
      if (!lead.company || typeof lead.company !== "string" || !lead.company.trim()) {
        return NextResponse.json({ error: "Firma ist ein Pflichtfeld" }, { status: 400 });
      }
      // Ensure user_id is set
      lead.user_id = user.id;
      if (!lead.status) lead.status = "new";
      /* DB-Spalte `name` ist NOT NULL (Legacy-Schema). Wenn das Form nichts
       * mitliefert, fallen wir auf den Entscheider-Namen oder die Firma zurück
       * — beides sind sinnvolle Defaults für Anzeigen/Suche. */
      if (!lead.name || (typeof lead.name === "string" && !lead.name.trim())) {
        lead.name = lead.ceo_name?.trim() || lead.company.trim();
      }
    }

    const created = await insertLeads(leadsInput);

    return NextResponse.json({ data: created, count: created.length }, { status: 201 });
  } catch (error) {
    console.error("[API POST /api/leads] Fehler:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
