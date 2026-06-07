/* ── API: POST /api/email-accounts/[id]/test ── */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEmailAccountById, updateEmailAccount } from "@/lib/supabase/email-accounts";
import { testConnection as testGraph } from "@/lib/email/microsoft-graph";
import { testConnection as testSmtp } from "@/lib/email/smtp";
import { testMicrosoftOAuth } from "@/lib/email/microsoft-oauth";
import { testGoogleOAuth } from "@/lib/email/google-oauth";

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

    let result: { ok: boolean; error?: string };

    switch (account.provider) {
      case "microsoft_oauth": {
        result = await testMicrosoftOAuth(account);
        break;
      }
      case "google_oauth": {
        result = await testGoogleOAuth(account);
        break;
      }
      case "microsoft_graph": {
        if (!account.ms_tenant_id || !account.ms_client_id || !account.ms_client_secret) {
          return NextResponse.json({ data: { ok: false, error: "Credentials unvollständig" } });
        }
        result = await testGraph({
          tenantId: account.ms_tenant_id,
          clientId: account.ms_client_id,
          clientSecret: account.ms_client_secret,
          senderEmail: account.sender_email,
          senderName: account.sender_name || undefined,
        });
        break;
      }
      case "smtp": {
        if (!account.smtp_host || !account.smtp_username || !account.smtp_password) {
          return NextResponse.json({ data: { ok: false, error: "SMTP Credentials unvollständig" } });
        }
        result = await testSmtp({
          host: account.smtp_host,
          port: account.smtp_port || 587,
          username: account.smtp_username,
          password: account.smtp_password,
          encryption: account.smtp_encryption || "tls",
          senderEmail: account.sender_email,
        });
        break;
      }
      default:
        return NextResponse.json({ data: { ok: false, error: "Unbekannter Provider" } });
    }

    // Health-Status updaten
    await updateEmailAccount(id, user.id, {
      health_status: result.ok ? "good" : "bad",
      last_error: result.ok ? null : (result.error ?? "Unbekannter Fehler"),
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("[API /api/email-accounts/[id]/test]", err);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
