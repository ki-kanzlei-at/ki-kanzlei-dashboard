/* Test-Invite Schritt 1: Recherche + LinkedIn-Profil des Entscheiders über die
 * LIVE-Endpunkte ermitteln (sendet NOCH KEINE Einladung). Prüft zugleich die
 * neue Credit-Belastung (2 Credits pro Chat-Frage). Usage: npx tsx scripts/frontend-invite-find.ts */
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
  const ssr = createServerClient(URL, ANON, { cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach(({ name, value }) => { jar[name] = value; }) } });
  await ssr.auth.verifyOtp({ token_hash: link!.properties!.hashed_token, type: "magiclink" });
  return Object.entries(jar).map(([n, v]) => `${n}=${v}`).join("; ");
}

async function main() {
  const Cookie = await cookieHeader();
  const H = { "Content-Type": "application/json", Cookie };

  const COMPANY_URL = process.argv[2] || "fonio.ai";
  const PERSON_Q = process.argv[3] || "Gib mir das LinkedIn-Profil des Gründers / Geschäftsführers.";

  console.log(`▶ Recherche: ${COMPANY_URL}`);
  const r = await fetch(`${BASE}/api/research`, { method: "POST", headers: H, body: JSON.stringify({ method: "url", url: COMPANY_URL }) });
  const rj = await r.json();
  const id = rj?.data?.session?.id;
  if (!id) { console.log(`❌ Recherche fehlgeschlagen: ${JSON.stringify(rj).slice(0, 300)}`); process.exit(1); }
  console.log(`✅ „${rj.data.session.company}" (Score ${rj.data.session.score}) · Credits übrig: ${rj.data.remaining}`);

  console.log(`\n💬 ${PERSON_Q}`);
  const c = await fetch(`${BASE}/api/research/${id}/chat`, { method: "POST", headers: H, body: JSON.stringify({ question: PERSON_Q }) });
  const cj = await c.json();
  if (!c.ok) { console.log(`❌ Chat: ${JSON.stringify(cj).slice(0, 300)}`); process.exit(1); }
  console.log(`   Credits übrig nach Chat: ${cj?.data?.remaining}`);

  const person = cj?.data?.aiMessage?.person;
  if (!person) {
    const blocks = cj?.data?.aiMessage?.blocks ?? [];
    const txt = blocks.map((x: { text?: string; items?: string[] }) => x.text ?? (x.items ?? []).join("; ")).join(" ").slice(0, 300);
    console.log(`\n⚠️ Kein Profil-Objekt zurückgegeben. Antworttext: ${txt}`);
    process.exit(0);
  }
  console.log(`\n👤 GEFUNDENES PROFIL (Einladung an diese Person würde gehen):`);
  console.log(JSON.stringify({
    name: person.name, headline: person.headline, location: person.location,
    profile_url: person.profile_url, public_identifier: person.public_identifier,
    provider_id: person.provider_id, id: person.id,
  }, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
