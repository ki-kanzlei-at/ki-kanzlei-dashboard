/* Abschluss-Verifikation nach allen Fixes: mehrere Leads recherchieren + analysieren.
 * Prüft Quellenbreite, Firmenbuch-Match, strukturierte Felder, Zielgruppe.
 * Usage: npx tsx scripts/verify-final.ts */
import { config } from "dotenv";
config({ path: ".env.local" });

const COMPANIES = [
  { company: "LBG Österreich", website: "lbg.at", city: "Wien", country: "AT" },
  { company: "TPA Steuerberatung", website: "tpa-group.at", city: "Wien", country: "AT" },
  { company: "Quehenberger Logistics", website: "quehenberger.com", city: "Salzburg", country: "AT" },
  { company: "Fonio", website: "fonio.ai", country: "AT" },
];

function fld(v: unknown) { return v ? "✅" : "—"; }

async function main() {
  const { researchCompany, researchAudience, resolveGeminiKey } = await import("@/lib/research/engine");
  const key = resolveGeminiKey(null);
  if (!key) { console.log("❌ Kein Gemini-Key"); process.exit(1); }

  for (const c of COMPANIES) {
    try {
      const r = await researchCompany(c, key, { companyName: "KI Kanzlei", offering: "KI-Software für Kanzleien", valueProp: null, targetCustomer: "Steuerberater, Anwälte" });
      const lf = r.leadFields;
      const fb = r.sources.find((s) => s.kind === "firmenbuch");
      console.log(`\n━━ ${c.company} (${c.website}) ━━`);
      console.log(`  grounded=${r.grounded}  Quellen=${r.sources.length}  Score=${r.score}`);
      console.log(`  Quellen-Arten: ${[...new Set(r.sources.map((s) => s.kind))].join(", ")}`);
      console.log(`  Firmenbuch: ${fb ? fb.title : "—"}`);
      console.log(`  Felder: GF=${fld(lf.ceo_name)}(${lf.ceo_name ?? ""})  Rechtsform=${fld(lf.legal_form)}  Mitarb=${fld(lf.employees)}(${lf.employees ?? ""})  Umsatz=${fld(lf.revenue)}(${lf.revenue ?? ""})  Gegr=${lf.founded_year ?? "—"}`);
      console.log(`  Zusammenfassung: ${fld(lf.summary)}  PainPoints: ${fld(lf.pain_points)}  Ansatz: ${fld(lf.our_solution)}`);
      console.log(`  Vorschläge: ${r.suggestions.join(" | ")}`);
    } catch (e) {
      console.log(`\n━━ ${c.company} ━━  ❌ ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\n━━ ZIELGRUPPE: Bauunternehmen (DE), 100+ MA ━━`);
  const aud = await researchAudience({ branche: "Bauunternehmen", country: "DE", filters: { size: "100" } }, key);
  console.log(`  grounded=${aud.grounded}  Firmen=${aud.sources.length}: ${aud.sources.map((s) => s.title).join(", ")}`);

  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
