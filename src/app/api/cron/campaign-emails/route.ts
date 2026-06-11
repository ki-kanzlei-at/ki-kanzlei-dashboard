/* ── Cron Job: GET /api/cron/campaign-emails ──
 *
 * Versendet die nächsten fälligen E-Mails pro Kampagne.
 *
 *  • Respektiert campaign.mailbox_id (festgelegte Mailbox) oder fällt
 *    auf User-weite Account-Rotation zurück.
 *  • Beachtet schedule.days/time_from/time_to/timezone pro Kampagne.
 *  • Verarbeitet Sequenzen: nach erfolgreichem Send wird step_index
 *    inkrementiert und next_send_at = now + delays[index-1] gesetzt.
 *  • Auto-Stop on Reply, Bounce, Failure.
 *  • Honoriert campaign.daily_limit (pro Tag).
 *  • Mail-Generierung über src/lib/email/campaign-generator (Gemini
 *    oder Template-Fallback).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getActiveAccountsForUser,
  pickNextAccount,
  incrementAccountSentCount,
  markAccountError,
  type EmailAccount,
} from "@/lib/supabase/email-accounts";
import { sendEmailViaAccount } from "@/lib/email/sender";
import { markLeadContacted } from "@/lib/supabase/lead-status";
import { recordMessage } from "@/lib/inbox/store";
import { generateCampaignMail } from "@/lib/email/campaign-generator";
import { getUserSettingsByUserId } from "@/lib/supabase/settings";
import { normalizeSendWindow, type SendWindow } from "@/lib/campaigns/send-window";
import { consumeCredits } from "@/lib/credits";
import type { Campaign } from "@/types/campaigns";

export const maxDuration = 300;

const MAX_LEADS_PER_CAMPAIGN_PER_RUN = 10;
/* Zeitbudget pro Lauf: rechtzeitig vor maxDuration sauber aussteigen, damit
 * der Lauf nie mitten im Send-Update gekillt wird. */
const RUN_TIME_BUDGET_MS = 240_000;
/* Claim-Fenster: solange gilt ein Lead als "in Bearbeitung" — ein paralleler
 * oder direkt folgender Lauf fasst ihn nicht an (Schutz vor Doppelversand). */
const CLAIM_WINDOW_MS = 15 * 60_000;

