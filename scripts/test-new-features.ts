/* Verifiziert: Zielgruppen-Recherche, LinkedIn-URL→Profil, Firmenbuch-Fix.
 * Usage: npx tsx scripts/test-new-features.ts <cs_key> */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { researchAudience, findLinkedInUrl, resolveGeminiKey } = await import("@/lib/research/engine");
  const { lookupOfficialCompany } = await import("@/lib/registry");
  const { createConnectSafelyClient } = await import("@/lib/connectsafely/client");
  const key = resolveGeminiKey(null);
  if (!key) { console.log("❌ Kein Gemini-Key"); process.exit(1); }

  console.log("── ZIELGRUPPEN-RECHERCHE (Logistik) ──");
  const aud = await researchAudience({ branche: "Logistik", country: "AT", filters: { size: "50" } }, key);
  console.log(`grounded=${aud.grounded}  Blöcke=${aud.blocks.length}  Quellen=${aud.sources.length}`);
  console.log("  Beispiel-Quellen:", aud.sources.slice(0, 3).map((s) => s.title).join(", "));

  console.log("\n── FIRMENBUCH-FIX (Fonio darf NICHT 'Bruno Fonio KEG' sein) ──");
  const fonio = await lookupOfficialCompany("Fonio", "AT").catch(() => null);
  console.log(`Fonio → ${fonio ? fonio.name : "kein Treffer (korrekt, da kein echtes AT-Firmenbuch-Match)"}`);
  const lbg = await lookupOfficialCompany("LBG Österreich", "AT").catch(() => null);
  console.log(`LBG  → ${lbg ? `${lbg.name} (Regression-Check OK)` : "❌ LBG nicht mehr gefunden!"}`);

  console.log("\n── LINKEDIN URL → PROFIL ──");
  const url = await findLinkedInUrl("Daniel Keinrath", "fonio.ai", key);
  console.log(`URL: ${url ?? "keine"}`);
  const csKey = process.argv.slice(2).find((x) => !x.startsWith("--"));
  if (url && csKey) {
    const accountId = "6a23f37406bcd5243bf7f573";
    const cs = createConnectSafelyClient(csKey, accountId);
    const p = await cs.getProfile(accountId, url).catch((e) => { console.log("  getProfile-Fehler:", e?.message); return null; });
    if (p) console.log(`  Profil: ${[p.first_name, p.last_name].filter(Boolean).join(" ")} — ${(p.headline || "").slice(0, 70)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
