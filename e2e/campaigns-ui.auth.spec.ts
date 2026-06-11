/**
 * UI-Verifikation: Kampagnen-Liste + Detailseite (Redesign).
 * Klickt jedes Element durch und legt Screenshots in .playwright-shots/ ab.
 */

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const SHOTS = path.join(__dirname, "..", ".playwright-shots");
test.beforeAll(() => { fs.mkdirSync(SHOTS, { recursive: true }); });

const shot = (name: string) => path.join(SHOTS, `${name}.png`);

test.describe("Kampagnen-Liste", () => {
  test("Liste: Tabs, Suche, Hover-Aktionen, Leerzustand", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/dashboard/campaigns");
    await expect(page.getByRole("heading", { name: "Kampagnen" })).toBeVisible({ timeout: 30_000 });
    // Tabelle oder Leerzustand abwarten
    await page.waitForTimeout(1500);
    await page.screenshot({ path: shot("01-liste"), fullPage: true });

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    console.log(`[UI-Check] ${rowCount} Kampagnen-Zeilen sichtbar`);

    if (rowCount > 0) {
      // Hover über erste Zeile → Aktions-Buttons erscheinen
      await rows.first().hover();
      await page.waitForTimeout(300);
      await page.screenshot({ path: shot("02-liste-hover-aktionen") });

      // Status-Badge-Farben auslesen (kein Orange erlaubt)
      const badges = page.locator("table .badge-status");
      const badgeCount = await badges.count();
      for (let i = 0; i < Math.min(badgeCount, 5); i++) {
        const cls = await badges.nth(i).getAttribute("class");
        const color = await badges.nth(i).evaluate((el) => getComputedStyle(el).color);
        console.log(`[UI-Check] Badge ${i}: ${cls} → ${color}`);
      }

      // Dropdown-Menü öffnen
      await rows.first().hover();
      const moreBtn = rows.first().locator("button:has(.sr-only)").last();
      await moreBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: shot("03-liste-dropdown") });
      await page.keyboard.press("Escape");
    }

    // Status-Tab wechseln
    await page.getByRole("tab", { name: /Aktiv/ }).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: shot("04-liste-tab-aktiv") });
    await page.getByRole("tab", { name: "Alle" }).click();
    await page.waitForTimeout(500);

    // Suche ohne Treffer → Lupen-Leerzustand
    await page.getByPlaceholder("Kampagne suchen …").fill("zzz-nicht-vorhanden-999");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: shot("05-liste-leer-suche"), fullPage: true });
    await expect(page.getByText("Keine Kampagnen gefunden")).toBeVisible();

    // Zurücksetzen
    await page.getByRole("button", { name: "Filter zurücksetzen" }).click();
    await page.waitForTimeout(800);

    console.log(`[UI-Check] Console-Errors: ${consoleErrors.length}`);
    consoleErrors.slice(0, 5).forEach((e) => console.log(`  ⚠ ${e.slice(0, 200)}`));
  });
});

test.describe("Kampagnen-Detailseite", () => {
  test("Detail: Stats, Flow, Chips, Empfänger, Bearbeiten-Sheet", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/dashboard/campaigns");
    await expect(page.getByRole("heading", { name: "Kampagnen" })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    test.skip(rowCount === 0, "Keine Kampagnen vorhanden — Detailseite nicht testbar");

    // Erste Kampagne öffnen (Zelle klicken, nicht Checkbox)
    await rows.first().locator("td").nth(1).click();
    await page.waitForURL(/\/dashboard\/campaigns\/[\w-]+/, { timeout: 30_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: shot("10-detail"), fullPage: true });

    // Sequenz-Flow vorhanden?
    const flowSteps = page.locator(".flow-step");
    console.log(`[UI-Check] Flow-Schritte: ${await flowSteps.count()}`);

    // Setup-Chips
    const chips = page.locator(".setup-chip");
    const chipCount = await chips.count();
    for (let i = 0; i < chipCount; i++) {
      console.log(`[UI-Check] Chip ${i}: ${(await chips.nth(i).innerText()).replace(/\n/g, " | ")}`);
    }

    // Empfänger-Suche ohne Treffer → Lupen-Leerzustand
    const searchInput = page.getByPlaceholder("Firma oder E-Mail suchen …");
    if (await searchInput.isVisible()) {
      await searchInput.fill("zzz-nicht-vorhanden-999");
      await page.waitForTimeout(1200);
      await page.screenshot({ path: shot("11-detail-leer-suche"), fullPage: true });
      await searchInput.clear();
      await page.waitForTimeout(800);
    }

    // Status-Filter-Popover öffnen
    await page.locator(".filter-trigger").click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot("12-detail-filter-popover") });
    await page.keyboard.press("Escape");

    // Bearbeiten-Sheet öffnen
    await page.getByRole("button", { name: "Bearbeiten" }).first().click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: shot("13-edit-sheet-oben") });

    // Sheet: Sequenz-Schritt hinzufügen
    const addStep = page.getByRole("button", { name: "Schritt hinzufügen" });
    if (await addStep.isVisible()) {
      await addStep.click();
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: shot("14-edit-sheet-sequenz") });

    // Hinzugefügten Schritt wieder entfernen (letzter Trash-Button)
    const trashBtns = page.locator('button[aria-label*="entfernen"]');
    if (await trashBtns.count() > 0) {
      await trashBtns.last().click();
      await page.waitForTimeout(300);
    }

    // Bis zum Footer scrollen (Wochentage, Switches)
    await page.getByText("Auto-Stopp bei Antwort").last().scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot("15-edit-sheet-unten") });

    // Speichern (No-op-Roundtrip) → Erfolgstoast
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Kampagne aktualisiert")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: shot("16-detail-nach-speichern"), fullPage: true });

    // Schmaler Viewport → Skalierung prüfen
    await page.setViewportSize({ width: 860, height: 900 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: shot("17-detail-schmal"), fullPage: true });

    console.log(`[UI-Check] Console-Errors: ${consoleErrors.length}`);
    consoleErrors.slice(0, 5).forEach((e) => console.log(`  ⚠ ${e.slice(0, 200)}`));
  });
});
