/* ── API Route: /api/social-media/accounts/[id]/test ── */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSocialMediaAccountById } from "@/lib/supabase/social-media-accounts";
import { LinkedInClient } from "@/lib/social-media/linkedin-client";
import { MetaGraphClient } from "@/lib/social-media/meta-client";

export async function POST(
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

    if (!account.access_token && !account.page_access_token) {
      return NextResponse.json({ ok: false, error: "Kein Access Token vorhanden" });
    }

    let result: { ok: boolean; name?: string; error?: string };

    switch (account.platform) {
      case "linkedin": {
        const client = new LinkedInClient(account.access_token!);
        result = await client.testConnection();
        break;
      }
      case "facebook":
      case "instagram": {
        const token = account.page_access_token || account.access_token!;
        const client = new MetaGraphClient(token);
        const pageId = account.page_id || account.platform_user_id;
        if (!pageId) {
          result = { ok: false, error: "Keine Page-ID vorhanden" };
        } else {
          result = await client.testConnection(pageId);
        }
        break;
      }
      default:
        result = { ok: false, error: "Unbekannte Plattform" };
    }

    // Update health status
    const updateBody: Record<string, unknown> = {
      health_status: result.ok ? "good" : "warning",
      last_error: result.ok ? null : result.error,
      updated_at: new Date().toISOString(),
    };

    await supabase
      .from("social_media_accounts")
      .update(updateBody)
      .eq("id", id)
      .eq("user_id", user.id);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[API /api/social-media/accounts/[id]/test]", error);
    return NextResponse.json({ ok: false, error: "Interner Serverfehler" }, { status: 500 });
  }
}
