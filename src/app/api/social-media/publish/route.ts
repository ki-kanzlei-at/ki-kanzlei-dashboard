/* ── API Route: POST /api/social-media/publish ── */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSocialMediaPost, updateSocialMediaPost } from "@/lib/supabase/social-media";
import { getActiveAccountsByIds, incrementAccountPostCount, markSocialAccountError } from "@/lib/supabase/social-media-accounts";
import { publishToAccount, type PublishResult } from "@/lib/social-media/publisher";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const { post_id, account_ids, publish_now, scheduled_at } = await request.json();

    if (!post_id || !account_ids?.length) {
      return NextResponse.json({ error: "post_id und account_ids benötigt" }, { status: 400 });
    }

    const post = await getSocialMediaPost(post_id);
    if (!post) {
      return NextResponse.json({ error: "Post nicht gefunden" }, { status: 404 });
    }

    // Update post with account_ids
    await updateSocialMediaPost(post_id, { account_ids });

    if (!publish_now) {
      // Just schedule
      await updateSocialMediaPost(post_id, {
        status: "scheduled",
        scheduled_at: scheduled_at ? new Date(scheduled_at).toISOString() : undefined,
      });
      return NextResponse.json({ scheduled: true });
    }

    // Publish now
    const accounts = await getActiveAccountsByIds(account_ids);
    if (accounts.length === 0) {
      return NextResponse.json({ error: "Keine aktiven Konten gefunden" }, { status: 400 });
    }

    const results: PublishResult[] = [];
    for (const account of accounts) {
      const result = await publishToAccount(account, post);
      results.push(result);

      if (result.success) {
        await incrementAccountPostCount(account.id);
      } else {
        await markSocialAccountError(account.id, result.error ?? "Unbekannt");
      }
    }

    const allSuccess = results.every((r) => r.success);
    const anySuccess = results.some((r) => r.success);

    await updateSocialMediaPost(post_id, {
      status: allSuccess ? "published" : anySuccess ? "published" : "failed",
      ...(anySuccess ? { published_at: new Date().toISOString() } : {}),
    });

    // Save publish results to post
    const existingResults = (post.publish_results ?? {}) as Record<string, unknown>;
    const updatedResults = { ...existingResults };
    for (const r of results) {
      updatedResults[r.account_id] = {
        platform: r.platform,
        success: r.success,
        post_id: r.post_id,
        error: r.error,
        published_at: new Date().toISOString(),
      };
    }
    await supabase
      .from("social_media_posts")
      .update({ publish_results: updatedResults })
      .eq("id", post_id);

    return NextResponse.json({ results, success: allSuccess });
  } catch (error) {
    console.error("[API /api/social-media/publish]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
