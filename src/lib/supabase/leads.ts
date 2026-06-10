/* ── Supabase Data Access Layer: Leads & Search Jobs ──
 *
 * Alle Datenbankzugriffe für die Tabellen `leads` und `search_jobs`.
 * Verwendet den Server-Client (Cookie-basiert, RLS-geschützt).
 */

import { createClient } from "./server";
import { bundeslandToOrClauses } from "@/lib/bundesland";
import type {
  Lead,
  LeadInsert,
  LeadUpdate,
  LeadStatus,
  LeadFilters,
  SortOptions,
  SearchJob,
  SearchJobInsert,
  SearchJobStatus,
} from "@/types/leads";

/* ─────────────────────────── Typen ─────────────────────────── */

const SORTABLE_COLUMNS = new Set([
  "company", "industry", "city", "status", "created_at", "email", "website",
]);

/**
 * Escaped einen Suchbegriff für die Verwendung in PostgREST-`or()`-Klauseln.
 * Kommas/Klammern würden sonst als Klausel-Syntax geparst, `%`/`_` als
 * Wildcards. Der Wert wird in doppelte Anführungszeichen gesetzt (PostgREST-
 * Quoting) und Wildcards werden literal escaped.
 */
function ilikePattern(term: string): string {
  const cleaned = term
    .replace(/["\\]/g, "")        // Quotes/Backslashes entfernen (Quoting-sicher)
    .replace(/([%_])/g, "\\$1");  // literale Wildcards escapen
  return `"%${cleaned}%"`;
}

/** Pagination-Optionen */
export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

/** Paginiertes Ergebnis */
export interface PaginatedResult<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Statistik: Anzahl Leads pro Status */
export type LeadStats = Record<LeadStatus, number> & { total: number };

/** Optionale Zusatzfelder beim Aktualisieren des Search-Job-Status */
export interface SearchJobStatusExtras {
  results_count?: number;
  total_count?: number | null;
  estimated_end_at?: string | null;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

/* ───────────────────────── Leads ───────────────────────── */

/**
 * Leads abrufen mit optionalen Filtern und Pagination.
 * RLS sorgt dafür, dass nur Leads des eingeloggten Users zurückkommen.
 */
export async function getLeads(
  filters: LeadFilters = {},
  pagination: PaginationOptions = {},
  sort: SortOptions = {},
  selectColumns = "*",
): Promise<PaginatedResult<Lead>> {
  const supabase = await createClient();

  const page = pagination.page ?? 1;
  const pageSize = pagination.pageSize ?? 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("leads")
    .select(selectColumns, { count: "exact" });

  /* Exakte Filter */
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.exclude_status && filters.exclude_status.length > 0 && !filters.status) {
    query = query.not("status", "in", `(${filters.exclude_status.join(",")})`);
  }
  if (filters.city) {
    if (Array.isArray(filters.city)) {
      query = query.in("city", filters.city);
    } else {
      query = query.eq("city", filters.city);
    }
  }
  if (filters.category) {
    query = query.ilike("category", `%${filters.category}%`);
  }
  if (filters.industry) {
    if (Array.isArray(filters.industry)) {
      query = query.in("industry", filters.industry);
    } else {
      query = query.eq("industry", filters.industry);
    }
  }
  if (filters.search_query) {
    query = query.eq("search_query", filters.search_query);
  }
  if (filters.search_location) {
    query = query.eq("search_location", filters.search_location);
  }
  if (filters.legal_form) {
    // Optionen stammen aus getDistinctLegalForms (exakte DB-Werte) →
    // exakter Match statt Substring ("GmbH" darf nicht "GmbH & Co KG" treffen).
    const forms = Array.isArray(filters.legal_form) ? filters.legal_form : [filters.legal_form];
    query = query.in("legal_form", forms);
  }
  if (filters.country) {
    query = query.eq("country", filters.country);
  }
  if (filters.state) {
    /* Bundesland-Filter: implizit AT-Scope um Kollision mit DE-PLZ zu vermeiden */
    if (!filters.country) query = query.eq("country", "AT");
    const states = Array.isArray(filters.state) ? filters.state : [filters.state];
    const clauses = states.flatMap((s) => bundeslandToOrClauses(s));
    if (clauses.length > 0) query = query.or(clauses.join(","));
  }

  /* ID-Filter (für CRM-Export) */
  if (filters.ids && filters.ids.length > 0) {
    query = query.in("id", filters.ids);
  }

  /* Suchauftrag-Filter: alle Leads aus einem konkreten Job */
  if (filters.search_job_id) {
    query = query.eq("search_job_id", filters.search_job_id);
  }

  /* Präsenz-Filter: nur Leads mit bestimmten Feldern (nicht null & nicht leer) */
  if (filters.has_ceo) { query = query.not("ceo_name", "is", null); query = (query as any).neq("ceo_name", ""); }
  if (filters.has_email) { query = query.not("email", "is", null); query = (query as any).neq("email", ""); }
  if (filters.has_phone) { query = query.not("phone", "is", null); query = (query as any).neq("phone", ""); }
  if (filters.has_website) { query = query.not("website", "is", null); query = (query as any).neq("website", ""); }
  /* Social-Media-Filter: mindestens ein Profil (LinkedIn, Facebook, Instagram, X, YouTube, TikTok) gesetzt */
  if (filters.has_social) {
    query = query.or(
      "social_linkedin.not.is.null,social_facebook.not.is.null,social_instagram.not.is.null,social_twitter.not.is.null,social_youtube.not.is.null,social_tiktok.not.is.null",
    );
  }

  /* Volltextsuche über mehrere Spalten */
  if (filters.search) {
    const term = ilikePattern(filters.search);
    query = query.or(
      `name.ilike.${term},company.ilike.${term},company_name.ilike.${term},email.ilike.${term},city.ilike.${term}`,
    );
  }

  /* Sortierung & Pagination */
  const sortCol = sort.sort_by && SORTABLE_COLUMNS.has(sort.sort_by) ? sort.sort_by : "created_at";
  const ascending = sort.sort_dir === "asc";
  query = query.order(sortCol, { ascending }).range(from, to);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Fehler beim Laden der Leads: ${error.message}`);
  }

  const total = count ?? 0;

  return {
    // Cast über unknown: bei dynamischem selectColumns kann TS den Row-Typ
    // nicht ableiten; Aufrufer mit "id"-Select nutzen nur das id-Feld.
    data: (data ?? []) as unknown as Lead[],
    count: total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Nur die IDs aller Leads, die auf die Filter zutreffen (für
 * "Alle Treffer auswählen" in der Kampagnen-Zielgruppe). Hartes Limit,
 * damit die Antwort klein bleibt; RLS scoped auf den User.
 */
export async function getLeadIds(
  filters: LeadFilters = {},
  limit = 10_000,
): Promise<{ ids: string[]; count: number }> {
  // Nur die id-Spalte laden — Filterlogik bleibt identisch zur Listenansicht.
  // Seitenweise (1000er-Schritte): PostgREST deckelt einzelne Antworten auf
  // max-rows (Supabase-Default 1000) — eine einzelne 10k-Anfrage käme also
  // stillschweigend gekürzt zurück.
  const PAGE = 1000;
  const ids: string[] = [];
  let count = 0;
  for (let page = 1; ids.length < limit; page++) {
    const result = await getLeads(filters, { page, pageSize: PAGE }, {}, "id");
    count = result.count;
    ids.push(...result.data.map((l) => l.id));
    if (result.data.length < PAGE || ids.length >= result.count) break;
  }
  return { ids: ids.slice(0, limit), count };
}

/**
 * Einzelnen Lead anhand der ID abrufen.
 */
export async function getLeadById(id: string): Promise<Lead | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    /* PGRST116 = kein Ergebnis gefunden → null zurückgeben */
    if (error.code === "PGRST116") return null;
    throw new Error(`Fehler beim Laden des Leads: ${error.message}`);
  }

  return data as Lead;
}

/**
 * Sucht einen bereits existierenden Lead (gegen Duplikate aus dem AI Researcher).
 * Match per Website-Domain (bevorzugt) oder exaktem Firmennamen. RLS scoped auf User.
 */
export async function findExistingLead(company: string, website: string | null): Promise<Lead | null> {
  const supabase = await createClient();
  const dom = website
    ? website.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").trim().toLowerCase()
    : null;

  if (dom) {
    const { data } = await supabase.from("leads").select("*").ilike("website", `%${dom}%`).limit(1);
    if (data && data.length) return data[0] as Lead;
  }
  const name = company.trim();
  if (name) {
    const { data } = await supabase.from("leads").select("*").ilike("company", name).limit(1);
    if (data && data.length) return data[0] as Lead;
  }
  return null;
}

/**
 * Mehrere Leads auf einmal einfügen (Bulk Insert).
 * Gibt die eingefügten Leads zurück.
 */
export async function insertLeads(leads: LeadInsert[]): Promise<Lead[]> {
  if (leads.length === 0) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("leads")
    .insert(leads)
    .select();

  if (error) {
    throw new Error(`Fehler beim Einfügen der Leads: ${error.message}`);
  }

  return (data ?? []) as Lead[];
}

/**
 * Status eines Leads aktualisieren.
 * Setzt automatisch `updated_at` auf den aktuellen Zeitpunkt.
 */
export async function updateLeadStatus(
  id: string,
  status: LeadStatus,
): Promise<Lead> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("leads")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Fehler beim Aktualisieren des Lead-Status: ${error.message}`);
  }

  return data as Lead;
}

