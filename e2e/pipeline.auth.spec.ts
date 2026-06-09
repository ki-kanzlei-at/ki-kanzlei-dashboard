/* ── End-to-End-Pipeline (live) ──
 * Spielt die komplette Kette gegen den echten Server + echte APIs durch:
 *   Scrapen → Lead-Anreicherung ("Mit AI ausfüllen") → AI-Researcher (Auto-Save
 *   als Lead) → Chat → Lead↔Session-Sync → Lösch-Sync → Cleanup.
 *
 * Verbraucht echte Credits (Gemini). Läuft seriell (workers:1). Externe
 * Datenlage (0 Treffer) wird als Warnung geloggt, der API-Vertrag aber hart
 * geprüft — so testen wir UNSEREN Code, nicht die Trefferquote von Google.
 */
import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const TIMEOUT_SCRAPE = 180_000;

/* Shared State über die Stages hinweg */
let scrapeJobId: string | null = null;
let scrapeLeadIds: string[] = [];
let researchSessionId: string | null = null;
let researchLeadId: string | null = null;
let enrichWebsite = "liip.ch";

async function poll<T>(fn: () => Promise<T | null>, timeoutMs: number, intervalMs = 3000): Promise<T | null> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (Date.now() - start < timeoutMs) {
    const r = await fn();
    if (r) return r;
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  return null;
}

