/* ── API: POST /api/campaigns/preview ──
 * Generiert EINE Beispiel-Mail aus dem Master-Prompt + echten Lead-Daten
 * (CEO, Branche, Stadt, Website …) für die Live-Vorschau im Wizard.
 * Verbraucht keine Credits — reines Setup-Hilfsmittel.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserSettings } from "@/lib/supabase/settings";
import { generateCampaignMail, type GeneratorLead } from "@/lib/email/campaign-generator";
import { renderSignaturePlain } from "@/lib/email/signature";
import type { Campaign } from "@/types/campaigns";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const systemPrompt = typeof body.system_prompt === "string" ? body.system_prompt.trim() : "";
    if (systemPrompt.length < 20) {
      return NextResponse.json({ error: "Bitte zuerst eine Kampagnen-Anweisung schreiben (mind. 20 Zeichen)." }, { status: 400 });
    }

    const tone = typeof body.tone === "string" ? body.tone : "professional";
    const language = typeof body.language === "string" ? body.language : "de-AT";
    const senderName = typeof body.sender_name === "string" ? body.sender_name : "";
    const stepIntent = typeof body.intent === "string" && body.intent.trim() ? body.intent.trim() : "Erstkontakt";
    const stepDesc = typeof body.desc === "string" ? body.desc : "Kurzer Pitch mit konkretem Bezug auf den Empfänger";

    // Sample-Lead: bevorzugt die übergebene ID (muss dem User gehören), sonst
    // ein repräsentativer Lead mit E-Mail + Ansprechperson.
    const LEAD_COLS = "id, company, email, ceo_name, ceo_first_name, ceo_last_name, ceo_title, ceo_gender, city, industry, website";
    let lead: GeneratorLead | null = null;

    if (typeof body.lead_id === "string" && body.lead_id) {
      const { data } = await supabase.from("leads").select(LEAD_COLS).eq("id", body.lead_id).eq("user_id", user.id).maybeSingle();
      if (data) lead = data as GeneratorLead;
    }
    if (!lead) {
      const { data } = await supabase
        .from("leads")
        .select(LEAD_COLS)
        .eq("user_id", user.id)
        .not("email", "is", null)
        .order("ceo_name", { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (data) lead = data as GeneratorLead;
    }
    // Fallback-Demo-Lead, falls noch keine Leads existieren
    if (!lead) {
      lead = {
        id: "preview", company: "Muster Kanzlei GmbH", email: "kontakt@muster-kanzlei.at",
        ceo_name: "Dr. Anna Berger", ceo_first_name: "Anna", ceo_last_name: "Berger",
        ceo_title: "Dr.", ceo_gender: "frau", city: "Wien", industry: "Steuerberatung", website: "muster-kanzlei.at",
      };
    }

    const settings = await getUserSettings(user.id);
    const signature = settings?.campaign_settings?.signature ?? "";
    const brand = settings?.brand_settings;
    const companyContext = {
      companyName: brand?.company_name ?? null,
      offering: brand?.offering ?? null,
      valueProp: brand?.value_prop ?? null,
      targetCustomer: brand?.target_customer ?? null,
    };

    // Minimales Campaign-Objekt — der Generator liest nur diese Felder.
    const campaign = {
      system_prompt: systemPrompt,
      tone,
      language,
      sender_name: senderName,
      sequence_steps: [{ intent: stepIntent, desc: stepDesc }],
    } as unknown as Campaign;

    const mail = await generateCampaignMail({
      campaign,
      step: { intent: stepIntent, desc: stepDesc } as Campaign["sequence_steps"][number],
      stepIndex: 0,
      lead,
      senderName: senderName || lead.ceo_name || "",
      signature: renderSignaturePlain(signature),
      companyContext,
    });

    return NextResponse.json({
      data: {
        subject: mail.subject,
        body: mail.plainBody,
        generator: mail.generator,
        lead: { company: lead.company, ceo_name: lead.ceo_name, city: lead.city, industry: lead.industry },
      },
    });
  } catch (err) {
    console.error("[API /api/campaigns/preview]", err);
    return NextResponse.json({ error: "Vorschau fehlgeschlagen" }, { status: 500 });
  }
}
