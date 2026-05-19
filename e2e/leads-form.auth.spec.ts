/**
 * Lead-Suchformular — systematischer Test JEDES Feldes.
 *
 * WICHTIG zu den Mocks:
 *  - GET /api/leads/search  → liefert Job-Liste (Array)
 *  - POST /api/leads/search → erstellt neuen Job
 * Wenn man eines davon falsch mockt, crasht die Page.
 */

import { test, expect, type Page, type Route } from "@playwright/test";

/** Mocks BEIDE Endpoints sauber. POST gibt die übergebene Response zurück. */
async function setupApiMocks(page: Page, opts: {
  initialJobs?: unknown[];
  onPost?: (req: Route) => void;
} = {}) {
  const jobs = opts.initialJobs ?? [];
  await page.route("**/api/leads/search**", (route) => {
    const method = route.request().method();
    if (method === "GET") {
      route.fulfill({ status: 200, body: JSON.stringify({ data: jobs }) });
    } else if (method === "POST" && opts.onPost) {
      opts.onPost(route);
    } else if (method === "POST") {
      route.fulfill({
        status: 201,
        body: JSON.stringify({
          data: { id: `mock-${Date.now()}`, status: "pending", query: "x", location: "y", country: "AT", created_at: new Date().toISOString() },
          queued: false,
        }),
      });
    } else {
      route.continue();
    }
  });
  // Leads-Tabelle: leeres Array damit kein Backend-Call das Frontend crasht
  await page.route("**/api/leads*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/leads" && route.request().method() === "GET") {
      route.fulfill({ status: 200, body: JSON.stringify({ data: [], count: 0, page: 1, page_size: 50 }) });
    } else {
      route.continue();
    }
  });
}

async function gotoLeads({ page }: { page: Page }) {
  await setupApiMocks(page);
  await page.goto("/dashboard/leads");
  await expect(page.getByText("Leads", { exact: true }).first()).toBeVisible();
}

const visible = (page: Page, text: string | RegExp) =>
  page.getByText(text).locator("visible=true");

test.describe("Lead-Suchformular: Branche-Feld", () => {
  test.beforeEach(gotoLeads);

  test("Branche-Input mit korrektem Placeholder", async ({ page }) => {
    await expect(page.getByPlaceholder(/Steuerberater, Anwalt, Arzt/i)).toBeVisible();
  });

  test("Leeres Submit zeigt Fehler 'Branche oder Stadt'", async ({ page }) => {
    await page.getByRole("button", { name: /leads suchen/i }).click();
    await expect(visible(page, /Branche oder Stadt angeben/i)).toBeVisible();
  });

  test("Branche eingegeben, aber keine Region/Stadt → Region-Fehler", async ({ page }) => {
    await page.getByPlaceholder(/Steuerberater, Anwalt, Arzt/i).fill("Rechtsanwalt");
    await page.getByRole("button", { name: /leads suchen/i }).click();
    await expect(visible(page, /Region wählen oder Stadt eingeben/i)).toBeVisible();
  });
});

