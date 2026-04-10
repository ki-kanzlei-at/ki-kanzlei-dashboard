/* ── OAuth: Meta (Facebook + Instagram) Redirect ── */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const appId = process.env.META_APP_ID;
    if (!appId) {
      return NextResponse.json({ error: "META_APP_ID nicht konfiguriert" }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const redirectUri = `${baseUrl}/api/social-media/auth/meta/callback`;

    const state = Buffer.from(JSON.stringify({ user_id: user.id })).toString("base64url");
    const scopes = "pages_show_list,pages_manage_posts,instagram_basic,instagram_content_publish";

    const url = new URL("https://www.facebook.com/v19.0/dialog/oauth");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", scopes);
    url.searchParams.set("response_type", "code");

    return NextResponse.redirect(url.toString());
  } catch (err) {
    console.error("[Meta OAuth redirect]", err);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
