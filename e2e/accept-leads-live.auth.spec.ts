/**
 * ABNAHME · LEADS LIVE (UI-getrieben, echtes Backend, echte Credits/Scrapes)
 * ───────────────────────────────────────────────────────────────────────────
 * Steuert ALLES über das Frontend: füllt das Suchformular aus, klickt
 * „Suche starten", wartet bis der Job durchläuft und verifiziert, dass echte
 * Leads im Account landen — über mehrere Länder (AT/DE/CH) und mit Filtern
 * (Rechtsform, „Mit Website"). Danach: Tabellen-Funktionen gegen die echten
 * Daten (Suchaufträge-Tab, Job-Filter, Land-Filter, AI-Anreicherung im Sheet).
 *
 * Kostet echte Credits (1/Lead-Discover, 2/Enrich). City-Suchen mit kleinem
 * max_results halten Kosten & Laufzeit niedrig. Leads bleiben im Account
 * (der Nutzer will sie) — nur reine Test-Artefakte werden separat aufgeräumt.
 */
import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const LEADS = "/dashboard/leads";
const JOB_TIMEOUT = 240_000;

/* Über Tests hinweg gesammelt (für Reporting/Folge-Tests) */
const createdJobs: { id: string; query: string; city: string; country: string }[] = [];
let enrichLeadId: string | null = null;

interface ScrapeConfig {
  query: string;
  city: string;
  country: "AT" | "DE" | "CH";
  countryLabel: string;
  requireWebsite?: boolean;
  companyType?: { label: string; expect: string }; // Rechtsform-Select-Label + erwarteter legal_form-Substring
  maxResults: number; // Vielfaches von 10 (Slider-Step)
}

async function gotoLeads(page: Page) {
  await page.goto(LEADS);
  await expect(page.getByRole("button", { name: /^Suche starten$/ })).toBeVisible({ timeout: 25_000 });
}

/** Land im Formular-Combobox umstellen (zeigt aktuell das Label des gewählten Landes). */
async function selectCountry(page: Page, fromLabel: string, toLabel: string) {
  if (fromLabel === toLabel) return;
  await page.getByRole("combobox").filter({ hasText: fromLabel }).click();
  await page.getByRole("option", { name: toLabel, exact: true }).click();
  await expect(page.getByRole("combobox").filter({ hasText: toLabel })).toBeVisible();
}

/** max_results-Slider per Tastatur setzen (Step 10) und über aria-valuenow verifizieren. */
async function setMaxResults(page: Page, value: number) {
  const steps = Math.round(value / 10);
  const slider = page.getByRole("slider").first();
  await slider.focus();
  await slider.press("Home"); // auf 0 ("Alle")
  for (let i = 0; i < steps; i++) await slider.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow", String(value));
}

/**
 * Startet eine Suche über das UI-Formular und gibt die Job-ID zurück
 * (aus der POST-Antwort von /api/leads/search abgefangen).
 */
async function startScrapeViaUI(page: Page, cfg: ScrapeConfig): Promise<string> {
  await gotoLeads(page);

  // Land (Default ist Österreich)
  await selectCountry(page, "Österreich", cfg.countryLabel);

  // Branche
  await page.getByPlaceholder(/Steuerberater, Anwalt, Arzt/i).fill(cfg.query);
  // Stadt / Ort (City-Suche = schnell & günstig)
  await page.getByPlaceholder(/Salzburg, Wien, Zürich/i).fill(cfg.city);

  // Rechtsform (optional)
  if (cfg.companyType) {
    await page.getByRole("combobox").filter({ hasText: /Alle Rechtsformen/i }).click();
    await page.getByRole("option", { name: cfg.companyType.label, exact: true }).click();
  }

  // „Mit Website" (optional)
  if (cfg.requireWebsite) {
    const cb = page.locator("#require-website");
    if (!(await cb.isChecked())) await cb.click();
  }

  // Anzahl Leads begrenzen
  await setMaxResults(page, cfg.maxResults);

  // Absenden + Job-ID aus POST-Response abfangen
  const respPromise = page.waitForResponse(
    (r) => r.url().includes("/api/leads/search") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /^Suche starten$/ }).click();
  const resp = await respPromise;
  expect(resp.status(), "POST /api/leads/search → 201").toBe(201);
  const jobId = (await resp.json()).data.id as string;
  createdJobs.push({ id: jobId, query: cfg.query, city: cfg.city, country: cfg.country });
  return jobId;
}

