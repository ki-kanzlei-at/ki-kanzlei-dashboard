/**
 * API-Integration-Tests: hit die echten Backend-Routes mit der gespeicherten Session.
 *
 * Cleanup: jedes test erzeugt seinen eigenen Job und löscht ihn am Ende —
 * keine Daten-Müll-Akkumulation in der DB.
 */

import { test, expect } from "@playwright/test";

test.describe("Health-Check (public)", () => {
  test("GET /api/health antwortet 200 mit Status-Info", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("status");
  });
});

test.describe("API: /api/leads/search", () => {
  test("GET liefert die Jobliste des authentifizierten Users", async ({ page }) => {
    const res = await page.request.get("/api/leads/search");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("POST ohne query gibt 400", async ({ page }) => {
    const res = await page.request.post("/api/leads/search", {
      data: { location: "Wien" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Suchbegriff|erforderlich/i);
  });

  test("POST ohne location/city gibt 400", async ({ page }) => {
    const res = await page.request.post("/api/leads/search", {
      data: { query: "Anwalt" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Standort|Stadt|erforderlich/i);
  });

  test("POST mit gültigen Daten erstellt Job (status: pending) und gibt queued-Flag", async ({ page }) => {
    const res = await page.request.post("/api/leads/search", {
      data: {
        query: "TEST_E2E_API_DELETE_ME",   // unique query string für späteres Cleanup
        city: "Mondsee",
        country: "AT",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data).toMatchObject({
      query: "TEST_E2E_API_DELETE_ME",
      status: expect.stringMatching(/pending|running/),
    });
    expect(body.data).toHaveProperty("id");
    expect(body).toHaveProperty("queued");

    // CLEANUP: Sofort cancel + delete damit kein echter Pipeline-Run anläuft
    const jobId = body.data.id;
    // Status auf failed setzen damit die Pipeline beim ersten cancellation-check abbricht
    await page.request.patch(`/api/leads/search/${jobId}`, {
      data: { status: "failed", error_message: "E2E Test Cleanup" },
    });
    const delRes = await page.request.delete(`/api/leads/search/${jobId}`);
    expect(delRes.ok()).toBeTruthy();
  });
});

test.describe("API: /api/leads/search/[id] — Einzeloperationen", () => {
  let createdJobId: string;

  test.beforeEach(async ({ page }) => {
    const res = await page.request.post("/api/leads/search", {
      data: {
        query: "TEST_E2E_ITEMOPS_DELETE_ME",
        city: "Mondsee",
        country: "AT",
      },
    });
    createdJobId = (await res.json()).data.id;
    // Sofort failed-cancel, damit kein echter Pipeline-Run startet
    await page.request.patch(`/api/leads/search/${createdJobId}`, {
      data: { status: "failed", error_message: "E2E Test (vor afterEach)" },
    });
  });

  test.afterEach(async ({ page }) => {
    if (createdJobId) {
      await page.request.delete(`/api/leads/search/${createdJobId}`).catch(() => {});
    }
  });

  test("DELETE löscht den Job", async ({ page }) => {
    const res = await page.request.delete(`/api/leads/search/${createdJobId}`);
    expect(res.ok()).toBeTruthy();
    createdJobId = ""; // Markiere als gelöscht für afterEach

    // GET sollte ihn nicht mehr in der Liste haben
    const listRes = await page.request.get("/api/leads/search");
    const list = await listRes.json();
    expect(list.data.find((j: { id: string }) => j.id === createdJobId)).toBeUndefined();
  });

  test("POST retry auf failed-Job: setzt Status auf pending ODER 400 wenn Race", async ({ page }) => {
    // Wir können nicht garantieren dass das PATCH auf failed nicht von der laufenden Pipeline
    // wieder überschrieben wird (status=running). Daher: beide Outcomes valide.
    const res = await page.request.post(`/api/leads/search/${createdJobId}/retry`);
    if (res.ok()) {
      const body = await res.json();
      expect(body.data.status).toBe("pending");
    } else {
      // 400 wenn Job aktuell nicht failed (Pipeline hat status=running gesetzt)
      expect(res.status()).toBe(400);
    }
    // Cleanup im afterEach
    await page.request.patch(`/api/leads/search/${createdJobId}`, {
      data: { status: "failed", error_message: "E2E Test (nach Retry)" },
    });
  });

  test("DELETE auf nicht-existierende ID gibt nicht 500", async ({ page }) => {
    // Random valide UUID, die nicht existiert
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await page.request.delete(`/api/leads/search/${fakeId}`);
    // Akzeptiert 404 oder 200 mit success — Hauptsache kein Server-Crash
    expect([200, 404]).toContain(res.status());
  });

  test("DELETE mit ungültigem UUID-Format gibt 400", async ({ page }) => {
    const res = await page.request.delete("/api/leads/search/nicht-eine-uuid");
    expect(res.status()).toBe(400);
  });
});

test.describe("API: /api/leads/search/bulk", () => {
  test("DELETE bulk löscht alle übergebenen IDs", async ({ page }) => {
    // 2 jobs erstellen
    const created: string[] = [];
    for (let i = 0; i < 2; i++) {
      const r = await page.request.post("/api/leads/search", {
        data: { query: `TEST_E2E_BULK_${i}_DELETE_ME`, city: "Mondsee", country: "AT" },
      });
      const id = (await r.json()).data.id;
      created.push(id);
      // Sofort cancel
      await page.request.patch(`/api/leads/search/${id}`, {
        data: { status: "failed", error_message: "E2E Bulk Test" },
      });
    }

    // Bulk-Delete
    const res = await page.request.delete("/api/leads/search/bulk", { data: { ids: created } });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.deleted).toBe(2);
  });

  test("DELETE bulk mit leerem ids-Array gibt 400", async ({ page }) => {
    const res = await page.request.delete("/api/leads/search/bulk", { data: { ids: [] } });
    expect(res.status()).toBe(400);
  });

  test("DELETE bulk mit ungültiger UUID gibt 400", async ({ page }) => {
    const res = await page.request.delete("/api/leads/search/bulk", {
      data: { ids: ["not-a-uuid"] },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("API: /api/leads", () => {
  test("GET liefert Leads-Liste mit count + page-info", async ({ page }) => {
    const res = await page.request.get("/api/leads?page=1&page_size=10");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("count");
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("GET mit search-Filter gibt gefilterte Liste zurück", async ({ page }) => {
    const res = await page.request.get("/api/leads?search=NICHT_EXISTIERENDER_SUCHBEGRIFF_XYZ");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.count).toBe(0);
  });
});

test.describe("API: Filter-Endpoints", () => {
  test("GET /api/leads/countries liefert Country-Liste", async ({ page }) => {
    const res = await page.request.get("/api/leads/countries");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.data) || Array.isArray(body)).toBe(true);
  });

  test("GET /api/leads/cities liefert City-Liste", async ({ page }) => {
    const res = await page.request.get("/api/leads/cities");
    expect(res.ok()).toBeTruthy();
  });

  test("GET /api/leads/industries liefert Industries-Liste", async ({ page }) => {
    const res = await page.request.get("/api/leads/industries");
    expect(res.ok()).toBeTruthy();
  });
});

test.describe("API: Auth-Pfad", () => {
  // Override: hier KEINE Session — wir wollen explizit unauthentifizierte Requests
  test.use({ storageState: { cookies: [], origins: [] } });

  test("Unauthentifizierter Zugriff auf /api/leads/search gibt 401", async ({ request }) => {
    const res = await request.get("/api/leads/search");
    expect(res.status()).toBe(401);
  });

  test("Unauthentifizierter POST auf /api/leads/search gibt 401", async ({ request }) => {
    const res = await request.post("/api/leads/search", {
      data: { query: "x", city: "y" },
    });
    expect(res.status()).toBe(401);
  });
});
