/**
 * Test: Direkt ki-kanzlei.at enrichen (Website Scraping + Gemini AI)
 * Verwendung: npx tsx scripts/test-ki-kanzlei.ts
 */

import { resolve } from "path";
import { config } from "dotenv";
config({ path: resolve(__dirname, "..", ".env.local") });

// Path alias resolver
const rootDir = resolve(__dirname, "..");
const Module = require("module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
  if (request.startsWith("@/")) {
    request = resolve(rootDir, "src", request.slice(2));
  }
  return originalResolveFilename.call(this, request, ...args);
};

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  TEST: ki-kanzlei.at Enrichment");
  console.log("═══════════════════════════════════════════════\n");

  const website = "https://www.ki-kanzlei.at";

  // ── Website Scraping ──
  console.log(`→ Scraping ${website} ...`);
  const urls = [
    { url: website, type: "homepage" },
    { url: website + "/impressum", type: "impressum" },
    { url: website + "/ueber-uns", type: "about" },
    { url: website + "/about", type: "about" },
    { url: website + "/kontakt", type: "kontakt" },
    { url: website + "/contact", type: "kontakt" },
    { url: website + "/team", type: "team" },
    { url: website + "/leistungen", type: "services" },
  ];

  let combinedText = "";
  const pagesLoaded: string[] = [];
  const emailsFound: string[] = [];
  const phonesFound: string[] = [];
  let socialLinkedin: string | null = null;
  let socialFacebook: string | null = null;
  let socialInstagram: string | null = null;

  for (const entry of urls) {
    try {
      const res = await fetch(entry.url, {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadBot/1.0)" },
        redirect: "follow",
      });

      if (!res.ok) {
        console.log(`  [${res.status}] ${entry.url}`);
        continue;
      }
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("text/html")) continue;

      const html = await res.text();
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 2500);

      combinedText += `\n\n=== ${entry.type.toUpperCase()} (${entry.url}) ===\n${text}\n`;
      pagesLoaded.push(entry.type);
      console.log(`  [200] ${entry.url} ✓`);

      // Emails
      const emails = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      emailsFound.push(...emails);

      // Phones
      const phones = html.match(/(?:\+[1-9]\d{0,2}|0)[\s\d\-\/()]{7,20}/g) || [];
      phonesFound.push(...phones.map((p) => p.replace(/[\s\-\/()]/g, "")));

      // Social
      if (!socialLinkedin) {
        const m = html.match(/https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[^\s"'<>]+/i);
        if (m) socialLinkedin = m[0];
      }
      if (!socialFacebook) {
        const m = html.match(/https?:\/\/([a-z]{2,3}\.)?facebook\.com\/(?!sharer)[^\s"'<>]+/i);
        if (m) socialFacebook = m[0].split('"')[0].split("'")[0].split("?")[0];
      }
      if (!socialInstagram) {
        const m = html.match(/https?:\/\/([a-z]{2,3}\.)?instagram\.com\/(?!p\/)[^\s"'<>]+/i);
        if (m) socialInstagram = m[0].split('"')[0].split("'")[0].split("?")[0];
      }
    } catch (err) {
      console.log(`  [ERR] ${entry.url}: ${err instanceof Error ? err.message : err}`);
      continue;
    }
  }

  const uniqueEmails = [...new Set(emailsFound)];
  const uniquePhones = [...new Set(phonesFound)];

  console.log(`\n─── Scraping Ergebnis ───`);
  console.log(`  Seiten geladen: ${pagesLoaded.join(", ")}`);
  console.log(`  Emails: ${uniqueEmails.length > 0 ? uniqueEmails.join(", ") : "–"}`);
  console.log(`  Phones: ${uniquePhones.length > 0 ? uniquePhones.slice(0, 5).join(", ") : "–"}`);
  console.log(`  LinkedIn: ${socialLinkedin || "–"}`);
  console.log(`  Facebook: ${socialFacebook || "–"}`);
  console.log(`  Instagram: ${socialInstagram || "–"}`);
  console.log(`  Content-Länge: ${combinedText.length} Zeichen`);
  console.log(`\n  Content-Vorschau (erste 500 Zeichen):`);
  console.log(`  ${combinedText.substring(0, 500).replace(/\n/g, "\n  ")}`);

  // ── Gemini AI ──
  console.log(`\n─── Gemini AI Extraktion ───`);
  const { extractWithGemini } = require("@/lib/enrichment/gemini");

  const geminiResult = await extractWithGemini({
    companyName: "KI Kanzlei",
    website,
    address: "Rossatzbach 3/2, 3602 Rossatz, Österreich",
    phone: null,
    pagesLoaded,
    websiteContent: combinedText.substring(0, 8000),
    ceoSnippets: "",
    emails: uniqueEmails,
    phones: uniquePhones,
  });

  if (geminiResult) {
    console.log("\n✅ Gemini Ergebnis:");
    console.log(JSON.stringify(geminiResult, null, 2));
  } else {
    console.log("\n⚠️  Gemini hat kein Ergebnis geliefert");
  }

  console.log("\n═══════════════════════════════════════════════");
  console.log("  FERTIG");
  console.log("═══════════════════════════════════════════════");
}

main().catch((err) => {
  console.error("💥 Fehler:", err);
  process.exit(1);
});
