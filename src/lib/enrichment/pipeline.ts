/* ── Enrichment Pipeline ──
 * Lead Enrichment Pipeline:
 * Google Places → Website Scraping → Gemini AI (mit Google Search Grounding via tools API) → Supabase Insert
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { extractWithGemini, buildCeoName, verifyCeoOrNull, verifyEmailOrNull } from "./gemini";
import { getSearchBoxes, type BoundingBox } from "./regions";
import { placeMatchesRegion } from "./plz-region";
import type { ExtractionStats, GeminiInput } from "./gemini";
import type { LeadInsert } from "@/types/leads";

/* ── Telemetry: Pro-Job-Counter für Kosten und Performance-Analyse ── */
interface JobStats {
  googlePlacesPages: number;     // einzelne Page-Calls (×0.017€ Text Search Pro)
  geminiStage1: number;          // ~$0.001 pro Call (flash)
  geminiStage2: number;          // ~$0.035 pro Call (flash + grounding)
  scrapes: number;
  inserts: number;
  duplicatesSkipped: number;
  noEmailSkipped: number;
  noCeoSkipped: number;
  geminiSkipped: number;         // Pre-Check verhinderte Gemini-Call
  boxSplits: number;             // adaptive Splittings
  offRegionSkipped: number;      // PLZ liegt in anderer Region (Bounding-Box-Bleed)
}
function newJobStats(): JobStats {
  return {
    googlePlacesPages: 0,
    geminiStage1: 0,
    geminiStage2: 0,
    scrapes: 0,
    inserts: 0,
    duplicatesSkipped: 0,
    noEmailSkipped: 0,
    noCeoSkipped: 0,
    geminiSkipped: 0,
    boxSplits: 0,
    offRegionSkipped: 0,
  };
}
function estimateCostCents(s: JobStats): { google: number; gemini: number; total: number } {
  // Text Search (Pro) ≈ €0.017/Call ≈ 1.7 cent (Google "SKU: Text Search Pro" 2026)
  const google = s.googlePlacesPages * 1.7;
  // Gemini 2.5-flash: Stage 1 ~ €0.001 = 0.1 cent, Stage 2 (mit Grounding) ~ €0.035 = 3.5 cent
  const gemini = s.geminiStage1 * 0.1 + s.geminiStage2 * 3.5;
  return { google: Math.round(google), gemini: Math.round(gemini), total: Math.round(google + gemini) };
}

/* ══════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════ */

interface PipelineParams {
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
  /** Tech-Stack-Filter (shopify, wordpress, …) — Lead muss mind. eine Tech haben. */
  techStack?: string[];
  /** Pflicht-Stichwort im Website-Inhalt. */
  websiteKeyword?: string;
  /** Mindest-Mitarbeiterzahl (AI-Schätzung). */
  minEmployees?: number;
  /** Obergrenze gespeicherter Leads; sobald erreicht, stoppt der Lauf. */
  maxResults?: number;
}

/* ── Legal-Form Fallback aus Firmennamen ──
 * Konservative Regex-Erkennung mit Wortgrenzen (\b), damit „AG" nicht in
 * „AGmedia" oder „Magnesia" matched. Reihenfolge: spezifischer vor allgemeiner
 * (GmbH & Co KG vor GmbH/KG). Wird nur als Fallback genutzt wenn Gemini nichts
 * liefert — keine Halluzination, weil der Match literal im Firmennamen steht.
 */
function detectLegalFormFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  const patterns: Array<[RegExp, string]> = [
    /* Kombinationen (spezifisch zuerst) */
    [/\bGmbH\s*&\s*Co\.?\s*KGaA\b/i, "GmbH & Co KGaA"],
    [/\bGmbH\s*&\s*Co\.?\s*KG\b/i,    "GmbH & Co KG"],
    [/\bGmbH\s*&\s*Co\.?\s*OHG\b/i,   "GmbH & Co OHG"],
    [/\bAG\s*&\s*Co\.?\s*KG\b/i,      "AG & Co KG"],
    /* Mehrbuchstabige eindeutige Formen */
    [/\bGmbH\b/i,                      "GmbH"],
    [/\bKGaA\b/,                        "KGaA"],
    [/\bOHG\b/i,                        "OHG"],
    [/\bGbR\b/,                         "GbR"],
    [/\bPart\s*GmbB\b/i,                "PartG mbB"],
    [/\bPartG\b/i,                      "PartG"],
    [/\bFlexCo\b/i,                     "FlexCo"],
    [/\bUG\s*\(haftungsbeschränkt\)/i, "UG"],
    [/\bKlG\b/,                         "KlG"],
    [/\bKmG\b/,                         "KmG"],
    /* Punktierte Kurzformen */
    [/\be\.\s*U\.?\b/i,                 "e.U."],
    [/\be\.\s*V\.?\b/i,                 "e.V."],
    /* Zweibuchstabige Kurzformen — case-sensitive damit „og" in „Yoga" nicht trifft */
    [/\bAG\b/,                          "AG"],
    [/\bKG\b/,                          "KG"],
    [/\bOG\b/,                          "OG"],
    [/\bUG\b/,                          "UG"],
    [/\bSE\b/,                          "SE"],
  ];
  for (const [re, label] of patterns) {
    if (re.test(name)) return label;
  }
  return null;
}

/* ── Phone & Email Cleanup Utilities ── */

/** Normalisiert eine Telefonnummer ins E.164-Format für AT/DE/CH */
function normalizePhone(phone: string, defaultCountry: string = "AT"): string {
  let cleaned = phone.replace(/[\s\-\/().\u00a0]/g, "");
  if (!cleaned) return phone;
  // Bereits internationales Format
  if (cleaned.startsWith("+")) return cleaned;
  // Nationale Nummer → internationales Format
  if (cleaned.startsWith("0")) {
    const prefix = defaultCountry === "DE" ? "+49" : defaultCountry === "CH" ? "+41" : "+43";
    cleaned = prefix + cleaned.substring(1);
  }
  return cleaned;
}

/** Entfernt Spam-Schutz-Strings aus Emails */
function cleanSpamProtection(email: string): string {
  return email
    .replace(/NOSPAM/gi, "")
    .replace(/REMOVETHIS/gi, "")
    .replace(/SPAM/gi, "")
    .replace(/\[at\]/gi, "@")
    .replace(/\[dot\]/gi, ".")
    .replace(/\.invalid$/i, "");
}

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

interface WebsiteData {
  emails: string[];
  phones: string[];
  websiteContent: string;
  pagesLoaded: string[];
  /** Erkannte Website-Technologien (shopify, wordpress, …) aus dem Homepage-HTML */
  techStack: string[];
  socialLinkedin: string | null;
  socialFacebook: string | null;
  socialInstagram: string | null;
  socialXing: string | null;
  socialTwitter: string | null;
  socialYoutube: string | null;
  socialTiktok: string | null;
}

