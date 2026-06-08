/* Screenshot der echten, authentifizierten Inbox-Seite (Visual-Check). */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { chromium } from "playwright";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMAIL = "kikanzlei2025@gmail.com";
const BASE = "http://localhost:3000";
const OUT = process.argv[2] || "C:/Users/marku/Desktop/ki-kanzlei lead dashboard/inbox-shot.png";

async function cookiePairs(): Promise<{ name: string; value: string }[]> {
  const admin = createAdmin(URL, SVC, { auth: { persistSession: false } });
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  const jar: Record<string, string> = {};
  const ssr = createServerClient(URL, ANON, { cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach(({ name, value }) => { jar[name] = value; }) } });
  await ssr.auth.verifyOtp({ token_hash: link!.properties!.hashed_token, type: "magiclink" });
  return Object.entries(jar).map(([name, value]) => ({ name, value }));
}

async function main() {
  const cookies = (await cookiePairs()).map((c) => ({ ...c, url: BASE }));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dashboard/inbox`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector(".inbox-root", { timeout: 20000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: OUT });
  console.log(`✅ screenshot saved: ${OUT}`);
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
