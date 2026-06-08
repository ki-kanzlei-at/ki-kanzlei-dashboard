/* ── API Route: POST /api/research/[id]/chat ──
 * Folgefrage zu einer Recherche (grounded). Jeder AI-Call kostet Credits
 * (CREDIT_COSTS.lead_chat) — egal ob normale Antwort oder LinkedIn-Suche.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserSettings } from "@/lib/supabase/settings";
import { getLinkedInIntegration } from "@/lib/supabase/settings";
import { resolveGeminiKey, answerQuestion, detectPersonLookup } from "@/lib/research/engine";
import { getSessionById, getMessages, addMessage } from "@/lib/supabase/research";
import { blocksToPlainText, parseBlocks } from "@/lib/research/format";
import { createConnectSafelyClient } from "@/lib/connectsafely/client";
import { findPersonProfile } from "@/lib/connectsafely/find-person";
import { getBalance, consumeCredits } from "@/lib/credits";
import { CREDIT_COSTS } from "@/lib/billing/plans";

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) return NextResponse.json({ error: "Frage fehlt" }, { status: 400 });

    const session = await getSessionById(id);
    if (!session) return NextResponse.json({ error: "Recherche nicht gefunden" }, { status: 404 });

    const settings = await getUserSettings(user.id);
    const key = resolveGeminiKey(settings?.gemini_api_key);
    if (!key) {
      return NextResponse.json(
        { error: "Gemini API Key nicht konfiguriert. Bitte unter Einstellungen hinterlegen." },
        { status: 400 },
      );
    }

    // Jede Frage an den AI Researcher kostet Credits (egal ob Antwort oder LinkedIn-Suche).
    const cost = CREDIT_COSTS.lead_chat;
    const balance = await getBalance(user.id);
    if (balance < cost) {
      return NextResponse.json({ error: "Nicht genug Credits für eine Frage.", remaining: balance, required: cost }, { status: 402 });
    }
    const consume = await consumeCredits(user.id, "lead_chat", { metadata: { sessionId: id } });
    if (!consume.ok) {
      return NextResponse.json({ error: "Nicht genug Credits für eine Frage.", remaining: consume.remaining }, { status: 402 });
    }
    const remaining = consume.remaining;

    const history = await getMessages(id);
    const userMessage = await addMessage(user.id, id, { role: "user", text: question });

    const hist = history
      .filter((m) => m.role === "user" || m.role === "ai")
      .map((m) => ({
        role: m.role as "user" | "ai",
        content: m.role === "ai" ? blocksToPlainText(m.blocks) : (m.text ?? ""),
      }));

    // LinkedIn-Profil einer Person gesucht? → ConnectSafely-Profil ermitteln und als
    // eigene Chat-Nachricht speichern. NUR bei Treffer früh zurückgeben — sonst unten
    // normal grounded antworten (gibt verfügbare Infos statt Sackgasse „nicht gefunden").
    if (/linkedin|xing|profil|vernetz/i.test(question)) {
      const personName = await detectPersonLookup(session.company, hist, question, key).catch(() => null);
      const integration = personName ? getLinkedInIntegration(settings) : null;
      if (personName && integration) {
        const client = createConnectSafelyClient(integration.apiKey, integration.accountId);
        const person = await findPersonProfile(client, integration.accountId, personName, session.company, key, session.country).catch(() => null);
        if (person) {
          const blocks = parseBlocks(`**LinkedIn-Profil von ${personName}:**`);
          const aiMessage = await addMessage(user.id, id, { role: "ai", blocks, person });
          return NextResponse.json({ data: { userMessage, aiMessage, remaining } });
        }
        // kein Profil → fällt durch zur normalen grounded Antwort (mit Rolle/Firma/Kontakt)
      }
    }

    const seller = {
      companyName: settings?.brand_settings?.company_name ?? null,
      offering: settings?.brand_settings?.offering ?? null,
      valueProp: settings?.brand_settings?.value_prop ?? null,
      targetCustomer: settings?.brand_settings?.target_customer ?? null,
    };
    const { blocks } = await answerQuestion(
      {
        company: session.company,
        website: session.website,
        industry: session.industry,
        city: session.city,
        facts: session.facts,
        sources: session.sources,
      },
      hist,
      question,
      key,
      seller,
    );

    const aiMessage = await addMessage(user.id, id, { role: "ai", blocks });

    return NextResponse.json({ data: { userMessage, aiMessage, remaining } });
  } catch (error) {
    console.error("[API POST /api/research/[id]/chat]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
