/**
 * Auth-Setup für Playwright-Tests.
 *
 * Läuft EINMAL vor allen authentifizierten Tests, loggt sich via Supabase ein
 * und speichert die Session in .auth/user.json. Spätere Tests reusen diesen State,
 * sparen Login-Roundtrips und sind reproduzierbar.
 *
 * Benötigte env vars (in .env.local oder .env.test):
 *   TEST_USER_EMAIL    — Test-Account E-Mail
 *   TEST_USER_PASSWORD — Test-Account Passwort
 */

import { test as setup, expect } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, "..", ".auth", "user.json");

setup("authenticate", async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "TEST_USER_EMAIL und TEST_USER_PASSWORD müssen in .env.local gesetzt sein. " +
      "Lege einen Test-User in Supabase an und trage die Credentials ein.",
    );
  }

  await page.goto("/login");

  // Stabile Selektoren über die Input-IDs (#login-email / #login-pwd) — Labels
  // und Placeholder ändern sich beim Redesign, die IDs bleiben.
  await page.locator("#login-email").fill(email);
  await page.locator("#login-pwd").fill(password);
  await page.getByRole("button", { name: /Anmelden/ }).click();

  // Warten bis weg von /login (Dashboard ODER Onboarding) — Session-Cookie ist
  // dann gesetzt, unabhängig vom Redirect-Ziel.
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
  await expect(page).not.toHaveURL(/\/login/);

  // Storage State speichern (Cookies + LocalStorage)
  await page.context().storageState({ path: authFile });
  console.log(`[Auth-Setup] Session gespeichert in ${authFile}`);
});
