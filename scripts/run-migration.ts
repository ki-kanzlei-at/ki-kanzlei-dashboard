/**
 * Migration-Runner.
 *
 * Führt eine spezifische SQL-Migration aus src/lib/supabase/migrations/ aus.
 * Nutzt den Service-Role-Key — bitte nur lokal/in CI mit gesichertem Env aufrufen.
 *
 * Beispiel:
 *   npx tsx scripts/run-migration.ts 009_connectsafely_migration.sql
 *   npx tsx scripts/run-migration.ts --all          (alle in Reihenfolge)
 *   npx tsx scripts/run-migration.ts --dry-run 009  (zeigt SQL ohne Ausführung)
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const MIGRATIONS_DIR = join(process.cwd(), "src", "lib", "supabase", "migrations");

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const runAll   = args.includes("--all");
const target   = args.find((a) => !a.startsWith("--"));

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  console.error("   Bitte .env.local prüfen.");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

function listMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function resolveMigrationFile(name: string): string | null {
  // accept "009", "009_connectsafely_migration", or full filename
  const all = listMigrations();
  const exact = all.find((f) => f === name || f === `${name}.sql`);
  if (exact) return exact;
  const byPrefix = all.find((f) => f.startsWith(name + "_") || f.startsWith(name));
  return byPrefix ?? null;
}

async function runFile(filename: string): Promise<void> {
  const fullPath = join(MIGRATIONS_DIR, filename);
  if (!existsSync(fullPath)) {
    console.error(`❌ Migration not found: ${fullPath}`);
    process.exit(1);
  }
  const sql = readFileSync(fullPath, "utf8");
  const sizeKb = (sql.length / 1024).toFixed(1);

  console.log(`\n📄 ${filename} (${sizeKb} KB)`);
  console.log("─".repeat(70));

  if (isDryRun) {
    console.log(sql);
    console.log(`\n→ DRY-RUN — Migration NICHT ausgeführt.`);
    return;
  }

  // Supabase JS Client kann kein arbitrary SQL → wir nutzen die postgrest
  // RPC-Funktion `exec_sql` IF vorhanden, sonst Hinweis auf direkte Ausführung.
  // Da `exec_sql` standardmäßig NICHT existiert, geben wir die SQL aus +
  // Anleitung zur Ausführung via Supabase SQL Editor.
  console.log(sql);
  console.log("\n" + "═".repeat(70));
  console.log("⚠️  Direct SQL execution via JS client is not supported by Supabase.");
  console.log("   Bitte SQL oben kopieren und in Supabase Dashboard → SQL Editor ausführen:");
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/(.+?)\.supabase\.co/)?.[1];
  if (projectRef) {
    console.log(`   → https://supabase.com/dashboard/project/${projectRef}/sql/new`);
  }
  console.log("═".repeat(70));

  // Optional: verifiziere ob Migration bereits gelaufen ist (für 009)
  if (filename.startsWith("009_")) {
    const { error } = await supabase
      .from("user_settings")
      .select("connectsafely_api_key")
      .limit(1);
    if (!error) {
      console.log("\n✅ Migration 009 scheint bereits ausgeführt zu sein (Spalte 'connectsafely_api_key' existiert).");
    } else {
      console.log("\n❌ Migration 009 noch nicht ausgeführt:", error.message);
    }
  }
}

(async () => {
  if (runAll) {
    const files = listMigrations();
    console.log(`Running ${files.length} migrations…`);
    for (const f of files) await runFile(f);
    return;
  }

  if (!target) {
    console.error("Usage: npx tsx scripts/run-migration.ts <migration-name> [--dry-run]");
    console.error("       npx tsx scripts/run-migration.ts --all");
    console.error("\nAvailable migrations:");
    listMigrations().forEach((f) => console.error("  - " + f));
    process.exit(1);
  }

  const resolved = resolveMigrationFile(target);
  if (!resolved) {
    console.error(`❌ Migration not found matching "${target}".`);
    console.error("Available:");
    listMigrations().forEach((f) => console.error("  - " + f));
    process.exit(1);
  }

  await runFile(resolved);
})().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
