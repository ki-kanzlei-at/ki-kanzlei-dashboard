/* ── API: GET + POST /api/campaigns ── */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getCampaigns,
  createCampaign,
} from "@/lib/supabase/campaigns";
import type {
  CampaignInsert,
  CampaignStatus,
  CampaignTone,
  SequenceStep,
  SequenceDelay,
} from "@/types/campaigns";

function sanitize(v: unknown, max = 512): string {
  if (typeof v !== "string") return "";
  return v.replace(/[<>]/g, "").trim().slice(0, max);
}

function clampInt(v: unknown, min: number, max: number, def: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

const VALID_STATUS: CampaignStatus[] = ["draft", "active", "paused", "completed", "archived"];
const VALID_TONE:  CampaignTone[]    = ["formal", "professional", "casual"];

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const url = new URL(request.url);
    const params = url.searchParams;

    const rawStatus = params.get("status");
    const status: CampaignStatus | undefined =
      rawStatus && (VALID_STATUS as string[]).includes(rawStatus)
        ? (rawStatus as CampaignStatus)
        : undefined;

    const filters = {
      status,
      search: params.get("search") || undefined,
    };

    const page     = clampInt(params.get("page"), 1, 10_000, 1);
    const pageSize = clampInt(params.get("limit") ?? params.get("page_size"), 1, 200, 25);

    const result = await getCampaigns(user.id, filters, { page, pageSize });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[API /api/campaigns GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interner Serverfehler" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const body = (await request.json()) as Record<string, unknown>;

    const name = sanitize(body.name, 256);
    if (!name) {
      return NextResponse.json({ error: "Name ist erforderlich" }, { status: 400 });
    }

    const leadIdsRaw = Array.isArray(body.lead_ids) ? body.lead_ids : [];
    const lead_ids = leadIdsRaw
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .slice(0, 10_000);

    if (lead_ids.length === 0) {
      return NextResponse.json(
        { error: "Mindestens ein Lead muss ausgewählt sein" },
        { status: 400 },
      );
    }

    /* ── Wizard-Payload normalisieren ── */
    const statusInput = sanitize(body.status, 32);
    const status: CampaignStatus = (VALID_STATUS as string[]).includes(statusInput)
      ? (statusInput as CampaignStatus)
      : "draft";

    const toneInput = sanitize(body.tone, 32);
    const tone: CampaignTone = (VALID_TONE as string[]).includes(toneInput)
      ? (toneInput as CampaignTone)
      : "professional";

    const language     = sanitize(body.language, 16) || "de-AT";
    const senderName   = sanitize(body.sender_name, 256) || null;
    const goal         = sanitize(body.goal, 256) || null;
    const systemPrompt = typeof body.system_prompt === "string"
      ? body.system_prompt.slice(0, 8192)
      : null;
    const mailboxId    = sanitize(body.mailbox_id, 64) || null;
    const replyTo      = sanitize(body.reply_to, 254) || "info@ki-kanzlei.at";

    /* Sequence */
    const rawSteps = Array.isArray(body.sequence_steps) ? body.sequence_steps : [];
    const sequence_steps: SequenceStep[] = rawSteps
      .map((s, i) => {
        if (!s || typeof s !== "object") return null;
        const o = s as Record<string, unknown>;
        const id = typeof o.id === "string" && o.id.length > 0 ? o.id : `s${i + 1}`;
        const intent = sanitize(o.intent, 128) || `Schritt ${i + 1}`;
        const desc = sanitize(o.desc, 512);
        return { id, intent, desc };
      })
      .filter((x): x is SequenceStep => x !== null)
      .slice(0, 10);

    const rawDelays = Array.isArray(body.sequence_delays) ? body.sequence_delays : [];
    const sequence_delays: SequenceDelay[] = rawDelays
      .map((d) => {
        if (!d || typeof d !== "object") return null;
        const value = clampInt((d as { value?: unknown }).value, 1, 60, 3);
        return { value, unit: "day" as const };
      })
      .filter((x): x is SequenceDelay => x !== null)
      .slice(0, 10);

    /* Schedule */
    const schedRaw = (body.schedule && typeof body.schedule === "object")
      ? (body.schedule as Record<string, unknown>)
      : {};
    const rawDays = Array.isArray(schedRaw.days) ? schedRaw.days : [];
    const days: boolean[] = Array.from({ length: 7 }, (_, i) => Boolean(rawDays[i]));
    const schedule = {
      days,
      time_from:   sanitize(schedRaw.time_from, 5) || "09:00",
      time_to:     sanitize(schedRaw.time_to,   5) || "17:00",
      timezone:    sanitize(schedRaw.timezone, 64) || "Europe/Vienna",
      gap_seconds: clampInt(schedRaw.gap_seconds, 30, 3600, 180),
    };

    /* Tracking */
    const trkRaw = (body.tracking && typeof body.tracking === "object")
      ? (body.tracking as Record<string, unknown>)
      : {};
    const tracking = {
      opens:   trkRaw.opens   !== false,
      clicks:  trkRaw.clicks  !== false,
      replies: trkRaw.replies !== false,
    };

    const dailyLimit   = clampInt(body.daily_limit, 1, 1000, 50);
    const delayMinutes = clampInt(body.delay_minutes, 1, 60, Math.max(1, Math.round(schedule.gap_seconds / 60)));

    const input: CampaignInsert = {
      name,
      lead_ids,
      daily_limit:        dailyLimit,
      delay_minutes:      delayMinutes,
      reply_to:           replyTo,
      mailbox_id:         mailboxId,
      sender_name:        senderName,
      goal,
      language,
      tone,
      system_prompt:      systemPrompt,
      sequence_steps,
      sequence_delays,
      schedule,
      tracking,
      auto_stop_on_reply: body.auto_stop_on_reply !== false,
      status,
    };

    const campaign = await createCampaign(input, user.id);
    return NextResponse.json({ data: campaign }, { status: 201 });
  } catch (err) {
    console.error("[API /api/campaigns POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interner Serverfehler" },
      { status: 500 },
    );
  }
}
