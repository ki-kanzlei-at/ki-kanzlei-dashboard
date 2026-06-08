/* ── API Route: POST /api/brand/analyze-url ──
 * Lädt eine Website, leitet via Gemini die Positionierung ab (Angebot/USP/Zielkunde/
 * Tagline) und gibt Vorschläge für brand_settings zurück. Persistiert NICHTS —
 * der/die User bestätigt/justiert die Felder (Onboarding bzw. Einstellungen).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchWebsiteData } from "@/lib/enrichment/pipeline";
import { extractBrandFromWebsite } from "@/lib/enrichment/brand-gemini";

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

    /* 1) Website scrapen — Homepage + Impressum + Kontakt + Sitemap */
    const websiteData = await fetchWebsiteData(url).catch((err) => {
      console.warn(`[brand/analyze-url] Scraping fehlgeschlagen für ${url}:`, err instanceof Error ? err.message : err);
      return null;
    });

    if (!websiteData || websiteData.pagesLoaded.length === 0) {
      return NextResponse.json(
        { error: "Website konnte nicht geladen werden. Prüfe die URL oder versuche es später." },
        { status: 422 },
      );
    }

    /* 2) Gemini leitet die Positionierung aus dem Content ab */
    const result = await extractBrandFromWebsite({
      companyName: new URL(url).hostname.replace(/^www\./, ""),
      website: url,
      pagesLoaded: websiteData.pagesLoaded,
      websiteContent: websiteData.websiteContent,
    });

    if (!result) {
      return NextResponse.json(
        { error: "AI-Analyse fehlgeschlagen. Bitte Felder manuell ausfüllen." },
        { status: 502 },
      );
    }

    /* 3) Mapping auf brand_settings-Feldnamen */
    return NextResponse.json({
      data: {
        company_name:    result.company_name,
        tagline:         result.tagline,
        offering:        result.offering,
        value_prop:      result.value_prop,
        target_customer: result.target_customer,
      },
      meta: {
        pages_loaded: websiteData.pagesLoaded,
      },
    });
  } catch (error) {
    console.error("[API /api/brand/analyze-url] Fehler:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
