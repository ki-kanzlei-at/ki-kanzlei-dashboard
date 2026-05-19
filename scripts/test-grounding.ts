/**
 * Test: Grounding-Effektivität — Firmen wo CEO NICHT auf Website steht
 * Testet ob Gemini via Google Search den Geschäftsführer findet
 *
 * Testfälle:
 * 1. Kleine GmbHs ohne Team-Seite (CEO nur im Firmenbuch)
 * 2. Handwerker/Installateure (oft nur Kontaktseite, kein Name)
 * 3. Vergleich: mit vs. ohne Grounding
 *
 * Verwendung: npx tsx scripts/test-grounding.ts
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

function timer() {
  const start = Date.now();
  return { elapsed: () => ((Date.now() - start) / 1000).toFixed(1) + "s", ms: () => Date.now() - start };
}

// Testfälle: Branchen wo CEO selten auf Website steht
const TEST_CASES = [
  { query: "Installateur", location: "Thalgau" },
  { query: "Tischlerei", location: "Mondsee" },
  { query: "Elektro", location: "St. Gilgen" },
];

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
}

async function searchGooglePlaces(query: string, location: string): Promise<GooglePlace[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY!;
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus,places.id",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ textQuery: `${query} in ${location}`, languageCode: "de", maxResultCount: 5 }),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return ((data.places || []) as GooglePlace[]).filter((p) => p.websiteUri);
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadBot/1.0)" }, redirect: "follow" });
    if (!r.ok || !(r.headers.get("content-type") || "").includes("text/html")) return null;
    return await r.text();
  } catch { return null; }
}

function extractFromHtml(html: string) {
  const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().substring(0, 2000);
  const emails = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const phones = (html.match(/(?:\+[1-9]\d{0,2}|0)[\s\d\-\/()]{7,20}/g) || []).map((p) => p.replace(/[\s\-\/()]/g, ""));
  return { text, emails, phones };
}

async function scrapeSimple(baseUrl: string) {
  const cleanBase = baseUrl.replace(/\/$/, "");
  const [homepage, impressum] = await Promise.all([fetchPage(cleanBase), fetchPage(cleanBase + "/impressum")]);
  let content = ""; const emails: string[] = []; const phones: string[] = []; const pages: string[] = [];
  if (homepage) { const d = extractFromHtml(homepage); content += `=== HOMEPAGE ===\n${d.text}\n`; emails.push(...d.emails); phones.push(...d.phones); pages.push("homepage"); }
  if (impressum) { const d = extractFromHtml(impressum); content += `=== IMPRESSUM ===\n${d.text}\n`; emails.push(...d.emails); phones.push(...d.phones); pages.push("impressum"); }
  return { content: content.substring(0, 8000), emails: [...new Set(emails)], phones: [...new Set(phones)], pages };
}

/** Gemini call MIT Grounding (normal) */
async function callGeminiWithGrounding(input: Record<string, unknown>) {
  const { extractWithGemini } = require("@/lib/enrichment/gemini");
  return extractWithGemini(input);
}

/** Gemini call OHNE Grounding (Vergleich) — direkt via API */
async function callGeminiWithoutGrounding(input: Record<string, unknown>) {
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: "Du bist ein Daten-Extraktions-Spezialist. Antworte IMMER mit validem JSON ohne Markdown-Bloecke.",
    generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
    // KEIN tools/grounding
  });

  const prompt = `Analysiere diese Daten und extrahiere den Geschäftsführer/Inhaber.
FIRMA: ${input.companyName}
WEBSITE: ${input.website}
ADRESSE: ${input.address}
WEBSITE-CONTENT:
${(input.websiteContent as string).substring(0, 4000)}
EMAILS: ${JSON.stringify(input.emails)}

Antworte NUR mit JSON:
{"ceo_first_name": "...", "ceo_last_name": "...", "ceo_gender": "herr|frau|unbekannt", "ceo_source": "website|unknown", "confidence_score": 0.0}`;

  try {
    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (err) {
    console.error("  [NoGrounding] Fehler:", (err as Error).message?.substring(0, 100));
    return null;
  }
}

