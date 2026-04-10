/* ── Next.js Instrumentation Hook ──
 * Wird einmalig beim Server-Start ausgeführt.
 * Startet den Cron Scheduler auf Railway (persistenter Node.js Prozess).
 */

export async function register() {
  // Nur im Node.js Runtime ausführen (nicht in Edge Runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCronScheduler } = await import("./lib/cron/scheduler");
    startCronScheduler();
  }
}
