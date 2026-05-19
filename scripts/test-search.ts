/**
 * Test-Script: Lead Pipeline v2 — Rechtsanwalt in Thalgau / Mondsee
 * Testet: Google Places → Smart Scraping (Sitemap) → Gemini AI (mit Google Search Grounding)
 *
 * Verwendung: npx tsx scripts/test-search.ts
 */

import { resolve } from "path";
import { config } from "dotenv";

// .env.local laden
config({ path: resolve(__dirname, "..", ".env.local") });

// Manuell Pfad-Aliase laden (da tsx @/ nicht automatisch auflöst)
const rootDir = resolve(__dirname, "..");
const Module = require("module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
  if (request.startsWith("@/")) {
    request = resolve(rootDir, "src", request.slice(2));
  }
  return originalResolveFilename.call(this, request, ...args);
};

// ── Interfaces ──

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  businessStatus?: string;
  types?: string[];
}

// ── Timing Helper ──

function timer() {
  const start = Date.now();
  return () => ((Date.now() - start) / 1000).toFixed(1) + "s";
}

// ── Main ──

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Lead Pipeline v2 — Test: Rechtsanwalt in Thalgau / Mondsee");
  console.log("  Google Places → Smart Scraping → Gemini AI (Grounding)");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Env-Check
  const requiredEnvs = ["GOOGLE_PLACES_API_KEY", "GEMINI_API_KEY"];
  const missing = requiredEnvs.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error("❌ Fehlende Umgebungsvariablen:", missing.join(", "));
    process.exit(1);
  }
  console.log("✓ Alle Env-Variablen vorhanden\n");

  const testCases = [
    { query: "Rechtsanwalt", location: "Thalgau" },
    { query: "Rechtsanwalt", location: "Mondsee" },
  ];

  for (const { query, location } of testCases) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`  TEST: "${query}" in "${location}"`);
    console.log(`${"─".repeat(60)}\n`);

    // Step 1: Google Places
    const t1 = timer();
    console.log("── STEP 1: Google Places API ──");
    const places = await searchGooglePlaces(query, location);
    console.log(`→ ${places.length} Ergebnisse (${t1()})\n`);

    for (const p of places) {
      console.log(`  📍 ${p.displayName?.text}`);
      console.log(`     ${p.formattedAddress || "–"}`);
      console.log(`     Website: ${p.websiteUri || "–"}`);
    }

    // Step 2+3: Scraping + Gemini für erstes Ergebnis mit Website
    const firstWithWebsite = places.find((p) => p.websiteUri);
    if (!firstWithWebsite?.websiteUri) {
      console.log("\n⚠️  Kein Ergebnis mit Website. Überspringe Scraping + Gemini.\n");
      continue;
    }

    // Step 2: Smart Scraping
    const t2 = timer();
    console.log(`\n── STEP 2: Smart Scraping (Sitemap-basiert) ──`);
    console.log(`→ Scrape: ${firstWithWebsite.websiteUri}`);

    const websiteData = await fetchWebsiteData(firstWithWebsite.websiteUri);
    console.log(`  Seiten geladen: ${websiteData.pagesLoaded.join(", ")}`);
    console.log(`  Emails: ${websiteData.emails.length > 0 ? websiteData.emails.join(", ") : "–"}`);
    console.log(`  Phones: ${websiteData.phones.length > 0 ? websiteData.phones.slice(0, 3).join(", ") : "–"}`);
    console.log(`  LinkedIn: ${websiteData.socialLinkedin || "–"}`);
    console.log(`  ⏱️  Scraping: ${t2()}`);

    // Step 3: Gemini AI mit Grounding
    const t3 = timer();
    console.log(`\n── STEP 3: Gemini AI Extraktion (mit Google Search Grounding) ──`);
    const { extractWithGemini } = require("@/lib/enrichment/gemini");
    const geminiResult = await extractWithGemini({
      companyName: firstWithWebsite.displayName?.text || query,
      website: firstWithWebsite.websiteUri,
      address: firstWithWebsite.formattedAddress || "",
      phone: firstWithWebsite.internationalPhoneNumber || firstWithWebsite.nationalPhoneNumber || null,
      pagesLoaded: websiteData.pagesLoaded,
      websiteContent: websiteData.websiteContent,
      emails: websiteData.emails,
      phones: websiteData.phones,
    });

    console.log(`  ⏱️  Gemini: ${t3()}`);

    if (geminiResult) {
      console.log("\n✅ Gemini Ergebnis:");
      console.log(`  CEO:        ${geminiResult.ceo_first_name || "–"} ${geminiResult.ceo_last_name || "–"}`);
      console.log(`  CEO Quelle: ${geminiResult.ceo_source || "–"}`);
      console.log(`  Gender:     ${geminiResult.ceo_gender}`);
      console.log(`  Email:      ${geminiResult.email || "–"}`);
      console.log(`  Phone:      ${geminiResult.phone || "–"}`);
      console.log(`  Branche:    ${geminiResult.industry || "–"}`);
      console.log(`  Rechtsform: ${geminiResult.legal_form || "–"}`);
      console.log(`  Confidence: ${geminiResult.confidence_score}`);
      console.log(`\n  Vollständig:`);
      console.log(JSON.stringify(geminiResult, null, 2));
    } else {
      console.log("\n⚠️  Gemini hat kein Ergebnis geliefert");
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log("  TEST ABGESCHLOSSEN");
  console.log(`${"═".repeat(60)}`);
}