async function main() {
  const totalT = timer();
  console.log("════════════════════════════════════════════════════════════════════");
  console.log("  GROUNDING TEST — Findet Gemini CEOs die NICHT auf der Website stehen?");
  console.log("════════════════════════════════════════════════════════════════════\n");

  const results: { firma: string; query: string; withGrounding: { name: string | null; source: string | null; time: string }; withoutGrounding: { name: string | null; source: string | null; time: string }; websiteHasCeo: boolean }[] = [];

  for (const { query, location } of TEST_CASES) {
    console.log(`\n${"━".repeat(65)}`);
    console.log(`  "${query}" in "${location}"`);
    console.log(`${"━".repeat(65)}`);

    const places = await searchGooglePlaces(query, location);
    console.log(`  ${places.length} Firmen mit Website\n`);

    // Max 2 pro Testcase
    for (const place of places.slice(0, 2)) {
      const name = place.displayName?.text || "?";
      console.log(`  ┌─ ${name}`);
      console.log(`  │  ${place.websiteUri}`);

      const scraped = await scrapeSimple(place.websiteUri!);
      console.log(`  │  Seiten: ${scraped.pages.join(", ")} | Emails: ${scraped.emails.length}`);

      // Check ob CEO-Name wahrscheinlich im Content steht
      const contentLower = scraped.content.toLowerCase();
      const nameParts = name.toLowerCase().split(/[\s\-]+/).filter((p) => p.length > 3);
      const websiteHasCeo = nameParts.some((p) => contentLower.includes(p));
      console.log(`  │  CEO im Content: ${websiteHasCeo ? "JA (Name gefunden)" : "NEIN"}`);

      // Input für Gemini
      const geminiInput = {
        companyName: name,
        website: place.websiteUri,
        address: place.formattedAddress || "",
        phone: place.internationalPhoneNumber || place.nationalPhoneNumber || null,
        pagesLoaded: scraped.pages,
        websiteContent: scraped.content,
        emails: scraped.emails,
        phones: scraped.phones,
      };

      // Test 1: MIT Grounding
      const t1 = timer();
      const withG = await callGeminiWithGrounding(geminiInput);
      const t1e = t1.elapsed();
      const ceoWithG = withG ? `${withG.ceo_first_name || ""} ${withG.ceo_last_name || ""}`.trim() || null : null;

      // Test 2: OHNE Grounding
      const t2 = timer();
      const withoutG = await callGeminiWithoutGrounding(geminiInput);
      const t2e = t2.elapsed();
      const ceoWithoutG = withoutG ? `${withoutG.ceo_first_name || ""} ${withoutG.ceo_last_name || ""}`.trim() || null : null;

      console.log(`  │`);
      console.log(`  │  MIT Grounding:    CEO = ${ceoWithG || "–"} (source: ${withG?.ceo_source || "–"}) [${t1e}]`);
      console.log(`  │  OHNE Grounding:   CEO = ${ceoWithoutG || "–"} (source: ${withoutG?.ceo_source || "–"}) [${t2e}]`);

      const better = ceoWithG && !ceoWithoutG ? "GROUNDING WINS" : ceoWithG && ceoWithoutG ? "GLEICH" : !ceoWithG && !ceoWithoutG ? "BEIDE LEER" : "KEIN GROUNDING GEWINNT";
      console.log(`  │  Ergebnis:         ${better}`);
      console.log(`  └─\n`);

      results.push({
        firma: name,
        query,
        withGrounding: { name: ceoWithG, source: withG?.ceo_source || null, time: t1e },
        withoutGrounding: { name: ceoWithoutG, source: withoutG?.ceo_source || null, time: t2e },
        websiteHasCeo,
      });

      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // ── Zusammenfassung ──
  console.log(`\n${"═".repeat(65)}`);
  console.log("  ZUSAMMENFASSUNG");
  console.log(`${"═".repeat(65)}\n`);

  console.log("  Firma                              | Website hat CEO | MIT Grounding      | OHNE Grounding     | Gewinner");
  console.log("  " + "─".repeat(120));
  for (const r of results) {
    const f = r.firma.substring(0, 35).padEnd(36);
    const w = r.websiteHasCeo ? "JA " : "NEIN";
    const g = (r.withGrounding.name || "–").substring(0, 18).padEnd(19);
    const ng = (r.withoutGrounding.name || "–").substring(0, 18).padEnd(19);
    const winner = r.withGrounding.name && !r.withoutGrounding.name ? "GROUNDING" : r.withGrounding.name && r.withoutGrounding.name ? "Gleich" : "–";
    console.log(`  ${f}| ${w}             | ${g}| ${ng}| ${winner}`);
  }

  const groundingWins = results.filter((r) => r.withGrounding.name && !r.withoutGrounding.name).length;
  const bothFound = results.filter((r) => r.withGrounding.name && r.withoutGrounding.name).length;
  const neitherFound = results.filter((r) => !r.withGrounding.name && !r.withoutGrounding.name).length;
  const noGroundingOnly = results.filter((r) => !r.withGrounding.name && r.withoutGrounding.name).length;

  console.log(`\n  Grounding hat CEO gefunden wo ohne nicht:  ${groundingWins}/${results.length}`);
  console.log(`  Beide gefunden:                             ${bothFound}/${results.length}`);
  console.log(`  Keiner gefunden:                            ${neitherFound}/${results.length}`);
  console.log(`  Nur ohne Grounding gefunden:                ${noGroundingOnly}/${results.length}`);
  console.log(`\n  Gesamtzeit: ${totalT.elapsed()}`);
}

main().catch((err) => { console.error("💥", err); process.exit(1); });
