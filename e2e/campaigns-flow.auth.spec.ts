/**
 * Funktions-Verifikation Kampagnen:
 *  1. Status-Wechsel setzen Zeitstempel (last_activity, completed_at) — per API
 *     an einer Wegwerf-Kampagne ohne Empfänger (wird nie versendet).
 *  2. Wizard-Durchlauf (4 Schritte) bis zum Entwurf — inkl. Multi-Mailbox-UI,
 *     3-Schritte-Limit und Doppelkontakt-Schutz.
 *  3. Edit-Sheet: Sequenz-Editor respektiert das 3-Schritte-Limit.
 *
 * WICHTIG: Es wird NIE eine Kampagne mit Empfängern aktiviert (Prod-Cron!).
 */

import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

const SHOTS = path.join(__dirname, "..", ".playwright-shots");
test.beforeAll(() => { fs.mkdirSync(SHOTS, { recursive: true }); });
const shot = (name: string) => path.join(SHOTS, `${name}.png`);

/** Wegwerf-Kampagnen anhand des Namens-Präfixes aufräumen. */
async function cleanupByName(page: Page, prefix: string) {
  const res = await page.request.get(`/api/campaigns?search=${encodeURIComponent(prefix)}&limit=50`);
  if (!res.ok()) return;
  const json = await res.json();
  for (const c of json.data ?? []) {
    if ((c.name as string).startsWith(prefix)) {
      await page.request.delete(`/api/campaigns/${c.id}`);
    }
  }
}

test.describe("Status-Wechsel & Zeitstempel (API)", () => {
  const NAME = "ZZ-AutoTest Status";

  test("pause/complete/draft stempeln last_activity; Start ohne Empfänger blockiert", async ({ page }) => {
    await page.goto("/dashboard/campaigns");
    await cleanupByName(page, NAME);

    /* Wegwerf-Entwurf ohne Empfänger anlegen */
    const createRes = await page.request.post("/api/campaigns", {
      data: { name: NAME, lead_ids: [], status: "draft" },
    });
    expect(createRes.status()).toBe(201);
    const { data: created } = await createRes.json();
    const id = created.id as string;

    try {
      /* → pausiert */
      const t0 = Date.now();
      const pauseRes = await page.request.patch(`/api/campaigns/${id}`, {
        data: { status: "paused" },
      });
      expect(pauseRes.ok()).toBeTruthy();
      let { data: c } = await (await page.request.get(`/api/campaigns/${id}`)).json();
      expect(c.status).toBe("paused");
      expect(c.last_activity_kind).toBe("pause");
      expect(new Date(c.last_activity_at).getTime()).toBeGreaterThan(t0 - 60_000);

      /* → abgeschlossen (setzt completed_at) */
      const doneRes = await page.request.patch(`/api/campaigns/${id}`, {
        data: { status: "completed" },
      });
      expect(doneRes.ok()).toBeTruthy();
      ({ data: c } = await (await page.request.get(`/api/campaigns/${id}`)).json());
      expect(c.status).toBe("completed");
      expect(c.completed_at).toBeTruthy();
      expect(c.last_activity_kind).toBe("completed");

      /* → aktiv MUSS scheitern (keine Empfänger) — Schutz vor Leerlauf-Versand */
      const activeRes = await page.request.patch(`/api/campaigns/${id}`, {
        data: { status: "active" },
      });
      expect(activeRes.status()).toBe(400);

      /* → zurück auf Entwurf */
      const draftRes = await page.request.patch(`/api/campaigns/${id}`, {
        data: { status: "draft" },
      });
      expect(draftRes.ok()).toBeTruthy();
      ({ data: c } = await (await page.request.get(`/api/campaigns/${id}`)).json());
      expect(c.last_activity_kind).toBe("draft");

      /* Sequenz-Limit serverseitig: 5 Steps schicken → 3 bleiben */
      const seqRes = await page.request.patch(`/api/campaigns/${id}`, {
        data: {
          sequence_steps: Array.from({ length: 5 }, (_, i) => ({
            id: `s${i + 1}`, intent: `Schritt ${i + 1}`, desc: "",
          })),
          sequence_delays: Array.from({ length: 4 }, () => ({ value: 3, unit: "day" })),
        },
      });
      expect(seqRes.ok()).toBeTruthy();
      ({ data: c } = await (await page.request.get(`/api/campaigns/${id}`)).json());
      expect(c.sequence_steps.length).toBe(3);
      expect(c.steps_total).toBe(3);
      expect(c.sequence_delays.length).toBe(2);
    } finally {
      await page.request.delete(`/api/campaigns/${id}`);
    }
  });
});

