/* ── GET /api/email-accounts/google/start ──
 * Startet den "Mit Google anmelden"-OAuth-Flow (delegiert, Gmail-Versand).
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { buildGoogleAuthUrl, isGoogleOAuthConfigured } from "@/lib/email/google-oauth";

function appOrigin(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  const origin = appOrigin(request);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  if (!isGoogleOAuthConfigured()) {
    return NextResponse.redirect(`${origin}/dashboard/settings?tab=mailbox&oauth_error=${encodeURIComponent("Google-Login ist serverseitig noch nicht konfiguriert (GOOGLE_OAUTH_CLIENT_ID/SECRET).")}`);
  }

  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${origin}/api/email-accounts/google/callback`;
  const res = NextResponse.redirect(buildGoogleAuthUrl(state, redirectUri));
  res.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: origin.startsWith("https"),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
