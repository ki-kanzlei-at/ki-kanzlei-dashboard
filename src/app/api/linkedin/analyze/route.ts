/* ── API Route: POST /api/linkedin/analyze ── */
/* 1. Loads full LinkedIn profile via ConnectSafely → fills all available fields directly
   2. Calls Gemini only for relevance score + industry (if missing) */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserSettings, getLinkedInIntegration } from "@/lib/supabase/settings";
import { createConnectSafelyClient } from "@/lib/connectsafely/client";
import { enforceQuota, logAction } from "@/lib/connectsafely/rate-limit";
import { getLinkedInLead, updateLinkedInLead } from "@/lib/supabase/linkedin-leads";
import type { LinkedInLeadUpdate } from "@/types/linkedin";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const settings = await getUserSettings(user.id);
    const integration = getLinkedInIntegration(settings);
    if (!integration) {
      return NextResponse.json({ error: "LinkedIn-Integration nicht konfiguriert" }, { status: 400 });
    }
    if (!settings?.gemini_api_key) {
      return NextResponse.json({ error: "Gemini API Key nicht konfiguriert" }, { status: 400 });
    }

    const { leadId } = await request.json();
    if (!leadId) {
      return NextResponse.json({ error: "Lead-ID fehlt" }, { status: 400 });
    }

    const lead = await getLinkedInLead(leadId);
    if (!lead) {
      return NextResponse.json({ error: "Lead nicht gefunden" }, { status: 404 });
    }

    // Profile-Lookup Quota prüfen (cached responses zählen nicht — wir loggen
    // konservativ, da wir den cached-Flag im LegacyProfile-Mapping verlieren)
    try {
      await enforceQuota(user.id, "profilePerDay");
    } catch (e) {
      const err = e as Error & { status?: number; resetAt?: string };
      return NextResponse.json(
        { error: err.message, resetAt: err.resetAt },
        { status: err.status ?? 429 },
      );
    }

    // ── Step 1: Load full profile from ConnectSafely ──
    const client = createConnectSafelyClient(integration.apiKey, integration.accountId);
    const identifier = lead.linkedin_id || lead.linkedin_url;
    let profile;
    try {
      profile = await client.getProfile(integration.accountId, identifier);
      logAction(user.id, "profilePerDay", { leadId, identifier }).catch(() => {});
    } catch {
      profile = null;
    }

    // ── Step 2: Extract all available fields directly from Unipile ──
    const updates: LinkedInLeadUpdate = {
      status: "analyzed",
    };

    if (profile) {
      // Basic info
      if (profile.first_name) updates.first_name = profile.first_name;
      if (profile.last_name) updates.last_name = profile.last_name;
      if (profile.headline) updates.headline = profile.headline;
      if (profile.location) updates.location = profile.location;
      if (profile.industry) updates.industry = profile.industry;
      if (profile.profile_picture_url) updates.profile_picture_url = profile.profile_picture_url;

      // Work experience (Unipile returns work_experience with linkedin_sections=*)
      const experiences = profile.work_experience || profile.positions || [];
      const currentJob = experiences.find((p) => p.is_current) || experiences[0];
      if (currentJob) {
        const companyName = currentJob.company || currentJob.company_name;
        if (companyName) updates.company = companyName;
        if (currentJob.title) updates.position = currentJob.title;
      }
    }

    // ── Step 3: Build profile text for Gemini scoring ──
    const experiences = profile?.work_experience || profile?.positions || [];
    const educations = profile?.education || profile?.educations || [];

    const profileParts = [
      `Name: ${lead.full_name}`,
      updates.headline || lead.headline ? `Headline: ${updates.headline || lead.headline}` : "",
      profile?.summary ? `Bio: ${profile.summary}` : "",
      updates.company || lead.company ? `Firma: ${updates.company || lead.company}` : "",
      updates.position || lead.position ? `Position: ${updates.position || lead.position}` : "",
      updates.location || lead.location ? `Standort: ${updates.location || lead.location}` : "",
      updates.industry || lead.industry ? `Branche: ${updates.industry || lead.industry}` : "",
      profile?.connections_count ? `Kontakte: ${profile.connections_count}` : "",
      profile?.is_premium ? "Premium-Account: Ja" : "",
      experiences.length
        ? `Berufserfahrung:\n${experiences.map((p) => {
            const company = p.company || p.company_name || "?";
            const period = [p.start_date, p.end_date || (p.is_current ? "heute" : "")].filter(Boolean).join(" – ");
            return `  - ${p.title || "?"} bei ${company}${period ? ` (${period})` : ""}`;
          }).join("\n")}`
        : "",
      educations.length
        ? `Ausbildung:\n${educations.map((e) => {
            const school = e.school || e.school_name || "?";
            return `  - ${e.degree || ""} ${e.field_of_study || ""} @ ${school}`.trim();
          }).join("\n")}`
        : "",
      profile?.skills?.length
        ? `Skills: ${profile.skills.join(", ")}`
        : "",
    ].filter(Boolean).join("\n");

    // ── Step 4: Gemini — Score + ai_summary + always extract/confirm all fields ──
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${settings.gemini_api_key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Analysiere dieses LinkedIn-Profil vollständig. Extrahiere ALLE Felder aus dem Profil, der Headline und dem Kontext.

Profil:
${profileParts}

Aufgabe:
- score: Relevanz-Score 0-100 als Business-Kontakt. Berücksichtige: Seniorität/Entscheidungsbefugnis (CEO/GF/Partner = hoch), Branchenrelevanz (Recht, Steuer, Beratung = hoch), Firmengröße, Erfahrung.
- ai_summary: 2-3 Sätze auf Deutsch. Beschreibe wer die Person ist, ihre aktuelle Rolle und warum sie als Business-Kontakt relevant oder weniger relevant ist.
- company: Aktueller Arbeitgeber / Firma (nur Firmenname)
- position: Aktuelle Position / Jobtitel
- industry: Branche (z.B. "Recht", "IT", "Steuerberatung", "Immobilien", "Gesundheit", "Finanzen")
- location: Standort (Stadt, Land)

Antwort NUR als valides JSON (kein Markdown, keine Codeblöcke):
{"score": <number>, "ai_summary": "<string>", "company": "<string oder null>", "position": "<string oder null>", "industry": "<string oder null>", "location": "<string oder null>"}`,
            }],
          }],
        }),
      },
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error("[Gemini API Error]", geminiRes.status, errBody);
      if (geminiRes.status === 429) {
        return NextResponse.json({ error: "Gemini API Limit erreicht — bitte später erneut versuchen" }, { status: 429 });
      }
      // Still save Unipile data even if Gemini fails
      const updated = await updateLinkedInLead(lead.id, updates);
      return NextResponse.json({ data: updated, warning: "Profildaten gespeichert, aber Score konnte nicht berechnet werden" });
    }

    const geminiData = await geminiRes.json();
    const responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (responseText) {
      try {
        const cleaned = responseText.replace(/```json\s*/g, "").replace(/```\s*/g, "");
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        const analysis = JSON.parse(jsonMatch?.[0] || "{}");
        updates.ai_score = Math.min(100, Math.max(0, analysis.score || 0));
        if (analysis.ai_summary) updates.ai_summary = analysis.ai_summary;
        if (analysis.company) updates.company = analysis.company;
        if (analysis.position) updates.position = analysis.position;
        if (analysis.industry) updates.industry = analysis.industry;
        if (analysis.location) updates.location = analysis.location;
      } catch (parseErr) {
        console.error("[Gemini Parse Error]", parseErr, "Response:", responseText);
      }
    }

    // ── Step 5: Save everything ──
    const updated = await updateLinkedInLead(lead.id, updates);
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("[API /api/linkedin/analyze]", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
