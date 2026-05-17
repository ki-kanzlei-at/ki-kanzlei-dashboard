/* ── Next.js Instrumentation Hook ──
 * Wird einmalig beim Server-Start ausgeführt.
 * 1. Startet den Cron Scheduler auf Railway (persistenter Node.js Prozess).
 * 2. Markiert stuck Jobs als failed (Recovery nach Server-Restart).
 */

export async function register() {
  // Nur im Node.js Runtime ausführen (nicht in Edge Runtime)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Cron Scheduler starten
  const { startCronScheduler } = await import("./lib/cron/scheduler");
  startCronScheduler();

  // Stuck Job Recovery
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
    const admin = getSupabaseAdmin();

    // Jobs die >15 Minuten auf "running" stehen → als failed markieren
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const { data, error } = await admin
      .from("search_jobs")
      .update({
        status: "failed",
        error_message: "Server-Neustart: Job wurde unterbrochen. Bitte erneut starten.",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("status", "running")
      .lt("updated_at", fifteenMinAgo)
      .select("id");

    if (error) {
      console.error("[Startup] Fehler beim Recovery stuck Jobs:", error.message);
    } else if (data && data.length > 0) {
      console.log(`[Startup] ${data.length} stuck Job(s) als failed markiert:`, data.map((j) => j.id));
    } else {
      console.log("[Startup] Keine stuck Jobs gefunden.");
    }
  } catch (err) {
    // Nicht kritisch — App soll trotzdem starten
    console.error("[Startup] Recovery fehlgeschlagen:", err);
  }
}
