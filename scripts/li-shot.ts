import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { chromium, type Page } from "playwright";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMAIL = "kikanzlei2025@gmail.com";
const BASE = "http://localhost:3000";
const OUT = "C:/Users/marku/Desktop/ki-kanzlei lead dashboard";

async function cookiePairs() {
  const admin = createAdmin(URL, SVC, { auth: { persistSession: false } });
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  const jar: Record<string, string> = {};
  const ssr = createServerClient(URL, ANON, { cookies: { getAll: () => Object.entries(jar).map(([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => { jar[name] = value; }) } });
  await ssr.auth.verifyOtp({ token_hash: link!.properties!.hashed_token, type: "magiclink" });
  return Object.entries(jar).map(([name, value]) => ({ name, value, url: BASE }));
}

async function shotCard(page: Page, heading: string, out: string) {
  const h = page.getByRole("heading", { name: heading, exact: true }).first();
  await h.waitFor({ state: "visible", timeout: 20000 });
  await h.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const card = h.locator("xpath=ancestor::div[contains(@class,'rounded-') and contains(@class,'border')][1]");
  if (await card.count()) await card.first().screenshot({ path: out });
  else await page.screenshot({ path: out });
  console.log(`✅ ${heading} → ${out}`);
}

async function main() {
  const cookies = await cookiePairs();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 1000 }, deviceScaleFactor: 2 });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dashboard/settings?tab=social`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1500);
  await shotCard(page, "Outreach-Limits", `${OUT}/shot-linkedin-limits.png`);
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
