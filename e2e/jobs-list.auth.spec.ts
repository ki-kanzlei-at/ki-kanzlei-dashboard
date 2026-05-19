/**
 * Job-Liste (SearchJobsList) — alle Job-States, Buttons, Queue-Anzeige.
 *
 * Mocked GET /api/leads/search liefert konstruierte Jobs für jeden State.
 * Hinweis: Status-Badges existieren doppelt im DOM (mobile + desktop),
 * daher selektieren wir über :visible.
 */

import { test, expect, type Page } from "@playwright/test";

const NOW = () => new Date().toISOString();

function mockJobs(page: Page, jobs: unknown[]) {
  return page.route("**/api/leads/search", (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({ status: 200, body: JSON.stringify({ data: jobs }) });
    } else {
      route.continue();
    }
  });
}

async function gotoLeadsPage(page: Page) {
  await page.goto("/dashboard/leads");
  await expect(page.getByText("Leads", { exact: true }).first()).toBeVisible();
}

const visible = (page: Page, text: string | RegExp) =>
  page.getByText(text).locator("visible=true");

test.describe("Job-Liste: Status-Anzeigen", () => {
  test("Pending zeigt 'In Warteschlange' + Queue-Position", async ({ page }) => {
    await mockJobs(page, [
      { id: "j1", user_id: "u1", query: "Anwalt", location: "Wien", country: "AT", status: "pending", results_count: 0, total_count: null, created_at: NOW(), updated_at: NOW(), started_at: null, completed_at: null, error_message: null, estimated_end_at: null },
      { id: "j2", user_id: "u1", query: "Steuerberater", location: "Salzburg", country: "AT", status: "pending", results_count: 0, total_count: null, created_at: new Date(Date.now() + 1000).toISOString(), updated_at: NOW(), started_at: null, completed_at: null, error_message: null, estimated_end_at: null },
    ]);

    await gotoLeadsPage(page);

    await expect(visible(page, "In Warteschlange").first()).toBeVisible();
    await expect(visible(page, /Startet automatisch sobald ein Slot frei wird/i)).toBeVisible();
    await expect(visible(page, /Position 2 in deiner Warteschlange/i)).toBeVisible();
  });

  test("Running zeigt 'Läuft…' + Progress + ETA", async ({ page }) => {
    await mockJobs(page, [
      { id: "j-run", user_id: "u1", query: "Notar", location: "Linz", country: "AT", status: "running", results_count: 12, total_count: 30, created_at: NOW(), updated_at: NOW(), started_at: NOW(), completed_at: null, error_message: null, estimated_end_at: new Date(Date.now() + 60_000).toISOString() },
    ]);

    await gotoLeadsPage(page);

    await expect(visible(page, /Läuft…/).first()).toBeVisible();
    await expect(visible(page, /12 Ergebnisse \/ 30 gesamt/i)).toBeVisible();
    await expect(visible(page, /~1 Min\. verbleibend/i)).toBeVisible();
  });

  test("Completed zeigt 'Abgeschlossen' + Ergebnis-Count", async ({ page }) => {
    await mockJobs(page, [
      { id: "j-done", user_id: "u1", query: "Arzt", location: "Graz", country: "AT", status: "completed", results_count: 42, total_count: 50, created_at: NOW(), updated_at: NOW(), started_at: NOW(), completed_at: NOW(), error_message: null, estimated_end_at: null },
    ]);

    await gotoLeadsPage(page);

    await expect(visible(page, /Abgeschlossen/).first()).toBeVisible();
    await expect(visible(page, /42 Ergebnisse/i)).toBeVisible();
  });

  test("Failed zeigt 'Fehlgeschlagen' + Error-Text + Retry-Button", async ({ page }) => {
    await mockJobs(page, [
      { id: "j-fail", user_id: "u1", query: "Architekt", location: "Bregenz", country: "AT", status: "failed", results_count: 0, total_count: null, created_at: NOW(), updated_at: NOW(), started_at: NOW(), completed_at: NOW(), error_message: "Gemini-Quota erreicht", estimated_end_at: null },
    ]);

    await gotoLeadsPage(page);

    await expect(visible(page, "Fehlgeschlagen").first()).toBeVisible();
    await expect(page.getByText(/Gemini-Quota erreicht/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /wiederholen/i })).toBeVisible();
  });
});

test.describe("Job-Liste: Aktionen", () => {
  test("Cancel-Button bei pending heißt 'Abbrechen'", async ({ page }) => {
    await mockJobs(page, [
      { id: "j-pend", user_id: "u1", query: "Anwalt", location: "Wien", country: "AT", status: "pending", results_count: 0, total_count: null, created_at: NOW(), updated_at: NOW(), started_at: null, completed_at: null, error_message: null, estimated_end_at: null },
    ]);

    await gotoLeadsPage(page);
    await expect(page.getByRole("button", { name: /^Abbrechen$/ })).toBeVisible();
  });

  test("Cancel-Button bei running heißt 'Stopp'", async ({ page }) => {
    await mockJobs(page, [
      { id: "j-run", user_id: "u1", query: "Anwalt", location: "Wien", country: "AT", status: "running", results_count: 1, total_count: 10, created_at: NOW(), updated_at: NOW(), started_at: NOW(), completed_at: null, error_message: null, estimated_end_at: null },
    ]);

    await gotoLeadsPage(page);
    await expect(page.getByRole("button", { name: /^Stopp$/ })).toBeVisible();
  });

  test("Counter-Bar oben zeigt 'X läuft / Y wartet'", async ({ page }) => {
    await mockJobs(page, [
      { id: "j1", user_id: "u1", query: "x", location: "Wien", country: "AT", status: "running", results_count: 1, total_count: 5, created_at: NOW(), updated_at: NOW(), started_at: NOW(), completed_at: null, error_message: null, estimated_end_at: null },
      { id: "j2", user_id: "u1", query: "x", location: "Linz", country: "AT", status: "running", results_count: 2, total_count: 8, created_at: NOW(), updated_at: NOW(), started_at: NOW(), completed_at: null, error_message: null, estimated_end_at: null },
      { id: "j3", user_id: "u1", query: "x", location: "Graz", country: "AT", status: "pending", results_count: 0, total_count: null, created_at: NOW(), updated_at: NOW(), started_at: null, completed_at: null, error_message: null, estimated_end_at: null },
    ]);

    await gotoLeadsPage(page);

    await expect(page.getByText(/2 laufen/i)).toBeVisible();
    await expect(page.getByText(/1 wartet/i)).toBeVisible();
  });

  test("Slot-Indikator wechselt zu amber bei 5/5", async ({ page }) => {
    const jobs = Array.from({ length: 5 }, (_, i) => ({
      id: `j${i}`,
      user_id: "u1",
      query: "x",
      location: `City${i}`,
      country: "AT",
      status: "running" as const,
      results_count: 0,
      total_count: 10,
      created_at: NOW(),
      updated_at: NOW(),
      started_at: NOW(),
      completed_at: null,
      error_message: null,
      estimated_end_at: null,
    }));
    await mockJobs(page, jobs);
    await gotoLeadsPage(page);

    const indicator = page.getByText(/5 \/ 5 Slots aktiv/i);
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveClass(/amber/);
  });
});
