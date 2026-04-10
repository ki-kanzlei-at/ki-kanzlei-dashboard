/* ── API Route: /api/social-media/posts ── */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getSocialMediaPostsPaginated,
  createSocialMediaPost,
} from "@/lib/supabase/social-media";
import type { SocialMediaPostStatus } from "@/types/social-media";

/* GET — Paginated list with filters */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const page = parseInt(sp.get("page") ?? "1", 10);
    const pageSize = parseInt(sp.get("pageSize") ?? "25", 10);
    const status = sp.get("status") as SocialMediaPostStatus | null;
    const platform = sp.get("platform") ?? undefined;
    const search = sp.get("search") ?? undefined;

    const result = await getSocialMediaPostsPaginated(
      user.id,
      { status: status ?? undefined, platform, search },
      { page, pageSize },
    );

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[API /api/social-media/posts GET]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

/* POST — Create a new post */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const body = await request.json();
    const { title, caption, html_content, platform, tags, status, scheduled_at, chat_history, account_ids } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: "Titel fehlt" }, { status: 400 });
    }

    const post = await createSocialMediaPost({
      user_id: user.id,
      title: title.trim(),
      caption: caption ?? null,
      html_content: html_content ?? null,
      platform: platform ?? [],
      tags: tags ?? [],
      status: status ?? "draft",
      scheduled_at: scheduled_at ?? null,
      chat_history: chat_history ?? null,
      account_ids: account_ids ?? [],
    });

    return NextResponse.json({ data: post }, { status: 201 });
  } catch (error) {
    console.error("[API /api/social-media/posts POST]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
