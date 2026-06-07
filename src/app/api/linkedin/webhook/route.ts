/* ── API Route: POST /api/linkedin/webhook ──
 *
 * ConnectSafely Webhook Receiver
 *  - Event-Typ aktuell: `message.received` (weitere folgen laut Docs)
 *  - Signature: HMAC-SHA256 über raw body, Header `X-Webhook-Signature: sha256=<hex>`
 *  - Replay-Schutz: `X-Webhook-Timestamp` darf nicht älter als 5 Minuten sein
 *  - Endpoint muss innerhalb 15s mit 2xx antworten — sonst Retry
 *
 * Docs: https://connectsafely.ai/docs/webhooks/security
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordMessage } from "@/lib/inbox/store";

const MAX_TIMESTAMP_SKEW_S = 5 * 60; // 5 Minuten Replay-Window

interface ConnectSafelyMessageEvent {
  event: "message.received" | string;
  timestamp?: string;
  accountId?: string;
  data: {
    conversationUrn?: string;
    threadId?: string;
    sender?: {
      profileId?: string;
      profileUrn?: string;
      name?: string;
      memberId?: string;
    };
    recipient?: {
      profileId?: string;
      profileUrn?: string;
    };
    body?: string;
    sentAt?: string;
    messageId?: string;
  };
}

function verifySignature(
  rawBody: string,
  sentSignature: string | null,
  timestamp: string | null,
  secret: string,
): { ok: boolean; reason?: string } {
  if (!sentSignature) return { ok: false, reason: "no signature header" };
  if (!timestamp) return { ok: false, reason: "no timestamp header" };

  // Replay-Schutz
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad timestamp" };
  const ageSec = Math.abs(Date.now() / 1000 - ts);
  if (ageSec > MAX_TIMESTAMP_SKEW_S) return { ok: false, reason: `timestamp too old (${ageSec}s)` };

  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(sentSignature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false, reason: "length mismatch" };
  try {
    return { ok: crypto.timingSafeEqual(a, b) };
  } catch {
    return { ok: false, reason: "comparison error" };
  }
}

export async function POST(request: NextRequest) {
  // 1. Raw body — needed for signature verification (must read BEFORE parse).
  const rawBody = await request.text();
  const sig = request.headers.get("x-webhook-signature");
  const ts  = request.headers.get("x-webhook-timestamp");

  // 2. Webhook secret kann pro User in den Settings hinterlegt sein.
  //    Wir prüfen alle bekannten Secrets, weil wir den User aus dem Body
  //    erst nach dem Parsen kennen — aber das wäre teuer. Stattdessen:
  //    Wenn nur 1 Sender-Account existiert (gängiger Fall), nimmt der
  //    Server-Process das in env-Var hinterlegte Secret. Per-User-Secrets
  //    werden über das accountId-Feld im Payload zugeordnet (sicheres
  //    Konzept gemäß ConnectSafely-Empfehlung).
  const fallbackSecret = process.env.CONNECTSAFELY_WEBHOOK_SECRET;

  // Erste Verifikation mit dem env-Secret (falls gesetzt)
  let signatureOk = false;
  if (fallbackSecret) {
    const v = verifySignature(rawBody, sig, ts, fallbackSecret);
    signatureOk = v.ok;
  }

  // Body parsen
  let body: ConnectSafelyMessageEvent;
  try {
    body = JSON.parse(rawBody) as ConnectSafelyMessageEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  // Per-User-Secret via accountId nachladen + Tenant (user_id) auflösen, um die
  // Lead-Suche unten auf den richtigen Mandanten zu beschränken.
  const admin = getSupabaseAdmin();
  let scopeUserId: string | null = null;
  if (body.accountId) {
    const { data: settings } = await admin
      .from("user_settings")
      .select("user_id, connectsafely_webhook_secret")
      .eq("connectsafely_account_id", body.accountId)
      .maybeSingle();
    scopeUserId = (settings as { user_id?: string } | null)?.user_id ?? null;
    const perUserSecret = (settings as { connectsafely_webhook_secret?: string } | null)?.connectsafely_webhook_secret ?? null;
    if (!signatureOk && perUserSecret) {
      const v = verifySignature(rawBody, sig, ts, perUserSecret);
      signatureOk = v.ok;
    }
  }

  // Kein gültiges Secret → 401. Unsignierte Events NUR mit explizitem Opt-in
  // (ALLOW_UNSIGNED_WEBHOOKS=true) — niemals auf erreichbaren Deployments setzen.
  if (!signatureOk) {
    if (process.env.ALLOW_UNSIGNED_WEBHOOKS === "true") {
      console.warn("[ConnectSafely webhook] ALLOW_UNSIGNED_WEBHOOKS=true — accepting UNSIGNED event");
    } else {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  // 3. Event-Routing

  if (body.event === "message.received") {
    // Sender-Identifier kann profileUrn oder profileId sein
    const senderUrn = body.data?.sender?.profileUrn;
    const senderId  = body.data?.sender?.profileId;
    const senderMember = body.data?.sender?.memberId;

    if (!senderUrn && !senderId && !senderMember) {
      return NextResponse.json({ ok: true, skipped: "no sender id" });
    }

    // Suche Lead in linkedin_id (das speichert unterschiedlich URN, slug oder memberId)
    const idents = [senderUrn, senderId, senderMember].filter(Boolean) as string[];
    const LEAD_COLS = "id, user_id, status, linkedin_url, linkedin_id, full_name, company, headline, profile_picture_url";
    let q = admin.from("linkedin_leads").select(LEAD_COLS).in("linkedin_id", idents);
    if (scopeUserId) q = q.eq("user_id", scopeUserId); // auf den Mandanten des accountId beschränken
    const { data: leads } = await q.limit(5);

    let target = leads?.[0];
    // Fallback: über die /in/<slug>-URL — verankert + LIKE-Metazeichen escaped,
    // und nur bei EINDEUTIGEM Treffer (sonst lieber nichts als falsche Person).
    if (!target && senderId) {
      const safe = senderId.replace(/[%_\\]/g, "\\$&");
      let fq = admin.from("linkedin_leads").select(LEAD_COLS).ilike("linkedin_url", `%/in/${safe}%`);
      if (scopeUserId) fq = fq.eq("user_id", scopeUserId);
      const { data: byUrl } = await fq.limit(2);
      if (byUrl && byUrl.length === 1) target = byUrl[0];
    }

    if (!target) {
      return NextResponse.json({ ok: true, matched: 0 });
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      last_message_at: now,
      updated_at: now,
    };
    // Wenn der Lead noch nicht akzeptiert war → erste Antwort bedeutet:
    // Connection wurde akzeptiert UND beantwortet
    if (target.status === "invited") {
      updates.status = "replied";
      updates.connection_accepted_at = now;
    } else if (target.status === "messaged" || target.status === "accepted") {
      updates.status = "replied";
    }

    await admin.from("linkedin_leads").update(updates).eq("id", target.id);

    // Eingehende Antwort in die Inbox schreiben → Conversation erscheint (has_inbound).
    const replyText = typeof body.data?.body === "string" ? body.data.body : "";
    if (replyText.trim()) {
      try {
        await recordMessage(admin, {
          userId: target.user_id,
          channel: "linkedin",
          direction: "in",
          linkedinLeadId: target.id,
          contactName: target.full_name || body.data?.sender?.name || "Unbekannt",
          contactCompany: target.company ?? null,
          contactRole: target.headline ?? null,
          linkedinUrl: target.linkedin_url ?? null,
          avatarUrl: target.profile_picture_url ?? null,
          externalThreadId: body.data?.conversationUrn ?? null,
          fromName: body.data?.sender?.name || target.full_name || null,
          body: replyText,
          // Dedupe: messageId, sonst stabiler Fallback (Thread + Zeit) gegen Webhook-Retries.
          externalId: body.data?.messageId
            || (body.data?.conversationUrn ? `${body.data.conversationUrn}:${body.data?.sentAt ?? now}` : null),
          sentAt: body.data?.sentAt ?? now,
          status: "interested",
        });
      } catch (e) {
        console.error("[ConnectSafely webhook] Inbox-Persist fehlgeschlagen", e);
      }
    }

    return NextResponse.json({ ok: true, matched: 1, leadId: target.id });
  }

  // Forward-Kompatibilität: spätere Events wie `connection.accepted` einfach annehmen.
  return NextResponse.json({ ok: true, skipped: `unknown event: ${body.event}` });
}
