/**
 * Real-World Multi-Job Lasttest.
 *
 * 6 parallele Jobs (typische DACH-B2B-Zielgruppen) — simuliert ~2 aktive Power-User
 * gleichzeitig. Misst:
 *   - Auslastung des Gemini-Semaphores (Cross-Job-Limit)
 *   - Per-Job Throughput + Datenqualität (CEO-, Email-Rate)
 *   - Global: Gesamtdauer, p50/p95 Latenzen
 *
 * Benötigt GOOGLE_PLACES_API_KEY + GEMINI_API_KEY in .env.local.
 * Verbraucht ~$0.05–0.15 (~90 Gemini-Calls + ~10 Places-Searches).
 */

import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(__dirname, "..", ".env.local") });

const rootDir = resolve(__dirname, "..");
const Module = require("module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
  if (request.startsWith("@/")) request = resolve(rootDir, "src", request.slice(2));
  return originalResolveFilename.call(this, request, ...args);
};

const { searchGooglePlaces, fetchWebsiteData } = require("@/lib/enrichment/pipeline");
const { extractWithGemini, buildCeoName } = require("@/lib/enrichment/gemini");
const { geminiSemaphore } = require("@/lib/enrichment/semaphore");

interface JobSpec {
  branche: string;
  ort: string;
  land: string;
  expected: string;
}

interface LeadResult {
  company: string;
  email: string | null;
  phone: string | null;
  ceo: string | null;
  industry: string | null;
  legal_form: string | null;
  city: string | null;
  rating: number | null;
  scrape_ms: number;
  gemini_ms: number;
  total_ms: number;
}

interface JobResult {
  branche: string;
  ort: string;
  places_found: number;
  with_website: number;
  enriched: number;
  with_ceo: number;
  with_email: number;
  duration_ms: number;
  throughput: number;
  leads: LeadResult[];
}

const JOBS: JobSpec[] = [
  { branche: "Rechtsanwalt",       ort: "Hallein",   land: "AT", expected: "klein, ~5 Treffer" },
  { branche: "Steuerberater",      ort: "Innsbruck", land: "AT", expected: "mittel, ~15 Treffer" },
  { branche: "Architekt",          ort: "Mondsee",   land: "AT", expected: "klein, ~5-10" },
  { branche: "Zahnarzt",           ort: "Bregenz",   land: "AT", expected: "klein-mittel, ~10" },
  { branche: "Immobilienmakler",   ort: "Salzburg",  land: "AT", expected: "mittel-groß, ~25" },
  { branche: "Notar",              ort: "Linz",      land: "AT", expected: "mittel, ~10" },
];

const PER_JOB_WORKER_LIMIT = 25;
const MAX_FIRMS_PER_JOB = 12; // Kostenlimit pro Test-Job

// Semaphore-Pressure tracking
const semaphoreSamples: { t: number; inUse: number; waiting: number }[] = [];
let trackingTimer: ReturnType<typeof setInterval> | null = null;

function startSemaphoreTracking(t0: number) {
  trackingTimer = setInterval(() => {
    const s = geminiSemaphore.stats;
    semaphoreSamples.push({ t: Date.now() - t0, inUse: s.inUse, waiting: s.waiting });
  }, 250);
}

function stopSemaphoreTracking() {
  if (trackingTimer) clearInterval(trackingTimer);
}

