/* ── API: GET /api/campaigns/[id]/leads ── */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCampaignLeads } from "@/lib/supabase/campaigns";
import type { CampaignLeadStatus } from "@/types/campaigns";

const VALID_STATUS: CampaignLeadStatus[] = [
  "pending", "sent", "failed", "opened", "bounced", "replied", "completed",
];

function clampInt(v: unknown, min: number, max: number, def: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const url = new URL(request.url);
    const params = url.searchParams;

    const rawStatus = params.get("status");
    const status: CampaignLeadStatus | undefined =
      rawStatus && (VALID_STATUS as string[]).includes(rawStatus)
        ? (rawStatus as CampaignLeadStatus)
        : undefined;

    const page     = clampInt(params.get("page"), 1, 10_000, 1);
    const pageSize = clampInt(params.get("limit") ?? params.get("page_size"), 1, 200, 25);

    const result = await getCampaignLeads(id, user.id, { page, pageSize }, {
      status,
      search: params.get("search") || undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[API /api/campaigns/:id/leads GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interner Serverfehler" },
      { status: 500 },
    );
  }
}
