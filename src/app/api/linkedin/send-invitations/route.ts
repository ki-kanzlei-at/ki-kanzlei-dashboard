/* ── API Route: POST /api/linkedin/send-invitations ──
 * Sendet Connection-Requests via ConnectSafely.
 * HARTES LIMIT: 90/Woche pro Account → Überschreitung = 24h Hold.
 * Wir nutzen Soft-Cap 80/Woche + per-Call Random-Delay 2-5s. */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserSettings, getLinkedInIntegration } from "@/lib/supabase/settings";
import { createConnectSafelyClient, ConnectSafelyError } from "@/lib/connectsafely/client";
import { enforceQuota, getQuota } from "@/lib/connectsafely/rate-limit";
import {
  getLinkedInLeadsForOutreach,
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

    // Quota-Guard: stoppt sofort wenn Wochen-Limit erreicht
    try {
      await enforceQuota(user.id, "connectPerWeek");
    } catch (e) {
      const err = e as Error & { status?: number; resetAt?: string };
      return NextResponse.json(
        { error: err.message, resetAt: err.resetAt },
        { status: err.status ?? 429 },
      );
    }

    // Tagesziel: kleiner von User-Setting und Rest-Wochenkontingent
    const userDailyLimit = settings?.linkedin_daily_limit ?? 15;
    const quota = await getQuota(user.id, "connectPerWeek");
    const effectiveLimit = Math.min(userDailyLimit, quota.remaining);

    if (effectiveLimit <= 0) {
      return NextResponse.json({
        data: { sent: 0, message: "Wochenlimit für Einladungen erreicht", resetAt: quota.resetAt },
      });
    }

    const leads = await getLinkedInLeadsForOutreach(user.id, effectiveLimit);
    if (leads.length === 0) {
      return NextResponse.json({ data: { sent: 0, message: "Keine Leads in der Queue" } });
    }

    const client = createConnectSafelyClient(integration.apiKey, integration.accountId);
    let sent = 0;
    const errors: string[] = [];

    for (const lead of leads) {
      try {
        // Re-Check Quota vor jedem Call (parallele Cron-Läufe könnten reinfunken)
        const currentQuota = await getQuota(user.id, "connectPerWeek");
        if (currentQuota.shouldBlock) {
          errors.push("Wochenlimit erreicht — Stopp.");
          break;
        }

        const identifier = lead.linkedin_id || lead.linkedin_url;
        await client.sendInvitation(
          integration.accountId,
          identifier,
          lead.invite_message || undefined,
        );

        await updateLinkedInLeadStatus(lead.id, "invited", {
          connection_sent_at: new Date().toISOString(),
        });
        sent++;

        // 2-5s Pause damit LinkedIn das nicht als Bot-Signal sieht
        if (sent < leads.length) await randomDelay(2000, 5000);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unbekannter Fehler";
        const status = (err as ConnectSafelyError).status;

        // 429 von ConnectSafely → hartes Limit erreicht, sofort stoppen
        if (status === 429 || status === 422) {
          await updateLinkedInLeadStatus(lead.id, "error", {
            error_message: "LinkedIn-Einladungslimit erreicht",
          });
          errors.push(`${lead.full_name}: LinkedIn-Limit erreicht`);
          break;
        }

        await updateLinkedInLeadStatus(lead.id, "error", { error_message: message });
        errors.push(`${lead.full_name}: ${message}`);
      }
    }

    return NextResponse.json({
      data: { sent, total: leads.length, errors },
    });
  } catch (error) {
    console.error("[API /api/linkedin/send-invitations]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
