import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const OUT = "C:/Users/marku/Desktop/ki-kanzlei lead dashboard";
async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1120, height: 500 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/email-preview?connected=microsoft`, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/v-toast-connected.png` });
  console.log("✅ v-toast-connected.png");
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
