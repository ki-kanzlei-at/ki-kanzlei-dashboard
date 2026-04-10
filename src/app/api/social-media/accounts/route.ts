/* ── API Route: /api/social-media/accounts ── */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getSocialMediaAccounts,
  createSocialMediaAccount,
} from "@/lib/supabase/social-media-accounts";

/* GET — List all accounts for user */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const accounts = await getSocialMediaAccounts(user.id);
    return NextResponse.json({ data: accounts });
  } catch (error) {
    console.error("[API /api/social-media/accounts GET]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

/* POST — Create account (after OAuth or manual) */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const body = await request.json();
    const account = await createSocialMediaAccount(user.id, body);
    return NextResponse.json({ data: account }, { status: 201 });
  } catch (error) {
    console.error("[API /api/social-media/accounts POST]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