test.describe("Lead-Suchformular: Land-Auswahl", () => {
  test.beforeEach(gotoLeads);

  test("Land-Dropdown öffnet, zeigt nur 3 DACH-Optionen", async ({ page }) => {
    const landBtn = page.getByRole("combobox").filter({ hasText: "Österreich" });
    await landBtn.click();
    await expect(page.getByRole("option", { name: "Österreich" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Deutschland" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Schweiz" })).toBeVisible();
    // Stichprobe: keine Non-DACH-Länder
    await expect(page.getByRole("option", { name: "Frankreich" })).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("Wechsel zu Deutschland: Button-Text aktualisiert", async ({ page }) => {
    await page.getByRole("combobox").filter({ hasText: "Österreich" }).click();
    await page.getByRole("option", { name: "Deutschland" }).click();
    await expect(page.getByRole("combobox").filter({ hasText: "Deutschland" })).toBeVisible();
  });

  test("Wechsel zu Schweiz: Region-Label heißt 'Kanton'", async ({ page }) => {
    await page.getByRole("combobox").filter({ hasText: "Österreich" }).click();
    await page.getByRole("option", { name: "Schweiz" }).click();
    // Region-Combobox Placeholder ändert sich auf "Kanton wählen"
    await expect(page.getByRole("combobox").filter({ hasText: /Kanton wählen/i })).toBeVisible();
  });
});

test.describe("Lead-Suchformular: Region/Bundesland Multi-Select", () => {
  test.beforeEach(gotoLeads);

  test("AT: Region-Dropdown enthält alle 9 Bundesländer", async ({ page }) => {
    await page.getByRole("combobox").filter({ hasText: /Bundesland wählen/i }).click();
    for (const bl of ["Wien", "Niederösterreich", "Oberösterreich", "Salzburg",
                       "Tirol", "Vorarlberg", "Kärnten", "Steiermark", "Burgenland"]) {
      await expect(page.getByRole("option", { name: bl, exact: true })).toBeVisible();
    }
    await page.keyboard.press("Escape");
  });

  test("Multi-Select: 3 Bundesländer wählbar, Button zeigt '3 Suchen starten'", async ({ page }) => {
    await page.getByRole("combobox").filter({ hasText: /Bundesland wählen/i }).click();
    await page.getByRole("option", { name: "Wien", exact: true }).click();
    await page.getByRole("option", { name: "Salzburg", exact: true }).click();
    await page.getByRole("option", { name: "Tirol", exact: true }).click();
    await page.keyboard.press("Escape");

    await expect(page.getByText(/3 Suchaufträge/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /3 Suchen starten/i })).toBeVisible();
  });
});

test.describe("Lead-Suchformular: Stadt/Ort optional", () => {
  test.beforeEach(gotoLeads);

  test("Stadt-Input mit korrektem Placeholder", async ({ page }) => {
    await expect(page.getByPlaceholder(/Salzburg, Wien, Zürich/i)).toBeVisible();
  });

  test("Nur Stadt + Branche reicht (ohne Region)", async ({ page }) => {
    await page.getByPlaceholder(/Steuerberater, Anwalt, Arzt/i).fill("Anwalt");
    await page.getByPlaceholder(/Salzburg, Wien, Zürich/i).fill("Mondsee");
    await page.getByRole("button", { name: /leads suchen/i }).click();
    await expect(visible(page, /Region wählen oder Stadt eingeben/i)).toHaveCount(0);
  });
});

test.describe("Lead-Suchformular: Rechtsform-Dropdown", () => {
  test.beforeEach(gotoLeads);

  test("Dropdown öffnet und zeigt Rechtsform-Optionen", async ({ page }) => {
    // shadcn Select Trigger über SelectValue Placeholder
    await page.getByRole("combobox").filter({ hasText: /Alle Rechtsformen|GmbH|AG/i }).click();
    // Mindestens GmbH-Option muss da sein
    await expect(page.getByRole("option").filter({ hasText: /GmbH/ }).first()).toBeVisible();
    await page.keyboard.press("Escape");
  });
});

test.describe("Lead-Suchformular: 'Nur mit Geschäftsführer' Checkbox", () => {
  test.beforeEach(gotoLeads);

  test("Checkbox togglet beim Klick", async ({ page }) => {
    const checkbox = page.getByLabel(/nur mit geschäftsführer/i);
    await expect(checkbox).not.toBeChecked();
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    await checkbox.click();
    await expect(checkbox).not.toBeChecked();
  });
});

test.describe("Lead-Suchformular: Submit + Toast-Verhalten", () => {
  test("Single-Submit: Toast 'gestartet' bei queued=false", async ({ page }) => {
    await setupApiMocks(page, {
      onPost: (route) => route.fulfill({
        status: 201,
        body: JSON.stringify({
          data: { id: "j1", status: "pending", query: "Anwalt", location: "Mondsee", country: "AT", created_at: new Date().toISOString(), results_count: 0, total_count: null },
          queued: false,
        }),
      }),
    });
    await page.goto("/dashboard/leads");
    await expect(page.getByText("Leads", { exact: true }).first()).toBeVisible();

    await page.getByPlaceholder(/Steuerberater, Anwalt, Arzt/i).fill("Anwalt");
    await page.getByPlaceholder(/Salzburg, Wien, Zürich/i).fill("Mondsee");
    await page.getByRole("button", { name: /leads suchen/i }).click();

    await expect(page.getByText(/Suche nach .* in Mondsee gestartet/i)).toBeVisible({ timeout: 10_000 });
  });

  test("Single-Submit: Toast 'eingereiht' bei queued=true", async ({ page }) => {
    await setupApiMocks(page, {
      onPost: (route) => route.fulfill({
        status: 201,
        body: JSON.stringify({
          data: { id: "j2", status: "pending", query: "Anwalt", location: "Mondsee", country: "AT", created_at: new Date().toISOString(), results_count: 0, total_count: null },
          queued: true,
        }),
      }),
    });
    await page.goto("/dashboard/leads");
    await expect(page.getByText("Leads", { exact: true }).first()).toBeVisible();

    await page.getByPlaceholder(/Steuerberater, Anwalt, Arzt/i).fill("Anwalt");
    await page.getByPlaceholder(/Salzburg, Wien, Zürich/i).fill("Mondsee");
    await page.getByRole("button", { name: /leads suchen/i }).click();

    await expect(page.getByText(/eingereiht.*startet sobald ein Slot frei ist/i)).toBeVisible({ timeout: 10_000 });
  });

  test("Komma-getrennte Branchen erzeugen mehrere Jobs", async ({ page }) => {
    let postCount = 0;
    await setupApiMocks(page, {
      onPost: (route) => {
        postCount++;
        route.fulfill({
          status: 201,
          body: JSON.stringify({
            data: { id: `j-${postCount}`, status: "pending", query: "x", location: "Mondsee", country: "AT", created_at: new Date().toISOString(), results_count: 0, total_count: null },
            queued: false,
          }),
        });
      },
    });
    await page.goto("/dashboard/leads");
    await expect(page.getByText("Leads", { exact: true }).first()).toBeVisible();

    await page.getByPlaceholder(/Steuerberater, Anwalt, Arzt/i).fill("Anwalt, Steuerberater, Notar");
    await page.getByPlaceholder(/Salzburg, Wien, Zürich/i).fill("Mondsee");
    await page.getByRole("button", { name: /leads suchen/i }).click();

    await expect.poll(() => postCount, { timeout: 5000 }).toBe(3);
    await expect(page.getByText(/3 Suchaufträge gestartet/i)).toBeVisible();
  });
});