test.describe("Wizard: 4 Schritte bis zum Entwurf", () => {
  const NAME = "ZZ-AutoTest Wizard";

  test("Durchlauf mit Mailbox, Empfängern, Briefing (max 3 Mails), Zeitplan", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/dashboard/campaigns");
    await cleanupByName(page, NAME);

    /* Wegwerf-Lead anlegen — beim Test-User stecken sonst u.U. alle
     * E-Mail-Leads bereits in einer Kampagne (Doppelkontakt-Filter). */
    const leadRes = await page.request.post("/api/leads", {
      data: {
        company: "ZZ-AutoTest GmbH",
        email: "autotest@example.com",
        status: "new",
      },
    });
    expect(leadRes.status()).toBe(201);
    const leadId = (await leadRes.json()).data?.[0]?.id as string;

    try {
    await page.goto("/dashboard/campaigns/new");
    await expect(page.getByRole("heading", { name: "Wer versendet?" })).toBeVisible({ timeout: 30_000 });

    /* ── Schritt 1: Mailbox(en) ──
     * Nur die Konto-Buttons (der „Neue Mailbox"-Link ist ebenfalls .choice-card). */
    const cards = page.locator("button.choice-card:not(.is-disabled)");
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    const cardCount = await cards.count();
    console.log(`[UI-Check] ${cardCount} wählbare Mailbox-Karten`);
    await cards.first().click();
    await expect(cards.first()).toHaveClass(/is-selected/);
    await page.screenshot({ path: shot("20-wiz-mailbox") });
    await page.getByRole("button", { name: "Weiter", exact: true }).click();

    /* ── Schritt 2: Empfänger ── */
    await expect(page.getByRole("heading", { name: "Empfänger auswählen" })).toBeVisible();
    await page.waitForTimeout(1500); // Leads + targeted-leads laden
    // Gezielt den Wegwerf-Lead suchen und auswählen
    await page.getByPlaceholder("Firma, Kontakt, E-Mail …").fill("ZZ-AutoTest");
    const rows = page.locator(".lead-picker-table tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    await rows.first().click();
    await expect(page.getByText("ausgewählt")).toBeVisible();
    await page.screenshot({ path: shot("21-wiz-empfaenger") });
    await page.getByRole("button", { name: "Weiter", exact: true }).click();

    /* ── Schritt 3: Name & Briefing ── */
    await expect(page.getByRole("heading", { name: "Name & Briefing" })).toBeVisible();
    await page.locator("#campaign-name").fill(NAME);
    // Briefing ggf. auffüllen (mind. 50 Zeichen für „Weiter")
    const prompt = page.locator(".prompt-area");
    if (((await prompt.inputValue()) ?? "").trim().length < 50) {
      await prompt.fill(
        "Wir sind eine Steuerberatungskanzlei aus Salzburg und bieten digitale " +
        "Buchhaltung für KMU. Ziel: ein kurzes Erstgespräch vereinbaren.",
      );
    }
    // Mail-Anzahl: auf Maximum klicken → bei 3 muss Schluss sein
    const plusBtn = page.getByRole("button", { name: "Mehr Mails" });
    await plusBtn.click();
    await expect(plusBtn).toBeDisabled(); // 2 → 3 → Limit erreicht
    await expect(page.locator(".tabular-nums", { hasText: "3" }).first()).toBeVisible();
    await page.screenshot({ path: shot("22-wiz-briefing"), fullPage: true });
    await page.getByRole("button", { name: "Weiter", exact: true }).click();

    /* ── Schritt 4: Zeitplan (vereinfacht) ── */
    await expect(page.getByRole("heading", { name: "Wann und wie viel?" })).toBeVisible();
    await expect(page.getByText("Tageslimit")).toBeVisible();
    // Vereinfachung: Zeitzone, Abstand & Tracking sind raus
    await expect(page.getByText("Zeitzone")).toHaveCount(0);
    await expect(page.getByText("Öffnungen tracken")).toHaveCount(0);
    await page.screenshot({ path: shot("23-wiz-zeitplan"), fullPage: true });
    await page.getByRole("button", { name: "Weiter", exact: true }).click();

    /* ── Review + Entwurf speichern (NICHT starten!) ── */
    await expect(page.getByRole("heading", { name: "Alles bereit" })).toBeVisible();
    await page.screenshot({ path: shot("24-wiz-review") });
    await page.getByRole("button", { name: "Als Entwurf speichern" }).click();
    await page.waitForURL(/\/dashboard\/campaigns$/, { timeout: 20_000 });

    /* Entwurf existiert? → aufräumen */
    const res = await page.request.get(`/api/campaigns?search=${encodeURIComponent(NAME)}`);
    const json = await res.json();
    const draft = (json.data ?? []).find((c: { name: string }) => c.name === NAME);
    expect(draft, "Wizard-Entwurf wurde angelegt").toBeTruthy();
    expect(draft.status).toBe("draft");
    expect(draft.steps_total).toBe(3);
    expect(draft.total_count).toBe(1);
    await page.request.delete(`/api/campaigns/${draft.id}`);

    console.log(`[UI-Check] Console-Errors: ${consoleErrors.length}`);
    consoleErrors.slice(0, 5).forEach((e) => console.log(`  ⚠ ${e.slice(0, 200)}`));
    } finally {
      if (leadId) await page.request.delete(`/api/leads/${leadId}`);
    }
  });
});

