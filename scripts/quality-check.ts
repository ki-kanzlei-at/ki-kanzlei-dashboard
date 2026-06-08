/* Mehrfach-Qualitätscheck des AI Researchers — prüft, ob über mehrere Läufe
 * konsistent saubere Ergebnisse rauskommen (keine geratenen E-Mail-Schemata,
 * kein "LinkedIn nicht gefunden", kein Jahresabschluss-Paywall-Gerede, keine
 * leeren Überblicke, Zitate + Firmenbuch vorhanden).
 *
 * Usage: npx tsx scripts/quality-check.ts [tries]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const TRIES = Number(process.argv[2] || 2);
const COMPANIES = [
  { company: "LBG Österreich", website: "lbg.at", city: "Wien", country: "AT" },
  { company: "TPA Steuerberatung", website: "tpa-group.at", city: "Wien", country: "AT" },
];

// Muster, die NICHT vorkommen dürfen:
const BAD = [
  { name: "E-Mail-Schema geraten", re: /e-?mail-?schema|vorname\.nachname|initial\.nachname|wahrscheinlich\w*\s+e-?mail/i },
  { name: "LinkedIn-Filler", re: /linkedin[^.\n]{0,40}(nicht\s+(öffentlich|gefunden)|nicht\s+über\s+google)/i },
  { name: "Jahresabschluss-Paywall", re: /kostenpflichtig|jahresabschluss[^.\n]{0,40}anfordern|firmenbuch[^.\n]{0,40}anfordern|müsste[^.\n]{0,40}angefordert/i },
];

interface Block { type: string; text?: string; items?: string[] }
function blocksText(blocks: Block[]): string {
  return blocks.map((b) => (b.type === "ul" ? (b.items ?? []).join(" ") : b.text ?? "")).join("\n");
}

let runs = 0, clean = 0;
const fails: string[] = [];

async function main() {
  const { researchCompany, answerQuestion, resolveGeminiKey } = await import("@/lib/research/engine");
  const key = resolveGeminiKey(null);
  if (!key) { console.log("❌ Kein Gemini-Key"); process.exit(1); }

  for (const c of COMPANIES) {
    for (let t = 1; t <= TRIES; t++) {
      runs++;
      const tag = `${c.company} · Versuch ${t}`;
      try {
        const r = await researchCompany(c, key);
        const text = blocksText(r.blocks);
        const issues: string[] = [];

        if (!r.grounded) issues.push("nicht grounded");
        if (text.trim().length < 120) issues.push("Überblick zu kurz/leer");
        if (!/\[\[\d+\]\]/.test(text)) issues.push("keine Zitate [[n]]");
        if (r.sources.length < 6) issues.push(`nur ${r.sources.length} Quellen`);
        if (!r.sources.some((s) => s.kind === "firmenbuch")) issues.push("kein Firmenbuch");
        if (r.suggestions.length !== 3) issues.push(`${r.suggestions.length} Vorschläge`);
        if (!/schlüsselperson|geschäftsführ|kontakt/i.test(text)) issues.push("keine Schlüsselpersonen");
        for (const b of BAD) if (b.re.test(text)) issues.push(`Überblick: ${b.name}`);

        // Finanz-Folgefrage (häufigster Auslöser für Paywall-Gerede)
        const a = await answerQuestion(
          { company: c.company, website: c.website, sources: r.sources },
          [], "Wie hoch sind Umsatz und Gewinn?", key,
        );
        const aText = blocksText(a.blocks);
        for (const b of BAD) if (b.re.test(aText)) issues.push(`Finanzfrage: ${b.name}`);

        if (issues.length === 0) {
          clean++;
          console.log(`✅ ${tag}  —  ${r.sources.length} Quellen, Score ${r.score}`);
        } else {
          fails.push(`${tag}: ${issues.join("; ")}`);
          console.log(`⚠️  ${tag}  —  ${issues.join("; ")}`);
        }
      } catch (e) {
        fails.push(`${tag}: EXCEPTION ${e instanceof Error ? e.message : e}`);
        console.log(`❌ ${tag}  —  Exception`);
      }
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`   ${clean}/${runs} Läufe sauber`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  if (fails.length) { console.log("Auffälligkeiten:"); fails.forEach((f) => console.log("  • " + f)); }
  process.exit(clean === runs ? 0 : 1);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
