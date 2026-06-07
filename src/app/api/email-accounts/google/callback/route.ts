/* ── GET /api/email-accounts/google/callback ──
 * OAuth-Rücksprung: Code → Tokens → Profil → Gmail-Konto anlegen/aktualisieren.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeGoogleCode, getGoogleProfile } from "@/lib/email/google-oauth";

function appOrigin(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
}
function back(origin: string, params: Record<string, string>) {
  const q = new URLSearchParams({ tab: "mailbox", ...params }).toString();
  return NextResponse.redirect(`${origin}/dashboard/settings?${q}`);
}

export async function GET(request: NextRequest) {
  const origin = appOrigin(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error_description") || url.searchParams.get("error");

  if (err) return back(origin, { oauth_error: err });
  if (!code || !state) return back(origin, { oauth_error: "Ungültige Antwort von Google." });

  const cookieState = request.cookies.get("google_oauth_state")?.value;
  if (!cookieState || cookieState !== state) return back(origin, { oauth_error: "Sicherheitsprüfung fehlgeschlagen (state)." });

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(`${origin}/login`);

    const redirectUri = `${origin}/api/email-accounts/google/callback`;
    const tokens = await exchangeGoogleCode(code, redirectUri);
    const profile = await getGoogleProfile(tokens.access_token);
    if (!profile.email) return back(origin, { oauth_error: "E-Mail-Adresse konnte nicht ermittelt werden." });

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const row = {
      provider: "google_oauth" as const,
      sender_email: profile.email,
      sender_name: profile.name,
      label: profile.email,
      oauth_access_token: tokens.access_token,
      oauth_refresh_token: tokens.refresh_token ?? null,
      oauth_token_expires_at: expiresAt,
      oauth_scope: tokens.scope ?? null,
      is_active: true,
      health_status: "good" as const,
      last_error: null,
    };

    // Vorhandenes Konto (gleiche Adresse) aktualisieren, sonst anlegen.
    const { data: existing } = await supabase
      .from("email_accounts").select("id").eq("user_id", user.id).eq("sender_email", profile.email).maybeSingle();

    if (existing) {
      await supabase.from("email_accounts").update({ ...row, updated_at: new Date().toISOString() }).eq("id", existing.id);
    } else {
      await supabase.from("email_accounts").insert({ user_id: user.id, ...row });
    }

    const res = back(origin, { connected: "google" });
    res.cookies.delete("google_oauth_state");
    return res;
  } catch (e) {
    console.error("[google/callback]", e);
    return back(origin, { oauth_error: e instanceof Error ? e.message : "Verbindung fehlgeschlagen." });
  }
}