async function enrichOne(place: any): Promise<LeadResult> {
  const company = place.displayName?.text || "?";
  const website = (place.websiteUri || "").replace(/\/$/, "");
  const overall = Date.now();

  const t1 = Date.now();
  const websiteData = website ? await fetchWebsiteData(website).catch(() => null) : null;
  const scrape_ms = Date.now() - t1;

  const t2 = Date.now();
  const ai = await extractWithGemini({
    companyName: company,
    website,
    address: place.formattedAddress || "",
    phone: place.internationalPhoneNumber || place.nationalPhoneNumber || null,
    pagesLoaded: websiteData?.pagesLoaded || [],
    websiteContent: websiteData?.websiteContent || "",
    emails: websiteData?.emails || [],
    phones: websiteData?.phones || [],
  });
  const gemini_ms = Date.now() - t2;

  return {
    company: ai?.company_name || company,
    email: ai?.email ?? null,
    phone: ai?.phone ?? place.internationalPhoneNumber ?? null,
    ceo: ai ? buildCeoName(ai) : null,
    industry: ai?.industry ?? null,
    legal_form: ai?.legal_form ?? null,
    city: ai?.city ?? null,
    rating: place.rating ?? null,
    scrape_ms,
    gemini_ms,
    total_ms: Date.now() - overall,
  };
}

async function runJob(spec: JobSpec): Promise<JobResult> {
  const t0 = Date.now();
  console.log(`▶ START "${spec.branche}" in "${spec.ort}"`);

  const places = await searchGooglePlaces(spec.branche, { location: spec.ort });
  const withWebsite = places.filter((p: any) => p.websiteUri && p.businessStatus === "OPERATIONAL");
  const subset = withWebsite.slice(0, MAX_FIRMS_PER_JOB);

  if (subset.length === 0) {
    return {
      branche: spec.branche, ort: spec.ort,
      places_found: places.length, with_website: withWebsite.length,
      enriched: 0, with_ceo: 0, with_email: 0,
      duration_ms: Date.now() - t0, throughput: 0, leads: [],
    };
  }

  // Worker-Pool wie in Pipeline (25 default)
  const queue = [...subset];
  const results: LeadResult[] = [];
  const workers = Array.from({ length: Math.min(PER_JOB_WORKER_LIMIT, subset.length) }, async () => {
    while (queue.length > 0) {
      const p = queue.shift();
      if (!p) break;
      try {
        results.push(await enrichOne(p));
      } catch (err) {
        console.warn(`   ! "${spec.branche}"/${spec.ort}: ${(err as Error).message?.substring(0, 80)}`);
      }
    }
  });
  await Promise.all(workers);

  const duration = Date.now() - t0;
  console.log(`◼ END   "${spec.branche}" in "${spec.ort}" — ${results.length} leads in ${(duration / 1000).toFixed(1)}s`);

  return {
    branche: spec.branche, ort: spec.ort,
    places_found: places.length, with_website: withWebsite.length,
    enriched: results.length,
    with_ceo: results.filter((r) => r.ceo).length,
    with_email: results.filter((r) => r.email).length,
    duration_ms: duration, throughput: results.length / (duration / 1000),
    leads: results,
  };
}

function pct(arr: number[], q: number): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

