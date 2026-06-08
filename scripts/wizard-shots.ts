/* Fährt den Kampagnen-Wizard durch und screenshotet jeden Step. */
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

async function shot(page: Page, file: string) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${file}` }); // Viewport (wie der User es sieht)
  console.log(`✅ ${file}`);
}
async function clickWeiter(page: Page) {
  await page.getByRole("button", { name: /Weiter/ }).click();
  await page.waitForTimeout(600);
}

async function main() {
  const cookies = await cookiePairs();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 940 }, deviceScaleFactor: 2 });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dashboard/campaigns/new`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1200);

  // Step 1: Mailbox
  await shot(page, "wiz-1-mailbox.png");
  await page.locator(".choice-card").first().click();
  await page.waitForTimeout(400);
  await clickWeiter(page);

  // Step 2: Basics
  await page.locator("#campaign-name").fill("__E2E_TEST__");
  const sn = page.locator("#sender-name");
  if (!(await sn.inputValue())) await sn.fill("Markus Wallner");
  await shot(page, "wiz-2-basics.png");
  await clickWeiter(page);

  // Step 3: Audience — Header-Checkbox zum Alle-Auswählen
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Alle sichtbaren auswählen" }).click();
  await page.waitForTimeout(500);
  await shot(page, "wiz-3-audience.png");
  await clickWeiter(page);

  // Step 4: Sequence / KI-Briefing + Live-Vorschau generieren
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Kanzlei-Outreach/ }).click().catch(() => {});
  await page.waitForTimeout(400);
  await shot(page, "wiz-4-sequence.png");
  // Beispiel-Mail generieren + auf Ergebnis warten
  await page.getByRole("button", { name: /Beispiel-Mail generieren/ }).click().catch(() => {});
  await page.waitForSelector("text=Betreff", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.getByText("Live-Vorschau").first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/wiz-4b-preview.png` });
  console.log("✅ wiz-4b-preview.png");
  await clickWeiter(page);

  // Step 5: Schedule
  await page.waitForTimeout(400);
  await shot(page, "wiz-5-schedule.png");
  await clickWeiter(page);

  // Review
  await page.waitForTimeout(600);
  await shot(page, "wiz-6-review.png");

  // E2E: als Entwurf speichern (kein echter Versand) + auf Redirect warten
  await page.getByRole("button", { name: /Als Entwurf speichern/ }).click();
  await page.waitForURL(/\/dashboard\/campaigns(\?|$)/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1000);
  console.log("✅ Entwurf gespeichert (E2E)");

  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
