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

  // Selektoren über Placeholder (shadcn FormLabel bindet nicht via htmlFor)
  await page.getByPlaceholder("name@firma.at").fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /Anmelden/ }).click();

  // Warten bis auf /dashboard weitergeleitet
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  await expect(page).toHaveURL(/\/dashboard/);

  // Storage State speichern (Cookies + LocalStorage)
  await page.context().storageState({ path: authFile });
  console.log(`[Auth-Setup] Session gespeichert in ${authFile}`);
});