// ── Google Places Search ──

async function searchGooglePlaces(query: string, location: string): Promise<GooglePlace[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY!;
  const body = {
    textQuery: `${query} in ${location}`,
    languageCode: "de",
    maxResultCount: 20,
  };

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.googleMapsUri,places.businessStatus,places.types,places.id,nextPageToken",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`Google Places API Fehler (${response.status}): ${errText}`);
    return [];
  }

  const data = await response.json();
  return (data.places || []) as GooglePlace[];
}

// ── Smart Website Scraping (Sitemap-basiert, wie in pipeline.ts) ──

interface WebsiteData {
  emails: string[];
  phones: string[];
  websiteContent: string;
  pagesLoaded: string[];
  socialLinkedin: string | null;
  socialFacebook: string | null;
  socialInstagram: string | null;
  socialXing: string | null;
  socialTwitter: string | null;
  socialYoutube: string | null;
  socialTiktok: string | null;
}

const RELEVANT_PATH_KEYWORDS = [
  "impressum", "imprint", "team", "kontakt", "contact",
  "about", "ueber-uns", "unternehmen", "management",
  "geschaeftsfuehrung", "partner", "anwalt", "anwaelte",
  "rechtsanwalt", "kanzlei",
];

async function fetchSitemapUrls(baseUrl: string): Promise<string[]> {
  try {
    const response = await fetch(baseUrl + "/sitemap.xml", {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadBot/1.0)" },
      redirect: "follow",
    });
    if (!response.ok) return [];
    const xml = await response.text();
    const urls = [...xml.matchAll(/<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    const relevant = urls.filter((url) => {
      const path = new URL(url).pathname.toLowerCase();
      return RELEVANT_PATH_KEYWORDS.some((kw) => path.includes(kw));
    });
    console.log(`  Sitemap: ${urls.length} URLs total, ${relevant.length} relevant`);
    return relevant.slice(0, 3);
  } catch {
    console.log("  Sitemap: nicht gefunden");
    return [];
  }
}

function classifyUrl(url: string): string {
  const path = new URL(url).pathname.toLowerCase();
  if (path === "/" || path === "") return "homepage";
  if (path.includes("impressum") || path.includes("imprint")) return "impressum";
  if (path.includes("kontakt") || path.includes("contact")) return "kontakt";
  if (path.includes("team") || path.includes("management")) return "team";
  if (path.includes("about") || path.includes("ueber-uns")) return "about";
  return "other";
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadBot/1.0)" },
      redirect: "follow",
    });
    if (!response.ok) return null;
    const ct = response.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function extractFromHtml(html: string) {
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 2000);

  const emails = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const phones = (html.match(/(?:\+[1-9]\d{0,2}|0)[\s\d\-\/()]{7,20}/g) || [])
    .map((p) => p.replace(/[\s\-\/()]/g, ""));

  const socials: Record<string, string | null> = {};
  const patterns: [string, RegExp][] = [
    ["linkedin", /https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[^\s"'<>]+/i],
    ["facebook", /https?:\/\/([a-z]{2,3}\.)?facebook\.com\/(?!sharer)[^\s"'<>]+/i],
    ["instagram", /https?:\/\/([a-z]{2,3}\.)?instagram\.com\/(?!p\/)[^\s"'<>]+/i],
    ["xing", /https?:\/\/([a-z]{2,3}\.)?xing\.com\/(?:profile|companies)\/[^\s"'<>]+/i],
    ["twitter", /https?:\/\/([a-z]{2,3}\.)?(twitter\.com|x\.com)\/(?!intent|share)[^\s"'<>]+/i],
    ["youtube", /https?:\/\/([a-z]{2,3}\.)?youtube\.com\/(channel|c|user|@)[^\s"'<>]+/i],
    ["tiktok", /https?:\/\/([a-z]{2,3}\.)?tiktok\.com\/@[^\s"'<>]+/i],
  ];
  for (const [name, pattern] of patterns) {
    const m = html.match(pattern);
    socials[name] = m ? m[0].split('"')[0].split("'")[0].split("?")[0] : null;
  }

  return { text, emails, phones, socials };
}

async function fetchWebsiteData(baseUrl: string): Promise<WebsiteData> {
  const cleanBase = baseUrl.replace(/\/$/, "");

  // Homepage + Sitemap parallel
  const [homepageHtml, sitemapUrls] = await Promise.all([
    fetchPage(cleanBase),
    fetchSitemapUrls(cleanBase),
  ]);

  // Additional pages
  let additionalUrls: { url: string; type: string }[];
  if (sitemapUrls.length > 0) {
    additionalUrls = sitemapUrls.map((url) => ({ url, type: classifyUrl(url) }));
  } else {
    additionalUrls = [
      { url: cleanBase + "/impressum", type: "impressum" },
      { url: cleanBase + "/kontakt", type: "kontakt" },
    ];
  }

  const additionalResults = await Promise.allSettled(
    additionalUrls.map((e) => fetchPage(e.url)),
  );

  let combinedText = "";
  const pagesLoaded: string[] = [];
  const emailsFound: string[] = [];
  const phonesFound: string[] = [];
  const allSocials: Record<string, string | null> = {};

  if (homepageHtml) {
    const data = extractFromHtml(homepageHtml);
    combinedText += `\n\n=== HOMEPAGE ===\n${data.text}\n`;
    pagesLoaded.push("homepage");
    emailsFound.push(...data.emails);
    phonesFound.push(...data.phones);
    for (const [k, v] of Object.entries(data.socials)) { if (v && !allSocials[k]) allSocials[k] = v; }
  }

  for (let i = 0; i < additionalResults.length; i++) {
    const result = additionalResults[i];
    if (result.status !== "fulfilled" || !result.value) continue;
    const pageType = additionalUrls[i].type;
    const data = extractFromHtml(result.value);
    combinedText += `\n\n=== ${pageType.toUpperCase()} ===\n${data.text}\n`;
    pagesLoaded.push(pageType);
    emailsFound.push(...data.emails);
    phonesFound.push(...data.phones);
    for (const [k, v] of Object.entries(data.socials)) { if (v && !allSocials[k]) allSocials[k] = v; }
  }

  return {
    emails: [...new Set(emailsFound)],
    phones: [...new Set(phonesFound)],
    websiteContent: combinedText.substring(0, 8000),
    pagesLoaded,
    socialLinkedin: allSocials["linkedin"] || null,
    socialFacebook: allSocials["facebook"] || null,
    socialInstagram: allSocials["instagram"] || null,
    socialXing: allSocials["xing"] || null,
    socialTwitter: allSocials["twitter"] || null,
    socialYoutube: allSocials["youtube"] || null,
    socialTiktok: allSocials["tiktok"] || null,
  };
}

// ── Start ──
main().catch((err) => {
  console.error("💥 Fataler Fehler:", err);
  process.exit(1);
});
