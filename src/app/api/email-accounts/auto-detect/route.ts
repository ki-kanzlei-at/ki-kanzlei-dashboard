/* ── API: POST /api/email-accounts/auto-detect ── */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { autoDetectSmtp, detectProviderName } from "@/lib/email/smtp-autodetect";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { email } = await request.json();
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ error: "Gültige E-Mail-Adresse erforderlich" }, { status: 400 });
    }

    const config = await autoDetectSmtp(email.toLowerCase().trim());
    const providerName = detectProviderName(email.toLowerCase().trim());

    return NextResponse.json({
      data: {
        config,
        provider_name: providerName,
        detected: config !== null,
      },
    });
  } catch (err) {
    console.error("[API /api/email-accounts/auto-detect]", err);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
