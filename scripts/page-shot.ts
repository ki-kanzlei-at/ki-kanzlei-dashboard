/* Screenshot einer authentifizierten Dashboard-Seite.
 *   npx tsx scripts/page-shot.ts /dashboard/campaigns out.png [width] */
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

const route = process.argv[2] || "/dashboard/campaigns";
const OUT = process.argv[3] || "C:/Users/marku/Desktop/ki-kanzlei lead dashboard/page-shot.png";
const width = parseInt(process.argv[4] || "1440", 10);

async function cookiePairs() {
  const admin = createAdmin(URL, SVC, { auth: { persistSession: false } });
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  const jar: Record<string, string> = {};
  const ssr = createServerClient(URL, ANON, { cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (l) => l.forEach(({ name, value }) => { jar[name] = value; }) } });
  await ssr.auth.verifyOtp({ token_hash: link!.properties!.hashed_token, type: "magiclink" });
  return Object.entries(jar).map(([name, value]) => ({ name, value, url: BASE }));
}

async function main() {
  const cookies = await cookiePairs();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: OUT, fullPage: true });
  console.log(`✅ ${route} → ${OUT}`);
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
