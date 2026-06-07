/* Zeigt Zeilenzahlen der Haupt-Tabellen (für „DB auf Setup clearen"-Entscheidung). */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const TABLES = [
  "leads", "search_jobs", "research_sessions", "research_messages",
  "linkedin_leads", "campaigns", "campaign_emails", "credit_ledger",
  "user_settings", "profiles",
];

async function main() {
  for (const t of TABLES) {
    const { count, error } = await supabase.from(t).select("id", { count: "exact", head: true });
    if (error) console.log(`${t.padEnd(20)}  (—  ${error.message})`);
    else console.log(`${t.padEnd(20)}  ${count}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
