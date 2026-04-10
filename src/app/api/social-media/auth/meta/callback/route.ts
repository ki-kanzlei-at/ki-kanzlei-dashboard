/* ── OAuth: Meta (Facebook + Instagram) Callback ── */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

interface FbPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
}

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

    let userId: string;
    try {
      const parsed = JSON.parse(Buffer.from(state, "base64url").toString());
      userId = parsed.user_id;
    } catch {
      return NextResponse.redirect(`${baseUrl}/dashboard/settings?tab=social-media&error=invalid_state`);
    }

    const redirectUri = `${baseUrl}/api/social-media/auth/meta/callback`;

    // Exchange code for short-lived token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?` +
        new URLSearchParams({
          client_id: process.env.META_APP_ID!,
          redirect_uri: redirectUri,
          client_secret: process.env.META_APP_SECRET!,
          code,
        }).toString(),
    );

    if (!tokenRes.ok) {
      console.error("[Meta OAuth] Token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(`${baseUrl}/dashboard/settings?tab=social-media&error=token_exchange`);
    }

    const tokenData = await tokenRes.json();
    const shortLivedToken = tokenData.access_token;

    // Exchange for long-lived token
    const longTokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?` +
        new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: process.env.META_APP_ID!,
          client_secret: process.env.META_APP_SECRET!,
          fb_exchange_token: shortLivedToken,
        }).toString(),
    );

    let longLivedToken = shortLivedToken;
    let expiresIn = 3600;
    if (longTokenRes.ok) {
      const longData = await longTokenRes.json();
      longLivedToken = longData.access_token;
      expiresIn = longData.expires_in || 5184000; // ~60 days
    }

    // Get user profile
    const meRes = await fetch(
      `https://graph.facebook.com/v19.0/me?fields=id,name,picture&access_token=${longLivedToken}`,
    );
    const me = meRes.ok ? await meRes.json() : { id: "unknown", name: "Facebook" };

    // Get pages with Instagram accounts
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${longLivedToken}`,
    );

    if (!pagesRes.ok) {
      console.error("[Meta OAuth] Pages fetch failed:", await pagesRes.text());
      return NextResponse.redirect(`${baseUrl}/dashboard/settings?tab=social-media&error=pages_fetch`);
    }

    const pagesData = await pagesRes.json();
    const pages: FbPage[] = pagesData.data ?? [];

    const admin = getSupabaseAdmin();
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Create an account for each Facebook Page
    for (const page of pages) {
      // Facebook Page account
      await admin.from("social_media_accounts").insert({
        user_id: userId,
        label: page.name,
        platform: "facebook",
        access_token: longLivedToken,
        token_expires_at: tokenExpiresAt,
        platform_user_id: me.id,
        platform_username: page.name,
        platform_avatar_url: me.picture?.data?.url || null,
        page_id: page.id,
        page_name: page.name,
        page_access_token: page.access_token,
        scopes: ["pages_show_list", "pages_manage_posts"],
        is_active: true,
        health_status: "good",
      });

      // Instagram Business Account (if linked)
      if (page.instagram_business_account?.id) {
        // Get IG username
        const igRes = await fetch(
          `https://graph.facebook.com/v19.0/${page.instagram_business_account.id}?fields=username,profile_picture_url&access_token=${page.access_token}`,
        );
        const igData = igRes.ok ? await igRes.json() : {};

        await admin.from("social_media_accounts").insert({
          user_id: userId,
          label: igData.username ? `@${igData.username}` : `Instagram (${page.name})`,
          platform: "instagram",
          access_token: longLivedToken,
          token_expires_at: tokenExpiresAt,
          platform_user_id: me.id,
          platform_username: igData.username || null,
          platform_avatar_url: igData.profile_picture_url || null,
          page_id: page.id,
          page_name: page.name,
          page_access_token: page.access_token,
          instagram_business_account_id: page.instagram_business_account.id,
          scopes: ["instagram_basic", "instagram_content_publish"],
          is_active: true,
          health_status: "good",
        });
      }
    }

    // If no pages found, create a basic Facebook account
    if (pages.length === 0) {
      await admin.from("social_media_accounts").insert({
        user_id: userId,
        label: me.name || "Facebook",
        platform: "facebook",
        access_token: longLivedToken,
        token_expires_at: tokenExpiresAt,
        platform_user_id: me.id,
        platform_username: me.name,
        platform_avatar_url: me.picture?.data?.url || null,
        scopes: ["pages_show_list", "pages_manage_posts"],
        is_active: true,
        health_status: "warning",
        last_error: "Keine Facebook-Seiten gefunden. Bitte erstelle eine Seite.",
      });
    }

    return NextResponse.redirect(`${baseUrl}/dashboard/settings?tab=social-media&success=meta`);
  } catch (err) {
    console.error("[Meta OAuth callback]", err);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return NextResponse.redirect(`${baseUrl}/dashboard/settings?tab=social-media&error=unknown`);
  }
}
