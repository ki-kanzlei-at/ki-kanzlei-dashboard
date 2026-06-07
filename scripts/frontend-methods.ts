/* Testet ALLE Recherche-Methoden über die LIVE-Endpunkte (wie das Frontend):
 * Zielgruppe (audience), Manuell (target), Aus Leads (crm), Website (url).
 * Usage: npx tsx scripts/frontend-methods.ts */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMAIL = "kikanzlei2025@gmail.com";
const BASE = "http://localhost:3000";

async function cookieHeader(): Promise<string> {
  const admin = createAdmin(URL, SVC, { auth: { persistSession: false } });
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  const jar: Record<string, string> = {};
  const ssr = createServerClient(URL, ANON, {
    cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach(({ name, value }) => { jar[name] = value; }) },
  });
  await ssr.auth.verifyOtp({ token_hash: link!.properties!.hashed_token, type: "magiclink" });
  return Object.entries(jar).map(([n, v]) => `${n}=${v}`).join("; ");
}

async function main() {
  const Cookie = await cookieHeader();
  const H = { "Content-Type": "application/json", Cookie };

  // 1) Zielgruppe (audience)
  console.log("▶ Methode: Zielgruppe (audience) — Zahnärzte, Wien");
  let res = await fetch(`${BASE}/api/research`, { method: "POST", headers: H, body: JSON.stringify({ method: "audience", branche: "Zahnärzte", region: "Wien", country: "AT", size: "5" }) });
  let j = await res.json();
  console.log(j?.data?.session ? `✅ ${res.status} — „${j.data.session.company}", ${(j.data.session.sources?.length ?? "?")} Beispielfirmen` : `⚠️ ${res.status}: ${JSON.stringify(j).slice(0, 160)}`);

  // 2) Manuell (target)
  console.log("\n▶ Methode: Manuell (target) — Würth Handelsges.m.b.H.");
  res = await fetch(`${BASE}/api/research`, { method: "POST", headers: H, body: JSON.stringify({ method: "target", company: "Würth Handelsges.m.b.H.", website: "wuerth.at", industry: "Handel" }) });
  j = await res.json();
  console.log(j?.data?.session ? `✅ ${res.status} — „${j.data.session.company}" (Score ${j.data.session.score})` : `⚠️ ${res.status}: ${JSON.stringify(j).slice(0, 160)}`);

  // 3) Aus Leads (crm) — ersten Lead holen, dann recherchieren
  console.log("\n▶ Methode: Aus Leads (crm)");
  const leadsRes = await fetch(`${BASE}/api/leads?limit=1&page=1`, { headers: H });
  const leadsJson = await leadsRes.json();
  const lead = (leadsJson?.data ?? [])[0];
  if (lead) {
    res = await fetch(`${BASE}/api/research`, { method: "POST", headers: H, body: JSON.stringify({ method: "crm", leadId: lead.id, company: lead.company, website: lead.website }) });
    j = await res.json();
    console.log(j?.data?.session ? `✅ ${res.status} — Lead „${lead.company}" recherchiert (Score ${j.data.session.score})` : `⚠️ ${res.status}: ${JSON.stringify(j).slice(0, 160)}`);
  } else {
    console.log("⚠️ Kein Lead gefunden für crm-Test");
  }

  console.log(`\n🔗 Alles sichtbar: ${BASE}/dashboard/ai-researcher`);
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
