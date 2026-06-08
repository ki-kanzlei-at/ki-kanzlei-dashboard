/* ── GET /api/integrations/[provider]/start ──
 * Startet den OAuth-Flow für eine CRM-Integration (verbinden ohne Token).
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getIntegration } from "@/lib/integrations/providers";

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

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const p = getIntegration(id);
  if (!p || p.auth !== "oauth" || !p.authorizeUrl) {
    return back(origin, { oauth_error: "Unbekannte Integration." });
  }

  const clientId = p.clientIdEnv ? process.env[p.clientIdEnv] : undefined;
  if (!clientId) {
    return back(origin, { oauth_error: `${p.name}-OAuth ist serverseitig noch nicht eingerichtet (${p.clientIdEnv}).` });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${origin}/api/integrations/${id}/callback`;
  const authUrl = new URL(p.authorizeUrl);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  if (p.scope) authUrl.searchParams.set("scope", p.scope);
  authUrl.searchParams.set("state", state);
  if (id === "zoho" || id === "salesforce") authUrl.searchParams.set("access_type", "offline");
  if (id === "zoho") authUrl.searchParams.set("prompt", "consent");

  const res = NextResponse.redirect(authUrl.toString());
  res.cookies.set("int_oauth_state", `${id}:${state}`, {
    httpOnly: true,
    secure: origin.startsWith("https"),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
