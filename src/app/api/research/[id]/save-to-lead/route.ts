/* ── API Route: POST /api/research/[id]/save-to-lead ──
 * Recherche ins CRM übernehmen: bestehenden Lead aktualisieren (Methode „CRM")
 * oder neuen Lead anlegen (URL / Zielgruppe). Protokolliert eine System-Karte.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getSessionWithMessages,
  markSessionSaved,
  addMessage,
} from "@/lib/supabase/research";
import { insertLeads, updateLead, getLeadById, findExistingLead } from "@/lib/supabase/leads";
import { blocksToPlainText } from "@/lib/research/format";
import type { Lead, LeadInsert, LeadUpdate } from "@/types/leads";
import type { ResearchSessionWithMessages, SavedCard, SavedCardItem } from "@/types/research";

/** Strukturierte KI-Recherche-Daten, die am Lead gespeichert werden (für die Lead-Sidebar). */
function buildAiResearch(session: ResearchSessionWithMessages, now: string) {
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

function buildLeadInsert(
  session: ResearchSessionWithMessages,
  userId: string,
  notes: string,
): LeadInsert {
  const lf = session.lead_fields ?? {};
  const ceoFull = [lf.ceo_title, lf.ceo_name].filter(Boolean).join(" ").trim() || null;
  const nameParts = (lf.ceo_name ?? "").trim().split(/\s+/).filter(Boolean);
  const ceoFirst = nameParts[0] ?? null;
  const ceoLast = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;

  return {
    name: ceoFull || session.company,
    company: session.company,
    company_name: session.company,
    // `email` ist NOT NULL in `leads` → leerer String, wenn die Recherche keine fand.
    email: lf.email || "",
    phone: lf.phone ?? null,
    website: session.website,
    address: null,
    street: lf.street ?? null,
    city: session.city,
    postal_code: lf.postal_code ?? null,
    // `state` ist KEINE echte Spalte in `leads` (wird app-seitig aus PLZ abgeleitet) → nicht inserten.
    country: session.country || "AT",
    industry: session.industry,
    legal_form: lf.legal_form ?? null,
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
    notes,
    status: "new",
    search_query: null,
    search_location: null,
    search_job_id: null,
    raw_data: {
      ai_research: buildAiResearch(session, new Date().toISOString()),
    },
    user_id: userId,
  };
}

/** Merge-Update für einen bereits existierenden Lead (Duplikat-Vermeidung):
 *  füllt nur leere Felder, hängt die Notiz an und aktualisiert die KI-Recherche. */
function buildMergeUpdate(existing: Lead, session: ResearchSessionWithMessages, note: string): LeadUpdate {
  const lf = session.lead_fields ?? {};
  const ceoFull = [lf.ceo_title, lf.ceo_name].filter(Boolean).join(" ").trim() || null;
  const prevRaw = (existing.raw_data ?? {}) as Record<string, unknown>;
  return {
    notes: existing.notes ? `${existing.notes}\n\n${note}` : note,
    company_name: existing.company_name || session.company,
    phone: existing.phone || lf.phone || null,
    website: existing.website || session.website,
    industry: existing.industry || session.industry,
    legal_form: existing.legal_form || lf.legal_form || null,
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

/** Strukturierte, lesbare Lead-Notiz aus den Recherche-Feldern (statt einem Blob). */
function buildLeadNotes(session: ResearchSessionWithMessages, overviewFallback: string): string {
  const lf = session.lead_fields ?? {};
  const date = new Date().toLocaleDateString("de-AT");
  const parts: string[] = [`KI-Recherche (${date})`];

  const summary = lf.summary || overviewFallback.split("\n").find((l) => l.trim().length > 40) || "";
  if (summary) parts.push(`\nZusammenfassung:\n${summary}`);

  const kennzahlen = [
    lf.revenue ? `Umsatz: ${lf.revenue}` : "",
    lf.employees ? `Mitarbeiter: ${lf.employees}` : "",
    lf.founded_year ? `Gegründet: ${lf.founded_year}` : "",
    lf.legal_form ? `Rechtsform: ${lf.legal_form}` : "",
  ].filter(Boolean);
  if (kennzahlen.length) parts.push(`\nKennzahlen:\n${kennzahlen.map((k) => `- ${k}`).join("\n")}`);

  if (lf.pain_points) parts.push(`\nMögliche Pain Points:\n${lf.pain_points}`);
  if (lf.our_solution) parts.push(`\nUnser Ansatz:\n${lf.our_solution}`);

  const social = [lf.social_linkedin, lf.social_facebook, lf.social_instagram].filter(Boolean);
  if (social.length) parts.push(`\nSocial:\n${social.map((s) => `- ${s}`).join("\n")}`);

  if (session.sources.length) parts.push(`\nQuellen: ${session.sources.map((s) => s.title).join(", ")}`);
  return parts.join("\n");
}

function buildCard(session: ResearchSessionWithMessages, leadId: string): SavedCard {
  const lf = session.lead_fields ?? {};
  const ceo = [lf.ceo_title, lf.ceo_name].filter(Boolean).join(" ").trim();
  const items: SavedCardItem[] = [
    { icon: "building", label: session.industry || "Branche", detail: [session.city, session.website].filter(Boolean).join(" · ") || "—" },
  ];
  if (ceo) items.push({ icon: "user", label: "Ansprechpartner", detail: ceo });
  if (lf.email || lf.phone) items.push({ icon: "mail", label: "Kontakt", detail: [lf.email, lf.phone].filter(Boolean).join(" · ") });
  if (session.score != null) items.push({ icon: "target", label: "Fit-Score", detail: `${session.score}/100` });
  items.push({ icon: "database", label: "Quellen", detail: `${session.sources.length} verknüpft` });
  return { company: session.company, when: "gerade eben", items, leadId };
}

export async function POST(
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

    // Bereits gespeichert → idempotent
    if (session.saved_lead_id) {
      return NextResponse.json({ data: { leadId: session.saved_lead_id, alreadySaved: true } });
    }

    // Strukturierte Notiz aus den Recherche-Feldern (Zusammenfassung, Kennzahlen,
    // Pain Points, Ansatz, Social) — nicht der rohe Overview-Blob.
    const firstAi = session.messages.find((m) => m.role === "ai");
    const overview = blocksToPlainText(firstAi?.blocks);
    const note = buildLeadNotes(session, overview);

    let leadId: string;
    let merged = false;
    if (session.lead_id) {
      // Aus dem CRM gestartet → genau diesen Lead aktualisieren
      const existing = await getLeadById(session.lead_id);
      if (!existing) return NextResponse.json({ error: "Verknüpfter Lead nicht gefunden" }, { status: 404 });
      await updateLead(existing.id, buildMergeUpdate(existing, session, note));
      leadId = existing.id;
      merged = true;
    } else {
      // Duplikat-Check: existiert die Firma schon (Domain/Name)? → mergen statt doppeln
      const dup = await findExistingLead(session.company, session.website);
      if (dup) {
        await updateLead(dup.id, buildMergeUpdate(dup, session, note));
        leadId = dup.id;
        merged = true;
      } else {
        const [created] = await insertLeads([buildLeadInsert(session, user.id, note)]);
        leadId = created.id;
      }
    }

    // Buchhaltung (Session markieren + System-Karte) — darf den Erfolg nicht kippen:
    // der Lead ist bereits im CRM, also geben wir die leadId in jedem Fall zurück.
    let sysMsg = undefined;
    try {
      await markSessionSaved(session.id, leadId);
      sysMsg = await addMessage(user.id, session.id, { role: "system", card: buildCard(session, leadId) });
    } catch (e) {
      console.error("[save-to-lead] Nachbereitung fehlgeschlagen", e);
    }

    return NextResponse.json({ data: { leadId, message: sysMsg, merged } });
  } catch (error) {
    console.error("[API POST /api/research/[id]/save-to-lead]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
