/* ── Cron Route: GET /api/cron/linkedin-invitations ──
 * Vercel Cron: Mo-Fr 8:00 UTC — sendet Einladungen für alle Auto-Outreach-User.
 * Quota wird PRO USER vor jedem Lead-Loop und vor jedem Einzelcall geprüft. */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { getAllAutoOutreachUsers, getLinkedInIntegration } from "@/lib/supabase/settings";
import {
  adminGetLinkedInLeadsForOutreach,
  adminUpdateLinkedInLeadStatus,
} from "@/lib/supabase/linkedin-leads";
import { createConnectSafelyClient, ConnectSafelyError } from "@/lib/connectsafely/client";
import { getQuota } from "@/lib/connectsafely/rate-limit";

function randomDelay(min: number, max: number) {
  return new Promise((resolve) => setTimeout(resolve, min + Math.random() * (max - min)));
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const users = await getAllAutoOutreachUsers();
    const results: { userId: string; sent: number; errors: string[] }[] = [];

    for (const settings of users) {
      const userId = settings.user_id;
      const integration = getLinkedInIntegration(settings);
      if (!integration) {
        results.push({ userId, sent: 0, errors: ["No ConnectSafely integration"] });
        continue;
      }

      const userDailyLimit = settings.linkedin_daily_limit ?? 15;
      let sent = 0;
      const errors: string[] = [];

      try {
        const quota = await getQuota(userId, "connectPerWeek");
        if (quota.shouldBlock) {
          results.push({ userId, sent: 0, errors: ["Wochenlimit erreicht"] });
          continue;
        }

        const effectiveLimit = Math.min(userDailyLimit, quota.remaining);
        const leads = await adminGetLinkedInLeadsForOutreach(userId, effectiveLimit);
        if (leads.length === 0) {
          results.push({ userId, sent: 0, errors: [] });
          continue;
        }

        const client = createConnectSafelyClient(integration.apiKey, integration.accountId);

        for (const lead of leads) {
          try {
            const q = await getQuota(userId, "connectPerWeek");
            if (q.shouldBlock) {
              errors.push("Wochenlimit erreicht — Stopp.");
              break;
            }

            const identifier = lead.linkedin_id || lead.linkedin_url;
            await client.sendInvitation(
              integration.accountId,
              identifier,
              lead.invite_message || undefined,
            );

            await adminUpdateLinkedInLeadStatus(lead.id, "invited", {
              connection_sent_at: new Date().toISOString(),
            });
            sent++;

            if (sent < leads.length) await randomDelay(2000, 5000);
          } catch (err) {
            const message = err instanceof Error ? err.message : "Unbekannter Fehler";
            const status = (err as ConnectSafelyError).status;
            if (status === 429 || status === 422) {
              await adminUpdateLinkedInLeadStatus(lead.id, "error", {
                error_message: "LinkedIn-Einladungslimit erreicht",
              });
              errors.push(`${lead.full_name}: Limit erreicht`);
              break;
            }
            await adminUpdateLinkedInLeadStatus(lead.id, "error", { error_message: message });
            errors.push(`${lead.full_name}: ${message}`);
          }
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "Unbekannter Fehler");
      }

      results.push({ userId, sent, errors });
    }

    console.log("[Cron linkedin-invitations]", JSON.stringify(results));
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    console.error("[Cron linkedin-invitations]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