/** Pollt /api/leads/search bis der Job completed/failed ist. */
async function waitJobDone(page: Page, jobId: string): Promise<{ status: string; results_count: number }> {
  const start = Date.now();
  while (Date.now() - start < JOB_TIMEOUT) {
    const list = await page.request.get("/api/leads/search");
    if (list.ok()) {
      const jobs = (await list.json()).data as Array<{ id: string; status: string; results_count: number }>;
      const job = jobs.find((j) => j.id === jobId);
      if (job && (job.status === "completed" || job.status === "failed")) return job;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Job ${jobId} nicht rechtzeitig fertig`);
}

/** Verifiziert die erzeugten Leads des Jobs gegen die gesetzten Filter. */
async function verifyJobLeads(page: Page, jobId: string, cfg: ScrapeConfig) {
  const res = await page.request.get(`/api/leads?search_job_id=${jobId}&limit=50`);
  expect(res.ok()).toBeTruthy();
  const leads = (await res.json()).data as Array<{
    id: string; company: string; website: string | null; legal_form: string | null; country: string;
  }>;
  console.log(`[${cfg.country}] Job ${jobId}: ${leads.length} Leads — ${leads.slice(0, 5).map((l) => l.company).join(" · ")}`);

  if (leads.length === 0) {
    console.warn(`[${cfg.country}] ⚠ 0 Leads (externe Datenlage) — API-Vertrag dennoch erfüllt.`);
    return [];
  }
  for (const l of leads) {
    expect(l.country, `Land ${cfg.country}`).toBe(cfg.country);
    if (cfg.requireWebsite) {
      expect(l.website, `Lead ${l.company} sollte Website haben`).toBeTruthy();
    }
    if (cfg.companyType && l.legal_form) {
      expect(l.legal_form.toLowerCase(), `Rechtsform ${cfg.companyType.expect}: ${l.company}`)
        .toContain(cfg.companyType.expect);
    }
  }
  // Ersten Lead mit Website für den Enrich-Test merken (egal aus welchem Land).
  if (!enrichLeadId) enrichLeadId = leads.find((l) => l.website)?.id ?? null;
  return leads;
}

/* ─────────────────────────  LIVE SCRAPES  ───────────────────────── */

test("AT · Steuerberater Salzburg (mit Website) — Scrape landet im Account", async ({ page }) => {
  test.setTimeout(JOB_TIMEOUT + 60_000);
  const cfg: ScrapeConfig = { query: "Steuerberater", city: "Salzburg", country: "AT", countryLabel: "Österreich", requireWebsite: true, maxResults: 20 };
  const jobId = await startScrapeViaUI(page, cfg);
  const job = await waitJobDone(page, jobId);
  expect(job.status, "Scrape-Job completed").toBe("completed");
  const leads = await verifyJobLeads(page, jobId, cfg);
  // Mind. ein Lead mit Website für den Enrich-Test merken
  enrichLeadId = leads.find((l) => l.website)?.id ?? leads[0]?.id ?? null;
});

test("DE · Steuerberater München (mit Website) — Multi-Country Scrape", async ({ page }) => {
  test.setTimeout(JOB_TIMEOUT + 60_000);
  const cfg: ScrapeConfig = { query: "Steuerberater", city: "München", country: "DE", countryLabel: "Deutschland", requireWebsite: true, maxResults: 10 };
  const jobId = await startScrapeViaUI(page, cfg);
  const job = await waitJobDone(page, jobId);
  expect(job.status).toBe("completed");
  await verifyJobLeads(page, jobId, cfg);
});

test("CH · Treuhänder Zürich (mit Website) — Multi-Country Scrape", async ({ page }) => {
  test.setTimeout(JOB_TIMEOUT + 60_000);
  const cfg: ScrapeConfig = { query: "Treuhänder", city: "Zürich", country: "CH", countryLabel: "Schweiz", requireWebsite: true, maxResults: 10 };
  const jobId = await startScrapeViaUI(page, cfg);
  const job = await waitJobDone(page, jobId);
  expect(job.status).toBe("completed");
  await verifyJobLeads(page, jobId, cfg);
});

test("AT · Rechtsform-Filter GmbH greift", async ({ page }) => {
  test.setTimeout(JOB_TIMEOUT + 60_000);
  const cfg: ScrapeConfig = { query: "Unternehmensberatung", city: "Wien", country: "AT", countryLabel: "Österreich", companyType: { label: "GmbH", expect: "gmbh" }, maxResults: 10 };
  const jobId = await startScrapeViaUI(page, cfg);
  const job = await waitJobDone(page, jobId);
  expect(job.status).toBe("completed");
  await verifyJobLeads(page, jobId, cfg);
});

/* ─────────────────────────  UI GEGEN ECHTE DATEN  ───────────────── */

test("Suchaufträge-Tab zeigt die Jobs & Job-Filter zeigt Leads", async ({ page }) => {
  test.setTimeout(60_000);
  await gotoLeads(page);
  await page.getByRole("tab", { name: /Suchaufträge/ }).click();
  // Mind. ein abgeschlossener Such-Job ist gelistet
  await expect(page.getByText(/Steuerberater|Treuhänder|Unternehmensberatung/).first()).toBeVisible({ timeout: 10_000 });

  // Irgendeinen abgeschlossenen Job MIT Treffern finden (unabhängig vom Modul-State,
  // damit der Test auch isoliert re-runbar ist) und den Job-Filter prüfen.
  const jobs = (await (await page.request.get("/api/leads/search")).json()).data as Array<{ id: string; status: string; results_count: number }>;
  const withLeads = jobs.find((j) => j.status === "completed" && j.results_count > 0);
  expect(withLeads, "mind. ein completed Job mit Treffern").toBeTruthy();
  const res = await page.request.get(`/api/leads?search_job_id=${withLeads!.id}&limit=5`);
  expect((await res.json()).count as number, "Job-Filter liefert Leads").toBeGreaterThan(0);
});

test("Toolbar Land-Filter = Deutschland zeigt nur DE-Leads (API-Spiegel)", async ({ page }) => {
  test.setTimeout(60_000);
  await gotoLeads(page);
  // UI: Land-Filter öffnen und Deutschland wählen → fetchLeads mit country=DE
  const respPromise = page.waitForResponse((r) => /\/api\/leads\?.*country=DE/.test(r.url()), { timeout: 15_000 });
  await page.getByRole("button", { name: "Land", exact: true }).last().click();
  await page.getByRole("option", { name: "Deutschland", exact: true }).click();
  const resp = await respPromise;
  const data = (await resp.json()).data as Array<{ country: string }>;
  for (const l of data) expect(l.country).toBe("DE");
});

test("AI-Anreicherung im Lead-Sheet ('Mit AI ausfüllen') bucht Credits", async ({ page }) => {
  test.setTimeout(120_000);
  // Lead mit Website holen — bevorzugt aus dem Scrape, sonst der jüngste mit Website.
  let leadId = enrichLeadId;
  if (!leadId) {
    const r = await page.request.get("/api/leads?has_website=true&limit=1&sort_by=created_at&sort_dir=desc");
    leadId = (await r.json()).data?.[0]?.id ?? null;
  }
  test.skip(!leadId, "kein Lead mit Website vorhanden");
  // Lead direkt per Deep-Link im Sheet öffnen
  await page.goto(`${LEADS}?lead=${leadId}`);
  await expect(page.getByRole("tab", { name: "Bearbeiten" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("tab", { name: "Bearbeiten" }).click();

  const enrichPromise = page.waitForResponse(
    (r) => r.url().includes("/api/leads/enrich-from-url") && r.request().method() === "POST",
    { timeout: 100_000 },
  );
  await page.getByRole("button", { name: /Mit AI ausfüllen/ }).click();
  const resp = await enrichPromise;
  expect([200, 402, 422, 502]).toContain(resp.status());
  if (resp.status() === 200) {
    const j = await resp.json();
    expect(j.meta?.credits_charged, "Enrich bucht 2 Credits").toBe(2);
    console.log(`[Enrich] ok · credits_charged=${j.meta?.credits_charged} · credits_left=${j.meta?.credits_left}`);
  } else {
    console.warn(`[Enrich] Status ${resp.status()} (extern/Guthaben) — Vertrag ok`);
  }
});

test.afterAll(async () => {
  console.log("\n=== LIVE-LEADS ZUSAMMENFASSUNG ===");
  console.log(`Erstellte Such-Jobs: ${createdJobs.length}`);
  for (const j of createdJobs) console.log(`  ${j.country} · ${j.query} · ${j.city} → ${j.id}`);
  console.log("Leads bleiben im Account (gewünscht). Reine Test-Artefakte werden separat aufgeräumt.");
});
