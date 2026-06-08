/* ── API Route: POST /api/leads/enrich-from-url ──
 * Lädt eine Website, extrahiert via Gemini Firmendaten und gibt vorausgefüllte
 * Lead-Felder zurück. Wird vom LeadEditSheet "AI ausfüllen"-Button verwendet.
 *
 * Im Gegensatz zur Bulk-Pipeline persistiert dieser Endpoint NICHTS — er liefert
 * nur Vorschläge, die der User im Form-Sheet bestätigen/anpassen kann.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchWebsiteData } from "@/lib/enrichment/pipeline";
import { extractWithGemini } from "@/lib/enrichment/gemini";
import { consumeCredits } from "@/lib/credits";
import { CREDIT_COSTS } from "@/lib/billing/plans";

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = trimmed.startsWith("http") ? new URL(trimmed) : new URL("https://" + trimmed);
    if (!url.hostname.includes(".")) return null;
    return `${url.protocol}//${url.hostname}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const rawUrl: string | undefined = body?.url;
    if (!rawUrl || typeof rawUrl !== "string") {
      return NextResponse.json({ error: "url ist erforderlich" }, { status: 400 });
    }

    const url = normalizeUrl(rawUrl);
    if (!url) {
      return NextResponse.json({ error: "Ungültige URL" }, { status: 400 });
    }

    /* Optional: Firmenname als Hinweis für Gemini (verbessert Stage-1-Treffer) */
    const companyHint: string = typeof body?.company === "string" ? body.company.trim() : "";

    /* 1) Website scrapen — Homepage + Impressum + Kontakt + Sitemap */
    const websiteData = await fetchWebsiteData(url).catch((err) => {
      console.warn(`[enrich-from-url] Scraping fehlgeschlagen für ${url}:`, err instanceof Error ? err.message : err);
      return null;
    });

    if (!websiteData || websiteData.pagesLoaded.length === 0) {
      return NextResponse.json(
        { error: "Website konnte nicht geladen werden. Prüfe die URL oder versuche es später." },
        { status: 422 },
      );
    }

    /* 1b) Credits abbuchen — diese Recherche nutzt Grounding (Google Search) und
     *     kostet wie eine Lead-Anreicherung. Atomar, vor dem teuren AI-Call. */
    const charge = await consumeCredits(user.id, "lead_enrich", {
      metadata: { source: "enrich-from-url", url },
    });
    if (!charge.ok) {
      const msg = charge.reason === "insufficient_credits"
        ? "Nicht genug Credits für die AI-Recherche."
        : "Credits konnten nicht abgebucht werden.";
      return NextResponse.json({ error: msg, remaining: charge.remaining }, { status: 402 });
    }

    /* 2) Gemini extrahiert strukturierte Felder. useGrounding=true → CEO-/Größen-
     *    Recherche via Google Search (gegroundet, wie beim AI-Researcher). */
    const result = await extractWithGemini(
      {
        companyName: companyHint || new URL(url).hostname.replace(/^www\./, ""),
        website: url,
        address: "",
        phone: null,
        pagesLoaded: websiteData.pagesLoaded,
        websiteContent: websiteData.websiteContent,
        emails: websiteData.emails,
        phones: websiteData.phones,
      },
      { useGrounding: true },
    );

    if (!result) {
      return NextResponse.json(
        { error: "AI-Extraktion fehlgeschlagen. Bitte manuell ausfüllen." },
        { status: 502 },
      );
    }

    /* 3) Mapping auf Form-Feldnamen — Sheet kann das 1:1 als form.setValue() konsumieren */
    const ceoName = [result.ceo_title, result.ceo_first_name, result.ceo_last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || null;

    return NextResponse.json({
      data: {
        company:          result.company_name ?? companyHint ?? null,
        industry:         result.industry ?? null,
        legal_form:       result.legal_form ?? null,
        email:            result.email ?? websiteData.emails[0] ?? null,
        phone:            result.phone ?? websiteData.phones[0] ?? null,
        street:           result.street ?? null,
        postal_code:      result.postal_code ?? null,
        city:             result.city ?? null,
        country:          result.country ?? null,
        ceo_gender:       result.ceo_gender !== "unbekannt" ? result.ceo_gender : null,
        ceo_title:        result.ceo_title ?? null,
        ceo_first_name:   result.ceo_first_name ?? null,
        ceo_last_name:    result.ceo_last_name ?? null,
        ceo_name:         ceoName,
        employee_count:   result.employee_count != null ? String(result.employee_count) : null,
        revenue:          result.revenue ?? null,
        notes:            result.summary ?? null,
        social_linkedin:  websiteData.socialLinkedin ?? null,
        social_facebook:  websiteData.socialFacebook ?? null,
        social_instagram: websiteData.socialInstagram ?? null,
        social_twitter:   websiteData.socialTwitter ?? null,
        social_youtube:   websiteData.socialYoutube ?? null,
        social_tiktok:    websiteData.socialTiktok ?? null,
      },
      meta: {
        pages_loaded:    websiteData.pagesLoaded,
        emails_found:    websiteData.emails.length,
        phones_found:    websiteData.phones.length,
        confidence:      result.confidence_score ?? null,
        credits_charged: CREDIT_COSTS.lead_enrich,
        credits_left:    charge.remaining,
      },
    });
  } catch (error) {
    console.error("[API /api/leads/enrich-from-url] Fehler:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
