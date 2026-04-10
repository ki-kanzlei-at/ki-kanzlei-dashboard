import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { LeadStatus, LeadFilters } from "@/types/leads";

const VALID_STATUSES: LeadStatus[] = ["new", "contacted", "interested", "not_interested", "converted"];

/**
 * Wendet Domain-Filter auf eine Supabase-Query an.
 * Gibt immer mindestens einen Filter zurück (PostgREST erfordert das für UPDATE/DELETE).
 */
function applyFilters(query: any, filters: LeadFilters) {
  let hasFilter = false;

  if (filters.status) { query = query.eq("status", filters.status); hasFilter = true; }
  if (filters.city) {
    if (Array.isArray(filters.city)) { query = query.in("city", filters.city); }
    else { query = query.eq("city", filters.city); }
    hasFilter = true;
  }
  if (filters.category) { query = query.ilike("category", `%${filters.category}%`); hasFilter = true; }
  if (filters.industry) {
    if (Array.isArray(filters.industry)) { query = query.in("industry", filters.industry); }
    else { query = query.eq("industry", filters.industry); }
    hasFilter = true;
  }
  if (filters.search_query) { query = query.eq("search_query", filters.search_query); hasFilter = true; }
  if (filters.search_location) { query = query.eq("search_location", filters.search_location); hasFilter = true; }
  if (filters.legal_form) {
    if (Array.isArray(filters.legal_form)) {
      const orClause = filters.legal_form.map((lf) => `legal_form.ilike.%${lf}%`).join(",");
      query = query.or(orClause);
    } else {
      query = query.ilike("legal_form", `%${filters.legal_form}%`);
    }
    hasFilter = true;
  }
  if (filters.country) { query = query.eq("country", filters.country); hasFilter = true; }
  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(
      `name.ilike.${term},company.ilike.${term},company_name.ilike.${term},email.ilike.${term},city.ilike.${term}`,
    );
    hasFilter = true;
  }

  if (!hasFilter) {
    query = query.not("id", "is", null);
  }

  return query;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const body = await request.json();
    const { action, ids, status, selectionMode, filters } = body as {
      action: "delete" | "status";
      ids?: string[];
      status?: LeadStatus;
      selectionMode?: "ids" | "all";
      filters?: LeadFilters;
    };

    if (!action) {
      return NextResponse.json({ error: "action ist erforderlich" }, { status: 400 });
    }

    const mode = selectionMode ?? "ids";

    if (mode === "ids") {
      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: "ids[] ist erforderlich für selectionMode 'ids'" }, { status: 400 });
      }
      if (ids.length > 1000) {
        return NextResponse.json({ error: "Maximal 1000 Einträge pro Bulk-Operation" }, { status: 400 });
      }
    } else if (mode === "all") {
      if (!filters) {
        return NextResponse.json({ error: "filters sind erforderlich für selectionMode 'all'" }, { status: 400 });
      }
    }

    // ── DELETE ──
    if (action === "delete") {
      if (mode === "all") {
        let query = supabase.from("leads").delete();
        query = applyFilters(query, filters!);
        const { error } = await query;
        if (error) {
          return NextResponse.json({ error: `Bulk-Delete fehlgeschlagen: ${error.message}` }, { status: 500 });
        }
        return NextResponse.json({ success: true, mode: "all" });
      } else {
        const { error } = await supabase.from("leads").delete().in("id", ids!);
        if (error) {
          return NextResponse.json({ error: `Delete fehlgeschlagen: ${error.message}` }, { status: 500 });
        }
        return NextResponse.json({ success: true, deleted: ids!.length });
      }
    }

    // ── STATUS ──
    if (action === "status") {
      if (!status || !VALID_STATUSES.includes(status)) {
        return NextResponse.json({ error: "Gültiger Status ist erforderlich" }, { status: 400 });
      }

      const updateData = { status, updated_at: new Date().toISOString() };

      if (mode === "all") {
        let query = supabase.from("leads").update(updateData);
        query = applyFilters(query, filters!);
        const { error } = await query;
        if (error) {
          return NextResponse.json({ error: `Bulk-Status-Update fehlgeschlagen: ${error.message}` }, { status: 500 });
        }
        return NextResponse.json({ success: true, mode: "all" });
      } else {
        const { error } = await supabase.from("leads").update(updateData).in("id", ids!);
        if (error) {
          return NextResponse.json({ error: `Status-Update fehlgeschlagen: ${error.message}` }, { status: 500 });
        }
        return NextResponse.json({ success: true, updated: ids!.length });
      }
    }

    return NextResponse.json({ error: `Unbekannte Aktion: ${action}` }, { status: 400 });
  } catch (error) {
    console.error("[API /api/leads/bulk] Fehler:", error);
    const message = error instanceof Error ? error.message : "Interner Serverfehler";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
