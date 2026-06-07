/* ── GET /api/email-accounts/microsoft/start ──
 * Startet den "Mit Microsoft anmelden"-OAuth-Flow (delegiert).
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { buildMicrosoftAuthUrl, isMicrosoftOAuthConfigured } from "@/lib/email/microsoft-oauth";

function appOrigin(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  const origin = appOrigin(request);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  if (!isMicrosoftOAuthConfigured()) {
    return NextResponse.redirect(`${origin}/dashboard/settings?tab=mailbox&oauth_error=${encodeURIComponent("Microsoft-Login ist serverseitig noch nicht konfiguriert (MS_OAUTH_CLIENT_ID/SECRET).")}`);
  }

  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${origin}/api/email-accounts/microsoft/callback`;
  const res = NextResponse.redirect(buildMicrosoftAuthUrl(state, redirectUri));
  res.cookies.set("ms_oauth_state", state, {
    httpOnly: true,
    secure: origin.startsWith("https"),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
