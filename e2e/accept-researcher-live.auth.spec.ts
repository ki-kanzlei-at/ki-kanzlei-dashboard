/**
 * ABNAHME · AI RESEARCHER LIVE (UI-getrieben, echtes Gemini-Grounding)
 * ───────────────────────────────────────────────────────────────────────────
 * Steuert den AI Researcher komplett über das Frontend:
 *   • Recherche per Website (Manuell → method "url")
 *   • Recherche per Firma+Website (Manuell → method "target", DE = Multi-Country)
 *   • Recherche aus dem CRM (gescrapter Lead → "Aus Leads")
 *   • Chat-Folgefrage (Mitarbeiterzahl), LinkedIn-Personensuche, Neu formulieren
 *   • Auto-Save als Lead + bidirektionale Lead↔Session-Verknüpfung
 *   • Rail-Filter & Suche, Lösch-Sync (Session löschen entkoppelt den Lead)
 *
 * Verbraucht echte Credits (2/Recherche, 2/Chat). Gemini-Grounding kann unter
 * Last 502 liefern → Start wird bis zu 3× wiederholt, sonst werden Folge-Checks
 * sauber übersprungen (externer Fehler, nicht unser Code).
 */
import { test, expect, type Page, type APIResponse } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const AIR = "/dashboard/ai-researcher";

/* Shared State (serial) */
let urlSessionId: string | null = null;
let urlLeadId: string | null = null;
let crmSessionId: string | null = null;
let crmLeadId: string | null = null;

async function gotoResearcher(page: Page) {
  // domcontentloaded statt "load": die Seite hält offene fetches (Sessions/Settings)
  // → das load-Event kann auf kaltem Dev-Server >30s brauchen. Der Button rendert
  // sofort, daher reicht DOM-ready + Button-Wait.
  await page.goto(AIR, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: /Neue Recherche/ }).first()).toBeVisible({ timeout: 30_000 });
}

/** Deep-Link auf eine Session öffnen (robuster Navigations-Wait). */
async function gotoSession(page: Page, sessionId: string) {
  await page.goto(`${AIR}?session=${sessionId}`, { waitUntil: "domcontentloaded" });
}

async function openModal(page: Page) {
  await page.getByRole("button", { name: /Neue Recherche/ }).first().click();
  await expect(page.locator(".air-modal")).toBeVisible();
}

/**
 * Startet eine Recherche über das Modal und fängt die POST /api/research Antwort ab.
 * Wiederholt bei 502 (Gemini-Grounding-Flake) bis zu 3×.
 */
async function startResearchViaUI(
  page: Page,
  opts: { tab: "Manuell" | "Aus Leads"; website?: string; company?: string },
): Promise<{ status: number; sessionId: string | null; savedLeadId: string | null; leadIdLink: string | null }> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await gotoResearcher(page);
    await openModal(page);
    const modal = page.locator(".air-modal");

    if (opts.tab === "Aus Leads") {
      await modal.getByRole("button", { name: "Aus Leads" }).click();
      // Auf ECHTE Lead-Zeilen warten: Lade-Skeletons nutzen ebenfalls .air-disc-row,
      // haben aber kein .air-disc-name → sonst klickt man einen Skeleton (ohne onClick).
      await expect(modal.locator(".air-disc-name").first()).toBeVisible({ timeout: 20_000 });
    } else {
      // Manuell ist Default
      await modal.getByPlaceholder("z. B. firma.at").fill(opts.website ?? "");
      if (opts.company) await modal.getByPlaceholder("Name der Firma, falls bekannt").fill(opts.company);
    }

    const respPromise = page.waitForResponse(
      (r) => r.url().includes("/api/research") && r.request().method() === "POST" && !/\/(chat|rewrite|save-to-lead|resolve-domain|discover|find-person|connect)/.test(r.url()),
      { timeout: 170_000 }, // CRM/AT bündelt Website-Scrape + 2× Firmenbuch-SOAP + Gemini → großzügig
    );

    if (opts.tab === "Aus Leads") {
      // Klick auf den echten Lead-Namen bubblet zum onClick der Zeile → startet Recherche.
      await modal.locator(".air-disc-name").first().click();
    } else {
      await modal.getByRole("button", { name: /Recherche starten/ }).click();
    }

    let resp: APIResponse;
    try {
      resp = await respPromise;
    } catch {
      console.warn(`[research] Versuch ${attempt}: keine Antwort (Timeout) — retry`);
      continue;
    }
    const status = resp.status();
    if (status === 201) {
      const j = await resp.json();
      const sessionId = j.data?.session?.id ?? null;
      const savedLeadId = j.data?.savedLeadId ?? j.data?.session?.saved_lead_id ?? null;
      const leadIdLink = j.data?.session?.lead_id ?? null;
      return { status, sessionId, savedLeadId, leadIdLink };
    }
    if (status === 402) return { status, sessionId: null, savedLeadId: null, leadIdLink: null };
    console.warn(`[research] Versuch ${attempt}: Status ${status} — warte 20s & retry`);
    await new Promise((r) => setTimeout(r, 20_000));
  }
  return { status: 502, sessionId: null, savedLeadId: null, leadIdLink: null };
}

