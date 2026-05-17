/* ── API Route: /api/seo/posts ── */
/* GET  = Dashboard (authenticated user)
   POST = Admin (CRON_SECRET auth) */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { getSeoPostsPaginated } from "@/lib/supabase/seo";
import { adminInsertSeoPost } from "@/lib/supabase/seo";
import type { SeoPostStatus } from "@/types/seo";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const url = request.nextUrl;
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const pageSize = parseInt(url.searchParams.get("pageSize") || "25", 10);
    const status = url.searchParams.get("status") as SeoPostStatus | null;
    const category = url.searchParams.get("category") || undefined;
    const search = url.searchParams.get("search") || undefined;

    const result = await getSeoPostsPaginated(
      user.id,
      { status: status || undefined, category, search },
      { page, pageSize },
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("[API /api/seo/posts GET]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (!body.user_id || !body.title) {
      return NextResponse.json(
        { error: "user_id und title sind Pflichtfelder" },
        { status: 400 },
      );
    }

    const post = await adminInsertSeoPost({
      user_id: body.user_id,
      title: body.title,
      slug: body.slug || null,
      meta_description: body.meta_description || null,
      category: body.category || null,
      html_content: body.html_content || null,
      word_count: body.word_count || 0,
      featured_image_url: body.featured_image_url || null,
      target_keywords: body.target_keywords || [],
      internal_links_used: body.internal_links_used || 0,
      website_url: body.website_url || null,
      publish_url: body.publish_url || null,
      status: body.status || "draft",
      published_at: body.published_at || null,
    });

    return NextResponse.json({ data: post }, { status: 201 });
  } catch (error) {
    console.error("[API /api/seo/posts POST]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
