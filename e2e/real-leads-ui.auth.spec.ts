/**
 * ECHTE Frontend-Verifizierung der Leads-Seite (KEINE Mocks, echtes Backend).
 * Deckt jede kostenlose Funktion ab: Suchformular + Validierung, Tabs, Status-Filter,
 * Toolbar-Suche, Filter-Popover, Sortierung, Pagination, Spalten-Toggle, Selection-UI,
 * Dialoge öffnen. KEINE kostenpflichtigen/destruktiven Aktionen hier.
 */
import { test, expect, type Page } from "@playwright/test";

const LEADS = "/dashboard/leads";

async function gotoLeads(page: Page) {
  await page.goto(LEADS);
  await expect(
    page.getByRole("button", { name: /Suche starten|Suchen starten|Sucht/ }),
  ).toBeVisible({ timeout: 25_000 });
}

/* ─────────────────────────  SUCHFORMULAR  ───────────────────────── */
test.describe("Leads · Suchformular", () => {
  test.beforeEach(gotoLeads);

  test("Branche- und Stadt-Input vorhanden", async ({ page }) => {
    await expect(page.getByPlaceholder(/Steuerberater, Anwalt, Arzt/i)).toBeVisible();
    await expect(page.getByPlaceholder(/Salzburg, Wien, Zürich/i)).toBeVisible();
  });

  test("Leeres Submit → 'Branche ist erforderlich'", async ({ page }) => {
    await page.getByRole("button", { name: /^Suche starten$/ }).click();
    await expect(page.getByText(/Branche ist erforderlich/i)).toBeVisible();
  });

  test("Nur Branche → 'Region wählen oder Stadt eingeben'", async ({ page }) => {
    await page.getByPlaceholder(/Steuerberater, Anwalt, Arzt/i).fill("Anwalt");
    await page.getByRole("button", { name: /^Suche starten$/ }).click();
    await expect(page.getByText(/Region wählen oder Stadt eingeben/i)).toBeVisible();
  });

  test("Land-Combobox: AT/DE/CH wählbar", async ({ page }) => {
    await page.getByRole("combobox").filter({ hasText: "Österreich" }).click();
    await expect(page.getByRole("option", { name: "Österreich" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Deutschland" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Schweiz" })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("Schweiz → Region-Label wird 'Kanton'", async ({ page }) => {
    await page.getByRole("combobox").filter({ hasText: "Österreich" }).click();
    await page.getByRole("option", { name: "Schweiz" }).click();
    await expect(page.getByRole("combobox").filter({ hasText: /Kanton wählen/i })).toBeVisible();
  });

  test("Bundesland Multi-Select → Button zeigt '3 Suchen starten'", async ({ page }) => {
    await page.getByRole("combobox").filter({ hasText: /Bundesland wählen/i }).click();
    await page.getByRole("option", { name: "Wien", exact: true }).click();
    await page.getByRole("option", { name: "Salzburg", exact: true }).click();
    await page.getByRole("option", { name: "Tirol", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /3 Suchen starten/i })).toBeVisible();
  });

  test("Rechtsform-Select öffnet Optionen", async ({ page }) => {
    await page.getByRole("combobox").filter({ hasText: /Alle Rechtsformen/i }).click();
    await expect(page.getByRole("option").filter({ hasText: /GmbH/ }).first()).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("Checkboxen require_ceo/email/website togglen", async ({ page }) => {
    for (const id of ["#require-ceo", "#require-email", "#require-website"]) {
      const cb = page.locator(id);
      await expect(cb).not.toBeChecked();
      await cb.click();
      await expect(cb).toBeChecked();
    }
  });
});

/* ─────────────────────────  TABS + STATUS  ──────────────────────── */
test.describe("Leads · Tabs & Status", () => {
  test.beforeEach(gotoLeads);

  test("Tab-Wechsel Suchaufträge ↔ Alle Leads", async ({ page }) => {
    await page.getByRole("tab", { name: /Suchaufträge/ }).click();
    await expect(page.getByRole("tab", { name: /Suchaufträge/ })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: /Alle Leads/ }).click();
    await expect(page.getByRole("tab", { name: /Alle Leads/ })).toHaveAttribute("aria-selected", "true");
  });

  test("Status-Subtabs filtern (URL/Request ändert sich)", async ({ page }) => {
    let sawStatus = false;
    page.on("request", (r) => { if (/\/api\/leads\?.*status=/.test(r.url())) sawStatus = true; });
    await page.getByRole("tab", { name: "Neu", exact: true }).click();
    await expect.poll(() => sawStatus, { timeout: 5000 }).toBe(true);
  });
});

/* ─────────────────────────  TOOLBAR + FILTER  ───────────────────── */
test.describe("Leads · Toolbar & Filter", () => {
  test.beforeEach(gotoLeads);

  test("Volltext-Suche feuert API mit search=", async ({ page }) => {
    let sawSearch = false;
    page.on("request", (r) => { if (/\/api\/leads\?.*search=/.test(r.url())) sawSearch = true; });
    await page.getByPlaceholder(/Firma, Kontakt, E-Mail/i).fill("GmbH");
    await expect.poll(() => sawSearch, { timeout: 5000 }).toBe(true);
  });

  for (const f of ["Branche", "Bundesland", "Stadt", "Rechtsform", "Land", "Kriterien"]) {
    test(`Filter-Popover '${f}' öffnet`, async ({ page }) => {
      // Filter-Trigger sind Buttons in der Toolbar; nimm den letzten mit dem Namen
      // (Suchform-Labels sind keine Buttons), öffne Popover.
      await page.getByRole("button", { name: f, exact: true }).last().click();
      // Popover hat ein Command-Searchfeld ODER Optionsliste
      await expect(
        page.getByRole("listbox").or(page.locator('[role="dialog"]')).or(page.getByPlaceholder(/such/i)).first(),
      ).toBeVisible({ timeout: 4000 });
      await page.keyboard.press("Escape");
    });
  }

  test("Spalten-Toggle öffnet Menü", async ({ page }) => {
    await page.getByRole("button", { name: /Spalten/i }).click();
    await expect(page.getByRole("menuitemcheckbox").first().or(page.getByRole("menuitem").first())).toBeVisible();
    await page.keyboard.press("Escape");
  });
});

/* ─────────────────────────  TABELLE: SORT/PAGE  ─────────────────── */
test.describe("Leads · Tabelle Sort & Pagination", () => {
  test.beforeEach(gotoLeads);

  test("Spalten-Sort feuert sort_by", async ({ page }) => {
    let sawSort = false;
    page.on("request", (r) => { if (/\/api\/leads\?.*sort_by=/.test(r.url())) sawSort = true; });
    // 'Firma' Header-Button (Tabellenkopf) — letzter Treffer
    await page.getByRole("button", { name: "Firma", exact: true }).last().click();
    await expect.poll(() => sawSort, { timeout: 5000 }).toBe(true);
  });

  test("Pro-Seite-Auswahl ändert limit", async ({ page }) => {
    let sawLimit = false;
    page.on("request", (r) => { if (/\/api\/leads\?.*limit=/.test(r.url())) sawLimit = true; });
    await page.getByRole("combobox").filter({ hasText: /^(25|50|100|200|500)$/ }).click();
    await page.getByRole("option", { name: "50", exact: true }).click();
    await expect.poll(() => sawLimit, { timeout: 5000 }).toBe(true);
  });

  test("Pagination Next feuert page=", async ({ page }) => {
    let sawPage = false;
    page.on("request", (r) => { if (/\/api\/leads\?.*page=2/.test(r.url())) sawPage = true; });
    const next = page.getByRole("button", { name: /Next|Weiter|Nächste/i }).or(page.getByRole("link", { name: /Next|Weiter/i }));
    await next.first().click();
    await expect.poll(() => sawPage, { timeout: 5000 }).toBe(true);
  });
});

/* ─────────────────────────  SELECTION + DIALOGE  ────────────────── */
test.describe("Leads · Selection & Dialoge", () => {
  test.beforeEach(gotoLeads);

  test("Select-All zeigt Selection-Bar", async ({ page }) => {
    await page.getByRole("checkbox", { name: /Alle auswählen/i }).first().click();
    await expect(page.getByText(/ausgewählt|Alle \d+ auswählen/i).first()).toBeVisible({ timeout: 4000 });
  });

  test("Import-Dialog öffnet", async ({ page }) => {
    await page.getByRole("button", { name: /Importieren/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/csv|Datei|hochladen|importier/i).first()).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("'Lead erstellen' öffnet Sheet", async ({ page }) => {
    await page.getByRole("button", { name: /Lead erstellen/i }).click();
    await expect(page.getByRole("dialog").or(page.locator('[role="dialog"]'))).toBeVisible();
    await expect(page.getByText(/Firma/i).first()).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("Zeile öffnen → Edit-Sheet", async ({ page }) => {
    // erste Datenzeile (row mit checkbox 'auswählen')
    const firstRow = page.getByRole("row").filter({ has: page.getByRole("checkbox", { name: /auswählen/i }) }).first();
    await firstRow.click();
    await expect(page.getByText(/Details|Übersicht|Aktivität/).first()).toBeVisible({ timeout: 6000 });
    await page.keyboard.press("Escape");
  });
});
