/* ── API: GET + POST /api/email-accounts ── */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getEmailAccounts,
  createEmailAccount,
  type EmailAccountInsert,
} from "@/lib/supabase/email-accounts";

function sanitize(v: unknown, max = 512): string {
  if (typeof v !== "string") return "";
  return v.replace(/[<>]/g, "").trim().slice(0, max);
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const accounts = await getEmailAccounts(user.id);
    // Secrets maskieren
    const safe = accounts.map((a) => ({
      ...a,
      smtp_password: a.smtp_password ? "••••••••" : null,
      ms_client_secret: a.ms_client_secret ? "••••••••" : null,
    }));
    return NextResponse.json({ data: safe });
  } catch (err) {
    console.error("[API /api/email-accounts GET]", err);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const body = await request.json();

    const provider = body.provider;
    if (provider !== "smtp" && provider !== "microsoft_graph") {
      return NextResponse.json({ error: "Ungültiger Provider" }, { status: 400 });
    }

    const senderEmail = sanitize(body.sender_email, 254);
    if (!senderEmail) {
      return NextResponse.json({ error: "Sender E-Mail erforderlich" }, { status: 400 });
    }

    const input: EmailAccountInsert = {
      label: sanitize(body.label, 256) || senderEmail,
      provider,
      sender_email: senderEmail,
      sender_name: sanitize(body.sender_name, 256) || null,
      reply_to: sanitize(body.reply_to, 254) || null,
      smtp_host: provider === "smtp" ? sanitize(body.smtp_host, 256) : null,
      smtp_port: provider === "smtp" ? (Number(body.smtp_port) || 587) : null,
      smtp_username: provider === "smtp" ? sanitize(body.smtp_username) : null,
      smtp_password: provider === "smtp" ? sanitize(body.smtp_password, 1024) : null,
      smtp_encryption: provider === "smtp" ? (body.smtp_encryption || "tls") : null,
      ms_tenant_id: provider === "microsoft_graph" ? sanitize(body.ms_tenant_id) : null,
      ms_client_id: provider === "microsoft_graph" ? sanitize(body.ms_client_id) : null,
      ms_client_secret: provider === "microsoft_graph" ? sanitize(body.ms_client_secret, 1024) : null,
      daily_limit: Math.min(500, Math.max(1, Number(body.daily_limit) || 50)),
      is_active: body.is_active !== false,
      priority: Number(body.priority) || 0,
      warmup_enabled: body.warmup_enabled === true,
      warmup_start: Math.min(100, Math.max(1, Number(body.warmup_start) || 10)),
      warmup_increment: Math.min(50, Math.max(1, Number(body.warmup_increment) || 5)),
    };

    const account = await createEmailAccount(user.id, input);
    return NextResponse.json({ data: account }, { status: 201 });
  } catch (err) {
    console.error("[API /api/email-accounts POST]", err);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
