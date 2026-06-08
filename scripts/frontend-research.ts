/* Führt eine echte Recherche über den LIVE-Endpunkt /api/research aus
 * (genau das, was der Frontend-Button auslöst — inkl. Auth, Credits, Persistenz).
 * Usage: npx tsx scripts/frontend-research.ts [domain]  */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMAIL = "kikanzlei2025@gmail.com";
const BASE = "http://localhost:3000";
const DOMAIN = process.argv[2] || "ottakringer.at";

async function main() {
  // 1) Magic-Link-Token via Admin erzeugen
  const admin = createAdmin(URL, SVC, { auth: { persistSession: false } });
  const { data: link, error: lerr } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  if (lerr || !link?.properties?.hashed_token) { console.log("❌ generateLink:", lerr?.message); process.exit(1); }

  // 2) Token einlösen → SSR-Client schreibt die korrekten sb-Cookies in unseren Jar
  const jar: Record<string, string> = {};
  const ssr = createServerClient(URL, ANON, {
    cookies: {
      getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => { jar[name] = value; }),
    },
  });
  const { data: v, error: verr } = await ssr.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (verr || !v?.session) { console.log("❌ verifyOtp:", verr?.message); process.exit(1); }
  console.log(`🔑 Session für ${v.user?.email} erzeugt, ${Object.keys(jar).length} Cookies.`);

  const cookieHeader = Object.entries(jar).map(([n, val]) => `${n}=${val}`).join("; ");

  // 3) Echte Recherche über den Live-Endpunkt (wie der Frontend-Button)
  console.log(`▶ POST ${BASE}/api/research  (url: ${DOMAIN})`);
  const res = await fetch(`${BASE}/api/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify({ method: "url", url: DOMAIN }),
  });
  const txt = await res.text();
  let j: { data?: { session?: { id: string; company: string; score: number }; remaining?: number } } = {};
  try { j = JSON.parse(txt); } catch { /* */ }
  if (res.ok && j.data?.session) {
    console.log(`✅ ${res.status} — Recherche LIVE erstellt: „${j.data.session.company}" (Score ${j.data.session.score}), Credits übrig: ${j.data.remaining}`);
    console.log(`   Sichtbar im Frontend: ${BASE}/dashboard/ai-researcher (Session ${j.data.session.id})`);
  } else {
    console.log(`⚠️ ${res.status}: ${txt.slice(0, 300)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
