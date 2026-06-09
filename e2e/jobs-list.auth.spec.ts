/**
 * Job-Liste (SearchJobsList) — Status-Rendering je Job-State, deterministisch
 * über gemockte GET /api/leads/search. Die Liste lebt im Tab „Suchaufträge",
 * daher wird der Tab vor den Assertions aktiviert.
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

async function gotoJobsTab(page: Page) {
  await page.goto("/dashboard/leads");
  await expect(page.getByText("Leads", { exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: /Suchaufträge/ }).click();
}

const job = (over: Record<string, unknown>) => ({
  id: "j", user_id: "u1", query: "Anwalt", location: "Wien", city: null, country: "AT",
  company_type: null, require_ceo: false, require_email: false, require_website: false,
  min_employees: null, max_results: null, status: "pending", results_count: 0, total_count: null,
  created_at: NOW(), updated_at: NOW(), started_at: null, completed_at: null,
  error_message: null, estimated_end_at: null, ...over,
});

test.describe("Job-Liste: Status-Rendering", () => {
  test("Pending → Badge 'Wartet' + 'In Warteschlange'", async ({ page }) => {
    await mockJobs(page, [job({ id: "j1", status: "pending" })]);
    await gotoJobsTab(page);
    await expect(page.getByText("Wartet").first()).toBeVisible();
    await expect(page.getByText("In Warteschlange").first()).toBeVisible();
  });

  test("Running → Badge 'Läuft' + Fortschritt (Leads + Prozent)", async ({ page }) => {
    await mockJobs(page, [job({ id: "j-run", query: "Notar", location: "Linz", status: "running", results_count: 12, total_count: 30, started_at: NOW() })]);
    await gotoJobsTab(page);
    await expect(page.getByText("Läuft").first()).toBeVisible();
    await expect(page.getByText("40%")).toBeVisible(); // 12/30
    await expect(page.getByText("Leads").first()).toBeVisible();
  });

  test("Completed → Badge 'Abgeschlossen' + Ergebnis-Count", async ({ page }) => {
    await mockJobs(page, [job({ id: "j-done", query: "Arzt", location: "Graz", status: "completed", results_count: 42, total_count: 50, started_at: NOW(), completed_at: NOW() })]);
    await gotoJobsTab(page);
    await expect(page.getByText("Abgeschlossen").first()).toBeVisible();
    await expect(page.getByText("42").first()).toBeVisible();
  });

  test("Failed → Badge 'Fehlgeschlagen' + Fehlertext + Bulk-Retry", async ({ page }) => {
    await mockJobs(page, [job({ id: "j-fail", query: "Architekt", location: "Bregenz", status: "failed", error_message: "Gemini-Quota erreicht", started_at: NOW(), completed_at: NOW() })]);
    await gotoJobsTab(page);
    await expect(page.getByText("Fehlgeschlagen").first()).toBeVisible();
    await expect(page.getByText(/Gemini-Quota erreicht/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Fehlgeschlagene wiederholen/i })).toBeVisible();
  });
});

test.describe("Job-Liste: Count-Bar", () => {
  test("Zeigt 'N Suchaufträge · X aktiv · Y in Warteschlange'", async ({ page }) => {
    await mockJobs(page, [
      job({ id: "a", location: "Wien", status: "running", results_count: 1, total_count: 5, started_at: NOW() }),
      job({ id: "b", location: "Linz", status: "running", results_count: 2, total_count: 8, started_at: NOW() }),
      job({ id: "c", location: "Graz", status: "pending" }),
    ]);
    await gotoJobsTab(page);
    await expect(page.getByText(/3\s+Suchaufträge/i)).toBeVisible();
    await expect(page.getByText(/2 aktiv/i)).toBeVisible();
    await expect(page.getByText(/1 in Warteschlange/i)).toBeVisible();
  });
});