export async function GET(request: NextRequest) {
  try {
    /* ── Cron-Auth ── */
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getSupabaseAdmin();

    /* ── Alle aktiven Kampagnen laden ── */
    const { data: campaignsRaw, error: campErr } = await admin
      .from("campaigns")
      .select("*")
      .eq("status", "active");

    if (campErr) {
      console.error("[Cron campaign-emails] Kampagnen laden:", campErr);
      return NextResponse.json({ error: campErr.message }, { status: 500 });
    }

    const campaigns = (campaignsRaw ?? []) as Campaign[];
    if (campaigns.length === 0) {
      return NextResponse.json({ message: "Keine aktiven Kampagnen", processed: 0 });
    }

    /* Fairness zwischen Usern/Kampagnen: Reihenfolge pro Lauf mischen, damit
     * bei knappem Zeitbudget nicht immer dieselben Kampagnen zuerst (und die
     * letzten nie) drankommen. */
    for (let i = campaigns.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [campaigns[i], campaigns[j]] = [campaigns[j], campaigns[i]];
    }

    const runStartedAt = Date.now();

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    let totalSent = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    let timedOut = false;

    for (const campaign of campaigns) {
      if (Date.now() - runStartedAt > RUN_TIME_BUDGET_MS) {
        timedOut = true;
        break;
      }
      try {
        /* User-Settings früh laden — globale Versand-Defaults gelten als
         * Fallback fürs Sendefenster, Gesamtlimit, Pause/Jitter, Tracking,
         * Abmeldelink & Signatur. */
        const settings = await getUserSettingsByUserId(campaign.user_id);
        const cs = settings?.campaign_settings;
        const signature = cs?.signature || "";
        const globalWindow = normalizeSendWindow(cs?.send_window);
        const brand = settings?.brand_settings;
        const companyContext = {
          companyName: brand?.company_name ?? null,
          offering: brand?.offering ?? null,
          valueProp: brand?.value_prop ?? null,
          targetCustomer: brand?.target_customer ?? null,
        };

        /* Sendefenster prüfen (Kampagne hat Vorrang, sonst globales Fenster) */
        if (!isInCampaignWindow(campaign, globalWindow)) {
          totalSkipped++;
          continue;
        }

        /* Tageslimit prüfen (pro Kampagne) */
        if (await isOverDailyLimit(campaign)) {
          totalSkipped++;
          continue;
        }

        /* Tages-Gesamtlimit über alle Postfächer des Users (0 = aus) */
        const totalDailyCap = cs?.total_daily_limit ?? 0;
        let userSentToday = totalDailyCap > 0 ? await getUserSentTodayTotal(campaign.user_id) : 0;
        if (totalDailyCap > 0 && userSentToday >= totalDailyCap) {
          totalSkipped++;
          continue;
        }

        /* Account-Quelle bestimmen */
        const accounts = await loadAccountsForCampaign(campaign);
        if (accounts.length === 0) {
          await admin
            .from("campaigns")
            .update({ error_message: "Keine aktive Mailbox konfiguriert" })
            .eq("id", campaign.id);
          continue;
        }

        /* Fällige Leads holen */
        const sequenceLen = Array.isArray(campaign.sequence_steps)
          ? campaign.sequence_steps.length
          : 0;
        if (sequenceLen === 0) {
          // Schema: leere Sequenz → komplettieren, damit Cron nicht in Schleife läuft
          await admin
            .from("campaigns")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", campaign.id);
          continue;
        }

        const nowIso = new Date().toISOString();
        const { data: dueLeads, error: leadsErr } = await admin
          .from("campaign_leads")
          .select("*, lead:leads(id, company, email, ceo_name, ceo_first_name, ceo_last_name, ceo_title, ceo_gender, city, industry, website)")
          .eq("campaign_id", campaign.id)
          .not("status", "in", "(replied,bounced,failed,completed)")
          .lt("step_index", sequenceLen)
          .or(`next_send_at.is.null,next_send_at.lte.${nowIso}`)
          .order("created_at", { ascending: true })
          .limit(MAX_LEADS_PER_CAMPAIGN_PER_RUN);

        if (leadsErr) {
          console.error(`[Cron] Leads für ${campaign.id}:`, leadsErr);
          continue;
        }

        if (!dueLeads || dueLeads.length === 0) {
          await maybeCompleteCampaign(campaign.id);
          continue;
        }

        /* Tracking: Kampagne hat Vorrang, sonst globaler Default (Fallback true) */
        const trackOpens = campaign.tracking?.opens ?? cs?.track_opens ?? true;
        const trackClicks = campaign.tracking?.clicks ?? cs?.track_clicks ?? true;
        const unsubLink = cs?.unsub_link ?? true;
        const jitterPct = Math.max(0, Math.min(50, cs?.send_jitter ?? 20)) / 100;

        let campaignErrorCleared = false;

        for (const cl of dueLeads) {
          /* Zeitbudget: lieber sauber aussteigen als mitten im Send sterben */
          if (Date.now() - runStartedAt > RUN_TIME_BUDGET_MS) {
            timedOut = true;
            break;
          }
          /* Tages-Gesamtlimit auch innerhalb des Laufs respektieren */
          if (totalDailyCap > 0 && userSentToday >= totalDailyCap) {
            totalSkipped++;
            break;
          }

          const lead = cl.lead;
          if (!lead?.email) {
            await admin
              .from("campaign_leads")
              .update({ status: "failed", error_message: "Keine E-Mail-Adresse", next_send_at: null })
              .eq("id", cl.id);
            await incrementCampaignCounter(campaign.id, "failed_count");
            totalFailed++;
            continue;
          }

          const account = pickNextAccount(accounts);
          if (!account) {
            // Alle Konten am Tageslimit → nächsten Cron-Lauf abwarten
            break;
          }

          const stepIndex = (cl.step_index as number) ?? 0;
          const step = campaign.sequence_steps[stepIndex];
          if (!step) {
            await admin
              .from("campaign_leads")
              .update({ status: "completed", next_send_at: null })
              .eq("id", cl.id);
            continue;
          }

          /* ── Atomarer Claim gegen Doppelversand ──
           * next_send_at wird VOR dem Versand nach vorne geschoben — nur wenn
           * die Zeile noch im fälligen Zustand ist. Greifen zwei überlappende
           * Cron-Läufe zur gleichen Zeile, bekommt genau einer den Zuschlag.
           * Stirbt der Lauf zwischen Send und Update, wird der Lead erst nach
           * dem Claim-Fenster erneut angefasst (statt sofort doppelt). */
          const claimUntil = new Date(Date.now() + CLAIM_WINDOW_MS).toISOString();
          const { data: claimed } = await admin
            .from("campaign_leads")
            .update({ next_send_at: claimUntil })
            .eq("id", cl.id)
            .eq("step_index", stepIndex)
            .not("status", "in", "(replied,bounced,failed,completed)")
            .or(`next_send_at.is.null,next_send_at.lte.${new Date().toISOString()}`)
            .select("id");
          if (!claimed || claimed.length === 0) {
            // Bereits von einem anderen Lauf übernommen (oder Status hat sich geändert)
            totalSkipped++;
            continue;
          }

          try {
            /* ── Credits-Check: kostet 1 mail_generate Credit ──
             * Bei insufficient_credits → Lead skip, Fehler in error_message dokumentieren,
             * Campaign NICHT pausieren (anderer Lead könnte trotzdem klappen mit Top-Up).
             */
            const creditCheck = await consumeCredits(
              campaign.user_id,
              "mail_generate",
              { ref: cl.id, metadata: { campaign_id: campaign.id, lead_id: cl.lead_id, step_index: stepIndex } },
            );
            if (!creditCheck.ok) {
              await admin
                .from("campaign_leads")
                .update({
                  error_message: "Nicht genug Credits — Top-Up im Dashboard kaufen",
                  next_send_at:  new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // 6h später retry
                })
                .eq("id", cl.id);
              await admin
                .from("campaigns")
                .update({ error_message: "Credits aufgebraucht — Top-Up nötig" })
                .eq("id", campaign.id);
              totalSkipped++;
              continue;
            }

            const trackingPixelUrl = trackOpens
              ? `${baseUrl}/api/track/open/${cl.tracking_token}`
              : null;

            // Abmeldelink (DSGVO): mailto an die Antwortadresse — Antwort landet
            // in der Inbox & stoppt die Sequenz, kein Extra-Endpoint nötig.
            const unsubscribeEmail = unsubLink
              ? (campaign.reply_to || account.reply_to || account.sender_email)
              : null;

            const mail = await generateCampaignMail({
              campaign,
              step,
              stepIndex,
              lead: {
                id:              lead.id,
                company:         lead.company,
                email:           lead.email,
                ceo_name:        lead.ceo_name,
                ceo_first_name:  lead.ceo_first_name,
                ceo_last_name:   lead.ceo_last_name,
                ceo_title:       lead.ceo_title,
                ceo_gender:      lead.ceo_gender,
                city:            lead.city,
                industry:        lead.industry,
                website:         lead.website,
              },
              senderName: campaign.sender_name || account.sender_name || account.sender_email,
              signature,
              trackingPixelUrl,
              unsubscribeEmail,
              companyContext,
            });

            const htmlWithClickTracking = trackClicks
              ? rewriteLinksForClickTracking(mail.htmlBody, baseUrl, cl.tracking_token)
              : mail.htmlBody;

            const replyTo = campaign.reply_to || account.reply_to || undefined;

            /* List-Unsubscribe-Header: Gmail/Yahoo verlangen ihn für
             * Bulk-Versand — verbessert Zustellbarkeit & DSGVO-Konformität. */
            const mailHeaders = unsubscribeEmail
              ? { "List-Unsubscribe": `<mailto:${unsubscribeEmail}?subject=Abmelden>` }
              : undefined;

            await sendEmailViaAccount(account, {
              to: lead.email,
              subject: mail.subject,
              htmlBody: htmlWithClickTracking,
              replyTo: replyTo ?? undefined,
              headers: mailHeaders,
            });

            /* Sequenz fortschreiben */
            const newStepIndex = stepIndex + 1;
            const moreSteps = newStepIndex < sequenceLen;
            const delayDays = moreSteps
              ? (campaign.sequence_delays?.[stepIndex]?.value ?? 3)
              : 0;
            // Follow-up-Zeitpunkt zufällig streuen (±jitter), damit das Muster
            // nicht exakt-maschinell wirkt.
            const followupJitter = 1 + (Math.random() * 2 - 1) * jitterPct;
            const nextSendAt = moreSteps
              ? new Date(Date.now() + delayDays * 86_400_000 * followupJitter).toISOString()
              : null;

            const isFirstSend = !cl.sent_at;
            await admin
              .from("campaign_leads")
              .update({
                status: moreSteps ? "sent" : "completed",
                sent_at: isFirstSend ? new Date().toISOString() : cl.sent_at,
                last_sent_at: new Date().toISOString(),
                next_send_at: nextSendAt,
                step_index: newStepIndex,
                email_subject: mail.subject,
                email_text: mail.plainBody.slice(0, 8000),
                sender_email: account.sender_email,
                error_message: null,
              })
              .eq("id", cl.id);

            // Ausgehende Mail in die Inbox spiegeln (zweiseitiger Thread)
            try {
              await recordMessage(admin, {
                userId: campaign.user_id,
                channel: "email",
                direction: "out",
                contactEmail: lead.email,
                contactName: lead.ceo_name || lead.company || lead.email,
                contactCompany: lead.company || null,
                leadId: lead.id,
                campaignId: campaign.id,
                campaignName: campaign.name || null,
                subject: mail.subject,
                body: mail.plainBody,
                fromName: account.sender_name || account.sender_email,
                senderEmail: account.sender_email,
                externalId: `cl-out:${cl.id}:${stepIndex}`,
              });
            } catch (e) {
              console.error("[Cron] Inbox-Spiegelung (out) fehlgeschlagen:", e);
            }

            await incrementAccountSentCount(account.id);
            account.sent_today++;
            userSentToday++;
            await incrementCampaignCounter(campaign.id, "sent_count");
            totalSent++;

            // Lead-Pipeline nachziehen: Neu → Kontaktiert (upgrade-only)
            await markLeadContacted(lead.id);

            /* Versand klappt wieder → alte Kampagnen-Fehlermeldung
             * ("Credits aufgebraucht", "Keine aktive Mailbox", …) zurücksetzen */
            if (!campaignErrorCleared) {
              campaignErrorCleared = true;
              if (campaign.error_message) {
                await admin
                  .from("campaigns")
                  .update({ error_message: null })
                  .eq("id", campaign.id);
              }
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "Unbekannter Fehler";
            console.error(`[Cron] Send-Fehler an ${lead.email} via ${account.sender_email}:`, errorMsg);

            await markAccountError(account.id, errorMsg);
            await admin
              .from("campaign_leads")
              .update({
                status: "failed",
                error_message: errorMsg.slice(0, 500),
                next_send_at: null,
              })
              .eq("id", cl.id);
            await incrementCampaignCounter(campaign.id, "failed_count");
            totalFailed++;
          }

          /* Inter-Send Gap (Anti-Burst). Basis: Kampagnen-gap_seconds, sonst die
           * globale "Pause zwischen E-Mails" (delay_minutes). Mit ±Jitter.
           * Im Serverless-Lauf hart gedeckelt (0,1× / max 5 s) — echtes Pacing
           * macht die Cron-Frequenz. Längere Sleeps würden bei vielen Usern
           * das Zeitbudget eines Laufs auffressen. */
          const baseGapSec = campaign.schedule?.gap_seconds
            ?? (cs?.delay_minutes ? cs.delay_minutes * 60 : 180);
          const gapJitter = 1 + (Math.random() * 2 - 1) * jitterPct;
          const gapMs = Math.min(
            Math.max(0, baseGapSec * gapJitter) * 1000 * 0.1,
            5_000,
          );
          if (gapMs > 0) {
            await new Promise((r) => setTimeout(r, gapMs));
          }
        }

        await maybeCompleteCampaign(campaign.id);
      } catch (err) {
        console.error(`[Cron] Kampagne ${campaign.id} Fehler:`, err);
      }
    }

    return NextResponse.json({
      message: timedOut ? "Cron: Zeitbudget erreicht (Rest im nächsten Lauf)" : "Cron abgeschlossen",
      processed: totalSent + totalFailed,
      sent: totalSent,
      failed: totalFailed,
      skipped: totalSkipped,
      timed_out: timedOut,
    });
  } catch (err) {
    console.error("[Cron campaign-emails]", err);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

/* ───────────────────────── Helpers ──────────────────────────── */

/**
 * Sendefenster-Check: prüft schedule.days[0..6] (Mo..So) und time_from/to
 * in der gewählten Zeitzone. Hat die Kampagne kein eigenes Fenster, gilt das
 * globale Versandfenster (fallback) aus den User-Settings.
 */
function isInCampaignWindow(campaign: Campaign, fallback?: SendWindow): boolean {
  const schedule = (campaign.schedule && Array.isArray(campaign.schedule.days))
    ? campaign.schedule
    : fallback;
  if (!schedule || !Array.isArray(schedule.days)) return true; // Standard: immer

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: schedule.timezone || "Europe/Vienna",
      hour:   "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
    const hour    = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const minute  = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);

    const dayIdx = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
    if (dayIdx < 0) return true;
    if (!schedule.days[dayIdx]) return false;

    const minutes = hour * 60 + minute;
    const [fH, fM] = (schedule.time_from || "09:00").split(":").map(Number);
    const [tH, tM] = (schedule.time_to   || "17:00").split(":").map(Number);
    const fromMin = fH * 60 + (fM || 0);
    const toMin   = tH * 60 + (tM || 0);
    return minutes >= fromMin && minutes < toMin;
  } catch {
    return true;
  }
}

async function isOverDailyLimit(campaign: Campaign): Promise<boolean> {
  if (!campaign.daily_limit || campaign.daily_limit <= 0) return false;
  const admin = getSupabaseAdmin();
  const { count } = await admin
    .from("campaign_leads")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .gte("last_sent_at", startOfDayInTimezone(campaign.schedule?.timezone));
  return (count ?? 0) >= campaign.daily_limit;
}

/** Tagesanfang (00:00) in der Kampagnen-Zeitzone als ISO-Zeitpunkt —
 *  das Tageslimit soll um Mitternacht lokaler Zeit zurücksetzen, nicht UTC. */
function startOfDayInTimezone(timezone?: string): string {
  const tz = timezone || "Europe/Vienna";
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(now);
    const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10) % 24;
    const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    const s = parseInt(parts.find((p) => p.type === "second")?.value ?? "0", 10);
    const sinceMidnightMs = ((h * 60 + m) * 60 + s) * 1000;
    return new Date(now.getTime() - sinceMidnightMs).toISOString();
  } catch {
    return new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  }
}

