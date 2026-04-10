/* ── API Route: POST /api/campaigns/[id]/trigger ──
 * Setzt die Kampagne auf "active" — der Cron Job übernimmt den Versand.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCampaignById, updateCampaign } from "@/lib/supabase/campaigns";
import { getEmailAccounts } from "@/lib/supabase/email-accounts";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const { id } = await params;
    const campaign = await getCampaignById(id, user.id);
    if (!campaign) {
      return NextResponse.json({ error: "Kampagne nicht gefunden" }, { status: 404 });
    }

    if (campaign.status !== "draft" && campaign.status !== "paused") {
      return NextResponse.json(
        { error: "Kampagne kann nur aus dem Status 'Entwurf' oder 'Pausiert' gestartet werden" },
        { status: 400 },
      );
    }

    // Prüfen ob aktive E-Mail-Konten vorhanden sind
    const accounts = await getEmailAccounts(user.id);
    const activeAccounts = accounts.filter((a) => a.is_active);
    if (activeAccounts.length === 0) {
      return NextResponse.json(
        { error: "Keine aktiven E-Mail-Konten konfiguriert. Bitte unter Einstellungen → Kampagnen mindestens ein Konto anlegen." },
        { status: 400 },
      );
    }

    // Status auf active setzen — Cron Job übernimmt den Versand
    const updated = await updateCampaign(id, { status: "active", error_message: null }, user.id);

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[API /api/campaigns/[id]/trigger]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
