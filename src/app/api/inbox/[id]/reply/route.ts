/* ── API Route: POST /api/inbox/[id]/reply ──
 * Echte Antwort senden: E-Mail via Account (SMTP/Graph), LinkedIn via ConnectSafely.
 * Hängt die gesendete Nachricht an die Conversation an.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmailViaAccount } from "@/lib/email/sender";
import type { EmailAccount } from "@/lib/supabase/email-accounts";
import { getUserSettings, getLinkedInIntegration } from "@/lib/supabase/settings";
import { createConnectSafelyClient } from "@/lib/connectsafely/client";
import { recordMessage } from "@/lib/inbox/store";
import type { InboxConversation } from "@/lib/inbox/types";

export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const body = await request.json();
    const text: string = typeof body.text === "string" ? body.text.trim().slice(0, 25000) : "";
    const subject: string | null = typeof body.subject === "string" && body.subject.trim() ? body.subject.trim().slice(0, 500) : null;
    if (!text) return NextResponse.json({ error: "Nachricht fehlt" }, { status: 400 });

    const { data: conv } = await supabase.from("inbox_conversations").select("*").eq("id", id).maybeSingle();
    if (!conv) return NextResponse.json({ error: "Konversation nicht gefunden" }, { status: 404 });
    const c = conv as InboxConversation;

    if (c.channel === "email") {
      const to = c.contact_email;
      if (!to) return NextResponse.json({ error: "Keine E-Mail-Adresse für diesen Kontakt" }, { status: 400 });

      // Account wählen: bevorzugt die Mailbox der Kampagne, sonst erstes aktives Konto.
      let account: EmailAccount | null = null;
      if (c.campaign_id) {
        const { data: camp } = await supabase.from("campaigns").select("mailbox_id").eq("id", c.campaign_id).maybeSingle();
        const mailboxId = (camp as { mailbox_id?: string } | null)?.mailbox_id;
        if (mailboxId) {
          const { data: acc } = await supabase.from("email_accounts").select("*").eq("id", mailboxId).maybeSingle();
          account = (acc as EmailAccount | null) ?? null;
        }
      }
      if (!account) {
        const { data: acc } = await supabase
          .from("email_accounts").select("*")
          .eq("is_active", true).order("priority", { ascending: false }).limit(1).maybeSingle();
        account = (acc as EmailAccount | null) ?? null;
      }
      if (!account) return NextResponse.json({ error: "Kein aktives E-Mail-Konto. Bitte unter Einstellungen verbinden." }, { status: 400 });

      const finalSubject = subject || "Re: Ihre Nachricht";
      const htmlBody = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
      await sendEmailViaAccount(account, { to, subject: finalSubject, htmlBody });

      await recordMessage(supabase, {
        userId: user.id, channel: "email", direction: "out",
        contactEmail: to, contactName: c.contact_name, contactCompany: c.contact_company,
        body: text, subject: finalSubject,
        fromName: account.sender_name || account.sender_email, senderEmail: account.sender_email,
      });
      return NextResponse.json({ data: { ok: true, channel: "email" } });
    }

    // LinkedIn
    const settings = await getUserSettings(user.id);
    const integration = getLinkedInIntegration(settings);
    if (!integration) return NextResponse.json({ error: "LinkedIn nicht verbunden." }, { status: 400 });
    const recipient = c.linkedin_url;
    if (!recipient) return NextResponse.json({ error: "Kein LinkedIn-Profil hinterlegt" }, { status: 400 });

    const client = createConnectSafelyClient(integration.apiKey, integration.accountId);
    await client.sendNewMessage(integration.accountId, recipient, text);

    await recordMessage(supabase, {
      userId: user.id, channel: "linkedin", direction: "out",
      linkedinLeadId: c.linkedin_lead_id, contactName: c.contact_name,
      contactCompany: c.contact_company, linkedinUrl: c.linkedin_url, body: text,
    });
    return NextResponse.json({ data: { ok: true, channel: "linkedin" } });
  } catch (e) {
    const err = e as Error & { status?: number };
    console.error("[API POST /api/inbox/[id]/reply]", err);
    return NextResponse.json({ error: "Senden fehlgeschlagen. Bitte später erneut versuchen." }, { status: err.status ?? 502 });
  }
}
