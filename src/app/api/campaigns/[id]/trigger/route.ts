/* ── API: POST /api/campaigns/[id]/trigger ──
 *
 * Manueller Start einer Kampagne (Status -> active).
 * Setzt next_send_at für alle wartenden Leads auf jetzt — damit der
 * nächste Cron-Lauf sie aufgreift.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCampaignById, updateCampaign } from "@/lib/supabase/campaigns";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const campaign = await getCampaignById(id, user.id);
    if (!campaign) {
      return NextResponse.json({ error: "Kampagne nicht gefunden" }, { status: 404 });
    }

    if (campaign.status === "completed") {
      return NextResponse.json(
        { error: "Kampagne ist bereits abgeschlossen" },
        { status: 409 },
      );
    }
    if (campaign.status === "active") {
      return NextResponse.json({ data: campaign });
    }

    // Vorflug: braucht mind. einen aktiven Mailbox-Account
    if (!campaign.mailbox_id) {
      const { count } = await supabase
        .from("email_accounts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_active", true);
      if (!count || count === 0) {
        return NextResponse.json(
          { error: "Keine aktive Mailbox konfiguriert" },
          { status: 400 },
        );
      }
    }

    const updated = await updateCampaign(id, { status: "active" }, user.id);
    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("[API /api/campaigns/:id/trigger POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interner Serverfehler" },
      { status: 500 },
    );
  }
}
