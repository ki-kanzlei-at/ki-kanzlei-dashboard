/* ── API Route: GET /api/linkedin/accounts ──
 * ConnectSafely hat keine list-all-accounts API: ein API-Key = ein Konto.
 * Wir geben dieses eine Konto in Legacy-Shape zurück, damit bestehende
 * UI-Komponenten weiterlaufen. */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserSettings, getLinkedInIntegration } from "@/lib/supabase/settings";
import { createConnectSafelyClient } from "@/lib/connectsafely/client";

export async function GET() {
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

    const client = createConnectSafelyClient(integration.apiKey, integration.accountId);
    const accounts = await client.getAccounts();

    const mapped = accounts.map((acc) => {
      const premiumFeatures = acc.connection_params?.im?.premiumFeatures ?? [];
      return {
        id: acc.id,
        name: acc.name ?? acc.connection_params?.im?.username ?? acc.id,
        type: acc.type ?? "classic",
        premiumFeatures,
        status: acc.status ?? "OK",
        publicIdentifier: acc.connection_params?.im?.publicIdentifier ?? null,
      };
    });

    return NextResponse.json({ data: mapped });
  } catch (error) {
    console.error("[API /api/linkedin/accounts]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