async function main() {
  const tGlobal = Date.now();
  console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║  Real-World Multi-Job Lasttest                                        ║");
  console.log(`║  ${JOBS.length} parallele Jobs, max ${MAX_FIRMS_PER_JOB} Firmen pro Job, ${PER_JOB_WORKER_LIMIT} Worker/Job        ║`);
  console.log(`║  Gemini-Semaphore: max ${geminiSemaphore.stats.capacity} parallel cross-job                       ║`);
  console.log("╚══════════════════════════════════════════════════════════════════════╝\n");

  startSemaphoreTracking(tGlobal);

  const results = await Promise.all(JOBS.map(runJob));

  stopSemaphoreTracking();
  const totalMs = Date.now() - tGlobal;

  // ─── Summary ───
  console.log(`\n${"═".repeat(72)}`);
  console.log("  ERGEBNIS PRO JOB");
  console.log(`${"═".repeat(72)}\n`);

  for (const r of results) {
    const ceoPct = r.enriched > 0 ? Math.round((r.with_ceo / r.enriched) * 100) : 0;
    const emailPct = r.enriched > 0 ? Math.round((r.with_email / r.enriched) * 100) : 0;
    console.log(
      `  ${(r.branche + " · " + r.ort).padEnd(36)} ` +
      `${r.enriched}/${r.with_website} enriched · ` +
      `${(r.duration_ms / 1000).toFixed(1)}s · ` +
      `${r.throughput.toFixed(2)}/sek · ` +
      `CEO ${ceoPct}% · Email ${emailPct}%`,
    );
  }

  // ─── Gesamt-Metriken ───
  const allLeads = results.flatMap((r) => r.leads);
  const scrapeMs = allLeads.map((l) => l.scrape_ms);
  const geminiMs = allLeads.map((l) => l.gemini_ms);
  const totalEnriched = allLeads.length;
  const totalCeo = allLeads.filter((l) => l.ceo).length;
  const totalEmail = allLeads.filter((l) => l.email).length;

  console.log(`\n${"═".repeat(72)}`);
  console.log("  GESAMT");
  console.log(`${"═".repeat(72)}\n`);
  console.log(`  Gesamtdauer:           ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`  Firmen enriched:       ${totalEnriched}`);
  console.log(`  Throughput (gesamt):   ${(totalEnriched / (totalMs / 1000)).toFixed(2)} Firmen/Sek`);
  console.log(`  Datenqualität:`);
  console.log(`    CEO-Findungsrate:    ${totalCeo}/${totalEnriched} = ${Math.round(totalCeo / totalEnriched * 100)}%`);
  console.log(`    Email-Findungsrate:  ${totalEmail}/${totalEnriched} = ${Math.round(totalEmail / totalEnriched * 100)}%`);
  console.log(`  Latenz-Distribution:`);
  console.log(`    Scrape avg/p50/p95:  ${(avg(scrapeMs) / 1000).toFixed(2)}s / ${(pct(scrapeMs, 0.5) / 1000).toFixed(2)}s / ${(pct(scrapeMs, 0.95) / 1000).toFixed(2)}s`);
  console.log(`    Gemini avg/p50/p95:  ${(avg(geminiMs) / 1000).toFixed(2)}s / ${(pct(geminiMs, 0.5) / 1000).toFixed(2)}s / ${(pct(geminiMs, 0.95) / 1000).toFixed(2)}s`);

  // ─── Semaphore-Pressure ───
  console.log(`\n${"═".repeat(72)}`);
  console.log("  GEMINI-SEMAPHORE AUSLASTUNG (Limit: " + geminiSemaphore.stats.capacity + ")");
  console.log(`${"═".repeat(72)}\n`);

  if (semaphoreSamples.length > 0) {
    const peakInUse = Math.max(...semaphoreSamples.map((s) => s.inUse));
    const peakWaiting = Math.max(...semaphoreSamples.map((s) => s.waiting));
    const avgInUse = avg(semaphoreSamples.map((s) => s.inUse));
    const samplesSaturated = semaphoreSamples.filter((s) => s.inUse >= geminiSemaphore.stats.capacity).length;
    const saturationPct = Math.round((samplesSaturated / semaphoreSamples.length) * 100);

    console.log(`  Peak in-use:           ${peakInUse} / ${geminiSemaphore.stats.capacity}`);
    console.log(`  Peak warteschlange:    ${peakWaiting} Workers blockiert`);
    console.log(`  Ø in-use (Sample):     ${avgInUse.toFixed(1)}`);
    console.log(`  Saturation:            ${saturationPct}% der Zeit am Limit`);

    // ASCII-Sparkline
    console.log(`\n  Verlauf (Zeit →):`);
    const samples = semaphoreSamples;
    const stepSize = Math.max(1, Math.floor(samples.length / 60));
    const peak = Math.max(peakInUse, 1);
    for (let row = 0; row < 5; row++) {
      const threshold = peak * (1 - row / 5);
      let line = `  ${String(Math.round(threshold)).padStart(3)} |`;
      for (let i = 0; i < samples.length; i += stepSize) {
        line += samples[i].inUse >= threshold ? "█" : " ";
      }
      console.log(line);
    }
    console.log("       " + "─".repeat(Math.ceil(samples.length / stepSize)));
    console.log(`        0s${" ".repeat(Math.max(0, Math.ceil(samples.length / stepSize) - 6))}${(totalMs / 1000).toFixed(0)}s`);
  }

  // ─── Daten-Preview ───
  console.log(`\n${"═".repeat(72)}`);
  console.log("  DATEN-PREVIEW (erste 2 Leads pro Job)");
  console.log(`${"═".repeat(72)}`);

  for (const r of results) {
    if (r.leads.length === 0) continue;
    console.log(`\n  ── ${r.branche} · ${r.ort} ──`);
    for (const lead of r.leads.slice(0, 2)) {
      console.log(`    • ${lead.company}`);
      console.log(`      CEO: ${lead.ceo || "–"} · Email: ${lead.email || "–"} · Tel: ${lead.phone || "–"}`);
      console.log(`      Industry: ${lead.industry || "–"} · ${lead.legal_form || "–"} · Rating: ${lead.rating ?? "–"}`);
    }
  }

  // ─── Optimierungs-Empfehlungen ───
  console.log(`\n${"═".repeat(72)}`);
  console.log("  OPTIMIERUNGS-ANALYSE");
  console.log(`${"═".repeat(72)}\n`);

  const peakInUse = semaphoreSamples.length > 0 ? Math.max(...semaphoreSamples.map((s) => s.inUse)) : 0;
  const peakWaiting = semaphoreSamples.length > 0 ? Math.max(...semaphoreSamples.map((s) => s.waiting)) : 0;
  const saturationPct = semaphoreSamples.length > 0
    ? Math.round((semaphoreSamples.filter((s) => s.inUse >= geminiSemaphore.stats.capacity).length / semaphoreSamples.length) * 100)
    : 0;
  const avgGemini = avg(geminiMs);
  const ceoRate = totalEnriched > 0 ? totalCeo / totalEnriched : 0;

  const suggestions: string[] = [];
  if (saturationPct > 70) {
    suggestions.push(
      `• Semaphore zu ${saturationPct}% gesättigt → GEMINI_GLOBAL_CONCURRENCY von ${geminiSemaphore.stats.capacity} auf ${geminiSemaphore.stats.capacity + 20} hochdrehen ` +
      `(wenn Gemini-Tier es erlaubt — Tier 1 = 1000 RPM, du bist aktuell bei ~${Math.round(peakInUse * 60 / (avgGemini / 1000))} RPM Peak).`,
    );
  } else if (saturationPct < 30) {
    suggestions.push(
      `• Semaphore nur ${saturationPct}% ausgelastet → aktuelle Concurrency reicht weit aus. Bei mehr User-Last automatisch sauberes Backpressure.`,
    );
  }
  if (peakWaiting > 10) {
    suggestions.push(
      `• Bis zu ${peakWaiting} Workers gleichzeitig in der Semaphore-Warteschlange. Wenn das stört: Gemini-Limit erhöhen ODER Worker pro Job runter auf 15-20.`,
    );
  }
  if (avgGemini > 8000) {
    suggestions.push(
      `• Gemini-Latenz avg ${(avgGemini / 1000).toFixed(1)}s ist hoch. Prompt-Längen prüfen (aktuell max 6000 chars Website-Content). Eventuell auf 4000 reduzieren.`,
    );
  }
  if (ceoRate < 0.85) {
    suggestions.push(
      `• CEO-Findungsrate nur ${Math.round(ceoRate * 100)}%. Stage-2-Grounding fängt nicht alles. Mögliche Verbesserung: zusätzlich Bing-Search oder LinkedIn-Lookup einbauen.`,
    );
  }
  if (suggestions.length === 0) {
    suggestions.push("• Alle Metriken im grünen Bereich. Keine Optimierung dringend nötig.");
  }
  for (const s of suggestions) console.log(`  ${s}`);

  console.log("");
}

main().catch((err) => { console.error("💥 Fehler:", err); process.exit(1); });
