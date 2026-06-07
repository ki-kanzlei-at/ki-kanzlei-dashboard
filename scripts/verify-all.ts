/* End-to-End-Verifikation aller AI-Researcher-Quellen + ConnectSafely.
 * Usage: npx tsx scripts/verify-all.ts <connectsafely_key> */
import { config } from "dotenv";
config({ path: ".env.local" });

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? `  —  ${detail}` : ""}`);
}

async function main() {
  console.log("── ENV ──");
  check("GEMINI_API_KEY gesetzt", !!process.env.GEMINI_API_KEY);
  check("JUSTIZONLINE_IWG_TOKEN gesetzt", !!process.env.JUSTIZONLINE_IWG_TOKEN);

  const { researchCompany, answerQuestion, resolveGeminiKey } = await import("@/lib/research/engine");
  const { lookupOfficialCompany } = await import("@/lib/registry");
  const { createConnectSafelyClient } = await import("@/lib/connectsafely/client");
  const key = resolveGeminiKey(null);
  if (!key) { check("Gemini-Key auflösbar", false); finish(); return; }

  console.log("\n── JUSTIZONLINE FIRMENBUCH ──");
  const fb = await lookupOfficialCompany("LBG Österreich", "AT").catch(() => null);
  check("Firmenbuch-Treffer (AT)", !!fb, fb ? fb.sourceLabel : "kein Treffer");
  check("Firmenbuch: Geschäftsführer", !!fb?.managers.length, fb?.managers[0]?.name ?? "");
  check("Firmenbuch: Rechtsform + Sitz", !!fb?.legalForm && !!fb?.seat, `${fb?.legalForm ?? "?"} · ${fb?.seat ?? "?"}`);

  console.log("\n── VOLL-RECHERCHE (LBG Österreich) ──");
  const r = await researchCompany({ company: "LBG Österreich", website: "lbg.at", city: "Wien", country: "AT" }, key);
  const text = JSON.stringify(r.blocks);
  check("grounded = true", r.grounded);
  check("Quellen ≥ 5", r.sources.length >= 5, `${r.sources.length} Quellen`);
  check("Inline-Zitate [[n]] vorhanden", /\[\[\d+\]\]/.test(text));
  check("Firmenbuch als Quelle gelistet", r.sources.some((s) => s.kind === "firmenbuch"), r.sources.find((s) => s.kind === "firmenbuch")?.title ?? "");
  check("Website/Web als Quelle", r.sources.some((s) => s.kind === "website" || !!s.url));
  check("Abschnitt Schlüsselpersonen/Kontakt", /schlüsselperson|kontakt|geschäftsführ/i.test(text));
  check("Fit-Score gesetzt (0-100)", r.score != null && r.score >= 0 && r.score <= 100, `${r.score}`);
  check("3 Folgefrage-Vorschläge", r.suggestions.length === 3);
  check("Lead-Feld: Geschäftsführer", !!r.leadFields.ceo_name, r.leadFields.ceo_name ?? "");
  check("Lead-Feld: Rechtsform", !!r.leadFields.legal_form, r.leadFields.legal_form ?? "");
  check("Lead-Feld: Adresse (Straße/PLZ)", !!r.leadFields.street || !!r.leadFields.postal_code, [r.leadFields.street, r.leadFields.postal_code].filter(Boolean).join(" "));

  console.log("\n── FOLGEFRAGE (Chat) ──");
  const a = await answerQuestion({ company: "LBG Österreich", website: "lbg.at", sources: r.sources }, [], "Gibt es aktuelle Wachstumssignale?", key);
  check("Folgefrage liefert Antwort", a.blocks.length > 0, `${a.blocks.length} Blöcke`);

  console.log("\n── CONNECTSAFELY (LinkedIn) ──");
  const csKey = process.argv.slice(2).find((x) => !x.startsWith("--"));
  if (!csKey) {
    check("ConnectSafely-Key übergeben", false, "kein Key als Argument");
  } else {
    const cs = createConnectSafelyClient(csKey, "6a23f37406bcd5243bf7f573");
    const acct = await cs.getAccount().catch(() => null);
    check("Account verbunden (AVAILABLE)", acct?.status === "AVAILABLE", acct ? `${acct.firstName} ${acct.lastName}` : "kein Account");
    const ppl = await cs.searchLinkedIn("6a23f37406bcd5243bf7f573", "Lidl Einkauf", { limit: 3 }).catch(() => null);
    check("People-Search liefert Treffer", (ppl?.items?.length ?? 0) > 0, ppl?.items?.[0]?.name ?? "");
  }

  finish();
}

function finish() {
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`   ${passed}/${results.length} Checks bestanden`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  if (passed < results.length) {
    console.log("Fehlgeschlagen:", results.filter((r) => !r.ok).map((r) => r.name).join(", "));
  }
  process.exit(passed === results.length ? 0 : 1);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
