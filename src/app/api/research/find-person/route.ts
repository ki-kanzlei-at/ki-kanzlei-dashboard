/* ── API Route: POST /api/research/find-person ──
 * Findet das LinkedIn-Profil einer Person für den Chat: zuerst die echte
 * Profil-URL über Google-Grounding, dann das vollständige Profil über
 * ConnectSafely /profile. Fällt auf die ConnectSafely-Namenssuche zurück.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserSettings, getLinkedInIntegration } from "@/lib/supabase/settings";
import { createConnectSafelyClient } from "@/lib/connectsafely/client";
import { resolveGeminiKey, findLinkedInUrl } from "@/lib/research/engine";
import type { LegacyProfile } from "@/lib/connectsafely/types";

export const maxDuration = 60;

interface PersonCard {
  id: string;
  name: string;
  headline?: string;
  location?: string;
  profile_url?: string;
  public_profile_url?: string;
  profile_picture_url?: string;
  first_name?: string;
  last_name?: string;
  public_identifier?: string;
  provider_id?: string;
}

function mapProfile(p: LegacyProfile, url: string, fallbackName: string): PersonCard {
  return {
    id: p.public_identifier || p.provider_id || url,
    name: [p.first_name, p.last_name].filter(Boolean).join(" ") || fallbackName,
    headline: p.headline,
    location: p.location,
    profile_url: p.profile_url || url,
    public_profile_url: p.profile_url || url,
    profile_picture_url: p.profile_picture_url,
    first_name: p.first_name,
    last_name: p.last_name,
    public_identifier: p.public_identifier,
    provider_id: p.provider_id,
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { company, name } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: "Name fehlt" }, { status: 400 });

    const settings = await getUserSettings(user.id);
    const integration = getLinkedInIntegration(settings);
    if (!integration) {
      return NextResponse.json({ error: "LinkedIn nicht verbunden", notConfigured: true }, { status: 400 });
    }

    const client = createConnectSafelyClient(integration.apiKey, integration.accountId);
    const key = resolveGeminiKey(settings?.gemini_api_key);

    let person: PersonCard | null = null;

    // 1) Echte LinkedIn-URL über Grounding finden, dann via ConnectSafely auflösen
    const url = key ? await findLinkedInUrl(name.trim(), company || "", key).catch(() => null) : null;
    if (url) {
      try {
        const p = await client.getProfile(integration.accountId, url);
        person = mapProfile(p, url, name.trim());
      } catch { /* fällt unten auf die Namenssuche zurück */ }
    }

    // 2) Fallback: ConnectSafely-Namenssuche
    if (!person) {
      try {
        const res = await client.searchLinkedIn(integration.accountId, `${company || ""} ${name}`.trim(), { limit: 3 });
        const top = (res.items ?? [])[0] as PersonCard | undefined;
        if (top) person = top;
      } catch { /* ignore */ }
    }

    return NextResponse.json({ data: { person, profileUrl: url } });
  } catch (error) {
    console.error("[API POST /api/research/find-person]", error);
    return NextResponse.json({ error: "Profil-Suche fehlgeschlagen" }, { status: 500 });
  }
}
