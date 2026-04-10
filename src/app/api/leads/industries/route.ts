import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDistinctIndustries } from "@/lib/supabase/leads";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const industries = await getDistinctIndustries(status);

    return NextResponse.json({ data: industries });
  } catch (error) {
    console.error("[API /api/leads/industries] Fehler:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
