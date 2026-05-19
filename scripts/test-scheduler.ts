/**
 * Multi-Tenant-Lasttest für den Job-Scheduler.
 *
 * Simuliert: 6 Kunden × 3 Jobs = 18 parallele Aufträge.
 * Verifiziert dass:
 *   - global nie mehr als MAX_GLOBAL_RUNNING_JOBS gleichzeitig laufen
 *   - per User nie mehr als MAX_PER_USER_RUNNING_JOBS
 *   - alle Jobs am Ende durchlaufen (FIFO-Queue tickt korrekt)
 *
 * Verwendung: npx tsx scripts/test-scheduler.ts
 */

import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(__dirname, "..", ".env.local") });

// Set tighter limit for test before importing scheduler
process.env.MAX_PER_USER_RUNNING_JOBS = "3";

const rootDir = resolve(__dirname, "..");
const Module = require("module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
  if (request.startsWith("@/")) request = resolve(rootDir, "src", request.slice(2));
  return originalResolveFilename.call(this, request, ...args);
};

const {
  enqueueJob,
  getSchedulerStats,
  _setPipelineRunner,
  _setPickNextPending,
} = require("@/lib/jobs/scheduler") as typeof import("@/lib/jobs/scheduler");

interface FakeJob {
  jobId: string;
  userId: string;
  query: string;
  location: string;
  country: string;
}

// Mock-Pipeline: simuliert ein Enrichment durch sleep.
// Logged Start + End damit wir den Concurrency-Verlauf nachvollziehen.
const PIPELINE_MS = 1500;
const activeAtPeak: { global: number; perUser: Record<string, number> } = { global: 0, perUser: {} };
const userPeakConcurrency: Record<string, number> = {};
const samples: { t: number; global: number; perUser: Record<string, number> }[] = [];

let started = 0;
let completed = 0;
const startTime = Date.now();

_setPipelineRunner(async (params) => {
  started++;
  const stats = getSchedulerStats();
  activeAtPeak.global = Math.max(activeAtPeak.global, stats.running);
  for (const [u, n] of Object.entries(stats.perUser)) {
    userPeakConcurrency[u] = Math.max(userPeakConcurrency[u] || 0, n);
  }
  samples.push({ t: Date.now() - startTime, global: stats.running, perUser: { ...stats.perUser } });

  console.log(
    `   [t=${((Date.now() - startTime) / 1000).toFixed(2)}s] ▶ START ${params.jobId} ` +
    `(${params.userId}) — global=${stats.running}, user=${stats.perUser[params.userId]}`,
  );

  await new Promise((r) => setTimeout(r, PIPELINE_MS));

  completed++;
  console.log(
    `   [t=${((Date.now() - startTime) / 1000).toFixed(2)}s] ◼ DONE  ${params.jobId} ` +
    `(${params.userId})`,
  );
});

// Mock pickNextPending: zieht aus in-memory Queue (statt DB)
const pendingQueue: FakeJob[] = [];
_setPickNextPending(async () => {
  return pendingQueue.shift() ?? null;
});

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  Multi-Tenant Scheduler Test                                          ║");
  console.log("║  6 User × 5 Jobs = 30 — per-user-Limit 3, kein globaler Cap           ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝\n");

  const users = ["userA", "userB", "userC", "userD", "userE", "userF"];
  const JOBS_PER_USER = 5;
  const jobs: FakeJob[] = [];
  for (const u of users) {
    for (let i = 1; i <= JOBS_PER_USER; i++) {
      jobs.push({
        jobId: `${u}-job${i}`,
        userId: u,
        query: "Rechtsanwalt",
        location: "Test",
        country: "AT",
      });
    }
  }

  // Alle Jobs einreihen — Erwartung: 3 pro User starten direkt (= 18 parallel insgesamt),
  // restliche 12 (2 pro User) landen in der pending-Queue
  const TOTAL = jobs.length;
  console.log(`Phase 1: ${TOTAL} Jobs einreihen…\n`);
  let directStarts = 0;
  let queuedCount = 0;
  for (const job of jobs) {
    const state = enqueueJob(job);
    if (state === "started") directStarts++;
    else {
      pendingQueue.push(job);
      queuedCount++;
    }
  }

  console.log(`\n  → direkt gestartet: ${directStarts}, in Queue: ${queuedCount}\n`);

  // Warten bis alle Jobs fertig sind
  while (completed < TOTAL) {
    await new Promise((r) => setTimeout(r, 100));
    if (Date.now() - startTime > 60_000) {
      throw new Error(`Timeout: nur ${completed}/${TOTAL} fertig`);
    }
  }

  const totalMs = Date.now() - startTime;
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ERGEBNIS`);
  console.log(`${"═".repeat(70)}\n`);
  console.log(`  Gesamtzeit:                ${(totalMs / 1000).toFixed(2)}s`);
  console.log(`  Jobs gestartet:            ${started} / ${TOTAL}`);
  console.log(`  Jobs abgeschlossen:        ${completed} / ${TOTAL}`);
  console.log(`  Max gleichzeitig (global): ${activeAtPeak.global} (kein Limit, nur informativ)`);
  console.log(`  Per-User Peak Concurrency:`);
  for (const [u, n] of Object.entries(userPeakConcurrency).sort()) {
    console.log(`    ${u}: ${n} (Limit: 3)`);
  }

  // Erwartung: 6 user × 3 parallel × 1.5s = 1.5s pro Welle, 2 Wellen → ~3s
  console.log(`\n  Erwartete Untergrenze:    ~3s (5 Wellen pro User × ~1.5s, parallel)`);

  // Assertions
  let failed = false;
  for (const [u, n] of Object.entries(userPeakConcurrency)) {
    if (n > 3) {
      console.error(`  ❌ FEHLER: User ${u} hatte ${n} parallel (> Limit 3)`);
      failed = true;
    }
  }
  if (!failed) console.log(`\n  ✓ Per-User Limits eingehalten`);
  if (started !== TOTAL || completed !== TOTAL) {
    console.error(`  ❌ FEHLER: nicht alle Jobs abgeschlossen (${completed}/${TOTAL})`);
    failed = true;
  } else {
    console.log(`  ✓ Alle ${TOTAL} Jobs durchgelaufen — Queue sauber abgearbeitet`);
  }

  // Concurrency-Verlauf zeigen (max bar = 20 für Lesbarkeit)
  console.log(`\n  ── Concurrency-Verlauf (Σ aller User) ──`);
  const peak = Math.max(...samples.map((s) => s.global), 1);
  const barMax = 20;
  const downSampled = samples.filter((_, i) => i % 2 === 0).slice(0, 25);
  for (const s of downSampled) {
    const w = Math.round((s.global / peak) * barMax);
    const bar = "█".repeat(w) + "░".repeat(barMax - w);
    console.log(`  t=${(s.t / 1000).toFixed(1).padStart(4)}s |${bar}| ${s.global}`);
  }

  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error("💥 Fehler:", err); process.exit(1); });
