/* Recherchiert deutsche Firmen (DE → Wikidata) + legt sie als Leads an + Analyse.
 * Usage: npx tsx scripts/seed-de-leads.ts */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const USER_ID = "a58929d6-69b9-4a2b-a60b-c6bcf8ff372d";
const COMPANIES = [
  { company: "DATEV", website: "datev.de", city: "Nürnberg", country: "DE" },
  { company: "Knauf", website: "knauf.de", city: "Iphofen", country: "DE" },
  { company: "TeamViewer", website: "teamviewer.com", city: "Göppingen", country: "DE" },
  { company: "Celonis", website: "celonis.com", city: "München", country: "DE" },
  { company: "Hochtief", website: "hochtief.de", city: "Essen", country: "DE" },
];

function note(lf: Record<string, unknown>, sources: { title: string }[]): string {
  const date = new Date().toLocaleDateString("de-AT");
  const p: string[] = [`KI-Recherche (${date})`];
  if (lf.summary) p.push(`\nZusammenfassung:\n${lf.summary}`);
  const k = [lf.revenue && `Umsatz: ${lf.revenue}`, lf.employees && `Mitarbeiter: ${lf.employees}`, lf.founded_year && `Gegründet: ${lf.founded_year}`, lf.legal_form && `Rechtsform: ${lf.legal_form}`].filter(Boolean);
  if (k.length) p.push(`\nKennzahlen:\n${k.map((x) => `- ${x}`).join("\n")}`);
  if (lf.pain_points) p.push(`\nMögliche Pain Points:\n${lf.pain_points}`);
  if (lf.our_solution) p.push(`\nUnser Ansatz:\n${lf.our_solution}`);
  if (sources.length) p.push(`\nQuellen: ${sources.map((s) => s.title).join(", ")}`);
  return p.join("\n");
}

async function main() {
  const { researchCompany, resolveGeminiKey } = await import("@/lib/research/engine");
  const key = resolveGeminiKey(null);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!key || !url || !svc) { console.log("❌ Keys fehlen"); process.exit(1); }
  const sb = createClient(url, svc, { auth: { persistSession: false } });

  for (const c of COMPANIES) {
    try {
      const r = await researchCompany(c, key, { companyName: "KI Kanzlei", offering: "KI-Software für Kanzleien", valueProp: null, targetCustomer: "Steuerberater, Anwälte, KMU" });
      const lf = r.leadFields as Record<string, string | null>;
      const wiki = r.sources.find((s) => s.sub === "Wikidata");
      console.log(`\n━━ ${c.company} (${c.website}) ━━`);
      console.log(`  grounded=${r.grounded}  Quellen=${r.sources.length}  Score=${r.score}  Wikidata=${wiki ? wiki.title : "—"}`);
      console.log(`  GF=${lf.ceo_name ?? "—"}  Rechtsform=${lf.legal_form ?? "—"}  Mitarb=${lf.employees ?? "—"}  Umsatz=${lf.revenue ?? "—"}  Gegr=${lf.founded_year ?? "—"}`);
      console.log(`  Zusammenfassung=${lf.summary ? "✅" : "—"}  Pain=${lf.pain_points ? "✅" : "—"}  Ansatz=${lf.our_solution ? "✅" : "—"}`);

      const ceoFull = [lf.ceo_title, lf.ceo_name].filter(Boolean).join(" ").trim() || null;
      const dom = c.website.replace(/^https?:\/\//, "").replace(/^www\./, "").toLowerCase();
      const aiResearch = { score: r.score, sources: r.sources, summary: lf.summary, employees: lf.employees, revenue: lf.revenue, founded_year: lf.founded_year, pain_points: lf.pain_points, our_solution: lf.our_solution, updated_at: new Date().toISOString() };
      const { data: existing } = await sb.from("leads").select("id").eq("user_id", USER_ID).ilike("website", `%${dom}%`).limit(1);
      const row = {
        name: ceoFull || c.company, company: c.company, company_name: r.derived?.company_name || c.company,
        email: lf.email || "", phone: lf.phone ?? null, website: dom, city: c.city, country: c.country,
        industry: r.derived?.industry ?? null, legal_form: lf.legal_form ?? null, ceo_name: ceoFull, ceo_title: lf.ceo_title ?? null,
        ceo_source: ceoFull ? "ai_research" : null, street: lf.street ?? null, postal_code: lf.postal_code ?? null,
        social_linkedin: lf.social_linkedin ?? null, social_facebook: lf.social_facebook ?? null, social_instagram: lf.social_instagram ?? null,
        notes: note(lf, r.sources), status: "new", raw_data: { ai_research: aiResearch }, user_id: USER_ID,
      };
      if (existing && existing.length) { await sb.from("leads").update({ raw_data: row.raw_data, notes: row.notes, legal_form: row.legal_form, ceo_name: row.ceo_name }).eq("id", existing[0].id); console.log("  ↻ Lead aktualisiert"); }
      else { const { error } = await sb.from("leads").insert(row); console.log(error ? `  ❌ ${error.message}` : "  ✅ Lead angelegt"); }
    } catch (e) {
      console.log(`\n━━ ${c.company} ━━ ❌ ${e instanceof Error ? e.message : e}`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
