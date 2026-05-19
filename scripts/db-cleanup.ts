/* DB-Cleanup Tool. Modi:
 *   --dry-run                 (default) Zeigt nur was passieren würde
 *   --delete-orphan-jobs      Löscht alle search_jobs mit 0 Leads ODER failed
 *   --industry-stats          Zeigt Branchen-Verteilung mit Lead-Counts
 *   --delete-industry "name"  Löscht alle Leads in Branche "name"
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const args = process.argv.slice(2);
const isDryRun = !args.includes("--apply");
const cmd = args.find(a => a.startsWith("--")) || "--dry-run";

async function deleteOrphanJobs() {
  const { data: orphans } = await supabase
    .from("search_jobs")
    .select("id, query, location, status, results_count")
    .or("results_count.eq.0,status.eq.failed");
  if (!orphans || orphans.length === 0) {
    console.log("Keine verwaisten Jobs gefunden.");
    return;
  }
  console.log(`\n${isDryRun ? "[DRY-RUN]" : "[APPLY]"} ${orphans.length} verwaiste Search Jobs gefunden:`);
  orphans.slice(0, 5).forEach(j =>
    console.log(`  - "${j.query}" in ${j.location} (${j.status}, ${j.results_count} Leads)`),
  );
  if (orphans.length > 5) console.log(`  ... und ${orphans.length - 5} weitere`);

  if (isDryRun) {
    console.log("\n→ Mit --apply ausführen um zu löschen.");
    return;
  }

  const ids = orphans.map(j => j.id);
  // In Batches löschen (Supabase limit)
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const { error } = await supabase.from("search_jobs").delete().in("id", batch);
    if (error) {
      console.error(`Fehler bei Batch ${i}:`, error.message);
      return;
    }
  }
  console.log(`✓ ${ids.length} verwaiste Jobs gelöscht`);
}

async function industryStats() {
  // Supabase default = 1000 rows. Wir paginieren um alle zu kriegen.
  const counter = new Map<string, number>();
  let offset = 0;
  const PAGE = 1000;
  let total = 0;
  while (true) {
    const { data: leads } = await supabase
      .from("leads")
      .select("industry")
      .range(offset, offset + PAGE - 1);
    if (!leads || leads.length === 0) break;
    for (const l of leads) {
      counter.set(l.industry || "(leer)", (counter.get(l.industry || "(leer)") || 0) + 1);
    }
    total += leads.length;
    if (leads.length < PAGE) break;
    offset += PAGE;
  }
  console.log(`\n══════ Branchen-Verteilung (${total} Leads gesamt) ══════`);
  [...counter.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) =>
    console.log(`  ${v.toString().padStart(4)}× ${k}`),
  );
}

async function deleteIndustry(industry: string) {
  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("industry", industry);
  if (!count) {
    console.log(`Keine Leads in Branche "${industry}".`);
    return;
  }
  console.log(`\n${isDryRun ? "[DRY-RUN]" : "[APPLY]"} ${count} Leads in Branche "${industry}" würden gelöscht.`);
  if (isDryRun) {
    console.log("→ Mit --apply ausführen um zu löschen.");
    return;
  }
  const { error } = await supabase.from("leads").delete().eq("industry", industry);
  if (error) console.error("Fehler:", error.message);
  else console.log(`✓ ${count} Leads gelöscht.`);
}

async function main() {
  if (cmd === "--delete-orphan-jobs") {
    await deleteOrphanJobs();
  } else if (cmd === "--industry-stats") {
    await industryStats();
  } else if (cmd === "--delete-industry") {
    const industry = args[args.indexOf("--delete-industry") + 1];
    if (!industry) { console.error("Fehlt: --delete-industry \"name\""); return; }
    await deleteIndustry(industry);
  } else {
    console.log(`Verwendung:
  npx tsx scripts/db-cleanup.ts --delete-orphan-jobs [--apply]
  npx tsx scripts/db-cleanup.ts --industry-stats
  npx tsx scripts/db-cleanup.ts --delete-industry "Hotel" [--apply]
`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
