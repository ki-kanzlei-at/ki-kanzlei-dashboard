/* ── API Route: POST /api/research/discover ──
 * Findet reale Unternehmen nach Branche + Region (Modal „Zielgruppe"). Gratis.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserSettings } from "@/lib/supabase/settings";
import { resolveGeminiKey, discoverCompanies } from "@/lib/research/engine";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const body = await request.json();
    const settings = await getUserSettings(user.id);
    const key = resolveGeminiKey(settings?.gemini_api_key);
    if (!key) {
      return NextResponse.json(
        { error: "Gemini API Key nicht konfiguriert. Bitte unter Einstellungen hinterlegen." },
        { status: 400 },
      );
    }

    const candidates = await discoverCompanies(
      body.branche || "",
      body.region || "",
      body.country || "AT",
      key,
      { size: body.size, revenue: body.revenue, criteria: body.criteria },
    );
    return NextResponse.json({ data: candidates });
  } catch (error) {
    console.error("[API POST /api/research/discover]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
