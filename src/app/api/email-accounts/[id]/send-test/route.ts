/* ── API: POST /api/email-accounts/[id]/send-test ──
 * Sendet eine echte Test-E-Mail über das Konto an die eigene Login-Adresse.
 * Beweist End-to-End-Versand (nicht nur Verbindung) — für SMTP & OAuth gleich.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEmailAccountById } from "@/lib/supabase/email-accounts";
import { getUserSettings } from "@/lib/supabase/settings";
import { sendEmailViaAccount } from "@/lib/email/sender";
import { renderSignatureHtml } from "@/lib/email/signature";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;
    const account = await getEmailAccountById(id, user.id);
    if (!account) return NextResponse.json({ error: "Konto nicht gefunden" }, { status: 404 });

    const to = user.email;
    if (!to) return NextResponse.json({ data: { ok: false, error: "Keine eigene E-Mail-Adresse hinterlegt" } });

    // Gespeicherte Signatur mitschicken (zeigt, wie eine echte Mail aussieht)
    const settings = await getUserSettings(user.id);
    const signatureHtml = renderSignatureHtml(settings?.campaign_settings?.signature);
    const signatureBlock = signatureHtml
      ? `<div style="margin-top:20px;color:#334155">${signatureHtml}</div>`
      : "";

    const htmlBody = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.6;font-size:14px">
        <p>Hi,</p>
        <p>diese kurze Nachricht ist gerade über dein Postfach <b>${account.sender_email}</b> rausgegangen. Liegt sie bei dir im Posteingang, ist die Einrichtung sauber und deine Mails kommen an.</p>
        <p>Mehr musst du nicht tun — die Mail kannst du einfach löschen.</p>
        ${signatureBlock}
        <div style="margin-top:22px;padding-top:12px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px">
          Automatischer Postfach-Test aus deinem <b style="color:#0f172a">KI Kanzlei Lead Dashboard</b>.
        </div>
      </div>`;

    try {
      await sendEmailViaAccount(account, {
        to,
        subject: `Postfach-Test · ${account.sender_email}`,
        htmlBody,
      });
      return NextResponse.json({ data: { ok: true, to } });
    } catch (e) {
      return NextResponse.json({ data: { ok: false, error: e instanceof Error ? e.message : "Versand fehlgeschlagen" } });
    }
  } catch (err) {
    console.error("[API /api/email-accounts/[id]/send-test]", err);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