test.describe("Lead-Status umstellen", () => {
  test("alle Status inkl. interested/not_interested sind setzbar (DB-Constraint-Fix)", async ({ page }) => {
    await page.goto("/dashboard/campaigns");
    const leadRes = await page.request.post("/api/leads", {
      data: { company: "ZZ-AutoTest Status GmbH", email: "statustest@example.com", status: "new" },
    });
    expect(leadRes.status()).toBe(201);
    const leadId = (await leadRes.json()).data?.[0]?.id as string;

    try {
      for (const status of ["contacted", "interested", "not_interested", "converted", "new"]) {
        const res = await page.request.patch(`/api/leads/${leadId}`, { data: { status } });
        expect(res.ok(), `Status „${status}" muss setzbar sein`).toBeTruthy();
        const { data } = await (await page.request.get(`/api/leads/${leadId}`)).json();
        expect(data.status).toBe(status);
      }
    } finally {
      await page.request.delete(`/api/leads/${leadId}`);
    }
  });
});

test.describe("Doppelkontakt-Schutz", () => {
  const NAME = "ZZ-AutoTest Doppelkontakt";

  test("Leads aus ABGESCHLOSSENEN Kampagnen bleiben ausgeschlossen", async ({ page }) => {
    await page.goto("/dashboard/campaigns");
    await cleanupByName(page, NAME);

    const leadRes = await page.request.post("/api/leads", {
      data: { company: "ZZ-AutoTest Doppel GmbH", email: "doppel@example.com", status: "new" },
    });
    expect(leadRes.status()).toBe(201);
    const leadId = (await leadRes.json()).data?.[0]?.id as string;

    let c1Id: string | null = null;
    let c2Id: string | null = null;
    try {
      /* Kampagne 1 mit dem Lead anlegen (Entwurf) und ABSCHLIESSEN */
      const c1Res = await page.request.post("/api/campaigns", {
        data: { name: `${NAME} 1`, lead_ids: [leadId], status: "draft" },
      });
      expect(c1Res.status()).toBe(201);
      const c1Json = await c1Res.json();
      c1Id = c1Json.data.id as string;
      expect(c1Json.skipped_already_contacted).toBe(0);
      expect(c1Json.data.total_count).toBe(1);

      const completeRes = await page.request.patch(`/api/campaigns/${c1Id}`, {
        data: { status: "completed" },
      });
      expect(completeRes.ok()).toBeTruthy();

      /* targeted-leads kennt den Lead — trotz abgeschlossener Kampagne */
      const tl = await (await page.request.get("/api/campaigns/targeted-leads")).json();
      expect(tl.data).toContain(leadId);

      /* Kampagne 2 mit demselben Lead → wird serverseitig ausgefiltert */
      const c2Res = await page.request.post("/api/campaigns", {
        data: { name: `${NAME} 2`, lead_ids: [leadId], status: "draft" },
      });
      expect(c2Res.status()).toBe(201);
      const c2Json = await c2Res.json();
      c2Id = c2Json.data.id as string;
      expect(c2Json.skipped_already_contacted).toBe(1);
      expect(c2Json.data.total_count).toBe(0);

      /* Start von Kampagne 2 → blockiert (alle Leads bereits in Kampagne) */
      const startRes = await page.request.patch(`/api/campaigns/${c2Id}`, {
        data: { status: "active" },
      });
      expect(startRes.status()).toBe(400);

      /* Kampagne 1 löschen → Lead wird wieder frei (CASCADE) */
      await page.request.delete(`/api/campaigns/${c1Id}`);
      c1Id = null;
      const tl2 = await (await page.request.get("/api/campaigns/targeted-leads")).json();
      expect(tl2.data).not.toContain(leadId);
    } finally {
      if (c2Id) await page.request.delete(`/api/campaigns/${c2Id}`);
      if (c1Id) await page.request.delete(`/api/campaigns/${c1Id}`);
      if (leadId) await page.request.delete(`/api/leads/${leadId}`);
    }
  });
});

