/* ── E2E-Cleanup ──
 * Entfernt NUR synthetische Test-Artefakte (Such-Jobs mit Query 'TEST_E2E…' +
 * deren Leads). Echte gescrapte Leads & Recherche-Sessions bleiben unangetastet.
 *   node scripts/e2e-cleanup.ts          # Dry-Run (nur zeigen)
 *   node scripts/e2e-cleanup.ts --apply  # tatsächlich löschen
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const apply = process.argv.includes("--apply");

async function main() {
  const { data: jobs, error } = await admin
    .from("search_jobs").select("id, query, location, status")
    .like("query", "TEST_E2E%");
  if (error) { console.error(error.message); process.exit(1); }
  console.log(`Gefundene TEST_E2E-Jobs: ${jobs?.length ?? 0}`);
  for (const j of jobs ?? []) console.log(`  ${j.status.padEnd(10)} ${j.query} · ${j.location} (${j.id})`);

  if (!apply) { console.log("\n(Dry-Run — mit --apply tatsächlich löschen)"); process.exit(0); }

  for (const j of jobs ?? []) {
    await admin.from("leads").delete().eq("search_job_id", j.id);
    await admin.from("search_jobs").delete().eq("id", j.id);
  }
  console.log(`\nGelöscht: ${jobs?.length ?? 0} Test-Jobs (+ zugehörige Leads).`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
