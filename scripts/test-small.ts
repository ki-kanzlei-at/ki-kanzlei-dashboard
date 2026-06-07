/* Test mit KLEINEREN Firmen: Quellenbreite + graceful handling.
 * Usage: npx tsx scripts/test-small.ts */
import { config } from "dotenv";
config({ path: ".env.local" });

const COMPANIES = [
  { company: "Social Dynamics", website: "socialdynamics.agency", country: "AT" },
  { company: "ECOMAL Austria", website: "ecomal.com", country: "AT" },
  { company: "Sphinx IT Consulting", website: "sphinx.at", country: "AT" },
];

async function main() {
  const { researchCompany, resolveGeminiKey } = await import("@/lib/research/engine");
  const key = resolveGeminiKey(null);
  if (!key) { console.log("❌ Kein Gemini-Key"); process.exit(1); }

  for (const c of COMPANIES) {
    try {
      const r = await researchCompany(c, key, { companyName: "KI Kanzlei", offering: "KI-Software für Kanzleien", valueProp: null, targetCustomer: null });
      const lf = r.leadFields;
      console.log(`\n━━ ${c.company} (${c.website}) ━━`);
      console.log(`  grounded=${r.grounded}  Quellen=${r.sources.length}  Score=${r.score}`);
      console.log(`  Quellen: ${r.sources.map((s) => s.title).slice(0, 12).join(" · ")}`);
      console.log(`  GF=${lf.ceo_name ?? "—"}  Mitarb=${lf.employees ?? "—"}  Umsatz=${lf.revenue ?? "—"}  Zusammenfassung=${lf.summary ? "✅" : "—"}`);
    } catch (e) {
      console.log(`\n━━ ${c.company} ━━  ❌ ${e instanceof Error ? e.message : e}`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
