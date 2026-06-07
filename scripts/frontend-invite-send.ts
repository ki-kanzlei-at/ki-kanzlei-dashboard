/* Test-Invite Schritt 2: Sendet EINE echte LinkedIn-Einladung über den LIVE-Endpunkt
 * /api/research/connect (durch den AI Researcher). Usage: npx tsx scripts/frontend-invite-send.ts */
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

  const payload = {
    profileId: "michael-grupp",
    profileUrl: "https://www.linkedin.com/in/michael-grupp/",
    fullName: "Michael Grupp",
    firstName: "Michael",
    lastName: "Grupp",
    headline: "Managing Director | CEO at BRYTER",
    company: "BRYTER",
    location: null,
    message: "Hallo Michael, spannend was ihr mit BRYTER im Legal-Automation-Bereich aufbaut. Ich bin mit KI Kanzlei im KI-Umfeld für Kanzleien aktiv – würde mich über eine Vernetzung freuen. Beste Grüße, Markus",
  };

  console.log(`▶ Sende LinkedIn-Einladung an ${payload.fullName} (${payload.profileUrl})`);
  const res = await fetch(`${BASE}/api/research/connect`, { method: "POST", headers: H, body: JSON.stringify(payload) });
  const j = await res.json();
  console.log(`HTTP ${res.status}`);
  console.log(JSON.stringify(j, null, 2));
  process.exit(res.ok ? 0 : 1);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
