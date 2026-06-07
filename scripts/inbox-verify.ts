/* End-to-End-Funktionscheck der Inbox über die LIVE-API. Usage: npx tsx scripts/inbox-verify.ts */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMAIL = "kikanzlei2025@gmail.com";
const BASE = "http://localhost:3000";
const admin = createAdmin(URL, SVC, { auth: { persistSession: false } });

let pass = 0, fail = 0;
function check(name: string, ok: boolean, extra = "") { console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`); ok ? pass++ : fail++; }

async function cookieHeader(): Promise<string> {
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  const jar: Record<string, string> = {};
  const ssr = createServerClient(URL, ANON, { cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach(({ name, value }) => { jar[name] = value; }) } });
  await ssr.auth.verifyOtp({ token_hash: link!.properties!.hashed_token, type: "magiclink" });
  return Object.entries(jar).map(([n, v]) => `${n}=${v}`).join("; ");
}

async function main() {
  const Cookie = await cookieHeader();
  const H = { "Content-Type": "application/json", Cookie };
  const MGID = "0c88a31d-b86c-41d7-94f7-0c13bbb05375"; // Michael Grupp linkedin_lead

  // 1) Gate: ohne Antwort leer
  let r = await fetch(`${BASE}/api/inbox`, { headers: { Cookie } });
  let j = await r.json();
  check("GET /api/inbox 200 + has_inbound-Gate (leer ohne Antwort)", r.ok && Array.isArray(j.data) && j.data.length === 0, `len=${j.data?.length}`);
  check("GET liefert me-Identität", !!j.me?.name, `me=${j.me?.name}`);

  // 2) Eingehende LinkedIn-Antwort via Webhook
  const wh = await fetch(`${BASE}/api/linkedin/webhook`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "message.received", data: { sender: { profileId: "michael-grupp", name: "Michael Grupp" }, body: "Verify-Test: klingt interessant!", messageId: "verify-mg-1", conversationUrn: "urn:li:conversation:verify-mg" } }) });
  const wj = await wh.json();
  check("Webhook message.received matched=1", wh.ok && wj.matched === 1, JSON.stringify(wj));

  // 3) Conversation erscheint jetzt
  r = await fetch(`${BASE}/api/inbox`, { headers: { Cookie } }); j = await r.json();
  const conv = (j.data ?? []).find((c: any) => c.linkedin_lead_id === MGID);
  check("Conversation erscheint nach Antwort", !!conv);
  check("Kanal = linkedin", conv?.channel === "linkedin");
  check("Zweiseitiger Thread (>=2 Nachrichten, out+in)", (conv?.messages?.length ?? 0) >= 2 && conv.messages.some((m: any) => m.direction === "in") && conv.messages.some((m: any) => m.direction === "out"));
  check("unread = true", conv?.unread === true);
  check("status = interested", conv?.status === "interested");

  // 4) Dedupe: gleicher Webhook erneut → keine zweite Nachricht
  await fetch(`${BASE}/api/linkedin/webhook`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "message.received", data: { sender: { profileId: "michael-grupp", name: "Michael Grupp" }, body: "Verify-Test: klingt interessant!", messageId: "verify-mg-1", conversationUrn: "urn:li:conversation:verify-mg" } }) });
  r = await fetch(`${BASE}/api/inbox`, { headers: { Cookie } }); j = await r.json();
  const conv2 = (j.data ?? []).find((c: any) => c.linkedin_lead_id === MGID);
  const inCount = (conv2?.messages ?? []).filter((m: any) => m.direction === "in").length;
  check("Dedupe: nur 1 eingehende Nachricht trotz doppeltem Webhook", inCount === 1, `in=${inCount}`);

  const cid = conv2.id;
  // 5) PATCH gelesen
  r = await fetch(`${BASE}/api/inbox/${cid}`, { method: "PATCH", headers: H, body: JSON.stringify({ unread: false }) });
  check("PATCH unread=false 200", r.ok);
  // 6) PATCH Stern
  r = await fetch(`${BASE}/api/inbox/${cid}`, { method: "PATCH", headers: H, body: JSON.stringify({ starred: true }) });
  check("PATCH starred=true 200", r.ok);
  // 7) PATCH ungültiges snoozed_until → 400
  r = await fetch(`${BASE}/api/inbox/${cid}`, { method: "PATCH", headers: H, body: JSON.stringify({ snoozed_until: "kein-datum" }) });
  check("PATCH ungültiges snoozed_until → 400", r.status === 400);
  // 8) PATCH unbekannte id → 404
  r = await fetch(`${BASE}/api/inbox/11111111-1111-1111-1111-111111111111`, { method: "PATCH", headers: H, body: JSON.stringify({ starred: true }) });
  check("PATCH unbekannte id → 404", r.status === 404);
  // 9) Verifiziere read+star persistiert
  r = await fetch(`${BASE}/api/inbox`, { headers: { Cookie } }); j = await r.json();
  const conv3 = (j.data ?? []).find((c: any) => c.id === cid);
  check("read+star persistiert", conv3?.unread === false && conv3?.starred === true);
  // 10) Reply-Validierung (ohne echten Versand): leerer Text → 400
  r = await fetch(`${BASE}/api/inbox/${cid}/reply`, { method: "POST", headers: H, body: JSON.stringify({ text: "" }) });
  check("Reply leerer Text → 400", r.status === 400);
  // 11) Reply unbekannte id → 404
  r = await fetch(`${BASE}/api/inbox/11111111-1111-1111-1111-111111111111/reply`, { method: "POST", headers: H, body: JSON.stringify({ text: "hi" }) });
  check("Reply unbekannte id → 404", r.status === 404);

  // Cleanup: Test-Reply entfernen, Zustand zurücksetzen
  await admin.from("inbox_messages").delete().eq("external_id", "verify-mg-1");
  await admin.from("inbox_conversations").update({ has_inbound: false, unread: false, starred: false, status: "new", snoozed_until: null, last_snippet: null }).eq("linkedin_lead_id", MGID);
  await admin.from("linkedin_leads").update({ status: "invited", last_message_at: null }).eq("id", MGID);
  r = await fetch(`${BASE}/api/inbox`, { headers: { Cookie } }); j = await r.json();
  check("Cleanup: Inbox wieder leer", (j.data ?? []).length === 0, `len=${j.data?.length}`);

  console.log(`\n${fail === 0 ? "🎉 ALLE" : "⚠️"} ${pass}/${pass + fail} Checks bestanden${fail ? ` (${fail} fehlgeschlagen)` : ""}.`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
