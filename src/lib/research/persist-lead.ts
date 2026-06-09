/* ── Recherche → Lead persistieren ──
 * Gemeinsame Logik für (a) automatisches Speichern direkt beim Recherche-Start
 * und (b) den manuellen „Zum Lead"-Endpoint. KI-Kennzahlen fließen in echte
 * Felder (employee_count/revenue), kein Notiz-Blob; raw_data.ai_research hält
 * Score/Zusammenfassung/Ansatz + session_id für den Deep-Link aus dem Lead-Sheet.
 */

import { insertLeads, updateLead, getLeadById, findExistingLead } from "@/lib/supabase/leads";
import { markSessionSaved } from "@/lib/supabase/research";
import type { Lead, LeadInsert, LeadUpdate } from "@/types/leads";
import type { ResearchSession } from "@/types/research";

/** Mitarbeiter-Freitext ("ca. 57.000", "10-50 Mitarbeiter") → Integer. */
function parseEmployeeCount(s?: string | null): number | null {
  if (!s) return null;
  const m = s.replace(/[.,]/g, "").match(/(\d+)\s*(k|tsd|tausend)?/i);
  if (!m) return null;
  let n = parseInt(m[1], 10);
  if (m[2]) n *= 1000;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function buildAiResearch(session: ResearchSession, now: string) {
  const lf = session.lead_fields ?? {};
  return {
    session_id: session.id,
    score: session.score,
    sources: session.sources,
    summary: lf.summary ?? null,
    employees: lf.employees ?? null,
    revenue: lf.revenue ?? null,
    founded_year: lf.founded_year ?? null,
    pain_points: lf.pain_points ?? null,
    our_solution: lf.our_solution ?? null,
    updated_at: now,
  };
}

function buildLeadInsert(session: ResearchSession, userId: string): LeadInsert {
  const lf = session.lead_fields ?? {};
  const ceoFull = [lf.ceo_title, lf.ceo_name].filter(Boolean).join(" ").trim() || null;
  const nameParts = (lf.ceo_name ?? "").trim().split(/\s+/).filter(Boolean);
  const ceoFirst = nameParts[0] ?? null;
  const ceoLast = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;
  return {
    name: ceoFull || session.company,
    company: session.company,
    company_name: session.company,
    email: lf.email || "", // email ist NOT NULL in leads
    phone: lf.phone ?? null,
    website: session.website,
    address: null,
    street: lf.street ?? null,
    city: session.city,
    postal_code: lf.postal_code ?? null,
    country: session.country || "AT",
    industry: session.industry,
    legal_form: lf.legal_form ?? null,
    employee_count: parseEmployeeCount(lf.employees),
    revenue: lf.revenue ?? null,
    ceo_name: ceoFull,
    ceo_title: lf.ceo_title ?? null,
    ceo_first_name: ceoFirst,
    ceo_last_name: ceoLast,
    ceo_gender: null,
    ceo_source: ceoFull ? "ai_research" : null,
    google_place_id: null,
    google_rating: null,
    google_reviews_count: null,
    social_linkedin: lf.social_linkedin ?? null,
    social_facebook: lf.social_facebook ?? null,
    social_instagram: lf.social_instagram ?? null,
    social_twitter: null,
    social_youtube: null,
    social_tiktok: null,
    notes: null,
    status: "new",
    search_query: null,
    search_location: null,
    search_job_id: null,
    raw_data: { ai_research: buildAiResearch(session, new Date().toISOString()) },
    user_id: userId,
  };
}

function buildMergeUpdate(existing: Lead, session: ResearchSession): LeadUpdate {
  const lf = session.lead_fields ?? {};
  const ceoFull = [lf.ceo_title, lf.ceo_name].filter(Boolean).join(" ").trim() || null;
  const prevRaw = (existing.raw_data ?? {}) as Record<string, unknown>;
  return {
    company_name: existing.company_name || session.company,
    phone: existing.phone || lf.phone || null,
    website: existing.website || session.website,
    industry: existing.industry || session.industry,
    legal_form: existing.legal_form || lf.legal_form || null,
    employee_count: existing.employee_count ?? parseEmployeeCount(lf.employees),
    revenue: existing.revenue || lf.revenue || null,
    ceo_name: existing.ceo_name || ceoFull,
    ceo_title: existing.ceo_title || lf.ceo_title || null,
    street: existing.street || lf.street || null,
    postal_code: existing.postal_code || lf.postal_code || null,
    social_linkedin: existing.social_linkedin || lf.social_linkedin || null,
    social_facebook: existing.social_facebook || lf.social_facebook || null,
    social_instagram: existing.social_instagram || lf.social_instagram || null,
    raw_data: { ...prevRaw, ai_research: buildAiResearch(session, new Date().toISOString()) },
  };
}

/**
 * Speichert eine Recherche-Session als Lead (anlegen oder mergen) und verknüpft die
 * Session (saved_lead_id). Idempotent: bereits gespeicherte Sessions geben die leadId zurück.
 */
export async function saveSessionToLead(
  session: ResearchSession,
  userId: string,
): Promise<{ leadId: string; merged: boolean }> {
  if (session.saved_lead_id) return { leadId: session.saved_lead_id, merged: false };

  let leadId: string;
  let merged = false;

  if (session.lead_id) {
    const existing = await getLeadById(session.lead_id);
    if (existing) {
      await updateLead(existing.id, buildMergeUpdate(existing, session));
      leadId = existing.id;
      merged = true;
    } else {
      const [created] = await insertLeads([buildLeadInsert(session, userId)]);
      leadId = created.id;
    }
  } else {
    const dup = await findExistingLead(session.company, session.website);
    if (dup) {
      await updateLead(dup.id, buildMergeUpdate(dup, session));
      leadId = dup.id;
      merged = true;
    } else {
      const [created] = await insertLeads([buildLeadInsert(session, userId)]);
      leadId = created.id;
    }
  }

  await markSessionSaved(session.id, leadId).catch((e) => console.error("[saveSessionToLead] markSessionSaved", e));
  return { leadId, merged };
}