test.describe("Pipeline: Scrapen → Researcher → Sync", () => {
  test.setTimeout(TIMEOUT_SCRAPE + 60_000);

  test("1) Scrape-Job startet, läuft durch und respektiert Filter (Rechtsform/Website)", async ({ request }) => {
    const res = await request.post("/api/leads/search", {
      data: {
        query: "Steuerberater",
        city: "Salzburg",
        country: "AT",
        company_type: "gmbh",
        require_website: true,
        max_results: 2,
      },
    });
    expect(res.status(), "POST /api/leads/search sollte 201 liefern").toBe(201);
    const json = await res.json();
    expect(json.data?.id).toBeTruthy();
    scrapeJobId = json.data.id;
    console.log(`[1] Scrape-Job erstellt: ${scrapeJobId} (queued=${json.queued})`);

    const finished = await poll(async () => {
      const list = await request.get("/api/leads/search");
      if (!list.ok()) return null;
      const jobs = (await list.json()).data as Array<{ id: string; status: string; results_count: number }>;
      const job = jobs.find((j) => j.id === scrapeJobId);
      if (job && (job.status === "completed" || job.status === "failed")) return job;
      return null;
    }, TIMEOUT_SCRAPE);

    expect(finished, "Scrape-Job sollte innerhalb des Timeouts fertig werden").toBeTruthy();
    console.log(`[1] Scrape-Job Status: ${finished!.status}, results_count=${finished!.results_count}`);

    // Erstellte Leads prüfen
    const leadsRes = await request.get(`/api/leads?search_job_id=${scrapeJobId}&limit=50`);
    expect(leadsRes.ok()).toBeTruthy();
    const leads = (await leadsRes.json()).data as Array<{ id: string; legal_form: string | null; website: string | null; company: string }>;
    scrapeLeadIds = leads.map((l) => l.id);
    console.log(`[1] ${leads.length} Leads aus Scrape: ${leads.map((l) => `${l.company} (${l.legal_form ?? "?"})`).join(", ") || "—"}`);

    if (leads.length === 0) {
      console.warn("[1] ⚠ 0 Leads — externe Datenlage. API-Vertrag dennoch erfüllt.");
    } else {
      for (const l of leads) {
        expect(l.website, `Lead ${l.company} sollte Website haben (require_website)`).toBeTruthy();
        if (l.legal_form) {
          expect(l.legal_form.toLowerCase(), `Rechtsform-Filter gmbh: ${l.company}`).toContain("gmbh");
        }
      }
      // Website für den Enrich-Test wiederverwenden
      const withWeb = leads.find((l) => l.website);
      if (withWeb?.website) enrichWebsite = withWeb.website;
    }
  });

  test("2) 'Mit AI ausfüllen' (enrich-from-url) liefert Felder + bucht 2 Credits", async ({ request }) => {
    const res = await request.post("/api/leads/enrich-from-url", {
      data: { url: enrichWebsite },
      timeout: 90_000,
    });
    expect([200, 402, 422]).toContain(res.status());
    const json = await res.json();
    if (res.status() === 200) {
      expect(json.data).toBeTruthy();
      expect(json.meta?.credits_charged, "enrich kostet 2 Credits").toBe(2);
      const filled = Object.entries(json.data).filter(([, v]) => v).map(([k]) => k);
      console.log(`[2] enrich ok: Felder=${filled.join(",")} · credits_left=${json.meta?.credits_left}`);
      expect(filled.length, "mind. ein Feld vorausgefüllt").toBeGreaterThan(0);
    } else {
      console.warn(`[2] enrich Status ${res.status()}: ${json.error} (extern/Guthaben) — Vertrag ok`);
    }
  });

  test("3) AI-Researcher (manuell/Website) startet + speichert automatisch als Lead", async ({ request }) => {
    // Gemini-Grounding kann unter Last (502) zicken → bis zu 3 Versuche mit Pause.
    let res!: Awaited<ReturnType<typeof request.post>>;
    let json: { error?: string; data?: { session: { id: string; saved_lead_id?: string | null }; savedLeadId?: string | null; messages?: unknown[]; remaining?: number } } = {};
    for (let attempt = 1; attempt <= 3; attempt++) {
      res = await request.post("/api/research", {
        data: { method: "url", url: enrichWebsite },
        timeout: 120_000,
      });
      json = await res.json();
      if (res.status() === 201 || res.status() === 402) break;
      console.warn(`[3] Versuch ${attempt}: Status ${res.status()} (${json.error}) — warte 25s`);
      await new Promise((r) => setTimeout(r, 25_000));
    }
    expect([201, 402, 502]).toContain(res.status());
    if (res.status() !== 201) {
      console.warn(`[3] research Status ${res.status()}: ${json.error} — überspringe Folge-Stages`);
      test.skip(true, "Researcher nicht verfügbar (extern)");
      return;
    }
    researchSessionId = json.data.session.id;
    researchLeadId = json.data.savedLeadId ?? json.data.session.saved_lead_id ?? null;
    console.log(`[3] Session ${researchSessionId} · auto-saved Lead=${researchLeadId} · remaining=${json.data.remaining}`);
    expect(researchSessionId, "Session-ID").toBeTruthy();
    expect(researchLeadId, "Auto-Save sollte eine Lead-ID liefern").toBeTruthy();
    expect(json.data.messages?.length, "mind. eine KI-Nachricht").toBeGreaterThan(0);
  });

  test("4) Lead↔Session sind bidirektional verknüpft", async ({ request }) => {
    test.skip(!researchSessionId || !researchLeadId, "keine Session/Lead aus Stage 3");
    // Session-Seite
    const sRes = await request.get(`/api/research/${researchSessionId}`);
    expect(sRes.ok()).toBeTruthy();
    const session = (await sRes.json()).data;
    expect(session.saved_lead_id ?? session.lead_id, "Session verweist auf Lead").toBe(researchLeadId);
    // Lead-Seite
    const lRes = await request.get(`/api/leads/${researchLeadId}`);
    expect(lRes.ok()).toBeTruthy();
    const lead = (await lRes.json()).data;
    expect(lead.raw_data?.ai_research?.session_id, "Lead verweist auf Session").toBe(researchSessionId);
    console.log(`[4] ✓ bidirektionale Verknüpfung bestätigt`);
  });

  test("5) Chat im Researcher liefert eine Antwort", async ({ request }) => {
    test.skip(!researchSessionId, "keine Session aus Stage 3");
    const res = await request.post(`/api/research/${researchSessionId}/chat`, {
      data: { question: "Wie viele Mitarbeiter hat die Firma ungefähr?" },
      timeout: 120_000,
    });
    expect([200, 402, 502]).toContain(res.status());
    const json = await res.json();
    if (res.status() === 200) {
      expect(json.data.aiMessage?.blocks?.length, "KI-Antwort hat Blöcke").toBeGreaterThan(0);
      console.log(`[5] ✓ Chat-Antwort erhalten · remaining=${json.data.remaining}`);
    } else {
      console.warn(`[5] Chat Status ${res.status()}: ${json.error} (extern/Guthaben)`);
    }
  });

  test("6) Lösch-Sync: Session löschen entkoppelt den Lead", async ({ request }) => {
    test.skip(!researchSessionId || !researchLeadId, "keine Session/Lead aus Stage 3");
    const del = await request.delete(`/api/research/${researchSessionId}`);
    expect(del.ok(), "DELETE Session").toBeTruthy();
    // Lead darf danach keinen session_id-Verweis mehr haben
    const lRes = await request.get(`/api/leads/${researchLeadId}`);
    expect(lRes.ok()).toBeTruthy();
    const lead = (await lRes.json()).data;
    const sid = lead.raw_data?.ai_research?.session_id ?? null;
    expect(sid, "session_id sollte nach Session-Löschung null sein").toBeFalsy();
    console.log(`[6] ✓ Lead entkoppelt (session_id=${sid})`);
    researchSessionId = null;
  });

  test("7) Cleanup: Test-Leads + Job löschen", async ({ request }) => {
    const toDelete = [...scrapeLeadIds];
    if (researchLeadId) toDelete.push(researchLeadId);
    for (const id of toDelete) {
      const r = await request.delete(`/api/leads/${id}`);
      if (!r.ok()) console.warn(`[7] Lead ${id} löschen: ${r.status()}`);
    }
    if (scrapeJobId) {
      const r = await request.delete(`/api/leads/search/${scrapeJobId}`);
      if (!r.ok()) console.warn(`[7] Job ${scrapeJobId} löschen: ${r.status()}`);
    }
    console.log(`[7] ✓ Cleanup: ${toDelete.length} Leads + Job entfernt`);
  });
});
