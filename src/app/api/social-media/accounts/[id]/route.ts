/* ── API Route: /api/social-media/accounts/[id] ── */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getSocialMediaAccountById,
  updateSocialMediaAccount,
  deleteSocialMediaAccount,
} from "@/lib/supabase/social-media-accounts";

/* GET — Single account */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const { id } = await params;
    const account = await getSocialMediaAccountById(id, user.id);
    if (!account) {
      return NextResponse.json({ error: "Konto nicht gefunden" }, { status: 404 });
    }

    return NextResponse.json({ data: account });
  } catch (error) {
    console.error("[API /api/social-media/accounts/[id] GET]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

/* PATCH — Update account */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const account = await updateSocialMediaAccount(id, user.id, body);
    return NextResponse.json({ data: account });
  } catch (error) {
    console.error("[API /api/social-media/accounts/[id] PATCH]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

/* DELETE — Delete account */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const { id } = await params;
    await deleteSocialMediaAccount(id, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /api/social-media/accounts/[id] DELETE]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
