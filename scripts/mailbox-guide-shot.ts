/* Öffnet Settings → E-Mail-Konten → Verbinden → Provider und screenshotet den Guide.
 *   npx tsx scripts/mailbox-guide-shot.ts "Google / Gmail" out.png */
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

const providerText = process.argv[2] || "Google / Gmail";
const OUT = process.argv[3] || "C:/Users/marku/Desktop/ki-kanzlei lead dashboard/mailbox-guide.png";

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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dashboard/settings?tab=mailbox`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(800);

  // Verbinden-Dialog öffnen
  for (const label of ["Erstes Konto verbinden", "Konto hinzufügen"]) {
    const btn = page.getByRole("button", { name: label });
    if (await btn.count()) { await btn.first().click(); break; }
  }
  await page.waitForTimeout(500);
  // Provider wählen
  await page.getByText(providerText, { exact: false }).first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: OUT });
  console.log(`✅ ${providerText} → ${OUT}`);
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
