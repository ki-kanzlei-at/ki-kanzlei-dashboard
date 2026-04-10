/* ── Cron Job: GET /api/cron/social-media-publish ──
 * Veröffentlicht geplante Social-Media-Posts.
 * Wird alle 5 Minuten von Vercel Cron aufgerufen.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getActiveAccountsByIds, incrementAccountPostCount, markSocialAccountError } from "@/lib/supabase/social-media-accounts";
import { publishToAccount } from "@/lib/social-media/publisher";
import type { SocialMediaPost } from "@/types/social-media";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getSupabaseAdmin();

    // Get posts due for publishing
    const { data: posts, error } = await admin
      .from("social_media_posts")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(20);

    if (error) {
      console.error("[Cron social-media-publish] Posts laden:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!posts || posts.length === 0) {
      return NextResponse.json({ message: "Keine geplanten Posts", processed: 0 });
    }

    let totalPublished = 0;
    let totalFailed = 0;

    for (const raw of posts) {
      const post = raw as SocialMediaPost;
      const accountIds = post.account_ids ?? [];

      if (accountIds.length === 0) {
        // No accounts assigned — mark as failed
        await admin
          .from("social_media_posts")
          .update({
            status: "failed",
            publish_results: { error: "Keine Konten zugewiesen" },
            updated_at: new Date().toISOString(),
          })
          .eq("id", post.id);
        totalFailed++;
        continue;
      }

      try {
        const accounts = await getActiveAccountsByIds(accountIds);
        if (accounts.length === 0) {
          await admin
            .from("social_media_posts")
            .update({
              status: "failed",
              publish_results: { error: "Keine aktiven Konten gefunden" },
              updated_at: new Date().toISOString(),
            })
            .eq("id", post.id);
          totalFailed++;
          continue;
        }

        const results: Record<string, unknown> = {};
        let anySuccess = false;

        for (const account of accounts) {
          const result = await publishToAccount(account, post);
          results[account.id] = {
            platform: result.platform,
            success: result.success,
            post_id: result.post_id,
            error: result.error,
            published_at: new Date().toISOString(),
          };

          if (result.success) {
            anySuccess = true;
            await incrementAccountPostCount(account.id);
          } else {
            await markSocialAccountError(account.id, result.error ?? "Unbekannt");
          }
        }

        await admin
          .from("social_media_posts")
          .update({
            status: anySuccess ? "published" : "failed",
            published_at: anySuccess ? new Date().toISOString() : null,
            publish_results: results,
            updated_at: new Date().toISOString(),
          })
          .eq("id", post.id);

        if (anySuccess) totalPublished++;
        else totalFailed++;
      } catch (err) {
        console.error(`[Cron social-media-publish] Post ${post.id}:`, err);
        totalFailed++;
      }
    }

    return NextResponse.json({
      message: "Cron abgeschlossen",
      processed: totalPublished + totalFailed,
      published: totalPublished,
      failed: totalFailed,
    });
  } catch (error) {
    console.error("[Cron social-media-publish]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
