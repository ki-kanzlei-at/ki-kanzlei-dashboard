/* ── API Route: POST /api/research/connect ──
 * Einzel-Connection-Request via ConnectSafely aus dem AI Researcher heraus.
 * Legt die Person zugleich als linkedin_lead an (Pipeline + Wochen-Quota).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserSettings, getLinkedInIntegration } from "@/lib/supabase/settings";
import { createConnectSafelyClient, ConnectSafelyError } from "@/lib/connectsafely/client";
import { enforceQuota } from "@/lib/connectsafely/rate-limit";
import { upsertLinkedInLead } from "@/lib/supabase/linkedin-leads";
import { recordMessage } from "@/lib/inbox/store";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const settings = await getUserSettings(user.id);
    const integration = getLinkedInIntegration(settings);
    if (!integration) {
      return NextResponse.json(
        { error: "LinkedIn nicht verbunden. Bitte in den Einstellungen verbinden.", notConfigured: true },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { profileId, profileUrl, fullName, firstName, lastName, headline, company, location, profilePicture, message } = body;
    const identifier: string | undefined = profileId || profileUrl;
    if (!identifier) return NextResponse.json({ error: "Profil-Kennung fehlt" }, { status: 400 });

    try {
      await enforceQuota(user.id, "connectPerWeek");
    } catch (e) {
      const err = e as Error & { status?: number; resetAt?: string };
      return NextResponse.json({ error: err.message, resetAt: err.resetAt }, { status: err.status ?? 429 });
    }

    const client = createConnectSafelyClient(integration.apiKey, integration.accountId);
    await client.sendInvitation(integration.accountId, identifier, message || undefined);

    // In die LinkedIn-Pipeline übernehmen (Tracking + Quota-Zählung)
    if (profileUrl) {
      try {
        const lead = await upsertLinkedInLead({
          user_id: user.id,
          linkedin_url: profileUrl,
          linkedin_id: profileId ?? null,
          full_name: fullName || "Unbekannt",
          first_name: firstName ?? null,
          last_name: lastName ?? null,
          headline: headline ?? null,
          company: company ?? null,
          location: location ?? null,
          profile_picture_url: profilePicture ?? null,
          status: "invited",
          connection_sent_at: new Date().toISOString(),
          invite_message: message ?? null,
        });
        // Invite als ausgehende Nachricht spiegeln (verborgener Thread-Kontext —
        // erscheint in der Inbox erst, wenn der Kontakt antwortet).
        await recordMessage(supabase, {
          userId: user.id, channel: "linkedin", direction: "out",
          linkedinLeadId: lead.id, contactName: fullName || "Unbekannt",
          contactCompany: company ?? null, contactRole: headline ?? null,
          linkedinUrl: profileUrl, avatarUrl: profilePicture ?? null,
          body: message || "Vernetzungsanfrage gesendet.",
          externalId: `li-invite:${lead.id}`,
        });
      } catch (e) {
        console.error("[research/connect] Lead-Upsert/Inbox fehlgeschlagen", e);
      }
    }

    return NextResponse.json({ data: { ok: true, status: "invited" } });
  } catch (e) {
    const err = e as ConnectSafelyError;
    console.error("[API /api/research/connect]", err);
    return NextResponse.json(
      { error: err.message || "LinkedIn-Verbindung fehlgeschlagen", resetAt: err.rateLimitReset },
      { status: err.status ?? 502 },
    );
  }
}