/**
 * Lead aktualisieren (beliebige Felder).
 */
export async function updateLead(
  id: string,
  fields: LeadUpdate,
): Promise<Lead> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("leads")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Fehler beim Aktualisieren des Leads: ${error.message}`);
  }

  return data as Lead;
}

/**
 * Einzelnen Lead löschen.
 */
export async function deleteLead(id: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("leads")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Fehler beim Löschen des Leads: ${error.message}`);
  }
}

/**
 * Mehrere Leads auf einmal löschen.
 */
export async function bulkDeleteLeads(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const supabase = await createClient();

  const { error } = await supabase
    .from("leads")
    .delete()
    .in("id", ids);

  if (error) {
    throw new Error(`Fehler beim Bulk-Löschen der Leads: ${error.message}`);
  }
}

/**
 * Status mehrerer Leads gleichzeitig aktualisieren.
 */
export async function bulkUpdateLeadStatus(
  ids: string[],
  status: LeadStatus,
): Promise<void> {
  if (ids.length === 0) return;

  const supabase = await createClient();

  const { error } = await supabase
    .from("leads")
    .update({ status, updated_at: new Date().toISOString() })
    .in("id", ids);

  if (error) {
    throw new Error(`Fehler beim Bulk-Status-Update: ${error.message}`);
  }
}

