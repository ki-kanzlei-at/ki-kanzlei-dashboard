/* Zoom auf den Sidebar-Footer (Profil-Avatar unten links). */
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
const OUT = process.argv[2] || "C:/Users/marku/Desktop/ki-kanzlei lead dashboard/shot-sidebar-footer.png";

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
  const imgEvents: string[] = [];
  page.on("requestfailed", (r) => { if (r.url().includes("avatar")) imgEvents.push(`FAILED ${r.url()} ${r.failure()?.errorText}`); });
  page.on("response", (r) => { if (r.url().includes("avatar")) imgEvents.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  // Footer-Button (Mein Konto) gezielt shooten
  const footer = page.getByRole("button", { name: /Mein Konto/i }).first();
  if (await footer.count()) await footer.screenshot({ path: OUT });
  else await page.screenshot({ path: OUT, clip: { x: 0, y: 740, width: 280, height: 120 } });
  console.log("avatar network events:", imgEvents.length ? imgEvents.join(" | ") : "KEINE Avatar-Requests");
  console.log(`✅ ${OUT}`);
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
