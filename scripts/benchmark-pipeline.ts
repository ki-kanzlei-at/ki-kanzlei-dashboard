/**
 * Benchmark der Lead-Enrichment-Pipeline
 *
 * Mißt jede Phase einzeln + Gesamtdurchsatz bei verschiedenen Concurrency-Levels.
 * Verwendet die echten Produktionsfunktionen aus src/lib/enrichment/pipeline.ts.
 *
 * Verwendung:
 *   npx tsx scripts/benchmark-pipeline.ts            # Default: Mondsee, Concurrency 3/6/10
 *   npx tsx scripts/benchmark-pipeline.ts Salzburg   # andere Stadt
 *   BENCH_CONCURRENCY=8 npx tsx scripts/benchmark-pipeline.ts
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

interface Timing {
  company: string;
  website: string;
  scrapeMs: number;
  geminiMs: number;
  totalMs: number;
  hasEmail: boolean;
  hasCeo: boolean;
  pagesLoaded: number;
  emailsFound: number;
}

interface RunResult {
  concurrency: number;
  city: string;
  placesMs: number;
  placesCount: number;
  withWebsite: number;
  enrichedMs: number;
  enrichedCount: number;
  withEmail: number;
  withCeo: number;
  totalMs: number;
  perCompany: Timing[];
  throughput: number; // companies/sec
}

function p(n: number, digits = 1): string {
  return (n / 1000).toFixed(digits) + "s";
}

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function pct(arr: number[], q: number): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return sorted[idx];
}

async function enrichOne(place: any): Promise<Timing> {
  const company = place.displayName?.text || "?";
  const website = (place.websiteUri || "").replace(/\/$/, "");
  const overallStart = Date.now();

  const tScrape = Date.now();
  const websiteData = website ? await fetchWebsiteData(website).catch(() => null) : null;
  const scrapeMs = Date.now() - tScrape;

  const tGemini = Date.now();
  const aiResult = await extractWithGemini({
    companyName: company,
    website,
    address: place.formattedAddress || "",
    phone: place.internationalPhoneNumber || place.nationalPhoneNumber || null,
    pagesLoaded: websiteData?.pagesLoaded || [],
    websiteContent: websiteData?.websiteContent || "",
    emails: websiteData?.emails || [],
    phones: websiteData?.phones || [],
  });
  const geminiMs = Date.now() - tGemini;

  const ceoName = aiResult ? buildCeoName(aiResult) : null;
  return {
    company,
    website,
    scrapeMs,
    geminiMs,
    totalMs: Date.now() - overallStart,
    hasEmail: !!(aiResult?.email || (websiteData?.emails || []).length > 0),
    hasCeo: !!ceoName,
    pagesLoaded: (websiteData?.pagesLoaded || []).length,
    emailsFound: (websiteData?.emails || []).length,
  };
}

async function runWithConcurrency(places: any[], concurrency: number): Promise<Timing[]> {
  const results: Timing[] = [];
  const queue = [...places];
  let idx = 0;

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async (_, w) => {
    while (queue.length > 0) {
      const place = queue.shift();
      if (!place) break;
      const myIdx = ++idx;
      const t0 = Date.now();
      try {
        const r = await enrichOne(place);
        results.push(r);
        console.log(
          `   [W${w}] [${myIdx}/${places.length}] ${r.company.padEnd(38).substring(0, 38)} ` +
          `scrape=${p(r.scrapeMs)} gemini=${p(r.geminiMs)} ceo=${r.hasCeo ? "✓" : "·"} email=${r.hasEmail ? "✓" : "·"}`
        );
      } catch (err) {
        console.warn(`   [W${w}] [${myIdx}/${places.length}] FEHLER:`, (err as Error).message);
      }
      void t0;
    }
  });

  await Promise.all(workers);
  return results;
}

async function bench(city: string, concurrency: number, sharedPlaces?: any[]): Promise<RunResult> {
  console.log(`\n${"━".repeat(70)}`);
  console.log(`  Benchmark: "${city}" · Concurrency ${concurrency}`);
  console.log(`${"━".repeat(70)}`);

  let placesMs = 0;
  let places: any[];
  if (sharedPlaces) {
    places = sharedPlaces;
  } else {
    const t = Date.now();
    places = await searchGooglePlaces("Rechtsanwalt", { location: city });
    placesMs = Date.now() - t;
    console.log(`  Places-Suche:    ${places.length} Treffer in ${p(placesMs)}`);
  }

  const withWebsite = places.filter((p: any) => p.websiteUri && p.businessStatus === "OPERATIONAL");
  console.log(`  Mit Website:     ${withWebsite.length}`);

  if (withWebsite.length === 0) {
    return {
      concurrency, city, placesMs, placesCount: places.length, withWebsite: 0,
      enrichedMs: 0, enrichedCount: 0, withEmail: 0, withCeo: 0,
      totalMs: placesMs, perCompany: [], throughput: 0,
    };
  }

  console.log(`  ─ Enrichment (${concurrency} parallel workers) ─`);
  const tEnrich = Date.now();
  const timings = await runWithConcurrency(withWebsite, concurrency);
  const enrichedMs = Date.now() - tEnrich;
  const totalMs = placesMs + enrichedMs;
  const throughput = withWebsite.length / (enrichedMs / 1000);

  console.log(
    `\n  ───── Ergebnis @ Concurrency=${concurrency} ─────\n` +
    `  Enrichment-Zeit: ${p(enrichedMs)}  (Σ ${p(totalMs)})\n` +
    `  Throughput:      ${throughput.toFixed(2)} Firmen/Sek\n` +
    `  Mit CEO:         ${timings.filter((t) => t.hasCeo).length}/${timings.length}\n` +
    `  Mit Email:       ${timings.filter((t) => t.hasEmail).length}/${timings.length}\n` +
    `  Scrape  avg/p50/p95: ${p(avg(timings.map((t) => t.scrapeMs)))} / ${p(pct(timings.map((t) => t.scrapeMs), 0.5))} / ${p(pct(timings.map((t) => t.scrapeMs), 0.95))}\n` +
    `  Gemini  avg/p50/p95: ${p(avg(timings.map((t) => t.geminiMs)))} / ${p(pct(timings.map((t) => t.geminiMs), 0.5))} / ${p(pct(timings.map((t) => t.geminiMs), 0.95))}\n` +
    `  Total   avg/p50/p95: ${p(avg(timings.map((t) => t.totalMs)))} / ${p(pct(timings.map((t) => t.totalMs), 0.5))} / ${p(pct(timings.map((t) => t.totalMs), 0.95))}`
  );

  return {
    concurrency, city, placesMs, placesCount: places.length, withWebsite: withWebsite.length,
    enrichedMs, enrichedCount: timings.length,
    withEmail: timings.filter((t) => t.hasEmail).length,
    withCeo: timings.filter((t) => t.hasCeo).length,
    totalMs, perCompany: timings, throughput,
  };
}

async function main() {
  const city = process.argv[2] || "Mondsee";
  const concs = process.env.BENCH_CONCURRENCY
    ? process.env.BENCH_CONCURRENCY.split(",").map((n) => parseInt(n, 10))
    : [3, 6, 10];

  console.log(`\n╔══════════════════════════════════════════════════════════════════════╗`);
  console.log(`║  Lead-Pipeline Benchmark                                              ║`);
  console.log(`║  Stadt: "${city.padEnd(20)}" · Concurrency-Stufen: ${concs.join(", ").padEnd(13)}      ║`);
  console.log(`╚══════════════════════════════════════════════════════════════════════╝`);

  // Erst einmal Places holen — gleiches Set für alle Concurrency-Tests
  console.log(`\nPlaces-Suche (einmal, geteilt)…`);
  const t = Date.now();
  const places = await searchGooglePlaces("Rechtsanwalt", { location: city });
  console.log(`→ ${places.length} Places in ${p(Date.now() - t)}`);

  const results: RunResult[] = [];
  for (const c of concs) {
    const r = await bench(city, c, places);
    results.push(r);
    // 3s Pause zwischen Concurrency-Runs (Gemini Rate-Limit erholen)
    await new Promise((r) => setTimeout(r, 3000));
  }

  // Vergleichstabelle
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  VERGLEICH`);
  console.log(`${"═".repeat(70)}`);
  console.log(
    `\n  Concurrency | Enrich-Zeit | Firmen/Sek | CEO-Rate | Email-Rate`
  );
  console.log(`  ${"─".repeat(64)}`);
  for (const r of results) {
    const ceoRate = r.enrichedCount > 0 ? ((r.withCeo / r.enrichedCount) * 100).toFixed(0) : "0";
    const emailRate = r.enrichedCount > 0 ? ((r.withEmail / r.enrichedCount) * 100).toFixed(0) : "0";
    console.log(
      `  ${String(r.concurrency).padStart(11)} | ${p(r.enrichedMs).padStart(11)} | ${r.throughput.toFixed(2).padStart(10)} | ${(ceoRate + "%").padStart(8)} | ${(emailRate + "%").padStart(10)}`
    );
  }

  // Best
  const best = results.reduce((a, b) => (b.throughput > a.throughput ? b : a), results[0]);
  console.log(`\n  → Beste Konfiguration: Concurrency=${best.concurrency} (${best.throughput.toFixed(2)} Firmen/Sek)\n`);
}

main().catch((err) => { console.error("💥 Fehler:", err); process.exit(1); });
