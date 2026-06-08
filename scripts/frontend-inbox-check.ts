/* Prüft, ob /dashboard/inbox authentifiziert sauber rendert (SSR-Markup). */
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
  const res = await fetch(`${BASE}/dashboard/inbox`, { headers: { Cookie }, redirect: "manual" });
  console.log(`HTTP ${res.status}`);
  const html = await res.text();
  const checks: [string, boolean][] = [
    ["inbox-root", html.includes("inbox-root")],
    ["Posteingang", html.includes("Posteingang")],
    ["Konversation/Empty or thread", html.includes("Keine Konversation") || html.includes("thread-head")],
    ["Sidebar Inbox link", html.includes("/dashboard/inbox")],
    ["breadcrumb Inbox", html.includes(">Inbox<")],
    ["no Next error overlay", !html.includes("__next_error__") && !html.toLowerCase().includes("unhandled runtime error")],
  ];
  for (const [k, ok] of checks) console.log(`${ok ? "✅" : "❌"} ${k}`);
  console.log(`(html length: ${html.length})`);
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
