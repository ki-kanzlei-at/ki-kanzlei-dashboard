/* Echte Recherche + Chat-Nachrichten über die LIVE-Endpunkte (wie das Frontend):
 * Recherche → Folgefragen → LinkedIn-Personensuche. Usage: npx tsx scripts/frontend-chat.ts */
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

function blocksText(blocks: { type: string; text?: string; items?: string[] }[] | null | undefined): string {
  if (!blocks) return "";
  return blocks.map((b) => (b.type === "ul" ? (b.items ?? []).join("; ") : b.text ?? "")).join(" ").replace(/\[\[\d+\]\]/g, "").replace(/\*\*/g, "");
}

async function main() {
  const Cookie = await cookieHeader();
  const H = { "Content-Type": "application/json", Cookie };

  console.log("▶ Recherche: fonio.ai");
  const r = await fetch(`${BASE}/api/research`, { method: "POST", headers: H, body: JSON.stringify({ method: "url", url: "fonio.ai" }) });
  const rj = await r.json();
  const id = rj?.data?.session?.id;
  if (!id) { console.log("❌ Recherche fehlgeschlagen:", JSON.stringify(rj).slice(0, 200)); process.exit(1); }
  console.log(`✅ „${rj.data.session.company}" (Score ${rj.data.session.score})`);

  const questions = [
    "Wie viele Mitarbeiter und welcher Umsatz?",
    "Wer ist die Geschäftsführung?",
    "Hast du das LinkedIn-Profil von Daniel Keinrath?",
  ];
  for (const q of questions) {
    console.log(`\n💬 Frage: ${q}`);
    const res = await fetch(`${BASE}/api/research/${id}/chat`, { method: "POST", headers: H, body: JSON.stringify({ question: q }) });
    const j = await res.json();
    const ai = j?.data?.aiMessage;
    if (ai?.person) console.log(`   👤 LinkedIn-Profil: ${ai.person.name} — ${(ai.person.headline || "").slice(0, 70)}  [${ai.person.profile_url || ai.person.public_profile_url || ""}]`);
    else console.log(`   🤖 ${blocksText(ai?.blocks).slice(0, 220)}`);
  }
  console.log(`\n🔗 Sichtbar im Frontend: ${BASE}/dashboard/ai-researcher (Session ${id})`);
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
