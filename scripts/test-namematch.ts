import { config } from "dotenv";
config({ path: ".env.local" });
async function main() {
  const { resolveGeminiKey } = await import("@/lib/research/engine");
  const { createConnectSafelyClient } = await import("@/lib/connectsafely/client");
  const { findPersonProfile } = await import("@/lib/connectsafely/find-person");
  const key = resolveGeminiKey(null);
  const cs = createConnectSafelyClient(process.argv[2] || "", "6a23f37406bcd5243bf7f573");
  const cases: [string, string, string][] = [
    ["Friedrich Ebner", "Sphinx IT Consulting", "AT"],
    ["Oliver Steil", "TeamViewer", "DE"],
    ["Daniel Keinrath", "fonio", "AT"],
    ["Elisabeth Mack", "Fellverliebt", "AT"],
  ];
  for (const [n, c, co] of cases) {
    const p = await findPersonProfile(cs, "6a23f37406bcd5243bf7f573", n, c, key, co).catch((e) => { console.log("err", e?.message); return null; });
    console.log(`${n} (${c}, ${co}) → ${p ? `${p.name} | ${p.profile_url || ""}` : "kein Profil (Fallback auf Grounding-Antwort)"}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e?.message || e); process.exit(1); });