/** Summe der heute bereits versendeten Mails über ALLE aktiven Postfächer des Users. */
async function getUserSentTodayTotal(userId: string): Promise<number> {
  const admin = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await admin
    .from("email_accounts")
    .select("sent_today, sent_today_date")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (!data) return 0;
  return data.reduce(
    (sum, a) => sum + (a.sent_today_date === today ? (a.sent_today ?? 0) : 0),
    0,
  );
}

async function loadAccountsForCampaign(campaign: Campaign): Promise<EmailAccount[]> {
  const admin = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  /* Auswahl der Kampagne: mehrere Mailboxen (Rotation) > eine Mailbox >
   * alle aktiven Konten des Users. pickNextAccount() rotiert least-used-first
   * und respektiert Warmup-/Tageslimits je Konto. */
  const mailboxIds = Array.isArray(campaign.mailbox_ids)
    ? campaign.mailbox_ids.filter(Boolean)
    : [];
  const fixedIds = mailboxIds.length > 0
    ? mailboxIds
    : campaign.mailbox_id ? [campaign.mailbox_id] : [];

  if (fixedIds.length > 0) {
    const { data } = await admin
      .from("email_accounts")
      .select("*")
      .in("id", fixedIds)
      .eq("user_id", campaign.user_id)
      .eq("is_active", true);
    const accounts = (data ?? []) as EmailAccount[];
    for (const acc of accounts) {
      if (acc.sent_today_date !== today) {
        await admin
          .from("email_accounts")
          .update({ sent_today: 0, sent_today_date: today })
          .eq("id", acc.id);
        acc.sent_today = 0;
        acc.sent_today_date = today;
      }
    }
    return accounts;
  }

  return getActiveAccountsForUser(campaign.user_id);
}

