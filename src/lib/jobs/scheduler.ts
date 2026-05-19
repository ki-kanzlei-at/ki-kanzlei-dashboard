/**
 * Job-Scheduler für Lead-Enrichment-Pipelines.
 *
 * Architektur:
 *   - Kein globales Job-Limit: jeder Job startet sofort, solange der User noch Slot hat.
 *   - Per-User-Limit (MAX_PER_USER_RUNNING_JOBS): begrenzt einen Kunden, schützt Fairness.
 *   - Übersteigende Jobs bleiben mit status="pending" in DB, werden FIFO nach Job-Ende gestartet.
 *   - API-Rate-Limit-Schutz erfolgt EBENE TIEFER über geminiSemaphore (cross-job),
 *     nicht über Job-Caps — das skaliert automatisch mit der Last.
 *
 * Skalierungs-Modell (Single-Node, in-process):
 *   - State liegt im Modulscope → funktioniert mit einer Railway-Instanz.
 *   - Für Multi-Node später: DB-basiertes Lock via "SELECT ... FOR UPDATE SKIP LOCKED".
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runEnrichmentPipeline } from "@/lib/enrichment/pipeline";

// Test-Hooks (in Production via Default-Implementierung)
type PipelineRunner = (p: ScheduledJobParams) => Promise<void>;
type PendingPicker = () => Promise<ScheduledJobParams | null>;
let _pipelineRunner: PipelineRunner = runEnrichmentPipeline;
let _pickNextPending: PendingPicker;
export function _setPipelineRunner(fn: PipelineRunner) { _pipelineRunner = fn; }
export function _setPickNextPending(fn: PendingPicker) { _pickNextPending = fn; }

export interface ScheduledJobParams {
  jobId: string;
  userId: string;
  query: string;
  location: string;
  country: string;
  companyType?: string;
  city?: string;
  requireCeo?: boolean;
  requireEmail?: boolean;
  requireWebsite?: boolean;
}

const MAX_PER_USER_RUNNING_JOBS = parseInt(process.env.MAX_PER_USER_RUNNING_JOBS || "5", 10);

interface RunningJob {
  userId: string;
  startedAt: number;
}

const runningJobs = new Map<string, RunningJob>();
let isTicking = false;

function countPerUser(userId: string): number {
  let n = 0;
  for (const j of runningJobs.values()) if (j.userId === userId) n++;
  return n;
}

function canStartFor(userId: string): boolean {
  return countPerUser(userId) < MAX_PER_USER_RUNNING_JOBS;
}

/**
 * Job einreihen.
 * - Wenn User-Slot frei → startet sofort, Rückgabe "started"
 * - Sonst → bleibt in DB als status="pending", Rückgabe "queued"
 */
export function enqueueJob(params: ScheduledJobParams): "started" | "queued" {
  if (canStartFor(params.userId)) {
    startJob(params);
    return "started";
  }
  console.log(
    `[Scheduler] Job ${params.jobId} (User ${params.userId}) in Queue ` +
    `(user ${countPerUser(params.userId)}/${MAX_PER_USER_RUNNING_JOBS})`,
  );
  return "queued";
}

/** Pipeline starten + Cleanup-Hook registrieren. */
function startJob(params: ScheduledJobParams): void {
  runningJobs.set(params.jobId, { userId: params.userId, startedAt: Date.now() });
  console.log(
    `[Scheduler] Job ${params.jobId} gestartet ` +
    `(total running ${runningJobs.size}, user ${countPerUser(params.userId)}/${MAX_PER_USER_RUNNING_JOBS})`,
  );

  _pipelineRunner(params)
    .catch((err) => {
      console.error(`[Scheduler] Pipeline-Fehler Job ${params.jobId}:`, err);
    })
    .finally(() => {
      runningJobs.delete(params.jobId);
      // Eigene Microtask, damit DB-Update vor tickQueue passiert
      setImmediate(() => { void tickQueue(); });
    });
}

/**
 * Schaut, ob pending Jobs in der DB warten und startet so viele wie möglich.
 * Wird nach jedem Job-Ende UND beim Server-Startup aufgerufen.
 */
export async function tickQueue(): Promise<void> {
  if (isTicking) return;
  isTicking = true;
  try {
    // Holt FIFO so viele pending-Jobs wie möglich, jeweils nur wenn der User noch Slot hat.
    // Schleife stoppt sobald pickNext nichts mehr findet (alle pending blockiert oder leer).
    while (true) {
      const next = await (_pickNextPending ?? pickNextPendingFromDB)();
      if (!next) break;
      startJob(next);
    }
  } catch (err) {
    console.error("[Scheduler] tickQueue Fehler:", err);
  } finally {
    isTicking = false;
  }
}

/**
 * Nächsten pending-Job aus DB holen, der das User-Limit nicht überschreitet.
 * FIFO über created_at, mit Per-User-Filter.
 */
async function pickNextPendingFromDB(): Promise<ScheduledJobParams | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("search_jobs")
    .select("id, user_id, query, location, country, city, company_type, require_ceo, require_email, require_website")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("[Scheduler] pickNextPending Fehler:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  for (const row of data) {
    if (runningJobs.has(row.id)) continue;
    if (countPerUser(row.user_id) >= MAX_PER_USER_RUNNING_JOBS) continue;
    return {
      jobId: row.id,
      userId: row.user_id,
      query: row.query,
      location: row.location,
      country: row.country,
      city: row.city ?? undefined,
      companyType: row.company_type ?? undefined,
      requireCeo: row.require_ceo ?? false,
      requireEmail: row.require_email ?? false,
      requireWebsite: row.require_website ?? false,
    };
  }
  return null;
}

/**
 * Beim Server-Start: alle pending Jobs einreihen.
 * Stuck-Recovery (running > 15min) macht weiterhin instrumentation.ts.
 */
export async function recoverPendingJobsOnStartup(): Promise<void> {
  await tickQueue();
}

/**
 * Position eines pending-Jobs in der Warteschlange.
 * Liefert 0 wenn nicht in der Queue (z.B. bereits running oder fertig).
 */
export async function getQueuePosition(jobId: string): Promise<number> {
  const admin = getSupabaseAdmin();
  const { data: target } = await admin
    .from("search_jobs")
    .select("created_at, status")
    .eq("id", jobId)
    .maybeSingle();

  if (!target || target.status !== "pending") return 0;

  const { count } = await admin
    .from("search_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .lt("created_at", target.created_at);

  return (count ?? 0) + 1;
}

/** Diagnostik für health-endpoint / Debug. */
export function getSchedulerStats() {
  const perUser: Record<string, number> = {};
  for (const job of runningJobs.values()) {
    perUser[job.userId] = (perUser[job.userId] || 0) + 1;
  }
  return {
    running: runningJobs.size,
    limits: {
      perUser: MAX_PER_USER_RUNNING_JOBS,
    },
    perUser,
  };
}