/* ── Website-Tech-Stack-Fingerprint ──
 * Erkennt verbreitete CMS/Shop-Systeme aus dem rohen Homepage-HTML
 * (Marker in Markup/Script-Pfaden). Konservativ — nur eindeutige Treffer.
 * Keys spiegeln TECH_STACK_OPTIONS (types/leads). */
const TECH_PATTERNS: Array<[string, RegExp]> = [
  ["shopify",     /cdn\.shopify\.com|\.myshopify\.com|Shopify\.theme/i],
  ["woocommerce", /woocommerce/i],
  ["wordpress",   /wp-content|wp-includes|content="WordPress/i],
  ["wix",         /static\.wixstatic\.com|_wixCssImports|wixsite\.com/i],
  ["squarespace", /static1\.squarespace\.com|squarespace\.com/i],
  ["webflow",     /\.webflow\.io|data-wf-page|assets\.website-files\.com/i],
  ["shopware",    /shopware/i],
  ["jtl",         /jtl-shop|JTLSHOP/i],
  ["typo3",       /typo3conf|\/typo3\//i],
  ["joomla",      /Joomla!|\/media\/jui\//i],
  ["jimdo",       /jimdo|jimcdn\.com/i],
];

function detectTechStack(html: string): string[] {
  if (!html) return [];
  const found: string[] = [];
  for (const [key, re] of TECH_PATTERNS) {
    if (re.test(html)) found.push(key);
  }
  // WooCommerce läuft immer auf WordPress → „wordpress"-Filter soll WooCommerce-Sites mittreffen
  if (found.includes("woocommerce") && !found.includes("wordpress")) found.push("wordpress");
  return found;
}

/* ══════════════════════════════════════════════════════
   Email Validation & Filtering
   ══════════════════════════════════════════════════════ */

const BLOCKED_EMAIL_DOMAINS = [
  "domain.com", "example.com", "example.org", "example.net",
  "website.at", "website.de", "website.com",
  "test.com", "test.at", "test.de",
  "google.com", "googleapis.com",
  "wixpress.com", "wix.com",
  "sentry.io", "sentry.com",
  "lettersoup.de",
  "placeholder.com",
  "firmenabc.at",
];

/** Substrings die irgendwo in der Email vorkommen → blockieren */
const BLOCKED_EMAIL_SUBSTRINGS = [
  "wixpress", "sentry", "schema", "googletagmanager",
  "w3.org", "jquery", "bootstrap", "fontawesome",
  "@2x", ".png", ".jpg", ".svg", ".gif", ".webp",
  ".css", ".js", ".woff", ".ttf", ".eot",
];

const BLOCKED_EMAIL_PREFIXES = [
  "benutzer", "user", "maxmustermann", "mustermann", "muster",
  "test", "example", "noreply", "no-reply", "dpo-google", "dpo",
  "mailer-daemon", "postmaster",
];

const DEPRIORITIZED_EMAIL_PREFIXES = [
  "bewerbung", "karriere", "jobs", "career",
  "dsb", "datenschutz", "privacy", "dsgvo",
  "newsletter", "marketing", "spam",
  "webmaster", "admin", "root",
  // Generische Rollen-Postfächer, bei denen sich „kein Schwein meldet"
  "presse", "press", "media", "pr",
  "service", "kundenservice", "kundendienst", "support", "helpdesk", "hilfe",
  "abuse", "billing", "buchhaltung", "rechnung", "invoice",
];

/** Lokalteil gehört zur Entscheider-Person? (z. B. „m.mustermann", „max.mustermann", „mustermann") */
function emailMatchesPerson(prefix: string, ceoName?: string | null): boolean {
  if (!ceoName) return false;
  const TITLES = new Set(["mag", "dr", "ing", "di", "mba", "herr", "frau", "prof", "dipl", "msc", "bsc"]);
  const names = ceoName.toLowerCase()
    .replace(/[^a-zäöüß\s.-]/g, " ")
    .split(/\s+/)
    .map((p) => p.replace(/\./g, "").trim())
    .filter((p) => p.length >= 3 && !TITLES.has(p));
  if (names.length === 0) return false;
  const p = prefix.toLowerCase().replace(/[._-]/g, "");
  // Nachname (längster Teil) sollte im Lokalteil stecken
  const lastName = names.reduce((a, b) => (b.length > a.length ? b : a), "");
  return p.includes(lastName);
}

function sanitizeEmail(email: string): string {
  let cleaned = email
    .trim()
    .replace(/%20/g, "")
    .replace(/%40/g, "@")
    .replace(/^['"]+|['"]+$/g, "");
  // Remove spam protection strings (officeNOSPAM@ → office@)
  cleaned = cleanSpamProtection(cleaned);
  return cleaned.toLowerCase();
}

function isValidEmail(email: string): boolean {
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) return false;
  const [prefix, domain] = email.split("@");

  // Exakte Domain oder Subdomain-Match (sentry-next.wixpress.com → wixpress.com blocked)
  if (BLOCKED_EMAIL_DOMAINS.some((bd) => domain === bd || domain.endsWith("." + bd))) return false;

  // Substring-Match über die ganze Email
  if (BLOCKED_EMAIL_SUBSTRINGS.some((sub) => email.includes(sub))) return false;

  if (BLOCKED_EMAIL_PREFIXES.some((bp) => prefix.startsWith(bp))) return false;
  if (/^\d{4,}/.test(prefix)) return false;
  return true;
}

function selectBestEmail(emails: string[], companyWebsite: string, ceoName?: string | null): string | null {
  if (emails.length === 0) return null;

  let companyDomain = "";
  try {
    const url = new URL(companyWebsite);
    companyDomain = url.hostname.replace(/^www\./, "").toLowerCase();
  } catch { /* ignore */ }

  const cleaned = emails
    .map(sanitizeEmail)
    .filter(isValidEmail)
    .filter((e, i, arr) => arr.indexOf(e) === i);

  if (cleaned.length === 0) return null;

  const onDomain = cleaned.filter((e) => companyDomain && e.endsWith("@" + companyDomain));
  const offDomain = cleaned.filter((e) => !companyDomain || !e.endsWith("@" + companyDomain));

  const preferred = ["office@", "info@", "kontakt@", "contact@", "kanzlei@"];
  const deprioritized = DEPRIORITIZED_EMAIL_PREFIXES;

  function emailScore(email: string): number {
    const prefix = email.split("@")[0];
    // Persönliche Entscheider-Adresse schlägt alles (z. B. m.mustermann@…)
    if (emailMatchesPerson(prefix, ceoName)) return -1;
    if (preferred.some((p) => email.startsWith(p))) return 0;
    if (deprioritized.some((dp) => prefix.startsWith(dp))) return 2;
    return 1;
  }

  const sorted = [...onDomain].sort((a, b) => emailScore(a) - emailScore(b));
  if (sorted.length > 0) return sorted[0];

  const sortedOff = [...offDomain]
    .filter((e) => !deprioritized.some((dp) => e.split("@")[0].startsWith(dp)))
    .sort((a, b) => emailScore(a) - emailScore(b));

  return sortedOff[0] || null;
}

/* ══════════════════════════════════════════════════════
   Main Pipeline
   ══════════════════════════════════════════════════════ */

export async function runEnrichmentPipeline(params: PipelineParams): Promise<void> {
  const {
    jobId,
    userId,
    query,
    location,
    country,
    companyType = "all",
    city,
    requireCeo = false,
    requireEmail = false,
    requireWebsite = false,
    techStack = [],
    websiteKeyword,
    minEmployees,
    maxResults,
  } = params;
  const stats = newJobStats();

  try {
    const startTime = Date.now();
    await updateJobStatus(jobId, "running", { started_at: new Date().toISOString() });

    // Multi-Branchen-Support: Komma-getrennte Query → einzelne Branchen abarbeiten
    const branches = parseBranches(query);

    // Google Places Suche: Bounding Box (Region) oder Text (Stadt)
    // Pro Branche separate Suche, Places per place.id dedupliziert.
    // Wir merken uns für jeden Place die zuerst-matchende Branche → für Lead.industry.
    const placeIndex = new Map<string, { place: GooglePlace; branch: string }>();

    const isRegionMode = !city && getSearchBoxes(location).length > 0;
    for (const branch of branches) {
      let branchPlaces: GooglePlace[];
      if (city) {
        console.log(`[Pipeline] Branche "${branch}" in Stadt "${city}" (Job: ${jobId})`);
        branchPlaces = await searchGooglePlaces(branch, { location: city, stats }).then((r) => r.places);
      } else if (isRegionMode) {
        console.log(`[Pipeline] Branche "${branch}" in Region "${location}" via Bounding Box (Job: ${jobId})`);
        branchPlaces = await searchRegion(branch, location, stats);
      } else {
        console.log(`[Pipeline] Branche "${branch}" in "${location}" via Textsuche (Job: ${jobId})`);
        branchPlaces = await searchGooglePlaces(branch, { location, stats }).then((r) => r.places);
      }

      // ── Off-Region-Filter (nur im Region-Mode, vor Pipeline-Verarbeitung) ──
      // Wir filtern Places deren PLZ in einer anderen DACH-Region liegt.
      // Spart Gemini-Calls für Leads die wir eh wegwerfen würden.
      if (isRegionMode) {
        const before = branchPlaces.length;
        branchPlaces = branchPlaces.filter((p) => placeMatchesRegion(p.formattedAddress, country, location));
        const dropped = before - branchPlaces.length;
        if (dropped > 0) {
          stats.offRegionSkipped += dropped;
          console.log(`[Pipeline] Off-Region-Filter: ${dropped} Places gedroppt (nicht in ${location})`);
        }
      }

      for (const p of branchPlaces) {
        if (!placeIndex.has(p.id)) placeIndex.set(p.id, { place: p, branch });
      }
      console.log(`[Pipeline] Branche "${branch}": ${branchPlaces.length} Places (gesamt unique: ${placeIndex.size})`);

      // Bei Multi-Branche: total_count live updaten, damit UI Progress zeigt während weitere Branchen gesucht werden
      if (branches.length > 1) {
        await updateJobStatus(jobId, "running", { total_count: placeIndex.size });
      }
    }

    const allPlaces: GooglePlace[] = [...placeIndex.values()].map((e) => e.place);
    const branchByPlaceId = new Map<string, string>(
      [...placeIndex.entries()].map(([id, e]) => [id, e.branch]),
    );

    console.log(`[Pipeline] ${allPlaces.length} Places gefunden (${branches.length} Branche${branches.length > 1 ? "n" : ""})`);

    if (allPlaces.length === 0) {
      await updateJobStatus(jobId, "completed", {
        results_count: 0,
        total_count: 0,
        completed_at: new Date().toISOString(),
      });
      return;
    }

    await updateJobStatus(jobId, "running", { total_count: allPlaces.length });

    // ── Batch-Dupe-Check: alle bekannten place_ids vorab laden statt pro Lead ──
    // Spart N × 100-300ms Supabase-Roundtrips. Bei 200 Places: 20-60s Ersparnis.
    const dupeCheckStart = Date.now();
    const placeIdList = allPlaces.map((p) => p.id).filter(Boolean);
    const { data: existingRows } = await getSupabaseAdmin()
      .from("leads")
      .select("google_place_id, email")
      .in("google_place_id", placeIdList.length > 0 ? placeIdList : ["__none__"]);
    const existingPlaceIds = new Set<string>(
      (existingRows || []).map((r) => r.google_place_id).filter((v): v is string => !!v),
    );
    const existingEmails = new Set<string>(
      (existingRows || []).map((r) => (r.email || "").toLowerCase()).filter(Boolean),
    );
    console.log(`[Pipeline] Batch-Dupe-Check: ${existingPlaceIds.size} bekannte Place-IDs, ${existingEmails.size} bekannte Emails (${((Date.now() - dupeCheckStart) / 1000).toFixed(1)}s)`);

    // Worker Pool — Sweet Spot lt. Benchmark: 25. Mit Gemini-Skips kann höher gehen.
    // Override via PIPELINE_CONCURRENCY. Gemini-Semaphore (GEMINI_GLOBAL_CONCURRENCY) deckelt cross-job.
    const CONCURRENCY = parseInt(process.env.PIPELINE_CONCURRENCY || "25", 10);
    let resultsCount = 0;
    let processedCount = 0;
    const timings: number[] = [];
    let cancelledFlag = false;
    // Cancellation: check once every 10 companies instead of every single one
    let lastCancelCheck = 0;
    const CANCEL_CHECK_INTERVAL = 10;

    const queue = [...allPlaces];
    let queueIndex = 0;
    // Obergrenze: sobald genug Leads gespeichert sind, stoppen alle Worker.
    let limitReached = false;
    // Synchron reservierte Insert-Slots → harter Cap ohne Overshoot trotz paralleler Worker.
    let reservedCount = 0;

    const workers = Array.from({ length: Math.min(CONCURRENCY, allPlaces.length) }, async (_, workerId) => {
      while (queue.length > 0 && !cancelledFlag && !limitReached) {
        const place = queue.shift()!;
        const idx = queueIndex++;
        const companyName = place.displayName?.text || "Unbekannt";
        const companyStart = Date.now();

        // Cancellation Check (shared flag, nur alle N Firmen DB-Query)
        if (idx - lastCancelCheck >= CANCEL_CHECK_INTERVAL) {
          lastCancelCheck = idx;
          cancelledFlag = await isJobCancelled(jobId);
          if (cancelledFlag) {
            console.log(`[Pipeline] Job ${jobId} abgebrochen bei ${processedCount}/${allPlaces.length}`);
            await updateJobStatus(jobId, "failed", {
              error_message: "Vom Benutzer abgebrochen",
              results_count: resultsCount,
              completed_at: new Date().toISOString(),
            });
            return;
          }
        }

        try {
          console.log(`[Pipeline] [W${workerId}] [${idx + 1}/${allPlaces.length}] ${companyName}`);

          // 1. Schneller Pre-Dupe-Check (kein Pipeline-Aufwand wenn schon im CRM)
          if (place.id && existingPlaceIds.has(place.id)) {
            console.log(`[Pipeline] [W${workerId}]   → Skip (Duplikat - place_id schon im CRM)`);
            stats.duplicatesSkipped++;
            processedCount++;
            timings.push(Date.now() - companyStart);
            await updateETA(jobId, resultsCount, processedCount, allPlaces.length, timings, CONCURRENCY);
            continue;
          }

          // 2. Pre-Check: ist überhaupt Lead-Potenzial da?
          // Bei keiner Website UND keiner Phone → keine Möglichkeit für Email → Drop ohne API-Call
          const hasWebsite = !!place.websiteUri;
          const hasPhone = !!(place.internationalPhoneNumber || place.nationalPhoneNumber);
          if (!hasWebsite && !hasPhone) {
            console.log(`[Pipeline] [W${workerId}]   → Skip (kein Website + keine Phone)`);
            stats.geminiSkipped++;
            stats.noEmailSkipped++;
            processedCount++;
            timings.push(Date.now() - companyStart);
            await updateETA(jobId, resultsCount, processedCount, allPlaces.length, timings, CONCURRENCY);
            continue;
          }

          // Optimierung: Tech-/Keyword-Filter brauchen zwingend eine Website.
          // Ohne Website kann nichts matchen → direkt skippen, spart den Enrich-Call.
          if ((techStack.length > 0 || websiteKeyword) && !hasWebsite) {
            console.log(`[Pipeline] [W${workerId}]   → Skip (kein Website, aber Tech/Keyword-Filter aktiv)`);
            processedCount++;
            timings.push(Date.now() - companyStart);
            await updateETA(jobId, resultsCount, processedCount, allPlaces.length, timings, CONCURRENCY);
            continue;
          }

          // 3. Hauptarbeit: enrich (Gemini-Calls werden in stats getrackt)
          const matchedBranch = branchByPlaceId.get(place.id) || branches[0] || query;
          const lead = await withTimeout(
            enrichAndBuildLead(place, matchedBranch, location, country, userId, jobId, stats, requireCeo, {
              techStack, websiteKeyword, minEmployees,
            }),
            COMPANY_TIMEOUT_MS,
            `Timeout bei "${companyName}" nach ${COMPANY_TIMEOUT_MS / 1000}s`,
          );

          if (!lead) {
            console.log(`[Pipeline] [W${workerId}]   → Skip (keine valide Email oder Filter nicht erfüllt)`);
            stats.noEmailSkipped++;
          } else if (companyType !== "all" && !matchesCompanyType(lead.legal_form ?? "", companyType)) {
            console.log(`[Pipeline] [W${workerId}]   → Skip (Rechtsform ${lead.legal_form ?? "unbekannt"} ≠ ${companyType}, strikt)`);
          } else if (requireCeo && !lead.ceo_name) {
            console.log(`[Pipeline] [W${workerId}]   → Skip (kein Geschäftsführer gefunden, requireCeo aktiv)`);
            stats.noCeoSkipped++;
          } else if (requireEmail && !lead.email) {
            console.log(`[Pipeline] [W${workerId}]   → Skip (keine E-Mail gefunden, requireEmail aktiv)`);
            stats.noEmailSkipped++;
          } else if (requireWebsite && !lead.website) {
            console.log(`[Pipeline] [W${workerId}]   → Skip (keine Website gefunden, requireWebsite aktiv)`);
          } else if (minEmployees && (!lead.employee_count || lead.employee_count < minEmployees)) {
            console.log(`[Pipeline] [W${workerId}]   → Skip (Mitarbeiter ${lead.employee_count ?? "?"} < ${minEmployees})`);
          } else {
            // 4. Email-Dupe-Check (gegen lokales Set, kein DB-Roundtrip)
            const emailLower = (lead.email || "").toLowerCase();
            if (emailLower && existingEmails.has(emailLower)) {
              console.log(`[Pipeline] [W${workerId}]   → Skip (Duplikat - email schon im CRM)`);
              stats.duplicatesSkipped++;
            } else if (maxResults && reservedCount >= maxResults) {
              // Harter Cap: Slot wird SYNCHRON reserviert (kein await zwischen Check und ++),
              // daher kann kein zweiter Worker dieselbe Reservierung gewinnen → kein Overshoot.
              limitReached = true;
            } else {
              // Slot reservieren, bevor der async-Insert läuft
              if (maxResults) reservedCount++;
              // Insert + lokale Sets updaten (gegen Race-Condition zwischen Workers)
              const { error } = await getSupabaseAdmin().from("leads").insert(lead);
              if (error) {
                if (maxResults) reservedCount--; // Slot wieder freigeben
                // Wenn unique-constraint greift, ist's auch ein Dupe → ok
                if (error.code === "23505") {
                  console.log(`[Pipeline] [W${workerId}]   → Skip (Race-Duplikat von DB abgefangen)`);
                  stats.duplicatesSkipped++;
                } else {
                  console.error(`[Pipeline] [W${workerId}]   → Insert-Fehler:`, error.message);
                }
              } else {
                resultsCount++;
                stats.inserts++;
                if (place.id) existingPlaceIds.add(place.id);
                if (emailLower) existingEmails.add(emailLower);
                // Obergrenze erreicht → restliche Worker stoppen
                if (maxResults && resultsCount >= maxResults) {
                  limitReached = true;
                  console.log(`[Pipeline] Limit von ${maxResults} Leads erreicht — Lauf wird gestoppt.`);
                }
              }
            }
          }
        } catch (err) {
          console.error(`[Pipeline] [W${workerId}]   → Fehler:`, err);
        }

        processedCount++;
        timings.push(Date.now() - companyStart);
        await updateETA(jobId, resultsCount, processedCount, allPlaces.length, timings, CONCURRENCY);
      }
    });

    await Promise.all(workers);
    if (cancelledFlag) return;

    await updateJobStatus(jobId, "completed", {
      results_count: resultsCount,
      completed_at: new Date().toISOString(),
    });
    const elapsedSec = (Date.now() - startTime) / 1000;
    const cost = estimateCostCents(stats);
    const leadsPerEuro = cost.total > 0 ? (resultsCount * 100 / cost.total).toFixed(1) : "∞";
    console.log(`[Pipeline] ══════ Job ${jobId} fertig in ${elapsedSec.toFixed(1)}s ══════`);
    console.log(`[Pipeline] Ergebnis:  ${resultsCount} Leads inserted (${allPlaces.length} Places gescannt)`);
    console.log(`[Pipeline] Google:    ${stats.googlePlacesPages} Page-Calls (${stats.boxSplits} adaptive Splits)`);
    console.log(`[Pipeline] Gemini:    Stage1=${stats.geminiStage1}, Stage2=${stats.geminiStage2} (${stats.geminiSkipped} pre-skipped)`);
    console.log(`[Pipeline] Pipeline:  ${stats.scrapes} scrapes, ${stats.duplicatesSkipped} dupes, ${stats.noEmailSkipped} no-email, ${stats.noCeoSkipped} no-ceo, ${stats.offRegionSkipped} off-region`);
    console.log(`[Pipeline] Kosten:    Google ~${(cost.google / 100).toFixed(2)}€, Gemini ~${(cost.gemini / 100).toFixed(2)}€, TOTAL ~${(cost.total / 100).toFixed(2)}€ (${leadsPerEuro} Leads/€)`);
  } catch (err) {
    console.error(`[Pipeline] Job ${jobId} fehlgeschlagen:`, err);
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    await updateJobStatus(jobId, "failed", {
      error_message: msg,
      completed_at: new Date().toISOString(),
    }).catch(() => {});
  }
}

/* ══════════════════════════════════════════════════════
   ETA Calculation
   ══════════════════════════════════════════════════════ */

async function updateETA(
  jobId: string,
  resultsCount: number,
  processedCount: number,
  totalCount: number,
  timings: number[],
  concurrency: number,
): Promise<void> {
  const remaining = totalCount - processedCount;
  const recentTimings = timings.slice(-25);
  const avgMs = recentTimings.length > 0
    ? recentTimings.reduce((a, b) => a + b, 0) / recentTimings.length
    : 1500;
  // Wichtig: Places werden parallel verarbeitet (Worker-Pool). Effektive Rate
  // = avgMs / Worker-Anzahl, sonst überschätzen wir ETA um Faktor 25.
  const effectiveMsPerPlace = avgMs / concurrency;
  const estimatedRemainingMs = remaining * effectiveMsPerPlace;
  const estimatedEnd = remaining > 0
    ? new Date(Date.now() + estimatedRemainingMs).toISOString()
    : null;

  await updateJobStatus(jobId, "running", {
    results_count: resultsCount,
    estimated_end_at: estimatedEnd,
  });
}

/* ══════════════════════════════════════════════════════
   Google Places API (mit Pagination)
   ══════════════════════════════════════════════════════ */

/** Google Places Text-Search Limits (API-seitig hart):
 * - 20 Treffer pro Page, max 3 Pages = 60 pro Query.
 * - Wenn nach Page 3 noch ein nextPageToken existiert, gibt es MEHR als 60 in der Box.
 *   In dem Fall splittet searchBoxAdaptive die Box in 4 Quadranten (rekursiv).
 *
 * Quellen: https://issuetracker.google.com/issues/35826799,
 *          https://blog.apify.com/google-places-api-limits/
 */
const ADAPTIVE_MAX_DEPTH = 4;     // 1+4+16+64+256 = max 341 Boxes (Min-Span stoppt aber früher)
const ADAPTIVE_MIN_LAT_SPAN = 0.05; // ≈ 5.5 km — feiner geht's Stadtteil-Ebene
const ADAPTIVE_MIN_LNG_SPAN = 0.05;

/** Google Places Suche: entweder per Bounding Box (Region) oder per Text (Stadt).
 * Liefert auch zurück, ob nach Page 3 noch ein nextPageToken existiert (= mehr als 60 Treffer in dieser Box).
 */
export async function searchGooglePlaces(
  query: string,
  options: { location?: string; boundingBox?: BoundingBox; stats?: JobStats },
): Promise<{ places: GooglePlace[]; hasMore: boolean }> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY ist nicht gesetzt");

  const allPlaces: GooglePlace[] = [];
  let pageToken: string | undefined;
  let hasMoreAfterLastPage = false;

  for (let page = 0; page < 3; page++) {
    const body: Record<string, unknown> = {
      textQuery: options.boundingBox ? query : `${query} in ${options.location}`,
      languageCode: "de",
      maxResultCount: 20,
    };
    if (pageToken) body.pageToken = pageToken;
    if (options.boundingBox) {
      body.locationRestriction = {
        rectangle: {
          low: { latitude: options.boundingBox.south, longitude: options.boundingBox.west },
          high: { latitude: options.boundingBox.north, longitude: options.boundingBox.east },
        },
      };
    }

    if (options.stats) options.stats.googlePlacesPages++;
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
      throw new Error(`Google Places API Fehler (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const places: GooglePlace[] = data.places || [];
    const filtered = places.filter((p) => p.websiteUri && p.businessStatus === "OPERATIONAL");
    allPlaces.push(...filtered);

    pageToken = data.nextPageToken;
    if (!pageToken) break;
    // Wenn das die letzte mögliche Page war und es noch ein Token gibt → Box ist überfüllt
    if (page === 2) hasMoreAfterLastPage = true;
    await sleep(300);
  }

  return { places: allPlaces, hasMore: hasMoreAfterLastPage };
}

/** Adaptive Box-Suche: splittet rekursiv in Quadranten, wenn eine Box >60 Treffer hat.
 * Verhindert Datenverlust in dichten Städten (z.B. "Anwalt" in Berlin/Wien).
 */
async function searchBoxAdaptive(
  query: string,
  box: BoundingBox,
  depth: number,
  seenIds: Set<string>,
  stats?: JobStats,
): Promise<GooglePlace[]> {
  const { places, hasMore } = await searchGooglePlaces(query, { boundingBox: box, stats });

  const fresh: GooglePlace[] = [];
  for (const p of places) {
    if (!seenIds.has(p.id)) {
      seenIds.add(p.id);
      fresh.push(p);
    }
  }

  // Box voll UND noch Splitting-Spielraum → vierteln und rekursiv suchen
  const canSplit =
    hasMore &&
    depth < ADAPTIVE_MAX_DEPTH &&
    (box.north - box.south) > ADAPTIVE_MIN_LAT_SPAN &&
    (box.east - box.west) > ADAPTIVE_MIN_LNG_SPAN;

  if (!canSplit) return fresh;

  console.log(`[Pipeline] Box voll (depth=${depth}, span=${(box.north - box.south).toFixed(3)}°×${(box.east - box.west).toFixed(3)}°), splitte in 4 Quadranten`);
  if (stats) stats.boxSplits++;
  const quads = splitInto4(box);
  const subResults = await Promise.all(
    quads.map((q) => searchBoxAdaptive(query, q, depth + 1, seenIds, stats)),
  );
  return [...fresh, ...subResults.flat()];
}

/** Teilt eine Box in 4 gleich große Quadranten (NE, NW, SE, SW). */
function splitInto4(box: BoundingBox): BoundingBox[] {
  const midLat = (box.south + box.north) / 2;
  const midLng = (box.west + box.east) / 2;
  return [
    { south: midLat, north: box.north, west: box.west, east: midLng },
    { south: midLat, north: box.north, west: midLng, east: box.east },
    { south: box.south, north: midLat, west: box.west, east: midLng },
    { south: box.south, north: midLat, west: midLng, east: box.east },
  ];
}

/** Sucht in einer Region über Bounding-Box-Grid mit adaptivem Sub-Splitting */
export async function searchRegion(query: string, regionName: string, stats?: JobStats): Promise<GooglePlace[]> {
  const boxes = getSearchBoxes(regionName);
  if (boxes.length === 0) {
    // Kein Bounding Box definiert → Fallback auf Textsuche
    console.log(`[Pipeline] Keine Bounding Box für "${regionName}", verwende Textsuche`);
    const { places } = await searchGooglePlaces(query, { location: regionName, stats });
    return places;
  }

  console.log(`[Pipeline] Region "${regionName}": ${boxes.length} Suchbereiche (adaptive Splitting aktiv)`);
  const seenIds = new Set<string>();

  // Alle Boxen parallel — adaptives Splitting passiert pro Box bei Bedarf
  const results = await Promise.allSettled(
    boxes.map((box) => searchBoxAdaptive(query, box, 0, seenIds, stats)),
  );

  const allPlaces: GooglePlace[] = [];
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    allPlaces.push(...result.value);
  }

  return allPlaces;
}

/** Zerlegt eine Komma-Liste in einzelne Branchen-Queries (trim, min 2 Zeichen, leer = Fallback). */
function parseBranches(rawQuery: string): string[] {
  const parts = (rawQuery || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  return parts.length > 0 ? parts : [rawQuery.trim()];
}

/* ══════════════════════════════════════════════════════
   Website Scraping
   ══════════════════════════════════════════════════════ */

/** Relevante Pfad-Keywords für Sitemap-URL-Filterung */
const RELEVANT_PATH_KEYWORDS = [
  "impressum", "imprint", "team", "kontakt", "contact",
  "about", "ueber-uns", "unternehmen", "management",
  "geschaeftsfuehrung", "partner", "anwalt", "anwaelte",
  "rechtsanwalt", "kanzlei",
];

/** Versucht /sitemap.xml zu laden und relevante URLs zu extrahieren */
async function fetchSitemapUrls(baseUrl: string): Promise<string[]> {
  try {
    const response = await fetch(baseUrl + "/sitemap.xml", {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadBot/1.0)" },
      redirect: "follow",
    });
    if (!response.ok) return [];
    const xml = await response.text();
    // Extract <loc> URLs from sitemap
    const urls = [...xml.matchAll(/<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    // Filter to relevant pages
    const relevant = urls.filter((url) => {
      const path = new URL(url).pathname.toLowerCase();
      return RELEVANT_PATH_KEYWORDS.some((kw) => path.includes(kw));
    });
    return relevant.slice(0, 3); // Max 3 additional pages
  } catch {
    return [];
  }
}

/** Klassifiziert eine URL nach Seitentyp */
function classifyUrl(url: string): string {
  const path = new URL(url).pathname.toLowerCase();
  if (path === "/" || path === "") return "homepage";
  if (path.includes("impressum") || path.includes("imprint")) return "impressum";
  if (path.includes("kontakt") || path.includes("contact")) return "kontakt";
  if (path.includes("team") || path.includes("management") || path.includes("geschaeftsfuehrung") || path.includes("partner")) return "team";
  if (path.includes("about") || path.includes("ueber-uns") || path.includes("unternehmen")) return "about";
  return "other";
}

/** Extrahiert Daten aus einer einzelnen HTML-Seite */
function extractPageData(html: string, pageType: string) {
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
  const socialPatterns: [string, RegExp][] = [
    ["linkedin", /https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[^\s"'<>]+/i],
    ["facebook", /https?:\/\/([a-z]{2,3}\.)?facebook\.com\/(?!sharer)[^\s"'<>]+/i],
    ["instagram", /https?:\/\/([a-z]{2,3}\.)?instagram\.com\/(?!p\/)[^\s"'<>]+/i],
    ["xing", /https?:\/\/([a-z]{2,3}\.)?xing\.com\/(?:profile|companies)\/[^\s"'<>]+/i],
    ["twitter", /https?:\/\/([a-z]{2,3}\.)?(twitter\.com|x\.com)\/(?!intent|share)[^\s"'<>]+/i],
    ["youtube", /https?:\/\/([a-z]{2,3}\.)?youtube\.com\/(channel|c|user|@)[^\s"'<>]+/i],
    ["tiktok", /https?:\/\/([a-z]{2,3}\.)?tiktok\.com\/@[^\s"'<>]+/i],
  ];
  for (const [name, pattern] of socialPatterns) {
    const m = html.match(pattern);
    socials[name] = m ? m[0].split('"')[0].split("'")[0].split("?")[0] : null;
  }

  return { text: `\n\n=== ${pageType.toUpperCase()} ===\n${text}\n`, emails, phones, socials };
}

/** Fetcht eine einzelne Seite mit Timeout */
async function fetchPage(url: string): Promise<{ url: string; html: string } | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadBot/1.0)" },
      redirect: "follow",
    });
    if (!response.ok) return null;
    const ct = response.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return null;
    return { url, html: await response.text() };
  } catch {
    return null;
  }
}

export async function fetchWebsiteData(baseUrl: string): Promise<WebsiteData> {
  const cleanBase = baseUrl.replace(/\/$/, "");
  const scrapingStart = Date.now();

  // Step 1+2: Homepage und Sitemap parallel laden
  const [homepageResult, sitemapUrls] = await Promise.all([
    fetchPage(cleanBase),
    fetchSitemapUrls(cleanBase),
  ]);

  // Step 3: Determine additional pages to fetch
  let additionalUrls: { url: string; type: string }[];
  if (sitemapUrls.length > 0) {
    // Sitemap found → use those URLs
    additionalUrls = sitemapUrls.map((url) => ({ url, type: classifyUrl(url) }));
    console.log(`[Scraping] Sitemap gefunden: ${sitemapUrls.length} relevante URLs`);
  } else {
    // No sitemap → fallback to /impressum + /kontakt only
    additionalUrls = [
      { url: cleanBase + "/impressum", type: "impressum" },
      { url: cleanBase + "/kontakt", type: "kontakt" },
    ];
  }

  // Step 4: Fetch additional pages in parallel
  const additionalResults = await Promise.allSettled(
    additionalUrls.map((entry) => fetchPage(entry.url)),
  );

  // Collect all results
  let combinedText = "";
  const pagesLoaded: string[] = [];
  const emailsFound: string[] = [];
  const phonesFound: string[] = [];
  const allSocials: Record<string, string | null> = {};

  // Process homepage
  if (homepageResult) {
    const data = extractPageData(homepageResult.html, "homepage");
    combinedText += data.text;
    pagesLoaded.push("homepage");
    emailsFound.push(...data.emails);
    phonesFound.push(...data.phones);
    for (const [k, v] of Object.entries(data.socials)) {
      if (v && !allSocials[k]) allSocials[k] = v;
    }
  }

  // Process additional pages
  for (let i = 0; i < additionalResults.length; i++) {
    const result = additionalResults[i];
    if (result.status !== "fulfilled" || !result.value) continue;
    const pageType = additionalUrls[i].type;
    const data = extractPageData(result.value.html, pageType);
    combinedText += data.text;
    pagesLoaded.push(pageType);
    emailsFound.push(...data.emails);
    phonesFound.push(...data.phones);
    for (const [k, v] of Object.entries(data.socials)) {
      if (v && !allSocials[k]) allSocials[k] = v;
    }
  }

  // Tech-Stack aus dem rohen Homepage-HTML (Marker stehen oft nur dort, nicht im Text)
  const techStack = homepageResult ? detectTechStack(homepageResult.html) : [];

  const elapsed = ((Date.now() - scrapingStart) / 1000).toFixed(1);
  console.log(`[Scraping] ${pagesLoaded.length} Seiten in ${elapsed}s (${pagesLoaded.join(", ")})${techStack.length ? ` · Tech: ${techStack.join(", ")}` : ""}`);

  return {
    emails: [...new Set(emailsFound)],
    phones: [...new Set(phonesFound)],
    websiteContent: combinedText.substring(0, 8000),
    pagesLoaded,
    techStack,
    socialLinkedin: allSocials["linkedin"] || null,
    socialFacebook: allSocials["facebook"] || null,
    socialInstagram: allSocials["instagram"] || null,
    socialXing: allSocials["xing"] || null,
    socialTwitter: allSocials["twitter"] || null,
    socialYoutube: allSocials["youtube"] || null,
    socialTiktok: allSocials["tiktok"] || null,
  };
}

/* ══════════════════════════════════════════════════════
   Enrich Single Place → LeadInsert
   ══════════════════════════════════════════════════════ */

async function enrichAndBuildLead(
  place: GooglePlace,
  query: string,
  location: string,
  country: string,
  userId: string,
  jobId: string,
  stats: JobStats,
  requireCeo: boolean,
  filters: { techStack?: string[]; websiteKeyword?: string; minEmployees?: number } = {},
): Promise<LeadInsert | null> {
  const companyName = place.displayName?.text || "";
  const website = (place.websiteUri || "").replace(/\/$/, "");
  const wantsTech = (filters.techStack?.length ?? 0) > 0;
  const wantsKeyword = !!filters.websiteKeyword?.trim();
  const wantsSize = (filters.minEmployees ?? 0) > 0;

  // Website scrapen (CEO-Suche macht jetzt Gemini via Google Search Grounding)
  const websiteData = website
    ? await fetchWebsiteData(website).then((r) => {
        stats.scrapes++;
        return r;
      }).catch((err) => {
        console.warn(`[Pipeline] Website-Scraping fehlgeschlagen für ${website}:`, err instanceof Error ? err.message : err);
        return null;
      })
    : null;

  // ── Pre-Gemini-Filter: Tech-Stack & Website-Keyword ──
  // Beide werden aus dem (gratis) Website-Scrape geprüft, BEVOR der teure Gemini-Call läuft.
  if (wantsTech || wantsKeyword) {
    // Ohne erreichbare Website kann weder Tech noch Keyword geprüft werden → verwerfen
    if (!websiteData) {
      console.log(`[Pipeline] Filter-Skip (keine Website für Tech/Keyword-Prüfung): ${companyName}`);
      return null;
    }
    if (wantsTech && !websiteData.techStack.some((t) => filters.techStack!.includes(t))) {
      console.log(`[Pipeline] Filter-Skip (Tech-Stack [${websiteData.techStack.join(",") || "none"}] passt nicht): ${companyName}`);
      return null;
    }
    if (wantsKeyword) {
      const kw = filters.websiteKeyword!.trim().toLowerCase();
      if (!websiteData.websiteContent.toLowerCase().includes(kw)) {
        console.log(`[Pipeline] Filter-Skip (Keyword "${filters.websiteKeyword}" nicht im Website-Inhalt): ${companyName}`);
        return null;
      }
    }
  }

  // Valide Emails aus Scraping
  const validEmails = (websiteData?.emails || []).map(sanitizeEmail).filter(isValidEmail);

  // Pre-Check 2: skip Gemini wenn Website nicht erreichbar UND keine Email gefunden UND nicht requireCeo/Größen-Filter
  // Gemini würde dann sowieso nichts finden können → drop ohne API-Call sparen
  const noViableSource = !websiteData && validEmails.length === 0;
  if (noViableSource && !requireCeo && !wantsSize) {
    stats.geminiSkipped++;
    return null;
  }

  // Gemini AI Extraktion. useGrounding nur wenn requireCeo=true (sonst keine teure Google-Search-Stage 2).
  const geminiInput: GeminiInput = {
    companyName,
    website,
    address: place.formattedAddress || "",
    phone: place.internationalPhoneNumber || place.nationalPhoneNumber || null,
    pagesLoaded: websiteData?.pagesLoaded || [],
    websiteContent: websiteData?.websiteContent || "",
    emails: validEmails,
    phones: websiteData?.phones || [],
  };
  // Adapter: ExtractionStats schreibt in unsere JobStats-Felder
  const geminiStatsAdapter: ExtractionStats = {
    get stage1Calls() { return stats.geminiStage1; },
    set stage1Calls(v: number) { stats.geminiStage1 = v; },
    get stage2Calls() { return stats.geminiStage2; },
    set stage2Calls(v: number) { stats.geminiStage2 = v; },
  };
  let aiResult = await extractWithGemini(geminiInput, {
    // Größen-Filter nutzt Grounding (echte Quellen wie LinkedIn/Register), wie der AI Researcher
    useGrounding: requireCeo || wantsSize,
    needSize: wantsSize,
    stats: geminiStatsAdapter,
  });

  // Anti-Gambling: Gemini-Ergebnisse verifizieren bevor wir sie verwenden
  if (aiResult) {
    // CEO-Verifikation: muss in Quelle stehen (Website-Content) oder via Grounding gefunden
    aiResult = verifyCeoOrNull(aiResult, websiteData?.websiteContent || "");
  }

  // Email: Gemini's Vorschlag prüfen, dann Fallback auf eigene Logik
  let bestEmail: string | null = null;
  if (aiResult?.email) {
    const aiEmail = sanitizeEmail(aiResult.email);
    if (isValidEmail(aiEmail)) {
      // Anti-Gambling: Email muss in scraped emails ODER website content vorkommen
      const verified = verifyEmailOrNull(aiEmail, websiteData?.emails || [], websiteData?.websiteContent || "");
      if (verified) bestEmail = verified;
    }
  }
  if (!bestEmail) {
    bestEmail = selectBestEmail(websiteData?.emails || [], website, aiResult ? buildCeoName(aiResult) : null);
  }

  // Keine valide Email → skip
  if (!bestEmail) return null;

  // Phone: Gemini's Vorschlag oder Google Places, normalisiert
  const rawPhone =
    aiResult?.phone ||
    place.internationalPhoneNumber ||
    place.nationalPhoneNumber ||
    (websiteData?.phones?.[0] || null);
  const bestPhone = rawPhone ? normalizePhone(rawPhone, country) : null;

  // CEO Name zusammenbauen
  const ceoName = aiResult ? buildCeoName(aiResult) : null;

  // Adresse: Gemini oder Fallback
  const fallbackAddress = parseAddress(place.formattedAddress || "", country);

  const postalCode = aiResult?.postal_code || fallbackAddress.postalCode || null;
  const leadCountry = aiResult?.country || fallbackAddress.country || country;
  // Hinweis: state-Spalte ist in der DB (noch) nicht angelegt. Migration 006 anwenden
  // damit Bundesland/Kanton-Filter im UI funktioniert. Bis dahin: weglassen.

  const lead: LeadInsert = {
    company: aiResult?.company_name || companyName,
    company_name: aiResult?.company_name || null,
    name: ceoName || aiResult?.company_name || companyName,
    email: bestEmail,
    phone: bestPhone,
    website,
    address: place.formattedAddress || null,
    street: aiResult?.street || fallbackAddress.street || null,
    city: aiResult?.city || fallbackAddress.city || location,
    postal_code: postalCode,
    country: leadCountry,
    industry: aiResult?.industry || capitalizeFirst(query),
    /* Fallback: Wenn Gemini keine Rechtsform liefert, aus dem Firmennamen extrahieren
     * (z.B. „Müller GmbH" → „GmbH"). Keine Halluzination, weil literal im Namen. */
    legal_form: aiResult?.legal_form
      || detectLegalFormFromName(aiResult?.company_name || companyName)
      || null,
    employee_count: aiResult?.employee_count ?? null,
    revenue: aiResult?.revenue ?? null,
    tech_stack: websiteData?.techStack && websiteData.techStack.length > 0 ? websiteData.techStack : null,
    ceo_name: ceoName,
    ceo_title: aiResult?.ceo_title || null,
    ceo_first_name: aiResult?.ceo_first_name || null,
    ceo_last_name: aiResult?.ceo_last_name || null,
    ceo_gender: aiResult?.ceo_gender || "unbekannt",
    ceo_source: aiResult?.ceo_source || null,
    notes: null,
    google_place_id: place.id || null,
    google_rating: place.rating ?? null,
    google_reviews_count: place.userRatingCount ?? null,
    social_linkedin: websiteData?.socialLinkedin || null,
    social_facebook: websiteData?.socialFacebook || null,
    social_instagram: websiteData?.socialInstagram || null,
    social_twitter: websiteData?.socialTwitter || null,
    social_youtube: websiteData?.socialYoutube || null,
    social_tiktok: websiteData?.socialTiktok || null,
    status: "new",
    search_query: query,
    search_location: location,
    search_job_id: jobId,
    raw_data: {
      source: "enrichment-pipeline",
      google_maps_url: place.googleMapsUri || null,
      category: (place.types || []).join(", "),
      emails_found: validEmails,
      phones_found: websiteData?.phones || [],
      pages_loaded: websiteData?.pagesLoaded || [],
      website_content_preview: websiteData?.websiteContent?.substring(0, 500) || null,
      confidence_score: aiResult?.confidence_score ?? null,
      ai_extraction: !!aiResult,
      // Default-Kurzbeschreibung „was sie tun" fürs Lead-Sheet (Website-Content ist eh da)
      ...(aiResult?.summary ? { ai_research: { summary: aiResult.summary, updated_at: new Date().toISOString() } } : {}),
    },
    user_id: userId,
  };

  return lead;
}

/* ══════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════ */

function parseAddress(address: string, defaultCountry: string) {
  if (!address) return { street: null, city: null, postalCode: null, country: defaultCountry };

  let country = defaultCountry;
  const lower = address.toLowerCase();
  if (lower.includes("österreich") || lower.includes("austria")) country = "AT";
  else if (lower.includes("deutschland") || lower.includes("germany")) country = "DE";
  else if (lower.includes("schweiz") || lower.includes("switzerland")) country = "CH";

  const parts = address.split(",").map((p) => p.trim());
  const street = parts[0] || null;
  let postalCode: string | null = null;
  let city: string | null = null;

  for (const part of parts.slice(1)) {
    const plzMatch = part.match(/^(\d{4,5})\s+(.+)/);
    if (plzMatch) {
      postalCode = plzMatch[1];
      city = plzMatch[2].trim();
      break;
    }
  }

  return { street, city, postalCode, country };
}

/* Strikte Rechtsform-Prüfung über AT/DE/CH. Unbekannte Filter → false (nichts durchlassen). */
function matchesCompanyType(legalForm: string, filter: string): boolean {
  if (!legalForm) return false;
  // Punkte/NBSP zu Leerzeichen, gepolstert für Wortgrenzen-Checks
  const lf = ` ${legalForm.toLowerCase().replace(/[. ]/g, " ").replace(/\s+/g, " ")} `;
  const has = (s: string) => lf.includes(s);
  const word = (s: string) => new RegExp(`(^| )${s}( |$)`).test(lf);
  const cokg = has("co") && word("kg");
  switch (filter) {
    case "gmbh_cokg": return has("gmbh") && cokg;
    case "gmbh":      return (has("gmbh") || has("gesellschaft mit beschränkter")) && !cokg;
    case "ag":        return (word("ag") || has("aktiengesellschaft")) && !has("gmbh") && !has("kgaa") && !has("kmag");
    case "kgaa":      return has("kgaa");
    case "kmag":      return has("kmag") || has("kommandit-ag");
    case "ug":        return word("ug") || has("haftungsbeschränkt");
    case "eu":        return has("e u") || has("einzelunternehmen");
    case "og":        return word("og") || has("offene gesellschaft");
    case "ohg":       return has("ohg") || has("offene handelsgesellschaft");
    case "kg":        return word("kg") && !has("gmbh") && !has("kgaa") && !has("kmg");
    case "kmg":       return has("kmg") || has("kommanditgesellschaft");
    case "klg":       return has("klg") || has("kollektivgesellschaft");
    case "gbr":       return has("gbr") || has("bürgerlichen rechts");
    case "se":        return word("se") || has("societas europaea");
    case "flexco":    return has("flexco") || has("flexible kapital");
    case "genossenschaft": return has("genossenschaft") || word("eg") || word("gen");
    case "stiftung":  return has("stiftung");
    case "partgmbb":  return has("mbb");
    case "partg":     return has("partg") || has("partnerschaftsgesellschaft");
    case "ev":        return has("e v") || has("eingetragener verein");
    case "verein":    return has("verein");
    default:          return false;
  }
}

async function updateJobStatus(
  jobId: string,
  status: string,
  extras: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("search_jobs")
    .update({ status, updated_at: new Date().toISOString(), ...extras })
    .eq("id", jobId);

  if (error) {
    console.error(`[Pipeline] Job-Status-Update fehlgeschlagen:`, error.message);
  }
}

async function isJobCancelled(jobId: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from("search_jobs")
    .select("status")
    .eq("id", jobId)
    .single();

  return data?.status === "failed";
}

function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const COMPANY_TIMEOUT_MS = parseInt(process.env.COMPANY_TIMEOUT_MS || "60000", 10);

/** Race gegen Timeout; rejects nach `ms` falls Promise hängt */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    timeout,
  ]);
}
