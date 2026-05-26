/* ── API Route: POST /api/linkedin/search ──
 * ConnectSafely-People-Search mit weichem Quota-Guard
 * (300 Searches/Monat hart, 250/Monat unser Soft-Limit). */

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
        { error: "LinkedIn-Integration nicht konfiguriert. Bitte in den Einstellungen einrichten." },
        { status: 400 },
      );
    }

    const { query, location, cursor, url } = await request.json();
    if (!query?.trim() && !url?.trim()) {
      return NextResponse.json({ error: "Suchbegriff oder Sales-Nav-URL fehlt" }, { status: 400 });
    }

    // ── Quota-Guard ────────────────────────────────────────────
    try {
      await enforceQuota(user.id, "searchPerMonth");
    } catch (e) {
      const err = e as Error & { status?: number; resetAt?: string };
      return NextResponse.json(
        { error: err.message, resetAt: err.resetAt },
        { status: err.status ?? 429 },
      );
    }

    const client = createConnectSafelyClient(integration.apiKey, integration.accountId);

    // Resolve location → ID (optional)
    let locationIds: string[] | undefined;
    if (location?.trim()) {
      try {
        const items = await client.searchParameters(
          integration.accountId, "LOCATION", location.trim(), 5,
        );
        locationIds = items.length > 0 ? items.map((i) => String(i.id)) : undefined;
      } catch { /* ignore */ }
    }

    try {
      const results = await client.searchLinkedIn(integration.accountId, query?.trim() ?? "", {
        locationIds,
        cursor: cursor || undefined,
        url: url || undefined,
      });
      // Log the action (search counts even if no results — LinkedIn charges this)
      logAction(user.id, "searchPerMonth", { query, location, locationIds }).catch(() => {});

      return NextResponse.json({
        data: {
          items: results.items ?? [],
          cursor: results.cursor ?? null,
          paging: results.paging ?? null,
        },
      });
    } catch (e) {
      const err = e as ConnectSafelyError;
      const status = err.status ?? 502;
      return NextResponse.json(
        { error: err.message || "LinkedIn-API-Fehler", resetAt: err.rateLimitReset },
        { status },
      );
    }
  } catch (error) {
    console.error("[API /api/linkedin/search] Internal error:", error);
    const message = error instanceof Error ? error.message : "Interner Serverfehler";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