test.describe("Edit-Sheet: Sequenz-Limit", () => {
  test("Schritt hinzufügen endet bei 3", async ({ page }) => {
    await page.goto("/dashboard/campaigns");
    await expect(page.getByRole("heading", { name: "Kampagnen" })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1200);

    const rows = page.locator("table tbody tr");
    test.skip((await rows.count()) === 0, "Keine Kampagnen vorhanden");

    await rows.first().locator("td").nth(1).click();
    await page.waitForURL(/\/dashboard\/campaigns\/[\w-]+/, { timeout: 30_000 });
    await page.waitForTimeout(1500);

    await page.getByRole("button", { name: "Bearbeiten" }).first().click();
    await page.waitForTimeout(500);

    const addStep = page.getByRole("button", { name: "Schritt hinzufügen" });
    // Bis zum Limit hinzufügen — Button verschwindet bei 3 Schritten
    for (let i = 0; i < 3 && await addStep.isVisible(); i++) {
      await addStep.click();
      await page.waitForTimeout(200);
    }
    await expect(addStep).toHaveCount(0);
    await expect(page.getByText("Schritt 3")).toBeVisible();
    await page.screenshot({ path: shot("25-edit-sheet-limit") });

    // Mailbox-Mehrfachauswahl sichtbar?
    await expect(page.locator("label", { hasText: "@" }).first()).toBeVisible();

    // NICHT speichern — Sheet schließen
    await page.getByRole("button", { name: "Abbrechen" }).click();
  });
});
