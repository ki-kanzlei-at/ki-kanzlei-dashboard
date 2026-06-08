/* ── API Route: POST /api/research/resolve-domain ──
 * Erkennt die Website-Domain zu einem Firmennamen (Manuell-Eingabe). Gratis,
 * ohne Grounding.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserSettings } from "@/lib/supabase/settings";
import { resolveGeminiKey, resolveDomain } from "@/lib/research/engine";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const body = await request.json();
    const company = typeof body.company === "string" ? body.company.trim() : "";
    if (company.length < 3) return NextResponse.json({ data: { domain: null } });

    const settings = await getUserSettings(user.id);
    const key = resolveGeminiKey(settings?.gemini_api_key);
    if (!key) return NextResponse.json({ data: { domain: null } });

    const domain = await resolveDomain(company, body.country || "AT", key);
    return NextResponse.json({ data: { domain } });
  } catch (error) {
    console.error("[API POST /api/research/resolve-domain]", error);
    return NextResponse.json({ data: { domain: null } });
  }
}
