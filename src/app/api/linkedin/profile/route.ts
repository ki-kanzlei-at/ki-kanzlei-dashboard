/* ── API Route: POST /api/linkedin/profile ──
 * ConnectSafely-Profil-Abruf mit 120/Tag-Quota (cached calls zählen nicht). */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserSettings, getLinkedInIntegration } from "@/lib/supabase/settings";
import { createConnectSafelyClient, ConnectSafelyError } from "@/lib/connectsafely/client";
import { enforceQuota, logAction } from "@/lib/connectsafely/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const settings = await getUserSettings(user.id);
    const integration = getLinkedInIntegration(settings);
    if (!integration) {
      return NextResponse.json(
        { error: "LinkedIn-Integration nicht konfiguriert" },
        { status: 400 },
      );
    }

    const { identifier } = await request.json();
    if (!identifier?.trim()) {
      return NextResponse.json({ error: "Profil-Identifier fehlt" }, { status: 400 });
    }

    try {
      await enforceQuota(user.id, "profilePerDay");
    } catch (e) {
      const err = e as Error & { status?: number; resetAt?: string };
      return NextResponse.json(
        { error: err.message, resetAt: err.resetAt },
        { status: err.status ?? 429 },
      );
    }

    const client = createConnectSafelyClient(integration.apiKey, integration.accountId);
    try {
      const profile = await client.getProfile(integration.accountId, identifier.trim());
      // Only log if not from cache — ConnectSafely cached responses don't count
      // against the 120/day limit. We log conservatively (always) since the raw
      // response is mapped into LegacyProfile and we lose `cached` flag there.
      logAction(user.id, "profilePerDay", { identifier }).catch(() => {});
      return NextResponse.json({ data: profile });
    } catch (e) {
      const err = e as ConnectSafelyError;
      return NextResponse.json(
        { error: err.message, resetAt: err.rateLimitReset },
        { status: err.status ?? 502 },
      );
    }
  } catch (error) {
    console.error("[API /api/linkedin/profile]", error);
    const message = error instanceof Error ? error.message : "Interner Serverfehler";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
