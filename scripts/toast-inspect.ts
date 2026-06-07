import { chromium } from "playwright";
const BASE = "http://localhost:3000";
async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1120, height: 600 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/email-preview`, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(1200);
  await p.getByRole("button", { name: "Aktionen" }).first().click();
  await p.waitForTimeout(300);
  await p.getByRole("menuitem", { name: "Verbindung testen" }).click();
  await p.waitForTimeout(800);

  const info = await p.evaluate(`(() => {
    var toast = document.querySelector("[data-sonner-toast]");
    var icon = document.querySelector("[data-sonner-toast] [data-icon]");
    var title = document.querySelector("[data-sonner-toast] [data-title]");
    function disp(el){ return el ? getComputedStyle(el).display : "n/a"; }
    function font(el){ return el ? getComputedStyle(el).fontFamily : "n/a"; }
    return {
      toastHTML: toast ? toast.outerHTML.slice(0, 700) : "NO TOAST",
      iconExists: !!icon,
      iconDisplay: disp(icon),
      titleFont: font(title),
      toasterFont: font(document.querySelector("[data-sonner-toaster]")),
    };
  })()`);
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
