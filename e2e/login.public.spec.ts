/**
 * Login-Seite — Validierung & Fehlerpfade.
 * Kein Auth nötig, deshalb .public.spec.ts.
 *
 * Stabile Selektoren über die Input-IDs (#login-email / #login-pwd) und den
 * sichtbaren Button-Text „Anmelden". Validierung ist clientseitig (eine Sammel-
 * meldung, kein Native-Browser-Check — das Formular nutzt noValidate).
 */

import { test, expect } from "@playwright/test";

const emailInput = (page: import("@playwright/test").Page) => page.locator("#login-email");
const passwordInput = (page: import("@playwright/test").Page) => page.locator("#login-pwd");
const submitBtn = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: /^Anmelden/ });

test.describe("Login-Seite", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("Page rendert mit allen wichtigen Elementen", async ({ page }) => {
    await expect(page.getByText("Willkommen zurück")).toBeVisible();
    await expect(emailInput(page)).toBeVisible();
    await expect(passwordInput(page)).toBeVisible();
    await expect(submitBtn(page)).toBeVisible();
    await expect(page.getByRole("button", { name: /passwort vergessen/i })).toBeVisible();
  });

  test("Leeres Formular zeigt Sammel-Fehlermeldung", async ({ page }) => {
    await submitBtn(page).click();
    await expect(page.getByText(/Bitte E-Mail und Passwort eingeben/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("Falsche Credentials zeigen Fehler-Alert", async ({ page }) => {
    await emailInput(page).fill("nonexistent-test-user@example.com");
    await passwordInput(page).fill("falsches-passwort-123");
    await submitBtn(page).click();
    await expect(
      page.getByText(/E-Mail oder Passwort.*falsch|noch nicht bestätigt|Kein Konto|fehlgeschlagen|Zu viele Anmeldeversuche/i),
    ).toBeVisible({ timeout: 15_000 });
    // Kein erfolgreicher Login → weiterhin auf /login
    await expect(page).toHaveURL(/\/login/);
  });

  test("Passwort-Show-Toggle wechselt input-type", async ({ page }) => {
    const pw = passwordInput(page);
    await pw.fill("geheim123");
    await expect(pw).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Passwort anzeigen" }).click();
    await expect(pw).toHaveAttribute("type", "text");
  });

  test("Passwort-vergessen Flow öffnet Reset-Form und zurück", async ({ page }) => {
    await page.getByRole("button", { name: /passwort vergessen/i }).click();
    await expect(page.getByText("Passwort zurücksetzen")).toBeVisible();
    await expect(page.getByRole("button", { name: "Link senden" })).toBeVisible();

    await page.getByRole("button", { name: /zurück zur anmeldung/i }).first().click();
    await expect(page.getByText("Willkommen zurück")).toBeVisible();
  });

  test("Reset-Form: leere E-Mail wird gefangen", async ({ page }) => {
    await page.getByRole("button", { name: /passwort vergessen/i }).click();
    await page.getByRole("button", { name: "Link senden" }).click();
    await expect(page.getByText(/Bitte E-Mail eingeben/i)).toBeVisible();
  });
});
