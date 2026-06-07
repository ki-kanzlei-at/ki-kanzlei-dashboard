/* Testet: Chat-Intent „LinkedIn von ihm" → Name + ConnectSafely-Profil.
 * Usage: npx tsx scripts/test-linkedin-intent.ts <cs_key> */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { detectPersonLookup, resolveGeminiKey } = await import("@/lib/research/engine");
  const { createConnectSafelyClient } = await import("@/lib/connectsafely/client");
  const key = resolveGeminiKey(null);
  if (!key) { console.log("❌ Kein Gemini-Key"); process.exit(1); }

  const company = "LBG Österreich";
  const history = [
    { role: "ai" as const, content: "Mag. Heinz Harb ist Managing Partner und Vorsitzender der Geschäftsführung bei LBG Österreich." },
    { role: "user" as const, content: "hast du die telefonnummer von ihm?" },
    { role: "ai" as const, content: "Heinz Harb ist unter +43 (1) 531 05 - 1403 erreichbar, E-Mail heinz.harb@lbg.at." },
  ];

  const name = await detectPersonLookup(company, history, "hast du nen linkedin auch von ihm?", key);
  console.log(`Intent-Erkennung „von ihm" → ${name ? `✅ "${name}"` : "❌ nicht erkannt"}`);

  // Gegenprobe: normale Frage darf NICHT triggern
  const neg = await detectPersonLookup(company, history, "wie viele standorte haben sie?", key);
  console.log(`Gegenprobe (Standorte-Frage) → ${neg ? `❌ fälschlich "${neg}"` : "✅ kein Personen-Lookup"}`);

  const csKey = process.argv.slice(2).find((x) => !x.startsWith("--"));
  if (name && csKey) {
    const accountId = "6a23f37406bcd5243bf7f573";
    const cs = createConnectSafelyClient(csKey, accountId);
    const res = await cs.searchLinkedIn(accountId, `${company} ${name}`, { limit: 3 }).catch((e) => { console.log("CS-Fehler:", e?.message); return null; });
    const items = res?.items ?? [];
    console.log(`ConnectSafely-Suche "${company} ${name}" → ${items.length} Treffer`);
    items.forEach((p: { name?: string; headline?: string }) => console.log(`   • ${p.name}${p.headline ? ` — ${p.headline.slice(0, 70)}` : ""}`));
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
