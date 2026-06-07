import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { researchCompany, findLinkedInUrl, resolveGeminiKey } = await import("@/lib/research/engine");
  const { createConnectSafelyClient } = await import("@/lib/connectsafely/client");
  const k = resolveGeminiKey(null);
  if (!k) { console.log("no key"); process.exit(1); }

  const r = await researchCompany({ company: "Fellverliebt", website: "fellverliebt.com", country: "AT" }, k);
  console.log(`fellverliebt: ${r.sources.length} Quellen => ${r.sources.map((s) => s.title).join(" | ")}`);

  const url = await findLinkedInUrl("Oliver Steil", "TeamViewer", k);
  console.log(`LinkedIn Oliver Steil (TeamViewer): ${url || "keine"}`);
  if (url) {
    const cs = createConnectSafelyClient(process.argv[2] || "", "6a23f37406bcd5243bf7f573");
    const p = await cs.getProfile("6a23f37406bcd5243bf7f573", url).catch((e) => { console.log("cs-err", e?.message); return null; });
    if (p) console.log(`  Profil: ${[p.first_name, p.last_name].filter(Boolean).join(" ")} — ${(p.headline || "").slice(0, 60)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e?.message || e); process.exit(1); });
