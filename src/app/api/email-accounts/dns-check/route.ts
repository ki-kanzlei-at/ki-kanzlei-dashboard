/* ── API: POST /api/email-accounts/dns-check ── */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkDomainDns } from "@/lib/email/dns-check";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    const { domain } = await request.json();
    if (!domain || typeof domain !== "string") {
      return NextResponse.json({ error: "Domain erforderlich" }, { status: 400 });
    }

    // Domain aus E-Mail extrahieren falls nötig
    const cleanDomain = domain.includes("@") ? domain.split("@")[1] : domain;
    const result = await checkDomainDns(cleanDomain.toLowerCase().trim());

    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("[API /api/email-accounts/dns-check]", err);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
