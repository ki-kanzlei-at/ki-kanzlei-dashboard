/* ── GET /api/integrations/[provider]/callback ──
 * OAuth-Rücksprung: Code → Token → in user_settings speichern.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getIntegration } from "@/lib/integrations/providers";
import { buildStoredToken } from "@/lib/integrations/tokens";

function appOrigin(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
}
function back(origin: string, params: Record<string, string>) {
  const q = new URLSearchParams({ tab: "crm", ...params }).toString();
  return NextResponse.redirect(`${origin}/dashboard/settings?${q}`);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const origin = appOrigin(request);
  const { provider: id } = await params;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error_description") || url.searchParams.get("error");

  const p = getIntegration(id);
  if (!p || p.auth !== "oauth" || !p.tokenUrl || !p.storeColumn) {
    return back(origin, { oauth_error: "Unbekannte Integration." });
  }
  if (err) return back(origin, { oauth_error: err });
  if (!code || !state) return back(origin, { oauth_error: `Ungültige Antwort von ${p.name}.` });

  const cookie = request.cookies.get("int_oauth_state")?.value;
  if (cookie !== `${id}:${state}`) {
    return back(origin, { oauth_error: "Sicherheitsprüfung fehlgeschlagen (state)." });
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(`${origin}/login`);

    const clientId = p.clientIdEnv ? process.env[p.clientIdEnv] : undefined;
    const clientSecret = p.clientSecretEnv ? process.env[p.clientSecretEnv] : undefined;
    if (!clientId || !clientSecret) {
      return back(origin, { oauth_error: `${p.name}-OAuth ist nicht vollständig konfiguriert.` });
    }

    const redirectUri = `${origin}/api/integrations/${id}/callback`;
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    });
    const tokenRes = await fetch(p.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const tok = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !(tok.access_token || tok.refresh_token)) {
      return back(origin, { oauth_error: tok.error_description || tok.error || "Token-Austausch fehlgeschlagen." });
    }

    // Vollständigen Token-Satz (access + refresh + Ablauf) je Provider ablegen …
    const stored = buildStoredToken(tok);
    const { data: cur } = await supabase
      .from("user_settings").select("integration_tokens").eq("user_id", user.id).maybeSingle();
    const map = (cur?.integration_tokens ?? {}) as Record<string, unknown>;
    map[id] = stored;

    // … plus Legacy-Spalte spiegeln (von /api/export/crm genutzt).
    const legacy = id === "zoho" ? (stored.refresh_token ?? stored.access_token) : stored.access_token;
    const upd: Record<string, unknown> = { user_id: user.id, integration_tokens: map, [p.storeColumn]: legacy };
    if (id === "salesforce" && stored.instance_url) upd.salesforce_instance_url = stored.instance_url;
    if (id === "pipedrive" && stored.domain) upd.pipedrive_domain = stored.domain;

    const { error } = await supabase.from("user_settings").upsert(upd);
    if (error) return back(origin, { oauth_error: error.message });

    const res = back(origin, { connected: id });
    res.cookies.delete("int_oauth_state");
    return res;
  } catch (e) {
    console.error("[integrations/callback]", e);
    return back(origin, { oauth_error: e instanceof Error ? e.message : "Verbindung fehlgeschlagen." });
  }
}
