/* Verifiziert den ConnectSafely-Key + testet die Personensuche. */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const key = process.argv[2];
  if (!key) { console.error("Usage: tsx scripts/test-connectsafely.ts <apiKey> [suchbegriff]"); process.exit(1); }
  const { createConnectSafelyClient } = await import("@/lib/connectsafely/client");
  const client = createConnectSafelyClient(key);

  console.log("=== Account-Status ===");
  try {
    const acct = await client.getAccount();
    console.log("id:", acct.id, "| status:", acct.status, "| name:", [acct.firstName, acct.lastName].filter(Boolean).join(" "), "| plan:", acct.linkedinPlan?.premiumType ?? "—");

    const q = process.argv.slice(3).join(" ") || "LBG Österreich Steuerberater";
    console.log(`\n=== Personensuche: "${q}" ===`);
    const res = await client.searchLinkedIn(acct.id, q, { limit: 5 });
    console.log("Treffer:", res.items?.length ?? 0);
    for (const it of (res.items ?? []).slice(0, 5)) {
      console.log(`- ${it.name} | ${it.headline ?? ""} | ${it.location ?? ""} | ${it.network_distance ?? ""} | ${it.profile_url ?? ""}`);
    }
  } catch (e) {
    console.error("Fehler:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
