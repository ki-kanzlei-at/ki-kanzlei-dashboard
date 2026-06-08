/**
 * Headless-Smoke-Test der AI-Researcher-Engine (echter Gemini-Grounding-Call).
 *   npx tsx scripts/test-research.ts
 *   npx tsx scripts/test-research.ts steuerberater-mueller.at
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

function printBlocks(blocks: { type: string; text?: string; items?: string[] }[]) {
  for (const b of blocks) {
    if (b.type === "h") console.log(`\n## ${b.text}`);
    else if (b.type === "ul") (b.items ?? []).forEach((i) => console.log(`  • ${i}`));
    else console.log(b.text);
  }
}

async function main() {
  const { researchCompany, answerQuestion, resolveGeminiKey } = await import("@/lib/research/engine");

  const key = resolveGeminiKey(null);
  if (!key) {
    console.error("❌ Kein GEMINI_API_KEY in .env.local gefunden.");
    process.exit(1);
  }
  console.log("✅ Gemini-Key vorhanden (Länge", key.length, ")");

  const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const input = arg
    ? { company: arg.replace(/\..*$/, ""), website: arg, country: "AT" }
    : { company: "Rauchenberger & Partner Steuerberatung", website: "rauchenberger.at", industry: "Steuerberater", city: "Wien", country: "AT" };

  console.log(`\n━━━ researchCompany: ${input.company} (${input.website}) ━━━`);
  const t0 = Date.now();
  const r = await researchCompany(input, key);
  console.log(`grounded=${r.grounded}  score=${r.score}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  console.log("\nQuellen:");
  r.sources.forEach((s) => console.log(`  [${s.n}] ${s.kind.padEnd(11)} ${s.title}  ${s.url ?? ""}`));

  console.log("\nOverview:");
  printBlocks(r.blocks);

  console.log("\nVorschläge:", r.suggestions);
  console.log("Abgeleitet:", r.derived);
  console.log("Lead-Felder (strukturiert):", r.leadFields);

  console.log(`\n━━━ answerQuestion: "Gibt es aktuelle Wachstumssignale?" ━━━`);
  const a = await answerQuestion(
    { company: input.company, website: input.website, industry: r.derived.industry, city: r.derived.city, facts: r.facts, sources: r.sources },
    [],
    "Gibt es aktuelle Wachstumssignale oder Anlässe für eine Kontaktaufnahme?",
    key,
  );
  printBlocks(a.blocks);

  console.log("\n✅ Engine-Smoke-Test fertig.");
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
