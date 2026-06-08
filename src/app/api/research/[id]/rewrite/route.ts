/* ── API Route: POST /api/research/[id]/rewrite ──
 * Formuliert eine bestehende KI-Antwort neu (gleiche Fakten + Quellen, neuer
 * Wortlaut). Kostet keine Credits — kein neues Grounding.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserSettings } from "@/lib/supabase/settings";
import { resolveGeminiKey, rewriteAnswer } from "@/lib/research/engine";
import { getMessageById, updateMessageBlocks } from "@/lib/supabase/research";
import { blocksToMarkdown } from "@/lib/research/format";

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    await params; // [id] dient nur dem Routing; die Nachricht wird per messageId geladen (RLS schützt).
    const body = await request.json();
    const messageId = typeof body.messageId === "string" ? body.messageId : "";
    if (!messageId) return NextResponse.json({ error: "messageId fehlt" }, { status: 400 });

    const message = await getMessageById(messageId);
    if (!message || message.role !== "ai") {
      return NextResponse.json({ error: "Nachricht nicht gefunden" }, { status: 404 });
    }
    const markdown = blocksToMarkdown(message.blocks);
    if (!markdown.trim()) {
      return NextResponse.json({ error: "Diese Nachricht kann nicht neu formuliert werden" }, { status: 400 });
    }

    const settings = await getUserSettings(user.id);
    const key = resolveGeminiKey(settings?.gemini_api_key);
    if (!key) {
      return NextResponse.json(
        { error: "Gemini API Key nicht konfiguriert. Bitte unter Einstellungen hinterlegen." },
        { status: 400 },
      );
    }

    const seller = {
      companyName: settings?.brand_settings?.company_name ?? null,
      offering: settings?.brand_settings?.offering ?? null,
      valueProp: settings?.brand_settings?.value_prop ?? null,
      targetCustomer: settings?.brand_settings?.target_customer ?? null,
    };

    const { blocks } = await rewriteAnswer(markdown, key, seller);
    const updated = await updateMessageBlocks(messageId, blocks);

    return NextResponse.json({ data: { aiMessage: updated ?? { ...message, blocks } } });
  } catch (error) {
    console.error("[API POST /api/research/[id]/rewrite]", error);
    return NextResponse.json({ error: "Neu formulieren fehlgeschlagen" }, { status: 500 });
  }
}