/**
 * Filtert Leads basierend auf den Kriterien und gibt ein Query-Objekt zurück.
 * Für Bulk-UPDATE/DELETE fügt Supabase immer einen expliziten Filter hinzu, da
 * filterlose Operationen von PostgREST abgelehnt werden (auch mit RLS).
 */
function applyFilters(query: any, filters: LeadFilters) {
  let hasFilter = false;

  if (filters.status) { query = query.eq("status", filters.status); hasFilter = true; }
  if (filters.city) { query = query.ilike("city", `%${filters.city}%`); hasFilter = true; }
  if (filters.category) { query = query.ilike("category", `%${filters.category}%`); hasFilter = true; }
  if (filters.industry) { query = query.ilike("industry", `%${filters.industry}%`); hasFilter = true; }
  if (filters.search_query) { query = query.eq("search_query", filters.search_query); hasFilter = true; }
  if (filters.search_location) { query = query.eq("search_location", filters.search_location); hasFilter = true; }
  if (filters.legal_form) { query = query.eq("legal_form", filters.legal_form); hasFilter = true; }
  if (filters.country) { query = query.eq("country", filters.country); hasFilter = true; }
  if (filters.state) {
    if (!filters.country) query = query.eq("country", "AT");
    const states = Array.isArray(filters.state) ? filters.state : [filters.state];
    const clauses = states.flatMap((s) => bundeslandToOrClauses(s));
    if (clauses.length > 0) { query = query.or(clauses.join(",")); hasFilter = true; }
  }
  if (filters.search) {
    const term = ilikePattern(filters.search);
    query = query.or(`name.ilike.${term},company.ilike.${term},company_name.ilike.${term},email.ilike.${term},city.ilike.${term}`);
    hasFilter = true;
  }

  // Supabase/PostgREST erfordert immer mindestens einen expliziten Filter für
  // UPDATE/DELETE. Falls keine Domain-Filter aktiv sind, fügen wir einen
  // trivialen Filter hinzu (UUIDs sind nie leere Strings → immer true).
  if (!hasFilter) {
    query = query.not("id", "is", null);
  }

  return query;
}

/**
 * Löscht alle Leads, die auf die Filter zutreffen.
 */
export async function bulkDeleteLeadsByFilters(filters: LeadFilters): Promise<void> {
  const supabase = await createClient();
  let query = supabase.from("leads").delete();
  query = applyFilters(query, filters);
  const { error } = await query;
  if (error) throw new Error(`Fehler beim Bulk-Löschen nach Filtern: ${error.message}`);
}

/**
 * Aktualisiert den Status aller Leads, die auf die Filter zutreffen.
 */
export async function bulkUpdateLeadStatusByFilters(
  filters: LeadFilters,
  status: LeadStatus,
): Promise<void> {
  const supabase = await createClient();
  let query = supabase.from("leads").update({ status, updated_at: new Date().toISOString() });
  query = applyFilters(query, filters);
  const { error } = await query;
  if (error) throw new Error(`Fehler beim Bulk-Status-Update nach Filtern: ${error.message}`);
}

/**
 * Statistiken: Anzahl der Leads gruppiert nach Status.
 */
