/* ── Cron Job: GET /api/cron/campaign-emails ──
 * Versendet E-Mails für aktive Kampagnen über Multi-Account Rotation.
 * Wird alle 5 Minuten von Vercel Cron aufgerufen.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUserSettingsByUserId } from "@/lib/supabase/settings";
import {
  getActiveAccountsForUser,
  pickNextAccount,
  incrementAccountSentCount,
  markAccountError,
} from "@/lib/supabase/email-accounts";
import { sendEmailViaAccount } from "@/lib/email/sender";

export const maxDuration = 300; // 5 Minuten max (Vercel Pro)

export async function GET(request: NextRequest) {
  try {
    // Cron-Auth prüfen
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getSupabaseAdmin();

    // Alle aktiven Kampagnen laden
    const { data: campaigns, error: campError } = await admin
      .from("campaigns")
      .select("*")
      .eq("status", "active");

    if (campError) {
      console.error("[Cron campaign-emails] Kampagnen laden:", campError);
      return NextResponse.json({ error: campError.message }, { status: 500 });
    }

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ message: "Keine aktiven Kampagnen", processed: 0 });
    }

    let totalSent = 0;
    let totalFailed = 0;

    for (const campaign of campaigns) {
      try {
        // E-Mail-Konten für diesen User laden
        const accounts = await getActiveAccountsForUser(campaign.user_id);
        if (accounts.length === 0) {
          await admin
            .from("campaigns")
            .update({ error_message: "Keine aktiven E-Mail-Konten konfiguriert" })
            .eq("id", campaign.id);
          continue;
        }

        // User-Settings für Kampagnen-Einstellungen
        const settings = await getUserSettingsByUserId(campaign.user_id);
        const cs = settings?.campaign_settings;

        // Sendefenster prüfen
        const sendWindow = cs?.send_window || "business";
        if (!isInSendWindow(sendWindow)) continue;

        // Nächste pending Leads holen (max 10 pro Cron-Lauf pro Kampagne)
        const { data: pendingLeads, error: leadsError } = await admin
          .from("campaign_leads")
          .select("*, lead:leads(company, email, ceo_name, website, phone)")
          .eq("campaign_id", campaign.id)
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(10);

        if (leadsError) {
          console.error(`[Cron] Leads laden für Kampagne ${campaign.id}:`, leadsError);
          continue;
        }

        if (!pendingLeads || pendingLeads.length === 0) {
          // Alle Leads verarbeitet?
          const { count: stillPending } = await admin
            .from("campaign_leads")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", campaign.id)
            .eq("status", "pending");

          if ((stillPending ?? 0) === 0) {
            await admin
              .from("campaigns")
              .update({ status: "completed", completed_at: new Date().toISOString() })
              .eq("id", campaign.id);
          }
          continue;
        }

        const delayMs = Math.min(((cs?.delay_minutes ?? 1) * 60 * 1000) / 10, 30000);
        const trackOpens = cs?.track_opens !== false;
        const signature = cs?.signature || "";
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL
          || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

        for (let i = 0; i < pendingLeads.length; i++) {
          const cl = pendingLeads[i];
          const lead = cl.lead;

          if (!lead?.email) {
            await admin
              .from("campaign_leads")
              .update({ status: "failed", error_message: "Keine E-Mail-Adresse" })
              .eq("id", cl.id);
            await incrementCampaignCounter(admin, campaign.id, "failed_count");
            totalFailed++;
            continue;
          }

          // Nächstes verfügbares Konto per Rotation wählen
          const account = pickNextAccount(accounts);
          if (!account) {
            // Alle Konten am Tageslimit → nächsten Cron-Lauf abwarten
            break;
          }

          try {
            const subject = generateSubject(campaign.name, lead);
            const htmlBody = generateHtmlBody(
              lead,
              settings,
              signature,
              trackOpens ? `${baseUrl}/api/track/open/${cl.tracking_token}` : null,
            );

            const replyTo = campaign.reply_to || account.reply_to || cs?.reply_to;

            await sendEmailViaAccount(account, {
              to: lead.email,
              subject,
              htmlBody,
              replyTo,
            });

            // Erfolg markieren
            await admin
              .from("campaign_leads")
              .update({
                status: "sent",
                sent_at: new Date().toISOString(),
                email_subject: subject,
                sender_email: account.sender_email,
              })
              .eq("id", cl.id);

            await incrementAccountSentCount(account.id);
            account.sent_today++; // In-memory aktualisieren für Rotation
            await incrementCampaignCounter(admin, campaign.id, "sent_count");
            totalSent++;
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "Unbekannter Fehler";
            console.error(`[Cron] E-Mail senden an ${lead.email} via ${account.sender_email}:`, errorMsg);

            await markAccountError(account.id, errorMsg);

            await admin
              .from("campaign_leads")
              .update({ status: "failed", error_message: errorMsg.slice(0, 500) })
              .eq("id", cl.id);

            await incrementCampaignCounter(admin, campaign.id, "failed_count");
            totalFailed++;
          }

          // Delay zwischen E-Mails
          if (i < pendingLeads.length - 1 && delayMs > 0) {
            await new Promise((r) => setTimeout(r, delayMs));
          }
        }
      } catch (err) {
        console.error(`[Cron] Kampagne ${campaign.id} Fehler:`, err);
      }
    }

    return NextResponse.json({
      message: "Cron abgeschlossen",
      processed: totalSent + totalFailed,
      sent: totalSent,
      failed: totalFailed,
    });
  } catch (error) {
    console.error("[Cron campaign-emails]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

/* ── Hilfsfunktionen ── */

