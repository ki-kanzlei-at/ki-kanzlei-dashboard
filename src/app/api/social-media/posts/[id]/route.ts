/* ── API Route: /api/social-media/posts/[id] ── */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getSocialMediaPost,
  updateSocialMediaPost,
  deleteSocialMediaPost,
} from "@/lib/supabase/social-media";

/* GET — Single post */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const { id } = await params;
    const post = await getSocialMediaPost(id);
    if (!post) {
      return NextResponse.json({ error: "Post nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json({ data: post });
  } catch (error) {
    console.error("[API /api/social-media/posts/[id] GET]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

/* PATCH — Update post */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const post = await updateSocialMediaPost(id, body);
    return NextResponse.json({ data: post });
  } catch (error) {
    console.error("[API /api/social-media/posts/[id] PATCH]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

/* DELETE — Delete post */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const { id } = await params;
    await deleteSocialMediaPost(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /api/social-media/posts/[id] DELETE]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
