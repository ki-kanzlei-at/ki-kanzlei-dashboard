/* Verifikations-Screenshots: Liste(Pausiert), Empty, Provider, SMTP, Toast, Settings, Guide. */
import { chromium, type Browser } from "playwright";

const BASE = "http://localhost:3000";
const OUT = "C:/Users/marku/Desktop/ki-kanzlei lead dashboard";

async function page(browser: Browser, url: string) {
  const ctx = await browser.newContext({ viewport: { width: 1120, height: 920 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(`${BASE}${url}`, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(600);
  return p;
}

async function main() {
  const browser = await chromium.launch();

  // 1) Liste — inaktive Zeile muss „Pausiert" zeigen
  let p = await page(browser, "/email-preview");
  await p.screenshot({ path: `${OUT}/v-list.png`, fullPage: true });
  console.log("✅ v-list.png");

  // 2) Toast — Verbindung testen über 3-Punkte-Menü (Font + keine Icons prüfen)
  await p.getByRole("button", { name: "Aktionen" }).first().click();
  await p.waitForTimeout(300);
  await p.getByRole("menuitem", { name: "Verbindung testen" }).click();
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${OUT}/v-toast.png` });
  console.log("✅ v-toast.png");

  // 3) Settings-Dialog (Test-Buttons + Tracking-Text)
  p = await page(browser, "/email-preview");
  await p.getByRole("button", { name: "Aktionen" }).first().click();
  await p.waitForTimeout(300);
  await p.getByRole("menuitem", { name: "Einstellungen" }).click();
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/v-settings.png` });
  console.log("✅ v-settings.png");

  // 4) Empty-State + Guide-Dialog
  p = await page(browser, "/email-preview?empty=1");
  await p.screenshot({ path: `${OUT}/v-empty.png`, fullPage: true });
  console.log("✅ v-empty.png");
  await p.getByRole("button", { name: "Einrichtungs-Anleitung öffnen" }).click();
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/v-guide.png` });
  console.log("✅ v-guide.png");

  // 5) Wizard Provider (kein Balken) + SMTP-Step (Felder-Alignment)
  p = await page(browser, "/email-preview");
  await p.getByRole("button", { name: "Konto hinzufügen" }).click();
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/v-provider.png` });
  console.log("✅ v-provider.png");
  await p.getByText("Anderer Anbieter (SMTP)").click();
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/v-smtp.png` });
  console.log("✅ v-smtp.png");

  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