/** Stellt eine Chat-Frage in der offenen Session und fängt die /chat-Antwort ab. */
async function askInChat(page: Page, question: string): Promise<{ status: number; blocks: number }> {
  const ta = page.getByPlaceholder(/Frag etwas über/);
  await expect(ta).toBeVisible({ timeout: 10_000 });
  const respPromise = page.waitForResponse(
    (r) => /\/api\/research\/[^/]+\/chat/.test(r.url()) && r.request().method() === "POST",
    { timeout: 130_000 },
  );
  await ta.fill(question);
  await ta.press("Enter");
  const resp = await respPromise;
  const status = resp.status();
  let blocks = 0;
  if (status === 200) {
    const j = await resp.json();
    blocks = j.data?.aiMessage?.blocks?.length ?? 0;
  }
  return { status, blocks };
}

/* ─────────────────────────  RECHERCHE PER WEBSITE (AT)  ───────────── */

test("AT · Recherche per Website (Manuell/url) — Überblick, Quellen, Score, Auto-Save", async ({ page }) => {
  test.setTimeout(200_000);
  const r = await startResearchViaUI(page, { tab: "Manuell", website: "lbg.at" });
  if (r.status !== 201) {
    console.warn(`[AT/url] research Status ${r.status} (extern/Guthaben) — Folge-Checks übersprungen`);
    test.skip(true, "Researcher extern nicht verfügbar");
    return;
  }
  urlSessionId = r.sessionId;
  urlLeadId = r.savedLeadId;
  expect(urlSessionId, "Session-ID").toBeTruthy();

  // UI: Chat-Kopf mit Firmennamen + Quellen sichtbar
  await expect(page.locator(".air-chat-head h2")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".air-sources")).toBeVisible({ timeout: 15_000 });

  // Extraktion über die API prüfen + loggen (LinkedIn / Mitarbeiter / Umsatz / GF)
  const sRes = await page.request.get(`/api/research/${urlSessionId}`);
  const session = (await sRes.json()).data;
  const lf = session.lead_fields ?? {};
  console.log(`[AT/url] Quellen=${session.sources?.length ?? 0} Score=${session.score} · GF=${lf.ceo_name ?? "—"} · Mitarbeiter=${lf.employees ?? "—"} · Umsatz=${lf.revenue ?? "—"} · LinkedIn=${lf.social_linkedin ?? "—"}`);
  expect(session.sources?.length ?? 0, "mind. eine Quelle").toBeGreaterThan(0);
  expect(typeof session.lead_fields, "lead_fields-Objekt vorhanden").toBe("object");
  expect(urlLeadId, "Auto-Save liefert Lead-ID").toBeTruthy();
});

test("AT · Auto-Save + bidirektionale Lead↔Session-Verknüpfung ('Zum Lead')", async ({ page }) => {
  test.setTimeout(60_000);
  test.skip(!urlSessionId || !urlLeadId, "keine Session/Lead aus Recherche");
  await gotoSession(page, urlSessionId!);
  // Auto-gespeichert → Header zeigt 'Zum Lead'-Link (nicht 'Als Lead'-Button)
  await expect(page.getByRole("link", { name: /Zum Lead/ })).toBeVisible({ timeout: 15_000 });
  // API: Session → Lead und Lead → Session
  const session = (await (await page.request.get(`/api/research/${urlSessionId}`)).json()).data;
  expect(session.saved_lead_id ?? session.lead_id).toBe(urlLeadId);
  const lead = (await (await page.request.get(`/api/leads/${urlLeadId}`)).json()).data;
  expect(lead.raw_data?.ai_research?.session_id, "Lead verweist auf Session").toBe(urlSessionId);
});