async function maybeCompleteCampaign(campaignId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { count } = await admin
    .from("campaign_leads")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .not("status", "in", "(completed,failed,bounced,replied)");
  if ((count ?? 0) === 0) {
    await admin
      .from("campaigns")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", campaignId);
  }
}

async function incrementCampaignCounter(
  campaignId: string,
  field: string,
): Promise<void> {
  const admin = getSupabaseAdmin();
  const rpcName = `increment_${field}`;
  const { error } = await admin.rpc(rpcName, { p_campaign_id: campaignId });
  if (error) {
    // Fallback ohne RPC
    const { data } = await admin
      .from("campaigns")
      .select(field)
      .eq("id", campaignId)
      .single();
    if (!data) return;
    await admin
      .from("campaigns")
      .update({ [field]: ((data as unknown as Record<string, number>)[field] ?? 0) + 1 })
      .eq("id", campaignId);
  }
}

/**
 * Ersetzt http(s)-Links im HTML durch /api/track/click/<token>?u=…
 * Der Endpoint zählt den Klick und leitet auf die Original-URL weiter.
 * mailto:- und bereits getrackte Links (…/api/track/…) bleiben unangetastet.
 * Berücksichtigt einfach- wie doppelt-gequotete hrefs (HTML-Signaturen!) und
 * dekodiert HTML-Entities (&amp;) vor dem URL-Encoding, damit Query-Parameter
 * nach dem Redirect intakt sind.
 */
function rewriteLinksForClickTracking(
  html: string,
  baseUrl: string,
  token: string,
): string {
  return html.replace(
    /href=("(https?:\/\/[^"]+)"|'(https?:\/\/[^']+)')/gi,
    (match, _full: string, dq: string | undefined, sq: string | undefined) => {
      const raw = dq ?? sq ?? "";
      if (raw.startsWith(`${baseUrl}/api/track/`)) return match; // nicht doppelt tracken
      const url = raw
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      return `href="${baseUrl}/api/track/click/${token}?u=${encodeURIComponent(url)}"`;
    },
  );
}
