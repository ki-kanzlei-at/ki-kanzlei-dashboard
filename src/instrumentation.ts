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

    // 1) Jobs die noch auf "running" stehen → als pending zurücksetzen (Server-Neustart)
    //    Pipeline-State steckt im Prozess-Memory, ist verloren — Job kann nicht weiterlaufen.
    //    "pending" damit Scheduler ihn wieder einreiht, statt user "Retry" klicken zu lassen.
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: requeued, error: requeueErr } = await admin
      .from("search_jobs")
      .update({
        status: "pending",
        started_at: null,
        results_count: 0,
        total_count: null,
        estimated_end_at: null,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("status", "running")
      .gte("updated_at", fifteenMinAgo)
      .select("id");

    if (requeueErr) {
      console.error("[Startup] Requeue running-Jobs fehlgeschlagen:", requeueErr.message);
    } else if (requeued && requeued.length > 0) {
      console.log(`[Startup] ${requeued.length} unterbrochene Job(s) re-queued:`, requeued.map((j) => j.id));
    }

    // 2) Jobs die >15 Min auf "running" hängen (kein DB-Update mehr) → als failed
    const { data: stuck, error: stuckErr } = await admin
      .from("search_jobs")
      .update({
        status: "failed",
        error_message: "Timeout: Job hat nicht mehr reagiert.",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("status", "running")
      .lt("updated_at", fifteenMinAgo)
      .select("id");

    if (stuckErr) {
      console.error("[Startup] Stuck-Recovery Fehler:", stuckErr.message);
    } else if (stuck && stuck.length > 0) {
      console.log(`[Startup] ${stuck.length} stuck Job(s) als failed markiert:`, stuck.map((j) => j.id));
    }

    // 3) Scheduler-Queue ticken: alle pending Jobs (inkl. soeben re-queued) starten
    const { recoverPendingJobsOnStartup } = await import("@/lib/jobs/scheduler");
    await recoverPendingJobsOnStartup();
  } catch (err) {
    // Nicht kritisch — App soll trotzdem starten
    console.error("[Startup] Recovery fehlgeschlagen:", err);
  }
}