function isInSendWindow(window: string): boolean {
  const now = new Date();
  const hour = now.getUTCHours() + 1; // CET approximation
  const day = now.getUTCDay();

  switch (window) {
    case "business":
      return day >= 1 && day <= 5 && hour >= 8 && hour < 18;
    case "extended":
      return day >= 1 && day <= 5 && hour >= 7 && hour < 21;
    case "always":
      return true;
    default:
      return true;
  }
}

function generateSubject(
  campaignName: string,
  lead: { company?: string; ceo_name?: string },
): string {
  let subject = campaignName;
  if (lead.company) subject = subject.replace(/\{company\}/gi, lead.company);
  if (lead.ceo_name) subject = subject.replace(/\{name\}/gi, lead.ceo_name);
  return subject;
}

function generateHtmlBody(
  lead: { company?: string; ceo_name?: string; email?: string; website?: string },
  settings: { linkedin_sender_profile?: { name?: string; position?: string; company?: string } | null } | null,
  signature: string,
  trackingPixelUrl: string | null,
): string {
  const senderProfile = settings?.linkedin_sender_profile;
  const name = lead.ceo_name || "Geschäftsführer/in";
  const company = lead.company || "";

  let sig = signature;
  if (sig) {
    sig = sig.replace(/\{name\}/g, senderProfile?.name || "");
    sig = sig.replace(/\{position\}/g, senderProfile?.position || "");
    sig = sig.replace(/\{company\}/g, senderProfile?.company || "");
    sig = sig.split("\n").map((l) => `<p style="margin:0">${l}</p>`).join("");
    sig = `<br/><div style="margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb">${sig}</div>`;
  }

  const trackingPixel = trackingPixelUrl
    ? `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none" alt="" />`
    : "";

  return `
<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a">
  <p>Sehr geehrte/r ${name},</p>
  <p>ich kontaktiere Sie im Zusammenhang mit ${company}.</p>
  ${sig}
</div>
${trackingPixel}
`.trim();
}

async function incrementCampaignCounter(
  admin: ReturnType<typeof getSupabaseAdmin>,
  campaignId: string,
  field: string,
): Promise<void> {
  const rpcName = `increment_${field}`;
  const { error } = await admin.rpc(rpcName, { p_campaign_id: campaignId });

  if (error) {
    const { data } = await admin
      .from("campaigns")
      .select(field)
      .eq("id", campaignId)
      .single();

    if (data) {
      await admin
        .from("campaigns")
        .update({ [field]: ((data as unknown as Record<string, number>)[field] ?? 0) + 1 })
        .eq("id", campaignId);
    }
  }
}
