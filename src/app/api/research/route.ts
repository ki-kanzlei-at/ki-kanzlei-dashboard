/* ── API Route: GET & POST /api/research ──
 * GET:  Recherche-Sessions des Users (Rail).
 * POST: Neue Recherche starten (Gemini-grounded) — verbraucht 2 Credits.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserSettings } from "@/lib/supabase/settings";
import { getLeadById } from "@/lib/supabase/leads";
import { getBalance, consumeCredits, grantCredits } from "@/lib/credits";
import { CREDIT_COSTS } from "@/lib/billing/plans";
import { researchCompany, researchAudience, resolveGeminiKey, type ResearchInput } from "@/lib/research/engine";
import { createSession, getSessions, addMessage } from "@/lib/supabase/research";
import { saveSessionToLead } from "@/lib/research/persist-lead";
import { normalizeDomain, companyFromDomain } from "@/lib/research/format";
import type { ResearchMethod } from "@/types/research";
import type { Lead } from "@/types/leads";

export const maxDuration = 60;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

  const sessions = await getSessions(user.id);
  return NextResponse.json({ data: sessions });
}

/** Land aus der Website-TLD ableiten (.de→DE, .ch→CH, .at→AT), sonst Fallback.
 *  Verhindert, dass DE/CH-Firmen fälschlich im AT-Firmenbuch gesucht werden,
 *  und routet CH-Firmen korrekt zu Zefix. */
function countryFromTld(website: string | null | undefined, fallback: string): string {
  if (!website) return fallback;
  const tld = website.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "").split(".").pop();
  if (tld === "de") return "DE";
  if (tld === "ch") return "CH";
  if (tld === "at") return "AT";
  return fallback;
}

