/**
 * Login-Seite — Validierung & Fehlerpfade.
 * Kein Auth nötig, deshalb .public.spec.ts.
 *
 * Hinweis: shadcn FormLabel bindet nicht via htmlFor an das Input.
 * Deshalb selektieren wir über Placeholder/Role statt getByLabel.
 */

import { test, expect } from "@playwright/test";

const emailInput = (page: import("@playwright/test").Page) =>
  page.getByRole("textbox", { name: "E-Mail Adresse" });

const passwordInput = (page: import("@playwright/test").Page) =>
  page.getByPlaceholder("Dein Passwort");

test.describe("Login-Seite", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("Page rendert mit allen wichtigen Elementen", async ({ page }) => {
    await expect(page.getByText("Willkommen zurück")).toBeVisible();
    await expect(emailInput(page)).toBeVisible();
    await expect(passwordInput(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Zum Dashboard" })).toBeVisible();
    await expect(page.getByRole("button", { name: /passwort vergessen/i })).toBeVisible();
  });

  test("Leeres Formular zeigt beide Pflichtfeld-Fehler", async ({ page }) => {
    await page.getByRole("button", { name: "Zum Dashboard" }).click();
    await expect(page.getByText("E-Mail ist erforderlich")).toBeVisible();
    await expect(page.getByText("Passwort ist erforderlich")).toBeVisible();
  });

  test("Ungültige E-Mail-Format wird abgefangen (Browser- oder zod-Validation)", async ({ page }) => {
    await emailInput(page).fill("kein-email");
    await passwordInput(page).fill("irgendwas123");
    await page.getByRole("button", { name: "Zum Dashboard" }).click();

    // Entweder: zod-Fehler im UI sichtbar
    // Oder: Browser blockiert via type=email native validation → Input ist :invalid
    const zodErr = await page.getByText("Keine gültige E-Mail").isVisible().catch(() => false);
    if (!zodErr) {
      const isInvalid = await emailInput(page).evaluate((el: HTMLInputElement) => !el.validity.valid);
      expect(isInvalid).toBeTruthy();
    }
    // Form darf NICHT abgeschickt sein → wir sind weiterhin auf /login
    await expect(page).toHaveURL(/\/login/);
  });

  test("Falsche Credentials zeigen Fehler-Alert", async ({ page }) => {
    await emailInput(page).fill("nonexistent-test-user@example.com");
    await passwordInput(page).fill("falsches-passwort-123");
    await page.getByRole("button", { name: "Zum Dashboard" }).click();
    await expect(
      page.getByText(/E-Mail oder Passwort.*falsch|noch nicht bestätigt|Kein Konto|Anmeldung fehlgeschlagen/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Passwort-Show-Toggle wechselt input-type", async ({ page }) => {
    const pw = passwordInput(page);
    await pw.fill("geheim123");
    await expect(pw).toHaveAttribute("type", "password");

    // Toggle: ghost-icon-Button direkt im 'relative' Wrapper des Inputs
    const wrapper = pw.locator("xpath=ancestor::div[contains(@class,'relative')][1]");
    await wrapper.getByRole("button").click();
    await expect(pw).toHaveAttribute("type", "text");
  });

  test("Passwort-vergessen Flow öffnet Reset-Form", async ({ page }) => {
    await page.getByRole("button", { name: /passwort vergessen/i }).click();
    await expect(page.getByText("Passwort zurücksetzen")).toBeVisible();
    await expect(page.getByRole("button", { name: "Link senden" })).toBeVisible();

    await page.getByRole("button", { name: /zurück zur anmeldung/i }).click();
    await expect(page.getByText("Willkommen zurück")).toBeVisible();
  });

  test("Reset-Form: leere E-Mail wird gefangen", async ({ page }) => {
    await page.getByRole("button", { name: /passwort vergessen/i }).click();
    await page.getByRole("button", { name: "Link senden" }).click();
    await expect(page.getByText("E-Mail ist erforderlich")).toBeVisible();
  });
});