export async function getLeadStats(): Promise<LeadStats> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("leads")
    .select("status");

  if (error) {
    throw new Error(`Fehler beim Laden der Lead-Statistiken: ${error.message}`);
  }

  const statuses: LeadStatus[] = [
    "new",
    "contacted",
    "interested",
    "not_interested",
    "converted",
  ];

  const stats = Object.fromEntries(
    statuses.map((s) => [s, 0]),
  ) as Record<LeadStatus, number> & { total: number };
  stats.total = 0;

  for (const row of data ?? []) {
    const s = row.status as LeadStatus;
    if (s in stats) {
      stats[s]++;
    }
    stats.total++;
  }

  return stats;
}

/**
 * Distinct industries aus der DB holen, gefiltert nach Status, Land und/oder Bundesland.
 */
export async function getDistinctIndustries(
  filters: { status?: string; country?: string; state?: string | string[] } = {},
): Promise<string[]> {
  const supabase = await createClient();

  let query = supabase.from("leads").select("industry");
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.country) query = query.eq("country", filters.country);
  if (filters.state) {
    if (!filters.country) query = query.eq("country", "AT");
    const states = Array.isArray(filters.state) ? filters.state : [filters.state];
    const clauses = states.flatMap((s) => bundeslandToOrClauses(s));
    if (clauses.length > 0) query = query.or(clauses.join(","));
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Fehler beim Laden der Branchen: ${error.message}`);
  }

  const unique = new Set<string>();
  for (const row of data ?? []) {
    if (row.industry) unique.add(row.industry);
  }

  return Array.from(unique).sort((a, b) => a.localeCompare(b, "de"));
}

/**
 * Distinct Rechtsformen aus der DB holen (nur tatsächlich vorhandene Werte).
 */
export async function getDistinctLegalForms(country?: string): Promise<string[]> {
  const supabase = await createClient();
  let query = supabase.from("leads").select("legal_form");
  if (country) query = query.eq("country", country);
  const { data, error } = await query;
  if (error) throw new Error(`Fehler beim Laden der Rechtsformen: ${error.message}`);
  const unique = new Set<string>();
  for (const row of data ?? []) {
    if (row.legal_form) unique.add(row.legal_form);
  }
  return Array.from(unique).sort((a, b) => a.localeCompare(b, "de"));
}

/**
 * Distinct cities aus der DB holen (nur nicht-leere Werte).
 */
export async function getDistinctCities(country?: string): Promise<string[]> {
  const supabase = await createClient();

  let query = supabase.from("leads").select("city").limit(10000);
  if (country) query = query.eq("country", country);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Fehler beim Laden der Städte: ${error.message}`);
  }

  const unique = new Set<string>();
  for (const row of data ?? []) {
    if (row.city) unique.add(row.city);
  }

  return Array.from(unique).sort((a, b) => a.localeCompare(b, "de"));
}

/**
 * Distinct countries aus der DB holen (nur nicht-leere Werte).
 */
export async function getDistinctCountries(): Promise<string[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("leads")
    .select("country");

  if (error) {
    throw new Error(`Fehler beim Laden der Länder: ${error.message}`);
  }

  const unique = new Set<string>();
  for (const row of data ?? []) {
    if (row.country) unique.add(row.country);
  }

  return Array.from(unique).sort((a, b) => a.localeCompare(b, "de"));
}

/* ─────────────────────── Search Jobs ─────────────────────── */

/**
 * Neuen Such-Job anlegen.
 */
export async function createSearchJob(
  job: SearchJobInsert,
): Promise<SearchJob> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("search_jobs")
    .insert({ ...job, status: job.status ?? "pending" })
    .select()
    .single();

  if (error) {
    throw new Error(`Fehler beim Anlegen des Such-Jobs: ${error.message}`);
  }

  return data as SearchJob;
}

/**
 * Such-Job löschen.
 */
export async function deleteSearchJob(id: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("search_jobs")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Fehler beim Löschen des Such-Jobs: ${error.message}`);
  }
}

/**
 * Alle Such-Jobs des eingeloggten Users abrufen (neueste zuerst).
 */
export async function getSearchJobs(): Promise<SearchJob[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("search_jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Fehler beim Laden der Such-Jobs: ${error.message}`);
  }

  return (data ?? []) as SearchJob[];
}

/**
 * Status eines Such-Jobs aktualisieren.
 */
export async function updateSearchJobStatus(
  id: string,
  status: SearchJobStatus,
  extras: SearchJobStatusExtras = {},
): Promise<SearchJob> {
  const supabase = await createClient();

  const updatePayload: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
    ...extras,
  };

  const { data, error } = await supabase
    .from("search_jobs")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Fehler beim Aktualisieren des Such-Job-Status: ${error.message}`);
  }

  return data as SearchJob;
}

/**
 * Einzelnen Such-Job anhand der ID abrufen.
 */
export async function getSearchJobById(id: string): Promise<SearchJob | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("search_jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Fehler beim Laden des Such-Jobs: ${error.message}`);
  }

  return data as SearchJob;
}
