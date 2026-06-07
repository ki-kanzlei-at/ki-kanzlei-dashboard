/* Screenshots der neuen Versand-Einstellungen (Settings → E-Mail-Konten).
 *   npx tsx scripts/versand-settings-shot.ts [port] [outDir] */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { chromium, type Page } from "playwright";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMAIL = "kikanzlei2025@gmail.com";
const PORT = process.argv[2] || "3100";
const BASE = `http://localhost:${PORT}`;
const OUT = (process.argv[3] || "C:/Users/marku/Desktop/ki-kanzlei lead dashboard").replace(/\/$/, "");

async function cookiePairs() {
  const admin = createAdmin(URL, SVC, { auth: { persistSession: false } });
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  const jar: Record<string, string> = {};
  const ssr = createServerClient(URL, ANON, {
    cookies: {
      getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
      setAll: (l) => l.forEach(({ name, value }) => { jar[name] = value; }),
    },
  });
  await ssr.auth.verifyOtp({ token_hash: link!.properties!.hashed_token, type: "magiclink" });
  return Object.entries(jar).map(([name, value]) => ({ name, value, url: BASE }));
}

async function shotCard(page: Page, headingText: string, out: string) {
  const heading = page.getByRole("heading", { name: headingText, exact: true }).first();
  await heading.waitFor({ state: "visible", timeout: 20000 });
  await heading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  // Nächste Card (rounded-Border-Container) um die Überschrift herum
  const card = heading.locator(
    "xpath=ancestor::div[contains(@class,'rounded-') and contains(@class,'border')][1]",
  );
  if (await card.count()) {
    await card.first().screenshot({ path: out });
  } else {
    await page.screenshot({ path: out });
  }
  console.log(`✅ ${headingText} → ${out}`);
}

async function main() {
  const cookies = await cookiePairs();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 1000 }, deviceScaleFactor: 2 });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();

  await page.goto(`${BASE}/dashboard/settings?tab=mailbox`, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1500);

  await shotCard(page, "Versandfenster", `${OUT}/shot-versandfenster.png`);
  await shotCard(page, "Versand-Einstellungen", `${OUT}/shot-versand-einstellungen.png`);

  // Voller Mailbox-Tab (Kontext) — interner Scroll-Container
  await page.evaluate(() => {
    const sc = document.querySelector("[data-settings-scroll], .overflow-y-auto");
    if (sc) (sc as HTMLElement).scrollTop = 0;
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/shot-mailbox-top.png` });
  console.log(`✅ Mailbox-Top → ${OUT}/shot-mailbox-top.png`);

  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