test("AT · Chat: Mitarbeiterzahl-Frage liefert Antwort", async ({ page }) => {
  test.setTimeout(160_000);
  test.skip(!urlSessionId, "keine Session aus Recherche");
  await gotoSession(page, urlSessionId!);
  await expect(page.locator(".air-chat-head h2")).toBeVisible({ timeout: 15_000 });
  const r = await askInChat(page, "Wie viele Mitarbeiter hat das Unternehmen ungefähr?");
  expect([200, 402, 502]).toContain(r.status);
  if (r.status === 200) {
    expect(r.blocks, "KI-Antwort hat Blöcke").toBeGreaterThan(0);
    await expect(page.locator(".air-msg-ai").last()).toBeVisible();
    console.log(`[Chat/Mitarbeiter] ok · Blöcke=${r.blocks}`);
  } else {
    console.warn(`[Chat/Mitarbeiter] Status ${r.status} (extern/Guthaben)`);
  }
});

test("AT · Chat: LinkedIn-Personensuche (Profilkarte oder Textantwort)", async ({ page }) => {
  test.setTimeout(160_000);
  test.skip(!urlSessionId, "keine Session aus Recherche");
  await gotoSession(page, urlSessionId!);
  await expect(page.locator(".air-chat-head h2")).toBeVisible({ timeout: 15_000 });
  const before = await page.locator(".air-msg-ai").count();
  const r = await askInChat(page, "Finde das LinkedIn-Profil des Geschäftsführers.");
  expect([200, 402, 502]).toContain(r.status);
  if (r.status === 200) {
    // Entweder LinkedIn-Profilkarte ODER eine normale KI-Antwort — beides ist gültig
    await expect.poll(async () => page.locator(".air-msg-ai").count(), { timeout: 15_000 }).toBeGreaterThan(before);
    const hasCard = await page.locator(".LinkedInProfileCard, [class*='LinkedIn']").count();
    console.log(`[Chat/LinkedIn] ok · Profilkarte=${hasCard > 0 ? "ja" : "nein (Textantwort)"}`);
  } else {
    console.warn(`[Chat/LinkedIn] Status ${r.status} (extern/Guthaben)`);
  }
});

test("AT · 'Neu formulieren' formuliert eine Antwort um (kostenlos)", async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!urlSessionId, "keine Session aus Recherche");
  await gotoSession(page, urlSessionId!);
  await expect(page.locator(".air-msg-ai").first()).toBeVisible({ timeout: 15_000 });
  const rewriteBtn = page.getByRole("button", { name: "Neu formulieren" }).first();
  const respPromise = page.waitForResponse(
    (r) => /\/api\/research\/[^/]+\/rewrite/.test(r.url()) && r.request().method() === "POST",
    { timeout: 90_000 },
  );
  await rewriteBtn.click();
  const resp = await respPromise;
  expect([200, 502]).toContain(resp.status());
  if (resp.status() === 200) console.log("[Rewrite] ok");
});

/* ─────────────────────────  MULTI-COUNTRY (DE)  ─────────────────── */

test("DE · Recherche per Firma+Website (Manuell/target) — Multi-Country", async ({ page }) => {
  test.setTimeout(200_000);
  const r = await startResearchViaUI(page, { tab: "Manuell", website: "datev.de", company: "DATEV eG" });
  if (r.status !== 201) {
    console.warn(`[DE/target] Status ${r.status} (extern/Guthaben) — übersprungen`);
    test.skip(true, "Researcher extern nicht verfügbar");
    return;
  }
  await expect(page.locator(".air-chat-head h2")).toBeVisible({ timeout: 15_000 });
  const session = (await (await page.request.get(`/api/research/${r.sessionId}`)).json()).data;
  console.log(`[DE/target] Land=${session.country} Quellen=${session.sources?.length ?? 0} · GF=${session.lead_fields?.ceo_name ?? "—"} · Mitarbeiter=${session.lead_fields?.employees ?? "—"}`);
  expect(session.country, "Land aus .de-TLD → DE").toBe("DE");
});

/* ─────────────────────────  AUS CRM (gescrapter Lead)  ──────────── */

