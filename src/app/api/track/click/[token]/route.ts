/* ── Klick-Tracking: GET /api/track/click/[token]?u=<ziel-url> ──
 * Kein Auth — verwendet Admin Client. Zählt den Klick (fire-and-forget)
 * und leitet sofort auf die ursprüngliche Ziel-URL weiter.
 */

import { NextRequest, NextResponse } from "next/server";
import { trackClick } from "@/lib/supabase/campaigns";

function safeTarget(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
    return null;
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const target = safeTarget(request.nextUrl.searchParams.get("u"));

  // Fire-and-forget — Weiterleitung nicht blockieren
  trackClick(token).catch((err) => {
    console.error("[Track Click]", err);
  });

  const fallback = new URL("/", request.nextUrl.origin).toString();
  return NextResponse.redirect(target ?? fallback, { status: 302 });
}
