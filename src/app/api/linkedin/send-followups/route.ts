/* ── API Route: POST /api/linkedin/send-followups ──
 * Sendet Follow-Up-Messages an akzeptierte Leads via ConnectSafely.
 * HARTES LIMIT: 100 Messages/Tag pro Account. Soft-Cap: 60/Tag. */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserSettings, getLinkedInIntegration } from "@/lib/supabase/settings";
import { createConnectSafelyClient, ConnectSafelyError } from "@/lib/connectsafely/client";
import { enforceQuota, getQuota } from "@/lib/connectsafely/rate-limit";
import {
  getLinkedInLeadsForFollowUp,
  updateLinkedInLeadStatus,
} from "@/lib/supabase/linkedin-leads";

function randomDelay(min: number, max: number) {
  return new Promise((resolve) =>
    setTimeout(resolve, min + Math.random() * (max - min)),
  );
}

export async function POST() {
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

    try {
      await enforceQuota(user.id, "messagePerDay");
    } catch (e) {
      const err = e as Error & { status?: number; resetAt?: string };
      return NextResponse.json(
        { error: err.message, resetAt: err.resetAt },
        { status: err.status ?? 429 },
      );
    }

    const followUpDays = settings?.linkedin_follow_up_days ?? 3;
    const leads = await getLinkedInLeadsForFollowUp(user.id, followUpDays);
    if (leads.length === 0) {
      return NextResponse.json({ data: { sent: 0, message: "Keine Follow-Ups fällig" } });
    }

    const client = createConnectSafelyClient(integration.apiKey, integration.accountId);
    let sent = 0;
    const errors: string[] = [];

    for (const lead of leads) {
      try {
        const q = await getQuota(user.id, "messagePerDay");
        if (q.shouldBlock) {
          errors.push("Tageslimit für Nachrichten erreicht — Stopp.");
          break;
        }

        const identifier = lead.linkedin_id || lead.linkedin_url;
        const message = lead.follow_up_message
          ?? "Vielen Dank für die Vernetzung! Ich freue mich auf den Austausch.";

        await client.sendNewMessage(integration.accountId, identifier, message);
        await updateLinkedInLeadStatus(lead.id, "messaged", {
          follow_up_sent_at: new Date().toISOString(),
        });
        sent++;

        if (sent < leads.length) await randomDelay(3000, 6000);
      } catch (err) {
        const status = (err as ConnectSafelyError).status;
        const msg = err instanceof Error ? err.message : "Unbekannter Fehler";

        if (status === 429) {
          await updateLinkedInLeadStatus(lead.id, "error", {
            error_message: "LinkedIn-Nachrichtenlimit erreicht",
          });
          errors.push(`${lead.full_name}: Nachrichtenlimit erreicht`);
          break;
        }

        await updateLinkedInLeadStatus(lead.id, "error", { error_message: msg });
        errors.push(`${lead.full_name}: ${msg}`);
      }
    }

    return NextResponse.json({ data: { sent, total: leads.length, errors } });
  } catch (error) {
    console.error("[API /api/linkedin/send-followups]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
