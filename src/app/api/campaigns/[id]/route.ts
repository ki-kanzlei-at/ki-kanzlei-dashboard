/* ── API: GET + PATCH + DELETE /api/campaigns/[id] ── */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getCampaignById,
  updateCampaign,
  deleteCampaign,
} from "@/lib/supabase/campaigns";
import type {
  CampaignStatus,
  CampaignTone,
  CampaignUpdate,
  SequenceStep,
  SequenceDelay,
} from "@/types/campaigns";
import { MAX_SEQUENCE_STEPS } from "@/types/campaigns";

const VALID_STATUS: CampaignStatus[] = ["draft", "active", "paused", "completed", "archived"];
const VALID_TONE:  CampaignTone[]    = ["formal", "professional", "casual"];

function sanitize(v: unknown, max = 512): string {
  if (typeof v !== "string") return "";
  return v.replace(/[<>]/g, "").trim().slice(0, max);
}

function clampInt(v: unknown, min: number, max: number, def: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
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

    return NextResponse.json({ data: campaign });
  } catch (err) {
    console.error("[API /api/campaigns/:id GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interner Serverfehler" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const updates: CampaignUpdate = {};

    if (typeof body.name === "string") {
      const n = sanitize(body.name, 256);
      if (n) updates.name = n;
    }

    if (typeof body.status === "string") {
      if ((VALID_STATUS as string[]).includes(body.status)) {
        updates.status = body.status as CampaignStatus;
      } else {
        return NextResponse.json({ error: "Ungültiger Status" }, { status: 400 });
      }
    }

    if (body.daily_limit !== undefined) {
      updates.daily_limit = clampInt(body.daily_limit, 1, 1000, 50);
    }
    if (body.delay_minutes !== undefined) {
      updates.delay_minutes = clampInt(body.delay_minutes, 1, 60, 8);
    }
    if (typeof body.reply_to === "string") {
      updates.reply_to = sanitize(body.reply_to, 254);
    }
    if (typeof body.error_message === "string" || body.error_message === null) {
      updates.error_message = typeof body.error_message === "string"
        ? sanitize(body.error_message, 500)
        : null;
    }
    if (Array.isArray(body.mailbox_ids)) {
      /* Mehrere Mailboxen (automatische Rotation). Ownership RLS-scoped prüfen. */
      let mailboxIds = Array.from(new Set(
        body.mailbox_ids
          .filter((v): v is string => typeof v === "string" && v.length > 0)
          .map((v) => sanitize(v, 64))
          .filter(Boolean),
      )).slice(0, 20);
      if (mailboxIds.length > 0) {
        const { data: owned, error: mbErr } = await supabase
          .from("email_accounts")
          .select("id")
          .in("id", mailboxIds);
        if (mbErr) {
          return NextResponse.json(
            { error: `Mailboxen konnten nicht geprüft werden: ${mbErr.message}` },
            { status: 500 },
          );
        }
        const ownedIds = new Set((owned ?? []).map((a) => a.id as string));
        mailboxIds = mailboxIds.filter((mid) => ownedIds.has(mid));
        if (mailboxIds.length === 0) {
          return NextResponse.json(
            { error: "Die gewählten Mailboxen wurden nicht gefunden" },
            { status: 400 },
          );
        }
      }
      updates.mailbox_ids = mailboxIds;
      updates.mailbox_id = mailboxIds.length === 1 ? mailboxIds[0] : null;
    } else if (typeof body.mailbox_id === "string" || body.mailbox_id === null) {
      updates.mailbox_id = typeof body.mailbox_id === "string"
        ? sanitize(body.mailbox_id, 64)
        : null;
      updates.mailbox_ids = updates.mailbox_id ? [updates.mailbox_id] : [];
    }
    if (typeof body.sender_name === "string") {
      updates.sender_name = sanitize(body.sender_name, 256);
    }
    if (typeof body.goal === "string") {
      updates.goal = sanitize(body.goal, 256);
    }
    if (typeof body.language === "string") {
      updates.language = sanitize(body.language, 16);
    }
    if (typeof body.tone === "string" && (VALID_TONE as string[]).includes(body.tone)) {
      updates.tone = body.tone as CampaignTone;
    }
    if (typeof body.system_prompt === "string") {
      updates.system_prompt = body.system_prompt.slice(0, 8192);
    }
    if (Array.isArray(body.sequence_steps)) {
      // Wie beim POST: sanitizen + auf MAX_SEQUENCE_STEPS begrenzen.
      // DAL berechnet steps_total nach.
      updates.sequence_steps = body.sequence_steps
        .map((s, i) => {
          if (!s || typeof s !== "object") return null;
          const o = s as Record<string, unknown>;
          const stepId = typeof o.id === "string" && o.id.length > 0 ? o.id : `s${i + 1}`;
          const intent = sanitize(o.intent, 128) || `Schritt ${i + 1}`;
          const desc = sanitize(o.desc, 512);
          return { id: stepId, intent, desc };
        })
        .filter((x): x is SequenceStep => x !== null)
        .slice(0, MAX_SEQUENCE_STEPS);
    }
    if (Array.isArray(body.sequence_delays)) {
      updates.sequence_delays = body.sequence_delays
        .map((d) => {
          if (!d || typeof d !== "object") return null;
          const value = clampInt((d as { value?: unknown }).value, 1, 60, 3);
          return { value, unit: "day" as const };
        })
        .filter((x): x is SequenceDelay => x !== null)
        .slice(0, Math.max(0, MAX_SEQUENCE_STEPS - 1));
    }
    if (body.schedule && typeof body.schedule === "object") {
      updates.schedule = body.schedule as CampaignUpdate["schedule"];
    }
    if (body.tracking && typeof body.tracking === "object") {
      updates.tracking = body.tracking as CampaignUpdate["tracking"];
    }
    if (typeof body.auto_stop_on_reply === "boolean") {
      updates.auto_stop_on_reply = body.auto_stop_on_reply;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Keine Änderungen" }, { status: 400 });
    }

    /* ── Start-Preflight: keine leeren Kampagnen aktivieren ── */
    if (updates.status === "active") {
      const { count } = await supabase
        .from("campaign_leads")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("user_id", user.id);
      if ((count ?? 0) === 0) {
        return NextResponse.json(
          { error: "Die Kampagne hat keine Empfänger:innen — bitte zuerst Leads hinzufügen" },
          { status: 400 },
        );
      }
      const { count: mailboxCount } = await supabase
        .from("email_accounts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_active", true);
      if ((mailboxCount ?? 0) === 0) {
        return NextResponse.json(
          { error: "Keine aktive Mailbox verbunden — bitte zuerst ein E-Mail-Konto in den Einstellungen verbinden" },
          { status: 400 },
        );
      }
    }

    const campaign = await updateCampaign(id, updates, user.id);
    return NextResponse.json({ data: campaign });
  } catch (err) {
    console.error("[API /api/campaigns/:id PATCH]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interner Serverfehler" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    await deleteCampaign(id, user.id);
    return NextResponse.json({ data: { id } });
  } catch (err) {
    console.error("[API /api/campaigns/:id DELETE]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interner Serverfehler" },
      { status: 500 },
    );
  }
}
