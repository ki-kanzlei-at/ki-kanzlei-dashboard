import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import path from "path";

// .env.local laden (Playwright tut das nicht von selbst, anders als Next.js)
loadEnv({ path: path.resolve(__dirname, ".env.local") });

const PORT = process.env.PORT || "3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,        // wir wollen Test-Reihenfolge stabil (Suchaufträge bauen aufeinander auf)
  forbidOnly: !!process.env.CI,
  // Live-Server-E2E gegen `next dev`: vereinzelte Timing-Flakes (Popover-/Tabellen-
  // Render unter Last). 1 lokaler Retry glättet das; CI nutzt 2. In Produktion
  // (next build/start) entfällt die Dev-Server-Latenz weitgehend.
  retries: process.env.CI ? 2 : 1,
  workers: 1,                  // ein Worker — sequentielle Ausführung wie ein menschlicher Tester
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "de-DE",
    timezoneId: "Europe/Vienna",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  projects: [
    // 1) Auth-Setup läuft EINMAL vor allen Tests, schreibt storageState
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    // 2) Public Pages (Login, Register) — KEIN Auth nötig
    {
      name: "public",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /\.public\.spec\.ts/,
    },
    // 3) Authentifizierte Tests — nutzen storageState aus setup
    {
      name: "auth",
      use: {
        ...devices["Desktop Chrome"],
        storageState: ".auth/user.json",
      },
      testMatch: /\.auth\.spec\.ts/,
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: "npm run dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
