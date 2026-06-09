/**
 * DIAGNOSE (temporär) — prüft Account-Readiness + Filter-Backends gegen das ECHTE Backend.
 * Kein Mock. Loggt Status + Body-Auszüge. Kostet nichts (nur GETs, kein Scrape/AI).
 */
import { test, expect } from "@playwright/test";

const endpoints = [
  "/api/credits/balance",
  "/api/leads?page=1&page_size=5",
  "/api/leads/search",
  "/api/leads/countries",
  "/api/leads/industries",
  "/api/leads/cities",
  "/api/leads/legal-forms",
  "/api/research",
];

test("diag: account readiness + filter backends", async ({ request }) => {
  for (const ep of endpoints) {
    const res = await request.get(ep);
    const status = res.status();
    let bodyPreview = "";
    try {
      const json = await res.json();
      bodyPreview = JSON.stringify(json).slice(0, 300);
    } catch {
      bodyPreview = (await res.text()).slice(0, 200);
    }
    console.log(`\n[DIAG] ${ep}\n  status=${status}\n  body=${bodyPreview}`);
    expect(status, `${ep} should not be a server error`).toBeLessThan(500);
  }
});
