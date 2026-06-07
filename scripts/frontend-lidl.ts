/* Lidl-Use-Case über die LIVE-Endpunkte: Firmenrecherche + Vertriebs-/Einkaufsleiter
 * via ConnectSafely-Personensuche + Kontakt-Frage im Chat. Usage: npx tsx scripts/frontend-lidl.ts */
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
function blocksText(b: { type: string; text?: string; items?: string[] }[] | null | undefined): string {
  if (!b) return ""; return b.map((x) => (x.type === "ul" ? (x.items ?? []).join("; ") : x.text ?? "")).join(" ").replace(/\[\[\d+\]\]/g, "").replace(/\*\*/g, "");
}

async function main() {
  const Cookie = await cookieHeader();
  const H = { "Content-Type": "application/json", Cookie };

  console.log("▶ Recherche: lidl.at");
  const r = await fetch(`${BASE}/api/research`, { method: "POST", headers: H, body: JSON.stringify({ method: "url", url: "lidl.at" }) });
  const rj = await r.json();
  const id = rj?.data?.session?.id;
  console.log(id ? `✅ „${rj.data.session.company}" (Score ${rj.data.session.score})` : `❌ ${JSON.stringify(rj).slice(0, 200)}`);

  // Rollenbasierte Personensuche (Vertriebs-/Einkaufsleiter) über ConnectSafely
  for (const role of ["Vertriebsleiter", "Einkaufsleiter", "Verkaufsleiter"]) {
    const s = await fetch(`${BASE}/api/linkedin/search`, { method: "POST", headers: H, body: JSON.stringify({ query: `Lidl Österreich ${role}` }) });
    const sj = await s.json();
    const items = sj?.data?.items ?? [];
    console.log(`\n🔎 ConnectSafely „Lidl Österreich ${role}": ${items.length} Treffer`);
    items.slice(0, 3).forEach((p: { name?: string; headline?: string; location?: unknown; profile_url?: string }) =>
      console.log(`   • ${p.name} — ${(p.headline || "").slice(0, 60)}  ${p.profile_url || ""}`));
  }

  // Kontakt-/Ansprechpartner-Frage im Chat
  if (id) {
    const q = "Wer ist im Vertrieb/Einkauf von Lidl Österreich verantwortlich und welche Kontaktdaten (E-Mail/Telefon) sind öffentlich?";
    console.log(`\n💬 ${q}`);
    const c = await fetch(`${BASE}/api/research/${id}/chat`, { method: "POST", headers: H, body: JSON.stringify({ question: q }) });
    const cj = await c.json();
    console.log(`   🤖 ${blocksText(cj?.data?.aiMessage?.blocks).slice(0, 320)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
