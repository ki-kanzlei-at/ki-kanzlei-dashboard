/* ── OAuth: LinkedIn Callback ── */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const error = request.nextUrl.searchParams.get("error");

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    if (error || !code || !state) {
      return NextResponse.redirect(`${baseUrl}/dashboard/settings?tab=social-media&error=oauth_denied`);
    }

    // Decode state
    let userId: string;
    try {
      const parsed = JSON.parse(Buffer.from(state, "base64url").toString());
      userId = parsed.user_id;
    } catch {
      return NextResponse.redirect(`${baseUrl}/dashboard/settings?tab=social-media&error=invalid_state`);
    }

    // Exchange code for token
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${baseUrl}/api/social-media/auth/linkedin/callback`,
        client_id: process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
      }).toString(),
    });

    if (!tokenRes.ok) {
      console.error("[LinkedIn OAuth] Token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(`${baseUrl}/dashboard/settings?tab=social-media&error=token_exchange`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const expiresIn = tokenData.expires_in; // seconds

    // Fetch profile
    const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      console.error("[LinkedIn OAuth] Profile fetch failed:", await profileRes.text());
      return NextResponse.redirect(`${baseUrl}/dashboard/settings?tab=social-media&error=profile_fetch`);
    }

    const profile = await profileRes.json();

    // Save account
    const admin = getSupabaseAdmin();
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Upsert by platform_user_id to avoid duplicates
    const { error: dbError } = await admin
      .from("social_media_accounts")
      .upsert(
        {
          user_id: userId,
          label: profile.name || "LinkedIn",
          platform: "linkedin",
          access_token: accessToken,
          refresh_token: tokenData.refresh_token || null,
          token_expires_at: tokenExpiresAt,
          platform_user_id: profile.sub,
          platform_username: profile.name,
          platform_avatar_url: profile.picture || null,
          scopes: ["openid", "profile", "w_member_social"],
          is_active: true,
          health_status: "good",
          last_error: null,
        },
        { onConflict: "user_id,platform,platform_user_id", ignoreDuplicates: false },
      );

    if (dbError) {
      // Fallback: try insert without upsert
      await admin.from("social_media_accounts").insert({
        user_id: userId,
        label: profile.name || "LinkedIn",
        platform: "linkedin",
        access_token: accessToken,
        refresh_token: tokenData.refresh_token || null,
        token_expires_at: tokenExpiresAt,
        platform_user_id: profile.sub,
        platform_username: profile.name,
        platform_avatar_url: profile.picture || null,
        scopes: ["openid", "profile", "w_member_social"],
        is_active: true,
        health_status: "good",
      });
    }

    return NextResponse.redirect(`${baseUrl}/dashboard/settings?tab=social-media&success=linkedin`);
  } catch (err) {
    console.error("[LinkedIn OAuth callback]", err);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return NextResponse.redirect(`${baseUrl}/dashboard/settings?tab=social-media&error=unknown`);
  }
}
