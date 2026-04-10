import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDistinctCities } from "@/lib/supabase/leads";

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
    const country = searchParams.get("country") || undefined;
    const cities = await getDistinctCities(country);

    return NextResponse.json({ data: cities });
  } catch (error) {
    console.error("[API /api/leads/cities] Fehler:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
