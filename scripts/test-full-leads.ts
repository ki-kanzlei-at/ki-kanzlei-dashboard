/**
 * Test: Komplette Lead-Daten für ALLE Firmen mit Website
 * Verwendung: npx tsx scripts/test-full-leads.ts
 */

import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(__dirname, "..", ".env.local") });

const rootDir = resolve(__dirname, "..");
const Module = require("module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
  if (request.startsWith("@/")) {
    request = resolve(rootDir, "src", request.slice(2));
  }
  return originalResolveFilename.call(this, request, ...args);
};

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

function timer() {
  const start = Date.now();
  return {
    elapsed: () => ((Date.now() - start) / 1000).toFixed(1) + "s",
    ms: () => Date.now() - start,
  };
}

async function main() {
  const totalTimer = timer();

  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("  FULL LEAD DATA — Rechtsanwalt Thalgau + Mondsee (alle Firmen)");
  console.log("═══════════════════════════════════════════════════════════════════\n");

  const { extractWithGemini, buildCeoName } = require("@/lib/enrichment/gemini");

  const testCases = [
    { query: "Rechtsanwalt", location: "Thalgau" },
    { query: "Rechtsanwalt", location: "Mondsee" },
  ];

  const allLeads: Record<string, unknown>[] = [];
  const stats = { places: 0, withWebsite: 0, scraped: 0, enriched: 0, withCeo: 0, totalScrapeMs: 0, totalGeminiMs: 0 };

  for (const { query, location } of testCases) {
    console.log(`\n${"━".repeat(65)}`);
    console.log(`  "${query}" in "${location}"`);
    console.log(`${"━".repeat(65)}`);

    const t = timer();
    const places = await searchGooglePlaces(query, location);
    console.log(`  → ${places.length} Places (${t.elapsed()})`);
    stats.places += places.length;

    const withWebsite = places.filter((p) => p.websiteUri);
    stats.withWebsite += withWebsite.length;
    console.log(`  → ${withWebsite.length} davon mit Website\n`);

    for (let i = 0; i < withWebsite.length; i++) {
      const place = withWebsite[i];
      const name = place.displayName?.text || "?";
      console.log(`  ┌─ [${i + 1}/${withWebsite.length}] ${name}`);
      console.log(`  │  ${place.formattedAddress}`);
      console.log(`  │  ${place.websiteUri}`);

      // Scraping
      const tScrape = timer();
      const websiteData = await fetchWebsiteData(place.websiteUri!).catch(() => null);
      const scrapeMs = tScrape.ms();
      stats.totalScrapeMs += scrapeMs;

      if (!websiteData) {
        console.log(`  │  ❌ Scraping fehlgeschlagen (${tScrape.elapsed()})`);
        console.log(`  └─\n`);
        continue;
      }
      stats.scraped++;

      console.log(`  │  Seiten: ${websiteData.pagesLoaded.join(", ")} (${tScrape.elapsed()})`);
      console.log(`  │  Emails: ${websiteData.emails.length > 0 ? websiteData.emails.slice(0, 3).join(", ") : "–"}`);
      console.log(`  │  Phones: ${websiteData.phones.length > 0 ? websiteData.phones.slice(0, 3).join(", ") : "–"}`);

      // Gemini
      const tGemini = timer();
      const geminiResult = await extractWithGemini({
        companyName: name,
        website: place.websiteUri,
        address: place.formattedAddress || "",
        phone: place.internationalPhoneNumber || place.nationalPhoneNumber || null,
        pagesLoaded: websiteData.pagesLoaded,
        websiteContent: websiteData.websiteContent,
        emails: websiteData.emails,
        phones: websiteData.phones,
      });
      const geminiMs = tGemini.ms();
      stats.totalGeminiMs += geminiMs;

      if (!geminiResult) {
        console.log(`  │  ❌ Gemini fehlgeschlagen (${tGemini.elapsed()})`);
        console.log(`  └─\n`);
        continue;
      }
      stats.enriched++;

      const ceoName = buildCeoName(geminiResult);
      if (ceoName) stats.withCeo++;

      // Build full lead object
      const lead = {
        company: geminiResult.company_name || name,
        ceo_name: ceoName,
        ceo_title: geminiResult.ceo_title,
        ceo_first_name: geminiResult.ceo_first_name,
        ceo_last_name: geminiResult.ceo_last_name,
        ceo_gender: geminiResult.ceo_gender,
        ceo_source: geminiResult.ceo_source,
        email: geminiResult.email,
        phone: geminiResult.phone,
        website: place.websiteUri,
        industry: geminiResult.industry,
        legal_form: geminiResult.legal_form,
        street: geminiResult.street,
        city: geminiResult.city,
        postal_code: geminiResult.postal_code,
        country: geminiResult.country,
        google_rating: place.rating ?? null,
        google_reviews: place.userRatingCount ?? null,
        social_linkedin: websiteData.socialLinkedin,
        social_facebook: websiteData.socialFacebook,
        social_instagram: websiteData.socialInstagram,
        confidence: geminiResult.confidence_score,
        _timing: { scrape: `${(scrapeMs / 1000).toFixed(1)}s`, gemini: `${(geminiMs / 1000).toFixed(1)}s` },
      };
      allLeads.push(lead);

      // Pretty output
      console.log(`  │`);
      console.log(`  │  ✅ LEAD DATA (Gemini: ${tGemini.elapsed()}):`);
      console.log(`  │  Firma:       ${lead.company}`);
      console.log(`  │  CEO:         ${lead.ceo_name || "–"} ${lead.ceo_title ? `(${lead.ceo_title})` : ""}`);
      console.log(`  │  Anrede:      ${lead.ceo_gender}`);
      console.log(`  │  CEO Quelle:  ${lead.ceo_source || "–"}`);
      console.log(`  │  Email:       ${lead.email || "–"}`);
      console.log(`  │  Telefon:     ${lead.phone || "–"}`);
      console.log(`  │  Branche:     ${lead.industry || "–"}`);
      console.log(`  │  Rechtsform:  ${lead.legal_form || "–"}`);
      console.log(`  │  Adresse:     ${lead.street || "–"}, ${lead.postal_code || "–"} ${lead.city || "–"}, ${lead.country || "–"}`);
      console.log(`  │  Rating:      ${lead.google_rating || "–"} (${lead.google_reviews || 0} Reviews)`);
      console.log(`  │  LinkedIn:    ${lead.social_linkedin || "–"}`);
      console.log(`  │  Facebook:    ${lead.social_facebook || "–"}`);
      console.log(`  │  Instagram:   ${lead.social_instagram || "–"}`);
      console.log(`  │  Confidence:  ${lead.confidence}`);
      console.log(`  └─\n`);

      // 500ms Pause zwischen Firmen (Gemini Rate Limit)
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // ── Summary ──
  console.log(`\n${"═".repeat(65)}`);
  console.log(`  ZUSAMMENFASSUNG`);
  console.log(`${"═".repeat(65)}\n`);
  console.log(`  Gesamtzeit:        ${totalTimer.elapsed()}`);
  console.log(`  Places gefunden:   ${stats.places}`);
  console.log(`  Davon mit Website: ${stats.withWebsite}`);
  console.log(`  Erfolgreich gescrapet: ${stats.scraped}`);
  console.log(`  Gemini-Ergebnis:   ${stats.enriched}`);
  console.log(`  Mit CEO gefunden:  ${stats.withCeo} / ${stats.enriched}`);
  console.log(`  Ø Scraping-Zeit:   ${stats.scraped > 0 ? (stats.totalScrapeMs / stats.scraped / 1000).toFixed(1) : "–"}s`);
  console.log(`  Ø Gemini-Zeit:     ${stats.enriched > 0 ? (stats.totalGeminiMs / stats.enriched / 1000).toFixed(1) : "–"}s`);
  console.log(`  Ø Total pro Firma: ${stats.enriched > 0 ? ((stats.totalScrapeMs + stats.totalGeminiMs) / stats.enriched / 1000).toFixed(1) : "–"}s`);

  console.log(`\n── Alle Leads als JSON ──\n`);
  console.log(JSON.stringify(allLeads, null, 2));
}

// ── Google Places ──

async function searchGooglePlaces(query: string, location: string): Promise<GooglePlace[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY!;
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.googleMapsUri,places.businessStatus,places.types,places.id",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ textQuery: `${query} in ${location}`, languageCode: "de", maxResultCount: 20 }),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return (data.places || []) as GooglePlace[];
}

// ── Smart Scraping ──

interface WebsiteData {
  emails: string[]; phones: string[]; websiteContent: string; pagesLoaded: string[];
  socialLinkedin: string | null; socialFacebook: string | null; socialInstagram: string | null;
  socialXing: string | null; socialTwitter: string | null; socialYoutube: string | null; socialTiktok: string | null;
}

const RELEVANT_PATHS = ["impressum","imprint","team","kontakt","contact","about","ueber-uns","unternehmen","management","anwalt","kanzlei"];

async function fetchSitemapUrls(baseUrl: string): Promise<string[]> {
  try {
    const r = await fetch(baseUrl + "/sitemap.xml", { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadBot/1.0)" }, redirect: "follow" });
    if (!r.ok) return [];
    const xml = await r.text();
    const urls = [...xml.matchAll(/<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    const relevant = urls.filter((u) => { const p = new URL(u).pathname.toLowerCase(); return RELEVANT_PATHS.some((kw) => p.includes(kw)); });
    return relevant.slice(0, 3);
  } catch { return []; }
}

function classifyUrl(url: string): string {
  const p = new URL(url).pathname.toLowerCase();
  if (p === "/" || p === "") return "homepage";
  if (p.includes("impressum") || p.includes("imprint")) return "impressum";
  if (p.includes("kontakt") || p.includes("contact")) return "kontakt";
  if (p.includes("team") || p.includes("management")) return "team";
  if (p.includes("about") || p.includes("ueber-uns")) return "about";
  return "other";
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadBot/1.0)" }, redirect: "follow" });
    if (!r.ok) return null;
    if (!(r.headers.get("content-type") || "").includes("text/html")) return null;
    return await r.text();
  } catch { return null; }
}

function extractFromHtml(html: string) {
  const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi,"").replace(/<style[^>]*>[\s\S]*?<\/style>/gi,"").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim().substring(0,2000);
  const emails = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const phones = (html.match(/(?:\+[1-9]\d{0,2}|0)[\s\d\-\/()]{7,20}/g) || []).map((p) => p.replace(/[\s\-\/()]/g,""));
  const socials: Record<string, string | null> = {};
  const pats: [string, RegExp][] = [
    ["linkedin", /https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[^\s"'<>]+/i],
    ["facebook", /https?:\/\/([a-z]{2,3}\.)?facebook\.com\/(?!sharer)[^\s"'<>]+/i],
    ["instagram", /https?:\/\/([a-z]{2,3}\.)?instagram\.com\/(?!p\/)[^\s"'<>]+/i],
  ];
  for (const [n, p] of pats) { const m = html.match(p); socials[n] = m ? m[0].split('"')[0].split("'")[0].split("?")[0] : null; }
  return { text, emails, phones, socials };
}

async function fetchWebsiteData(baseUrl: string): Promise<WebsiteData> {
  const cleanBase = baseUrl.replace(/\/$/, "");
  const [homepageHtml, sitemapUrls] = await Promise.all([fetchPage(cleanBase), fetchSitemapUrls(cleanBase)]);
  let additional: { url: string; type: string }[];
  if (sitemapUrls.length > 0) { additional = sitemapUrls.map((u) => ({ url: u, type: classifyUrl(u) })); }
  else { additional = [{ url: cleanBase + "/impressum", type: "impressum" }, { url: cleanBase + "/kontakt", type: "kontakt" }]; }
  const results = await Promise.allSettled(additional.map((e) => fetchPage(e.url)));
  let combinedText = ""; const pagesLoaded: string[] = []; const emailsFound: string[] = []; const phonesFound: string[] = [];
  const allSocials: Record<string, string | null> = {};
  if (homepageHtml) {
    const d = extractFromHtml(homepageHtml); combinedText += `\n=== HOMEPAGE ===\n${d.text}\n`; pagesLoaded.push("homepage");
    emailsFound.push(...d.emails); phonesFound.push(...d.phones);
    for (const [k, v] of Object.entries(d.socials)) { if (v && !allSocials[k]) allSocials[k] = v; }
  }
  for (let i = 0; i < results.length; i++) {
    const r = results[i]; if (r.status !== "fulfilled" || !r.value) continue;
    const d = extractFromHtml(r.value); combinedText += `\n=== ${additional[i].type.toUpperCase()} ===\n${d.text}\n`;
    pagesLoaded.push(additional[i].type); emailsFound.push(...d.emails); phonesFound.push(...d.phones);
    for (const [k, v] of Object.entries(d.socials)) { if (v && !allSocials[k]) allSocials[k] = v; }
  }
  return {
    emails: [...new Set(emailsFound)], phones: [...new Set(phonesFound)], websiteContent: combinedText.substring(0, 8000), pagesLoaded,
    socialLinkedin: allSocials["linkedin"] || null, socialFacebook: allSocials["facebook"] || null, socialInstagram: allSocials["instagram"] || null,
    socialXing: allSocials["xing"] || null, socialTwitter: allSocials["twitter"] || null, socialYoutube: allSocials["youtube"] || null, socialTiktok: allSocials["tiktok"] || null,
  };
}

main().catch((err) => { console.error("💥 Fataler Fehler:", err); process.exit(1); });
