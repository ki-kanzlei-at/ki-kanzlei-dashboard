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

  // Falls noch nicht verifiziert: Per-User-Secret via accountId nachladen
  if (!signatureOk && body.accountId) {
    const admin = getSupabaseAdmin();
    const { data: settings } = await admin
      .from("user_settings")
      .select("connectsafely_webhook_secret")
      .eq("connectsafely_account_id", body.accountId)
      .maybeSingle();
    const perUserSecret = settings?.connectsafely_webhook_secret as string | null;
    if (perUserSecret) {
      const v = verifySignature(rawBody, sig, ts, perUserSecret);
      signatureOk = v.ok;
    }
  }

  // Kein gültiges Secret → 401, AUSSER wir laufen im Dev-Mode ohne Secret
  if (!signatureOk) {
    if (!fallbackSecret && process.env.NODE_ENV !== "production") {
      console.warn("[ConnectSafely webhook] No secret configured — accepting unsigned event (DEV only)");
    } else {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  // 3. Event-Routing
  const admin = getSupabaseAdmin();

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
    const { data: leads } = await admin
      .from("linkedin_leads")
      .select("id, status, linkedin_url, linkedin_id")
      .in("linkedin_id", idents)
      .limit(5);

    let target = leads?.[0];
    // Fallback: suche über URL-Pattern wenn nur profileId vorhanden
    if (!target && senderId) {
      const { data: byUrl } = await admin
        .from("linkedin_leads")
        .select("id, status, linkedin_url, linkedin_id")
        .ilike("linkedin_url", `%${senderId}%`)
        .limit(1);
      target = byUrl?.[0];
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
    return NextResponse.json({ ok: true, matched: 1, leadId: target.id });
  }

  // Forward-Kompatibilität: spätere Events wie `connection.accepted` einfach annehmen.
  return NextResponse.json({ ok: true, skipped: `unknown event: ${body.event}` });
}
