/**
 * SNAPSHOT (temporär) — dumpt die echten interaktiven Controls beider Feature-Seiten,
 * damit Tests stabile Selektoren über sichtbare Accessible Names nutzen können.
 */
import { test, type Page } from "@playwright/test";

async function dumpControls(page: Page, label: string) {
  await page.waitForTimeout(1500); // client render + erste Daten
  const roles = ["button", "tab", "textbox", "combobox", "checkbox", "link", "radio"];
  console.log(`\n========== ${label} ==========`);
  for (const role of roles) {
    const els = page.getByRole(role as Parameters<Page["getByRole"]>[0]);
    const n = await els.count();
    const names: string[] = [];
    for (let i = 0; i < n; i++) {
      const el = els.nth(i);
      const name = (await el.getAttribute("aria-label")) || (await el.innerText().catch(() => "")) || (await el.getAttribute("placeholder")) || "";
      const ph = await el.getAttribute("placeholder");
      const clean = (name || ph || "").replace(/\s+/g, " ").trim().slice(0, 60);
      if (clean) names.push(clean);
    }
    if (names.length) console.log(`  [${role}] (${names.length}): ${JSON.stringify(names)}`);
  }
}

test("snapshot: leads page controls", async ({ page }) => {
  await page.goto("/dashboard/leads");
  await page.waitForLoadState("networkidle").catch(() => {});
  await dumpControls(page, "LEADS PAGE");
});

test("snapshot: ai-researcher page controls", async ({ page }) => {
  await page.goto("/dashboard/ai-researcher");
  await page.waitForLoadState("networkidle").catch(() => {});
  await dumpControls(page, "AI RESEARCHER PAGE");
});
