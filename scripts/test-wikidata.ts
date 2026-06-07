/* Testet den Wikidata-DE-Connector. Usage: npx tsx scripts/test-wikidata.ts */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { wikidataLookup } = await import("@/lib/wikidata/client");
  for (const name of ["Hochtief", "DATEV", "Wienerberger", "SAP", "Goldbeck"]) {
    const r = await wikidataLookup(name, "DE");
    if (!r) { console.log(`❌ ${name}: kein Treffer`); continue; }
    console.log(`✅ ${name} → ${r.name} | ${r.sourceLabel}`);
    console.log(`   Rechtsform=${r.legalForm ?? "—"}  Sitz=${r.seat ?? "—"}  Land=${r.country ?? "—"}  Gegr=${r.foundedYear ?? "—"}  GF/Vorstand=${r.managers[0]?.name ?? "—"}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
