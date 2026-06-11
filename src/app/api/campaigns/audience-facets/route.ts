/* ── API: GET /api/campaigns/audience-facets ──
 *
 * Grundlage für die Filter im Empfänger-Schritt des Kampagnen-Wizards:
 * alle ansprechbaren Leads (Status „neu", mit E-Mail, noch in keiner
 * Kampagne) mit ihren filterbaren Feldern. Die Filter-Optionen und die
 * kaskadierende Einengung berechnet der Client aus diesen Zeilen — so
 * stehen in jedem Dropdown nur Werte, die es im Pool wirklich gibt.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface AudienceFacetRow {
  id: string;
  country: string | null;
  postal_code: string | null;
  city: string | null;
  industry: string | null;
  legal_form: string | null;
}

const CHUNK = 1000;

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    /* Leads, die bereits in irgendeiner Kampagne stecken (Doppelkontakt-Schutz) */
    const targeted = new Set<string>();
    for (let offset = 0; ; offset += CHUNK) {
      const { data, error: qErr } = await supabase
        .from("campaign_leads")
        .select("lead_id")
        .eq("user_id", user.id)
        .range(offset, offset + CHUNK - 1);
      if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
      (data ?? []).forEach((r) => { if (r.lead_id) targeted.add(r.lead_id as string); });
      if (!data || data.length < CHUNK) break;
    }

    /* Ansprechbarer Pool: Status neu + E-Mail vorhanden */
    const rows: AudienceFacetRow[] = [];
    for (let offset = 0; ; offset += CHUNK) {
      const { data, error: qErr } = await supabase
        .from("leads")
        .select("id, country, postal_code, city, industry, legal_form")
        .eq("user_id", user.id)
        .eq("status", "new")
        .not("email", "is", null)
        .neq("email", "")
        .order("id", { ascending: true })
        .range(offset, offset + CHUNK - 1);
      if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });
      for (const r of (data ?? []) as AudienceFacetRow[]) {
        if (!targeted.has(r.id)) rows.push(r);
      }
      if (!data || data.length < CHUNK) break;
    }

    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("[API /api/campaigns/audience-facets GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interner Serverfehler" },
      { status: 500 },
    );
  }
}
