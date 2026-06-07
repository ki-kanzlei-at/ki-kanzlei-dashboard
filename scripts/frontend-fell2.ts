/* Frontend-Test: DE-Firma (Wikidata) + fellverliebt mit Elisabeth Mack. */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BASE = "http://localhost:3000";

async function cookieHeader(): Promise<string> {
  const admin = createAdmin(URL, SVC, { auth: { persistSession: false } });
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: "kikanzlei2025@gmail.com" });
  const jar: Record<string, string> = {};
  const ssr = createServerClient(URL, ANON, { cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach(({ name, value }) => { jar[name] = value; }) } });
  await ssr.auth.verifyOtp({ token_hash: link!.properties!.hashed_token, type: "magiclink" });
  return Object.entries(jar).map(([n, v]) => `${n}=${v}`).join("; ");
}
function txt(b: { type: string; text?: string; items?: string[] }[] | null | undefined): string {
  if (!b) return ""; return b.map((x) => (x.type === "ul" ? (x.items ?? []).join("; ") : x.text ?? "")).join(" ").replace(/\[\[\d+\]\]/g, "").replace(/\*\*/g, "");
}
async function chat(H: Record<string, string>, id: string, q: string) {
  const j = await (await fetch(`${BASE}/api/research/${id}/chat`, { method: "POST", headers: H, body: JSON.stringify({ question: q }) })).json();
  const ai = j?.data?.aiMessage;
  console.log(`\n💬 ${q}`);
  if (ai?.person) console.log(`   👤 ${ai.person.name} — ${(ai.person.headline || "—")} ${ai.person.location ? "· " + ai.person.location : ""} [${ai.person.profile_url || ""}]  Foto:${ai.person.profile_picture_url ? "✅" : "—"}`);
  else console.log(`   🤖 ${txt(ai?.blocks).slice(0, 240)}`);
}

async function main() {
  const Cookie = await cookieHeader();
  const H = { "Content-Type": "application/json", Cookie };

  // ── DE-Firma via Frontend (Wikidata-Neudaten) ──
  console.log("▶ DE-Recherche: flixbus.de");
  const r1 = await (await fetch(`${BASE}/api/research`, { method: "POST", headers: H, body: JSON.stringify({ method: "url", url: "flixbus.de" }) })).json();
  const id1 = r1?.data?.session?.id;
  console.log(id1 ? `✅ „${r1.data.session.company}" Score ${r1.data.session.score} · Quellen ${r1.data.session.sources?.length}` : `❌ ${JSON.stringify(r1).slice(0,160)}`);
  if (id1) {
    const wiki = (r1.data.session.sources || []).find((s: { sub?: string }) => s.sub === "Wikidata");
    console.log(`   Wikidata-Quelle: ${wiki ? wiki.title : "—"}`);
    await chat(H, id1, "Wer ist der Geschäftsführer und hast du sein LinkedIn?");
  }

  // ── fellverliebt + Elisabeth Mack ──
  console.log("\n\n▶ Recherche: fellverliebt.com");
  const r2 = await (await fetch(`${BASE}/api/research`, { method: "POST", headers: H, body: JSON.stringify({ method: "url", url: "fellverliebt.com" }) })).json();
  const id2 = r2?.data?.session?.id;
  console.log(id2 ? `✅ „${r2.data.session.company}" Score ${r2.data.session.score} · Quellen ${(r2.data.session.sources||[]).map((s:{title:string})=>s.title).join(", ")}` : `❌ ${JSON.stringify(r2).slice(0,160)}`);
  if (id2) {
    await chat(H, id2, "Wer ist die Inhaberin von Fellverliebt?");
    await chat(H, id2, "Hast du das LinkedIn-Profil von Elisabeth Mack?");
  }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e?.message || e); process.exit(1); });
