/* ── OAuth: LinkedIn Redirect ── */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const clientId = process.env.LINKEDIN_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json({ error: "LINKEDIN_CLIENT_ID nicht konfiguriert" }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const redirectUri = `${baseUrl}/api/social-media/auth/linkedin/callback`;

    const state = Buffer.from(JSON.stringify({ user_id: user.id })).toString("base64url");
    const scopes = "openid profile w_member_social";

    const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", scopes);

    return NextResponse.redirect(url.toString());
  } catch (err) {
    console.error("[LinkedIn OAuth redirect]", err);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
