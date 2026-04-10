import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // Railway gibt request.nextUrl.origin als localhost zurück — NEXT_PUBLIC_APP_URL verwenden
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    `${request.nextUrl.protocol}//${request.headers.get("x-forwarded-host") || request.nextUrl.host}`;

  const code     = searchParams.get("code");
  const next     = searchParams.get("next") ?? "/dashboard";
  const recovery = searchParams.get("recovery");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Recovery-Flow: entweder next=/login oder recovery=true als eigener Param
      if (next.startsWith("/login") || recovery === "true") {
        return NextResponse.redirect(`${baseUrl}/login?recovery=true`);
      }
      return NextResponse.redirect(`${baseUrl}${next}`);
    }
  }

  return NextResponse.redirect(`${baseUrl}/login?error=auth_failed`);
}
