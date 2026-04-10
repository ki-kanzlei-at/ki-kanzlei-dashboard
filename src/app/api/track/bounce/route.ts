/* ── Tracking: POST /api/track/bounce ──
 * Aufgerufen via API mit shared secret.
 * Body: { email: string, bounce_type?: "hard" | "soft" }
 */

import { NextRequest, NextResponse } from "next/server";
import { trackBounce } from "@/lib/supabase/campaigns";

export async function POST(request: NextRequest) {
  try {
    // Shared secret prüfen (Authorization header oder x-api-secret)
    const authHeader = request.headers.get("authorization");
    const apiSecret = request.headers.get("x-api-secret");
    const cronSecret = process.env.CRON_SECRET;

    const isAuthorized =
      (authHeader && authHeader === `Bearer ${cronSecret}`) ||
      (apiSecret && apiSecret === cronSecret);

    if (!cronSecret || !isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { email, bounce_type } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "email ist erforderlich" }, { status: 400 });
    }

    const found = await trackBounce(email, bounce_type);

    return NextResponse.json({ success: true, matched: found });
  } catch (error) {
    console.error("[Track Bounce]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
