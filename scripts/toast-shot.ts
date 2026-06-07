import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const OUT = "C:/Users/marku/Desktop/ki-kanzlei lead dashboard";
async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1120, height: 600 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/email-preview`, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(1500);
  await p.getByRole("button", { name: "Aktionen" }).first().click();
  await p.waitForTimeout(300);
  await p.getByRole("menuitem", { name: "Verbindung testen" }).click();
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/v-toast2.png` });
  console.log("✅ v-toast2.png");
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
