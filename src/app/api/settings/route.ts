/* ── API Route: GET + PATCH /api/settings ── */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserSettings, upsertUserSettings } from "@/lib/supabase/settings";
import { sanitizeSignatureForStorage } from "@/lib/email/signature";

const MAX_STRING_LENGTH = 2048;

function sanitizeString(value: unknown, maxLength = MAX_STRING_LENGTH): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") return undefined;
  return value
    .slice(0, maxLength)
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "")
    .trim() || undefined;
}

function sanitizeUrl(value: unknown): string | undefined {
  const str = sanitizeString(value);
  if (!str) return str;
  try {
    const url = new URL(str);
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    return str;
  } catch {
    return undefined;
  }
}

function sanitizeNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (value === null || value === undefined) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function sanitizeJsonValue(v: unknown, depth: number): unknown {
  if (typeof v === "string") {
    return v.slice(0, 2048).replace(/[<>]/g, "").replace(/javascript:/gi, "").trim();
  }
  if (typeof v === "boolean" || typeof v === "number") return v;
  if (depth <= 0) return undefined;
  if (Array.isArray(v)) {
    // Arrays primitiver Werte (z.B. send_window.days: boolean[]) erhalten
    return v.slice(0, 64).map((item) => sanitizeJsonValue(item, depth - 1)).filter((x) => x !== undefined);
  }
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const clean = sanitizeJsonValue(val, depth - 1);
      if (clean !== undefined) out[k] = clean;
    }
    return out;
  }
  return undefined;
}

function sanitizeJsonb(value: unknown): Record<string, unknown> | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  // Verschachtelte Objekte/Arrays bis Tiefe 3 erhalten (z.B. campaign_settings.send_window).
  return sanitizeJsonValue(value, 3) as Record<string, unknown>;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const settings = await getUserSettings(user.id);
    return NextResponse.json({ data: settings });
  } catch (error) {
    console.error("[API /api/settings GET]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    // Guard against oversized payloads
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 50_000) {
      return NextResponse.json({ error: "Payload zu groß" }, { status: 413 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 });
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: "Ungültiges Format" }, { status: 400 });
    }

    // campaign_settings: Signatur HTML-erhaltend behandeln (sanitizeJsonb würde <> strippen)
    const campaignSettingsClean = sanitizeJsonb(body.campaign_settings);
    if (campaignSettingsClean && body.campaign_settings && typeof body.campaign_settings === "object") {
      const rawSig = (body.campaign_settings as Record<string, unknown>).signature;
      if (rawSig !== undefined) campaignSettingsClean.signature = sanitizeSignatureForStorage(rawSig);
    }

    const settings = await upsertUserSettings(user.id, {
      gemini_api_key: sanitizeString(body.gemini_api_key, 512),
      hubspot_api_key: sanitizeString(body.hubspot_api_key, 512),
      pipedrive_api_key: sanitizeString(body.pipedrive_api_key, 512),
      pipedrive_domain: sanitizeString(body.pipedrive_domain, 256),
      salesforce_instance_url: sanitizeUrl(body.salesforce_instance_url),
      salesforce_access_token: sanitizeString(body.salesforce_access_token, 512),
      zoho_client_id: sanitizeString(body.zoho_client_id, 512),
      zoho_client_secret: sanitizeString(body.zoho_client_secret, 512),
      zoho_refresh_token: sanitizeString(body.zoho_refresh_token, 512),
      webhook_url: sanitizeUrl(body.webhook_url),
      /* ConnectSafely (aktuelle LinkedIn-Integration) */
      connectsafely_api_key: sanitizeString(body.connectsafely_api_key, 512),
      connectsafely_account_id: sanitizeString(body.connectsafely_account_id, 256),
      connectsafely_webhook_secret: sanitizeString(body.connectsafely_webhook_secret, 512),
      /* Unipile (DEPRECATED — bleibt für Migration-Reads) */
      unipile_api_key: sanitizeString(body.unipile_api_key, 512),
      unipile_dsn: sanitizeUrl(body.unipile_dsn),
      unipile_account_id: sanitizeString(body.unipile_account_id, 256),
      linkedin_daily_limit: sanitizeNumber(body.linkedin_daily_limit, 5, 50, 25),
      linkedin_auto_outreach: typeof body.linkedin_auto_outreach === "boolean" ? body.linkedin_auto_outreach : undefined,
      linkedin_follow_up_days: body.linkedin_follow_up_days != null
        ? sanitizeNumber(body.linkedin_follow_up_days, 1, 30, 3)
        : undefined,
      linkedin_sender_profile: typeof body.linkedin_sender_profile === "object" && body.linkedin_sender_profile !== null && !Array.isArray(body.linkedin_sender_profile)
        ? {
            name: sanitizeString((body.linkedin_sender_profile as Record<string, unknown>).name, 256),
            position: sanitizeString((body.linkedin_sender_profile as Record<string, unknown>).position, 256),
            company: sanitizeString((body.linkedin_sender_profile as Record<string, unknown>).company, 256),
            specialization: sanitizeString((body.linkedin_sender_profile as Record<string, unknown>).specialization, 256),
            tone: sanitizeString((body.linkedin_sender_profile as Record<string, unknown>).tone, 256),
          }
        : undefined,
      linkedin_outreach_template: sanitizeString(body.linkedin_outreach_template, 4096),
      lead_settings: sanitizeJsonb(body.lead_settings),
      campaign_settings: campaignSettingsClean,
      seo_settings: sanitizeJsonb(body.seo_settings),
      notification_settings: sanitizeJsonb(body.notification_settings),
      anthropic_api_key: sanitizeString(body.anthropic_api_key, 512),
      brand_settings: sanitizeJsonb(body.brand_settings),
    });

    return NextResponse.json({ data: settings });
  } catch (error) {
    console.error("[API /api/settings PATCH]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