function leadFacts(lead: Lead): string {
  return [
    lead.legal_form ? `Rechtsform: ${lead.legal_form}` : "",
    lead.ceo_name ? `Ansprechpartner: ${lead.ceo_name}${lead.ceo_title ? ` (${lead.ceo_title})` : ""}` : "",
    lead.email ? `E-Mail: ${lead.email}` : "",
    lead.phone ? `Telefon: ${lead.phone}` : "",
    lead.industry ? `Branche: ${lead.industry}` : "",
    (lead.street || lead.city) ? `Adresse: ${[lead.street, lead.postal_code, lead.city].filter(Boolean).join(" ")}` : "",
    lead.google_rating ? `Google: ${lead.google_rating}★ (${lead.google_reviews_count ?? 0} Bew.)` : "",
    lead.notes ? `Notizen: ${lead.notes}` : "",
  ].filter(Boolean).join(". ");
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const body = await request.json();
    const method = body.method as string;

    // ── Zielgruppen-Recherche (Beispielfirmen + Angebots-Ansatz im Chat) ──
    if (method === "audience") {
      const branche = (body.branche || "").trim();
      if (!branche) return NextResponse.json({ error: "Zielgruppe fehlt" }, { status: 400 });

      const settings = await getUserSettings(user.id);
      const key = resolveGeminiKey(settings?.gemini_api_key);
      if (!key) return NextResponse.json({ error: "Gemini API Key nicht konfiguriert. Bitte unter Einstellungen hinterlegen." }, { status: 400 });

      const cost = CREDIT_COSTS.lead_research;
      const balance = await getBalance(user.id);
      if (balance < cost) return NextResponse.json({ error: "Nicht genug Credits für eine Recherche.", remaining: balance, required: cost }, { status: 402 });

      const seller = {
        companyName: settings?.brand_settings?.company_name ?? null,
        offering: settings?.brand_settings?.offering ?? null,
        valueProp: settings?.brand_settings?.value_prop ?? null,
        targetCustomer: settings?.brand_settings?.target_customer ?? null,
      };
      const aud = await researchAudience(
        { branche, region: body.region, country: body.country, filters: { size: body.size, revenue: body.revenue, criteria: body.criteria } },
        key, seller,
      );
      if (!aud.grounded) return NextResponse.json({ error: "Keine passenden Firmen gefunden. Passe Zielgruppe oder Filter an." }, { status: 502 });

      const consume = await consumeCredits(user.id, "lead_research", { metadata: { audience: branche } });
      if (!consume.ok) return NextResponse.json({ error: "Nicht genug Credits für eine Recherche.", remaining: consume.remaining }, { status: 402 });

      try {
        const session = await createSession(user.id, {
          method: "target", // DB-Methode (Zielgruppe wird als „target" gespeichert)
          company: `Zielgruppe: ${branche}`,
          website: null,
          industry: branche,
          city: body.region || null,
          country: body.country || "AT",
          score: null,
          facts: null,
          lead_fields: {},
          sources: aud.sources,
          suggestions: aud.suggestions,
        });
        const aiMsg = await addMessage(user.id, session.id, { role: "ai", blocks: aud.blocks });
        return NextResponse.json({ data: { session, messages: [aiMsg], remaining: consume.remaining } }, { status: 201 });
      } catch (persistErr) {
        console.error("[API POST /api/research audience] Persistenz fehlgeschlagen → Erstattung", persistErr);
        await grantCredits(user.id, cost, "refund", { metadata: { reason: "audience_persist_failed", audience: branche } });
        return NextResponse.json({ error: "Recherche konnte nicht gespeichert werden — die Credits wurden erstattet. Bitte erneut versuchen." }, { status: 500 });
      }
    }

    if (!["target", "crm", "url"].includes(method)) {
      return NextResponse.json({ error: "Ungültige Recherche-Methode" }, { status: 400 });
    }

    // 1) Recherche-Subjekt auflösen
    let input: ResearchInput;
    let leadId: string | null = null;
    let statusSnapshot: Lead["status"] | null = null;

    if (method === "crm") {
      if (!body.leadId) return NextResponse.json({ error: "leadId fehlt" }, { status: 400 });
      const lead = await getLeadById(body.leadId);
      if (!lead) return NextResponse.json({ error: "Lead nicht gefunden" }, { status: 404 });
      leadId = lead.id;
      statusSnapshot = lead.status;
      input = {
        company: lead.company,
        website: lead.website,
        industry: lead.industry,
        city: lead.city,
        state: lead.state,
        country: lead.country,
        facts: leadFacts(lead),
      };
    } else if (method === "url") {
      const domain = normalizeDomain(body.url || "");
      if (!domain || !domain.includes(".")) {
        return NextResponse.json({ error: "Bitte eine gültige Website-Adresse angeben" }, { status: 400 });
      }
      input = { company: companyFromDomain(domain), website: domain, country: countryFromTld(domain, body.country || "AT") };
    } else {
      if (!body.company || typeof body.company !== "string") {
        return NextResponse.json({ error: "Firma fehlt" }, { status: 400 });
      }
      input = {
        company: body.company,
        website: body.website || null,
        industry: body.industry || null,
        city: body.city || null,
        state: body.state || null,
        country: countryFromTld(body.website, body.country || "AT"),
      };
    }

    // 2) Gemini-Key auflösen
    const settings = await getUserSettings(user.id);
    const key = resolveGeminiKey(settings?.gemini_api_key);
    if (!key) {
      return NextResponse.json(
        { error: "Gemini API Key nicht konfiguriert. Bitte unter Einstellungen hinterlegen." },
        { status: 400 },
      );
    }

    // 3) Guthaben vorab prüfen (vermeidet teure Recherche für leere Konten)
    const cost = CREDIT_COSTS.lead_research;
    const balance = await getBalance(user.id);
    if (balance < cost) {
      return NextResponse.json(
        { error: "Nicht genug Credits für eine Recherche.", remaining: balance, required: cost },
        { status: 402 },
      );
    }

    // 4) Recherche durchführen — mit Angebots-Kontext aus den Settings (Produkt-Fit)
    const seller = {
      companyName: settings?.brand_settings?.company_name ?? null,
      offering: settings?.brand_settings?.offering ?? null,
      valueProp: settings?.brand_settings?.value_prop ?? null,
      targetCustomer: settings?.brand_settings?.target_customer ?? null,
    };
    const result = await researchCompany(input, key, seller);
    if (!result.grounded) {
      return NextResponse.json(
        { error: "KI-Recherche aktuell nicht möglich. Bitte Gemini-Key / Kontingent prüfen." },
        { status: 502 },
      );
    }

    // 5) Credits abbuchen (atomar)
    const consume = await consumeCredits(user.id, "lead_research", {
      metadata: { company: input.company, method },
    });
    if (!consume.ok) {
      return NextResponse.json(
        { error: "Nicht genug Credits für eine Recherche.", remaining: consume.remaining },
        { status: 402 },
      );
    }

    // 6) Session + erste KI-Nachricht persistieren.
    //    Schlägt die Persistenz NACH der Abbuchung fehl, erstatten wir die Credits
    //    automatisch — so kann nie „belastet, aber kein Ergebnis" entstehen.
    const company = method !== "crm" && result.derived.company_name ? result.derived.company_name : input.company;
    try {
      const session = await createSession(user.id, {
        method: method as ResearchMethod,
        lead_id: leadId,
        company,
        website: input.website ?? null,
        industry: result.derived.industry,
        city: result.derived.city,
        state: result.derived.state,
        country: input.country ?? "AT",
        score: result.score,
        status: statusSnapshot,
        facts: result.facts,
        lead_fields: result.leadFields,
        sources: result.sources,
        suggestions: result.suggestions,
      });
      const aiMsg = await addMessage(user.id, session.id, { role: "ai", blocks: result.blocks });

      // Auto-Save: Recherche sofort als Lead ins CRM (kein manueller „Speichern"-Klick nötig).
      let savedLeadId: string | null = null;
      try {
        const saved = await saveSessionToLead(session, user.id);
        savedLeadId = saved.leadId;
      } catch (e) {
        console.error("[API POST /api/research] Auto-Save als Lead fehlgeschlagen", e);
      }

      return NextResponse.json(
        {
          data: {
            session: { ...session, saved_lead_id: savedLeadId ?? session.saved_lead_id },
            messages: [aiMsg],
            remaining: consume.remaining,
            savedLeadId,
          },
        },
        { status: 201 },
      );
    } catch (persistErr) {
      console.error("[API POST /api/research] Persistenz fehlgeschlagen → Credits-Erstattung", persistErr);
      await grantCredits(user.id, cost, "refund", {
        metadata: { reason: "research_persist_failed", company: input.company, method },
      });
      return NextResponse.json(
        { error: "Recherche konnte nicht gespeichert werden — die Credits wurden erstattet. Bitte erneut versuchen." },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("[API POST /api/research]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
