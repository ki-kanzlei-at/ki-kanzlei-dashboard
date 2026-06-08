import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDistinctLegalForms } from "@/lib/supabase/leads";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const country = searchParams.get("country") || undefined;
    const forms = await getDistinctLegalForms(country);
    return NextResponse.json({ data: forms });
  } catch (error) {
    console.error("[API /api/leads/legal-forms] Fehler:", error);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
