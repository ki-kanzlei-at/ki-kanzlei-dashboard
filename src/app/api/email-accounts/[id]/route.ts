/* ── API: PATCH + DELETE /api/email-accounts/[id] ── */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  updateEmailAccount,
  deleteEmailAccount,
  type EmailAccountUpdate,
} from "@/lib/supabase/email-accounts";

function sanitize(v: unknown, max = 512): string {
  if (typeof v !== "string") return "";
  return v.replace(/[<>]/g, "").trim().slice(0, max);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();

    const updates: EmailAccountUpdate = {};

    if (body.label !== undefined) updates.label = sanitize(body.label, 256);
    if (body.sender_email !== undefined) updates.sender_email = sanitize(body.sender_email, 254);
    if (body.sender_name !== undefined) updates.sender_name = sanitize(body.sender_name, 256) || null;
    if (body.reply_to !== undefined) updates.reply_to = sanitize(body.reply_to, 254) || null;
    if (body.send_as_email !== undefined) updates.send_as_email = sanitize(body.send_as_email, 254) || null;
    if (body.smtp_host !== undefined) updates.smtp_host = sanitize(body.smtp_host, 256) || null;
    if (body.smtp_port !== undefined) updates.smtp_port = Number(body.smtp_port) || 587;
    if (body.smtp_username !== undefined) updates.smtp_username = sanitize(body.smtp_username) || null;
    if (body.smtp_password !== undefined && body.smtp_password !== "••••••••") {
      updates.smtp_password = sanitize(body.smtp_password, 1024) || null;
    }
    if (body.smtp_encryption !== undefined) updates.smtp_encryption = body.smtp_encryption;
    if (body.ms_tenant_id !== undefined) updates.ms_tenant_id = sanitize(body.ms_tenant_id) || null;
    if (body.ms_client_id !== undefined) updates.ms_client_id = sanitize(body.ms_client_id) || null;
    if (body.ms_client_secret !== undefined && body.ms_client_secret !== "••••••••") {
      updates.ms_client_secret = sanitize(body.ms_client_secret, 1024) || null;
    }
    if (body.daily_limit !== undefined) updates.daily_limit = Math.min(500, Math.max(1, Number(body.daily_limit)));
    if (body.is_active !== undefined) updates.is_active = body.is_active === true;
    if (body.priority !== undefined) updates.priority = Number(body.priority) || 0;
    if (body.warmup_enabled !== undefined) updates.warmup_enabled = body.warmup_enabled === true;
    if (body.warmup_start !== undefined) updates.warmup_start = Math.min(100, Math.max(1, Number(body.warmup_start)));
    if (body.warmup_increment !== undefined) updates.warmup_increment = Math.min(50, Math.max(1, Number(body.warmup_increment)));

    const account = await updateEmailAccount(id, user.id, updates);
    return NextResponse.json({ data: account });
  } catch (err) {
    console.error("[API /api/email-accounts/[id] PATCH]", err);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { id } = await params;
    await deleteEmailAccount(id, user.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[API /api/email-accounts/[id] DELETE]", err);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
