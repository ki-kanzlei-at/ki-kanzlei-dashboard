/* ── E2E-Readiness-Check ──
 * Lädt .env UND .env.local (Service-Role-Key liegt in .env, Test-Creds in .env.local).
 * Findet den Test-User über TEST_USER_EMAIL, zeigt Credit-Stand + Daten-Baseline und
 * stockt Credits NUR bei --topup auf (admin_adjust). Druckt KEINE Secrets.
 *
 *   npx tsx scripts/e2e-readiness.ts            # nur Report
 *   npx tsx scripts/e2e-readiness.ts --topup 3000  # auf >=3000 aufstocken
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local" }); // überschreibt Test-Creds, ergänzt nichts Geheimes

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const email = process.env.TEST_USER_EMAIL!;

if (!url || !serviceKey) {
  console.error("FEHLT: NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY (.env).");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

async function findUserId(): Promise<string | null> {
  // listUsers paginiert; bei kleinem Projekt reicht Seite 1-3
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) { console.error("[auth.listUsers]", error.message); return null; }
    const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (u) return u.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main() {
  const topupIdx = process.argv.indexOf("--topup");
  const topupTarget = topupIdx >= 0 ? Number(process.argv[topupIdx + 1] || "3000") : 0;

  console.log(`\n=== E2E READINESS ===`);
  console.log(`Supabase:  ${url.replace(/^https?:\/\//, "")}`);
  console.log(`Test-User: ${email}`);

  const userId = await findUserId();
  if (!userId) { console.error(`User mit E-Mail ${email} NICHT gefunden.`); process.exit(1); }
  console.log(`User-ID:   ${userId}`);

  // Credit-Stand
  const { data: balRow } = await admin
    .from("credit_balance").select("balance").eq("user_id", userId).maybeSingle();
  let balance = (balRow?.balance as number | undefined) ?? 0;
  console.log(`\nCredits:   ${balance}`);

  // Daten-Baseline für diesen User
  const tables = ["leads", "search_jobs", "research_sessions", "research_messages"];
  console.log(`\n--- Baseline (user-scoped) ---`);
  for (const t of tables) {
    const { count, error } = await admin
      .from(t).select("id", { count: "exact", head: true }).eq("user_id", userId);
    console.log(`  ${t.padEnd(20)} ${error ? "(—) " + error.message : count}`);
  }

  // Optional aufstocken
  if (topupTarget > 0 && balance < topupTarget) {
    const delta = topupTarget - balance;
    const { data, error } = await admin.rpc("grant_credits", {
      p_user_id: userId,
      p_amount: delta,
      p_action_type: "admin_adjust",
      p_action_ref: null,
      p_metadata: { reason: "e2e-acceptance-test" },
    });
    if (error) { console.error("[grant_credits]", error.message); process.exit(1); }
    const row = Array.isArray(data) ? data[0] : data;
    balance = row?.balance_after ?? balance + delta;
    console.log(`\n+++ Aufgestockt um ${delta} → neuer Stand: ${balance}`);
  } else if (topupTarget > 0) {
    console.log(`\n(kein Top-up nötig: ${balance} >= ${topupTarget})`);
  }

  // Maschinell parsebare Zeile am Ende
  console.log(`\nREADY user_id=${userId} balance=${balance}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
