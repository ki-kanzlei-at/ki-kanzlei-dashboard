/* ── API Route: GET /api/social-media/unsplash ── */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const accessKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!accessKey) {
      return NextResponse.json({ error: "UNSPLASH_ACCESS_KEY nicht konfiguriert" }, { status: 500 });
    }

    const sp = request.nextUrl.searchParams;
    const query = sp.get("query");
    if (!query) {
      return NextResponse.json({ error: "query Parameter fehlt" }, { status: 400 });
    }

    const page = sp.get("page") || "1";
    const perPage = sp.get("per_page") || "20";

    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("page", page);
    url.searchParams.set("per_page", perPage);
    url.searchParams.set("orientation", "squarish");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Client-ID ${accessKey}` },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Unsplash API: ${res.status} ${text.slice(0, 200)}` }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({
      results: (data.results ?? []).map((img: Record<string, unknown>) => ({
        id: img.id,
        urls: img.urls,
        alt_description: img.alt_description,
        user: {
          name: (img.user as Record<string, unknown>)?.name,
          username: (img.user as Record<string, unknown>)?.username,
          links: (img.user as Record<string, unknown>)?.links,
        },
        width: img.width,
        height: img.height,
      })),
      total: data.total,
      total_pages: data.total_pages,
    });
  } catch (error) {
    console.error("[API /api/social-media/unsplash]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
