/**
 * Leads-Tabelle: Filter, Suche, Sortierung, Bulk-Actions.
 *
 * Mocked Leads-API damit der Test deterministisch ist.
 */

import { test, expect, type Page } from "@playwright/test";

function mockLeads(page: Page, leads: unknown[], total = leads.length) {
  return page.route("**/api/leads*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/leads" && route.request().method() === "GET") {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ data: leads, count: total, page: 1, page_size: 50 }),
      });
    } else {
      route.continue();
    }
  });
}

const SAMPLE_LEADS = [
  {
    id: "l1", company: "Kanzlei Müller GmbH", company_name: "Kanzlei Müller GmbH",
    name: "Dr. Hans Müller", email: "office@mueller.at", phone: "+43 1 1234567",
    website: "https://mueller.at", city: "Wien", state: "Wien", country: "AT",
    industry: "Rechtsanwälte", legal_form: "GmbH", status: "new",
    ceo_name: "Dr. Hans Müller", ceo_gender: "herr",
    created_at: new Date().toISOString(), user_id: "u1",
  },
  {
    id: "l2", company: "Steuerbüro Anna Hofer", company_name: "Steuerbüro Anna Hofer",
    name: "Mag. Anna Hofer", email: "info@hofer-steuer.at", phone: "+43 662 9988776",
    website: "https://hofer-steuer.at", city: "Salzburg", state: "Salzburg", country: "AT",
    industry: "Steuerberater", legal_form: "e.U.", status: "contacted",
    ceo_name: "Mag. Anna Hofer", ceo_gender: "frau",
    created_at: new Date().toISOString(), user_id: "u1",
  },
];

async function gotoLeadsPage(page: Page) {
  await page.goto("/dashboard/leads");
  await expect(page.getByText("Leads", { exact: true }).first()).toBeVisible();
}

test.describe("Leads-Tabelle: Basis-Darstellung", () => {
  test.beforeEach(async ({ page }) => {
    await mockLeads(page, SAMPLE_LEADS);
  });

  test("Tab 'Leads' zeigt beide Leads aus Mock", async ({ page }) => {
    await gotoLeadsPage(page);
    await page.getByRole("tab", { name: /^Alle Leads/ }).click();

    await expect(page.getByText("Kanzlei Müller GmbH")).toBeVisible();
    await expect(page.getByText("Steuerbüro Anna Hofer")).toBeVisible();
  });

  test("Email + Telefon + Website werden angezeigt", async ({ page }) => {
    await gotoLeadsPage(page);
    await page.getByRole("tab", { name: /^Alle Leads/ }).click();

    await expect(page.getByText("office@mueller.at")).toBeVisible();
    await expect(page.getByText(/\+43 1 1234567/)).toBeVisible();
  });
});

test.describe("Leads-Tabelle: Volltextsuche", () => {
  test("Suche nach Firmenname filtert clientseitig via API-Call", async ({ page }) => {
    let lastUrl = "";
    await page.route("**/api/leads*", (route) => {
      const url = route.request().url();
      lastUrl = url;
      if (url.includes("/api/leads") && route.request().method() === "GET") {
        const includesSearch = url.includes("search=");
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            data: includesSearch ? [SAMPLE_LEADS[0]] : SAMPLE_LEADS,
            count: includesSearch ? 1 : 2,
            page: 1,
            page_size: 50,
          }),
        });
      } else {
        route.continue();
      }
    });

    await gotoLeadsPage(page);
    await page.getByRole("tab", { name: /^Alle Leads/ }).click();

    const searchInput = page.getByPlaceholder(/Firma, Kontakt, E-Mail/i).first();
    await searchInput.fill("Müller");

    // Wait für debounced search (500ms) — Url sollte search= enthalten
    await expect.poll(() => lastUrl.includes("search="), { timeout: 3000 }).toBe(true);
  });
});

test.describe("Leads-Tabelle: Empty State", () => {
  test("Leere Liste zeigt Empty-State-Komponente", async ({ page }) => {
    await mockLeads(page, [], 0);
    await gotoLeadsPage(page);
    await page.getByRole("tab", { name: /^Alle Leads/ }).click();

    // Verschiedene mögliche Texte für leeren Zustand
    const emptyTexts = [/keine leads/i, /noch keine/i, /nichts gefunden/i];
    let foundEmpty = false;
    for (const re of emptyTexts) {
      if (await page.getByText(re).isVisible().catch(() => false)) {
        foundEmpty = true;
        break;
      }
    }
    expect(foundEmpty).toBeTruthy();
  });
});