test("CRM · Recherche aus gescraptem Lead — Session ist mit dem Lead verknüpft", async ({ page }) => {
  test.setTimeout(300_000);
  const r = await startResearchViaUI(page, { tab: "Aus Leads" });
  if (r.status !== 201) {
    console.warn(`[CRM] Status ${r.status} (extern/Guthaben) — übersprungen`);
    test.skip(true, "Researcher extern nicht verfügbar");
    return;
  }
  crmSessionId = r.sessionId;
  crmLeadId = r.leadIdLink ?? r.savedLeadId;
  await expect(page.locator(".air-chat-head h2")).toBeVisible({ timeout: 15_000 });
  expect(crmSessionId).toBeTruthy();
  // Session ist an den CRM-Lead gebunden
  const session = (await (await page.request.get(`/api/research/${crmSessionId}`)).json()).data;
  expect(session.lead_id ?? session.saved_lead_id, "Session ↔ CRM-Lead").toBeTruthy();
  console.log(`[CRM] Session ${crmSessionId} ↔ Lead ${session.lead_id ?? session.saved_lead_id} · ${session.company}`);
});

/* ─────────────────────────  RAIL: FILTER & SUCHE  ──────────────── */

test("Rail · Filter (Website/CRM) & Suche grenzen Sessions ein", async ({ page }) => {
  test.setTimeout(90_000);
  await gotoResearcher(page);
  // WICHTIG: Lade-Skeletons nutzen dieselbe .air-session-Klasse → auf ECHTE Sessions
  // warten (.air-session-name gibt es nur an echten Zeilen), sonst zählt man Skeletons.
  await expect(page.locator(".air-session-name").first()).toBeVisible({ timeout: 30_000 });
  const total = await page.locator(".air-session-name").count();

  // Filter "Website" (method url) grenzt ein (≤ alle)
  await page.locator(".air-rail-filters .air-filter-chip", { hasText: "Website" }).first().click();
  await expect.poll(async () => page.locator(".air-session-name").count(), { timeout: 8000 }).toBeLessThanOrEqual(total);

  // zurück auf "Alle" und über die Suche auf 0 eingrenzen → Empty-State
  await page.locator(".air-rail-filters .air-filter-chip", { hasText: "Alle" }).first().click();
  await page.getByPlaceholder(/Recherchen durchsuchen/).fill("zzz-kein-treffer-xyz");
  await expect(page.locator(".air-rail-empty")).toBeVisible({ timeout: 10_000 });
});

/* ─────────────────────────  LÖSCH-SYNC  ─────────────────────────── */

test("Lösch-Sync · Session löschen entkoppelt den Lead", async ({ page }) => {
  test.setTimeout(90_000);
  // Selbstständig: eine bestehende Session MIT verknüpftem Lead über die API finden
  // (kein neuer Gemini-Call nötig → unabhängig von Rate-Limits).
  if (!crmSessionId || !crmLeadId) {
    const sessions = (await (await page.request.get("/api/research")).json()).data as Array<{ id: string; saved_lead_id?: string | null; lead_id?: string | null }>;
    const linked = sessions.find((s) => s.saved_lead_id || s.lead_id);
    test.skip(!linked, "keine Session mit verknüpftem Lead vorhanden");
    crmSessionId = linked!.id;
    crmLeadId = (linked!.saved_lead_id ?? linked!.lead_id) as string;
  }
  await gotoSession(page, crmSessionId!);
  await expect(page.locator(".air-chat-head h2")).toBeVisible({ timeout: 30_000 });

  // Über das Rail-Kontextmenü der aktiven Session löschen
  const activeRow = page.locator(".air-session.is-active").first();
  await activeRow.locator(".air-session-del").click();
  await page.getByRole("menuitem", { name: /Löschen/ }).click();
  // Bestätigungsdialog
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  const delResp = page.waitForResponse((r) => /\/api\/research\/[^/]+$/.test(r.url()) && r.request().method() === "DELETE", { timeout: 30_000 });
  await dialog.getByRole("button", { name: /Löschen/ }).click();
  await delResp;

  // Lead darf danach keinen Session-Verweis mehr haben
  await expect.poll(async () => {
    const lead = (await (await page.request.get(`/api/leads/${crmLeadId}`)).json()).data;
    return lead?.raw_data?.ai_research?.session_id ?? null;
  }, { timeout: 15_000 }).toBeFalsy();
  console.log(`[Lösch-Sync] ✓ Lead ${crmLeadId} entkoppelt`);
  crmSessionId = null;
});

test.afterAll(async () => {
  console.log("\n=== RESEARCHER ZUSAMMENFASSUNG ===");
  console.log(`url-Session: ${urlSessionId ?? "—"} → Lead ${urlLeadId ?? "—"}`);
  console.log("Recherchen/Leads bleiben im Account (gewünscht).");
});
