/* ── Cron Scheduler (Railway / persistenter Server) ──
 * Ersetzt vercel.json "crons" — läuft im Node.js Prozess via instrumentation.ts
 */

import cron from "node-cron";

export function startCronScheduler() {
  // Intern via localhost — kein Internet-Hop, kein DNS
  const baseUrl = `http://localhost:${process.env.PORT ?? 3000}`;
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error("[Cron] CRON_SECRET nicht gesetzt — Cron Jobs werden nicht gestartet");
    return;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };

  async function trigger(path: string) {
    try {
      const res = await fetch(`${baseUrl}${path}`, { method: "GET", headers });
      if (!res.ok) {
        console.error(`[Cron] ${path} → HTTP ${res.status}`);
      }
    } catch (err) {
      console.error(`[Cron] ${path} → Fehler:`, err instanceof Error ? err.message : err);
    }
  }

  // Campaign E-Mails — alle 5 Minuten
  cron.schedule("*/5 * * * *", () => trigger("/api/cron/campaign-emails"));

  // Social Media Publishing — alle 5 Minuten
  cron.schedule("*/5 * * * *", () => trigger("/api/cron/social-media-publish"));

  // LinkedIn Einladungen — Mo–Fr 08:00 UTC
  cron.schedule("0 8 * * 1-5", () => trigger("/api/cron/linkedin-invitations"));

  // LinkedIn Follow-ups — Mo–Fr 10:00 UTC
  cron.schedule("0 10 * * 1-5", () => trigger("/api/cron/linkedin-followups"));

  console.log("[Cron] Scheduler gestartet — 4 Jobs aktiv");
}
