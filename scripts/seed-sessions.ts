/* Legt 5 echte Recherche-Sessions an (mit KI-Überblick als Nachricht), damit die
 * AI-Researcher-Historie ("Letzte Recherchen") gefüllt ist.
 * Usage: npx tsx scripts/seed-sessions.ts */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const USER_ID = "a58929d6-69b9-4a2b-a60b-c6bcf8ff372d";
const COMPANIES = [
  { company: "BDO Austria", website: "bdo.at", city: "Wien", country: "AT" },
  { company: "LeitnerLeitner", website: "leitnerleitner.com", city: "Linz", country: "AT" },
  { company: "Strabag", website: "strabag.com", city: "Wien", country: "AT" },
  { company: "Red Bull", website: "redbull.com", city: "Fuschl am See", country: "AT" },
  { company: "Sphinx IT Consulting", website: "sphinx.at", city: "Wien", country: "AT" },
];

async function main() {
  const { researchCompany, resolveGeminiKey } = await import("@/lib/research/engine");
  const key = resolveGeminiKey(null);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!key || !url || !svc) { console.log("❌ Keys fehlen"); process.exit(1); }
  const sb = createClient(url, svc, { auth: { persistSession: false } });

  let i = 0;
  for (const c of COMPANIES) {
    try {
      const r = await researchCompany(c, key, { companyName: "KI Kanzlei", offering: "KI-Software für Kanzleien", valueProp: null, targetCustomer: "Steuerberater, Anwälte, KMU" });
      const when = new Date(Date.now() - i * 3600_000).toISOString(); // gestaffelt für „vor X Std."
      const { data: sess, error } = await sb.from("research_sessions").insert({
        user_id: USER_ID, method: "url", company: r.derived?.company_name || c.company, website: c.website,
        industry: r.derived?.industry ?? null, city: c.city ?? r.derived?.city ?? null, country: c.country,
        score: r.score, facts: r.facts, lead_fields: r.leadFields, sources: r.sources, suggestions: r.suggestions,
        created_at: when, updated_at: when,
      }).select("id").single();
      if (error || !sess) { console.log(`❌ ${c.company}: ${error?.message}`); i++; continue; }
      await sb.from("research_messages").insert({ session_id: sess.id, user_id: USER_ID, role: "ai", blocks: r.blocks, created_at: when });
      console.log(`✅ Session: ${c.company} (Score ${r.score}, ${r.sources.length} Quellen)`);
    } catch (e) {
      console.log(`❌ ${c.company}: ${e instanceof Error ? e.message : e}`);
    }
    i++;
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
