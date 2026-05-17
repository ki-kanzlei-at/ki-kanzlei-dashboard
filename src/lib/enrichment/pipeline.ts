/* ── Enrichment Pipeline ──
 * Lead Enrichment Pipeline:
 * Google Places → Website Scraping → Gemini AI (mit Google Search Grounding) → Supabase Insert
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { extractWithGemini, buildCeoName } from "./gemini";
import { postalCodeToBundesland } from "@/lib/bundesland";
import type { GeminiInput } from "./gemini";
import type { LeadInsert } from "@/types/leads";

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
}

/* ── Region → Städte Mappings (AT / DE / CH) ── */
const REGION_CITIES: Record<string, string[]> = {
  // ── Österreich (9 Bundesländer) ──
  "Wien": ["Wien Innere Stadt", "Wien Leopoldstadt", "Wien Landstraße", "Wien Favoriten", "Wien Margareten", "Wien Mariahilf", "Wien Neubau", "Wien Josefstadt", "Wien Döbling", "Wien Floridsdorf", "Wien Ottakring", "Wien Hietzing"],
  "Niederösterreich": ["St. Pölten", "Wiener Neustadt", "Baden", "Krems an der Donau", "Amstetten", "Mödling", "Korneuburg", "Tulln", "Zwettl", "Mistelbach", "Hollabrunn", "Waidhofen an der Ybbs", "Stockerau", "Klosterneuburg", "Schwechat"],
  "Oberösterreich": ["Linz", "Wels", "Steyr", "Leonding", "Traun", "Braunau am Inn", "Ried im Innkreis", "Vöcklabruck", "Gmunden", "Enns", "Marchtrenk", "Bad Ischl", "Schärding", "Rohrbach", "Freistadt"],
  "Steiermark": ["Graz", "Leoben", "Kapfenberg", "Bruck an der Mur", "Leibnitz", "Feldbach", "Weiz", "Hartberg", "Judenburg", "Voitsberg", "Deutschlandsberg", "Murau", "Liezen", "Fürstenfeld", "Knittelfeld"],
  "Salzburg": ["Salzburg", "Hallein", "Wals-Siezenheim", "Seekirchen", "Saalfelden", "Bischofshofen", "St. Johann im Pongau", "Zell am See", "Straßwalchen", "Oberndorf bei Salzburg", "Mittersill", "Neumarkt am Wallersee", "Radstadt"],
  "Tirol": ["Innsbruck", "Kufstein", "Schwaz", "Hall in Tirol", "Wörgl", "Lienz", "Telfs", "Imst", "Landeck", "Reutte", "Kitzbühel", "St. Johann in Tirol", "Jenbach", "Zirl", "Rum"],
  "Kärnten": ["Klagenfurt", "Villach", "Wolfsberg", "Spittal an der Drau", "Feldkirchen", "St. Veit an der Glan", "Völkermarkt", "Hermagor", "Althofen", "Ferlach", "Bad St. Leonhard", "Friesach", "Gmünd", "Radenthein"],
  "Vorarlberg": ["Bregenz", "Dornbirn", "Feldkirch", "Bludenz", "Hohenems", "Lustenau", "Hard", "Rankweil", "Götzis", "Lauterach", "Wolfurt", "Schwarzach"],
  "Burgenland": ["Eisenstadt", "Oberwart", "Neusiedl am See", "Güssing", "Jennersdorf", "Mattersburg", "Oberpullendorf", "Pinkafeld", "Stegersbach", "Deutschkreutz", "Rust", "Frauenkirchen"],
  // ── Deutschland (16 Bundesländer) ──
  "Bayern": ["München", "Nürnberg", "Augsburg", "Regensburg", "Würzburg", "Ingolstadt", "Fürth", "Erlangen", "Bayreuth", "Landshut", "Rosenheim", "Bamberg", "Aschaffenburg", "Passau", "Kempten"],
  "Nordrhein-Westfalen": ["Köln", "Düsseldorf", "Dortmund", "Essen", "Duisburg", "Bochum", "Wuppertal", "Bielefeld", "Bonn", "Münster", "Aachen", "Krefeld", "Mönchengladbach", "Gelsenkirchen", "Oberhausen"],
  "Baden-Württemberg": ["Stuttgart", "Mannheim", "Karlsruhe", "Freiburg im Breisgau", "Heidelberg", "Ulm", "Heilbronn", "Pforzheim", "Reutlingen", "Konstanz", "Tübingen", "Offenburg", "Villingen-Schwenningen", "Esslingen", "Ludwigsburg"],
  "Berlin": ["Berlin Mitte", "Berlin Charlottenburg", "Berlin Kreuzberg", "Berlin Steglitz", "Berlin Spandau", "Berlin Tempelhof", "Berlin Pankow", "Berlin Neukölln", "Berlin Lichtenberg", "Berlin Reinickendorf"],
  "Hamburg": ["Hamburg Mitte", "Hamburg Altona", "Hamburg Eimsbüttel", "Hamburg Wandsbek", "Hamburg Bergedorf", "Hamburg Harburg", "Hamburg Nord", "Hamburg Blankenese", "Hamburg Barmbek", "Hamburg Winterhude"],
  "Hessen": ["Frankfurt am Main", "Wiesbaden", "Kassel", "Darmstadt", "Hanau", "Offenbach am Main", "Marburg", "Gießen", "Fulda", "Wetzlar", "Bad Homburg", "Rüsselsheim", "Limburg an der Lahn"],
  "Niedersachsen": ["Hannover", "Braunschweig", "Osnabrück", "Oldenburg", "Göttingen", "Wolfsburg", "Salzgitter", "Hildesheim", "Lüneburg", "Hameln", "Celle", "Delmenhorst", "Emden", "Lingen", "Wilhelmshaven"],
  "Rheinland-Pfalz": ["Mainz", "Ludwigshafen", "Koblenz", "Trier", "Kaiserslautern", "Worms", "Neuwied", "Neustadt an der Weinstraße", "Speyer", "Frankenthal", "Bad Kreuznach", "Andernach"],
  "Sachsen": ["Leipzig", "Dresden", "Chemnitz", "Zwickau", "Plauen", "Görlitz", "Freiberg", "Bautzen", "Pirna", "Meißen", "Döbeln", "Riesa"],
  "Thüringen": ["Erfurt", "Jena", "Gera", "Weimar", "Gotha", "Suhl", "Nordhausen", "Eisenach", "Altenburg", "Mühlhausen", "Ilmenau", "Saalfeld"],
  "Brandenburg": ["Potsdam", "Cottbus", "Brandenburg an der Havel", "Frankfurt an der Oder", "Oranienburg", "Eberswalde", "Bernau", "Falkensee", "Schwedt", "Königs Wusterhausen", "Strausberg", "Neuruppin"],
  "Sachsen-Anhalt": ["Halle", "Magdeburg", "Dessau-Roßlau", "Lutherstadt Wittenberg", "Stendal", "Merseburg", "Halberstadt", "Wernigerode", "Naumburg", "Bernburg", "Quedlinburg", "Schönebeck"],
  "Schleswig-Holstein": ["Kiel", "Lübeck", "Flensburg", "Neumünster", "Norderstedt", "Elmshorn", "Pinneberg", "Itzehoe", "Wedel", "Rendsburg", "Husum", "Bad Oldesloe"],
  "Mecklenburg-Vorpommern": ["Rostock", "Schwerin", "Neubrandenburg", "Stralsund", "Greifswald", "Wismar", "Güstrow", "Waren", "Anklam", "Parchim", "Bergen auf Rügen"],
  "Saarland": ["Saarbrücken", "Neunkirchen", "Homburg", "Völklingen", "Saarlouis", "Merzig", "St. Ingbert", "St. Wendel", "Dillingen", "Lebach"],
  "Bremen": ["Bremen", "Bremerhaven", "Bremen-Nord", "Vegesack"],
  // ── Schweiz (alle 26 Kantone) ──
  "Zürich": ["Zürich", "Winterthur", "Uster", "Dübendorf", "Dietikon", "Kloten", "Regensdorf", "Wädenswil", "Horgen", "Bülach"],
  "Bern": ["Bern", "Biel", "Thun", "Köniz", "Ostermundigen", "Steffisburg", "Langenthal", "Burgdorf", "Spiez", "Interlaken"],
  "Luzern": ["Luzern", "Kriens", "Emmen", "Horw", "Littau", "Sursee", "Willisau", "Hochdorf"],
  "Uri": ["Altdorf", "Erstfeld", "Bürglen", "Schattdorf", "Flüelen"],
  "Schwyz": ["Schwyz", "Einsiedeln", "Freienbach", "Küssnacht", "Arth", "Lachen"],
  "Obwalden": ["Sarnen", "Kerns", "Alpnach", "Engelberg", "Sachseln"],
  "Nidwalden": ["Stans", "Hergiswil", "Buochs", "Ennetbürgen", "Beckenried"],
  "Glarus": ["Glarus", "Näfels", "Netstal", "Ennenda", "Mollis"],
  "Zug": ["Zug", "Baar", "Cham", "Steinhausen", "Risch-Rotkreuz", "Hünenberg"],
  "Freiburg": ["Freiburg", "Bulle", "Villars-sur-Glâne", "Düdingen", "Murten", "Marly"],
  "Solothurn": ["Solothurn", "Olten", "Grenchen", "Bettlach", "Biberist", "Zuchwil"],
  "Basel-Stadt": ["Basel", "Riehen", "Bettingen"],
  "Basel-Landschaft": ["Liestal", "Allschwil", "Reinach", "Binningen", "Birsfelden", "Arlesheim", "Muttenz", "Pratteln"],
  "Schaffhausen": ["Schaffhausen", "Neuhausen am Rheinfall", "Thayngen", "Beringen"],
  "Appenzell Ausserrhoden": ["Herisau", "Teufen", "Speicher", "Heiden", "Bühler"],
  "Appenzell Innerrhoden": ["Appenzell", "Oberegg", "Rüte", "Gonten"],
  "St. Gallen": ["St. Gallen", "Rapperswil-Jona", "Wil", "Gossau", "Arbon", "Rorschach", "Buchs", "Altstätten"],
  "Graubünden": ["Chur", "Davos", "St. Moritz", "Arosa", "Ilanz", "Landquart", "Thusis"],
  "Aargau": ["Aarau", "Baden", "Wettingen", "Brugg", "Rheinfelden", "Zofingen", "Lenzburg", "Wohlen", "Oftringen"],
  "Thurgau": ["Frauenfeld", "Kreuzlingen", "Arbon", "Amriswil", "Weinfelden", "Romanshorn"],
  "Tessin": ["Lugano", "Bellinzona", "Locarno", "Mendrisio", "Chiasso", "Ascona", "Biasca"],
  "Waadt": ["Lausanne", "Montreux", "Renens", "Nyon", "Yverdon-les-Bains", "Morges", "Vevey", "Pully", "Aigle"],
  "Wallis": ["Sion", "Brig-Glis", "Visp", "Monthey", "Martigny", "Sierre", "Naters"],
  "Neuenburg": ["Neuenburg", "La Chaux-de-Fonds", "Le Locle", "Val-de-Travers", "Boudry"],
  "Genf": ["Genf", "Carouge", "Lancy", "Meyrin", "Vernier", "Onex", "Thônex", "Plan-les-Ouates"],
  "Jura": ["Delémont", "Porrentruy", "Saignelégier", "Courrendlin", "Bassecourt"],
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
];

function sanitizeEmail(email: string): string {
  return email
    .trim()
    .replace(/%20/g, "")
    .replace(/%40/g, "@")
    .replace(/^['"]+|['"]+$/g, "")
    .toLowerCase();
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

function selectBestEmail(emails: string[], companyWebsite: string): string | null {
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
  const { jobId, userId, query, location, country, companyType = "all", city, requireCeo = false } = params;

  try {
    const startTime = Date.now();
    await updateJobStatus(jobId, "running", { started_at: new Date().toISOString() });

    // Determine search locations: specific city, or Bundesland → expand to cities
    let searchLocations: string[];
    if (city) {
      // User specified a specific city
      searchLocations = [city];
      console.log(`[Pipeline] Start: "${query}" in Stadt "${city}" (Job: ${jobId})`);
    } else if (REGION_CITIES[location]) {
      // Region selected → search all cities
      searchLocations = REGION_CITIES[location];
      console.log(`[Pipeline] Start: "${query}" in ${location} (${searchLocations.length} Städte) (Job: ${jobId})`);
    } else {
      // Fallback: use location as-is
      searchLocations = [location];
      console.log(`[Pipeline] Start: "${query} in ${location}" (Job: ${jobId})`);
    }

    // Google Places Suche über alle Städte
    const allPlaces: GooglePlace[] = [];
    const seenPlaceIds = new Set<string>();

    for (const loc of searchLocations) {
      console.log(`[Pipeline] Suche in: "${query} in ${loc}"`);
      const places = await searchGooglePlaces(query, loc);
      // Deduplicate by Google Place ID
      for (const p of places) {
        if (!seenPlaceIds.has(p.id)) {
          seenPlaceIds.add(p.id);
          allPlaces.push(p);
        }
      }
    }

    console.log(`[Pipeline] ${allPlaces.length} Places gefunden (${searchLocations.length} Städte durchsucht)`);

    if (allPlaces.length === 0) {
      await updateJobStatus(jobId, "completed", {
        results_count: 0,
        total_count: 0,
        completed_at: new Date().toISOString(),
      });
      return;
    }

    await updateJobStatus(jobId, "running", { total_count: allPlaces.length });

    // Für jede Firma: Enrichment
    let resultsCount = 0;
    let processedCount = 0;
    const timings: number[] = [];

    for (let i = 0; i < allPlaces.length; i++) {
      const place = allPlaces[i];
      const companyName = place.displayName?.text || "Unbekannt";
      const companyStart = Date.now();

      // Cancellation Check bei jeder Firma
      const cancelled = await isJobCancelled(jobId);
      if (cancelled) {
        console.log(`[Pipeline] Job ${jobId} abgebrochen bei ${i}/${allPlaces.length}`);
        await updateJobStatus(jobId, "failed", {
          error_message: "Vom Benutzer abgebrochen",
          results_count: resultsCount,
          completed_at: new Date().toISOString(),
        });
        return;
      }

      try {
        console.log(`[Pipeline] [${i + 1}/${allPlaces.length}] ${companyName}`);
        const lead = await enrichAndBuildLead(place, query, location, country, userId, jobId);

        if (!lead) {
          console.log(`[Pipeline]   → Skip (keine valide Email)`);
        } else if (companyType !== "all" && lead.legal_form && !matchesCompanyType(lead.legal_form, companyType)) {
          console.log(`[Pipeline]   → Skip (Rechtsform ${lead.legal_form} ≠ ${companyType})`);
        } else if (requireCeo && !lead.ceo_name) {
          console.log(`[Pipeline]   → Skip (kein Geschäftsführer gefunden, requireCeo aktiv)`);
        } else {
          // Duplikatsprüfung: google_place_id ODER email
          const dupeChecks: string[] = [];
          if (lead.google_place_id) dupeChecks.push(`google_place_id.eq.${lead.google_place_id}`);
          if (lead.email) dupeChecks.push(`email.eq.${lead.email}`);

          let isDuplicate = false;
          if (dupeChecks.length > 0) {
            const { data: existing } = await getSupabaseAdmin()
              .from("leads")
              .select("id")
              .or(dupeChecks.join(","))
              .limit(1);
            isDuplicate = !!existing && existing.length > 0;
          }

          if (isDuplicate) {
            console.log(`[Pipeline]   → Skip (Duplikat: place_id oder email existiert bereits)`);
          } else {
            const { error } = await getSupabaseAdmin().from("leads").insert(lead);
            if (error) {
              console.error(`[Pipeline]   → Insert-Fehler:`, error.message);
            } else {
              resultsCount++;
            }
          }
        }
      } catch (err) {
        console.error(`[Pipeline]   → Fehler:`, err);
      }

      processedCount++;
      timings.push(Date.now() - companyStart);
      await updateETA(jobId, resultsCount, processedCount, allPlaces.length, timings);

      // Kleine Pause zwischen Firmen um API Rate-Limits zu vermeiden
      if (i < allPlaces.length - 1) await sleep(300);
    }

    await updateJobStatus(jobId, "completed", {
      results_count: resultsCount,
      completed_at: new Date().toISOString(),
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Pipeline] Job ${jobId} fertig: ${resultsCount} Leads in ${elapsed}s`);
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
): Promise<void> {
  const remaining = totalCount - processedCount;
  const recentTimings = timings.slice(-10);
  const avgMs = recentTimings.reduce((a, b) => a + b, 0) / recentTimings.length;
  const estimatedRemainingMs = remaining * avgMs;
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

async function searchGooglePlaces(query: string, location: string): Promise<GooglePlace[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY ist nicht gesetzt");

  const allPlaces: GooglePlace[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 5; page++) {
    const body: Record<string, unknown> = {
      textQuery: `${query} in ${location}`,
      languageCode: "de",
      maxResultCount: 20,
    };
    if (pageToken) body.pageToken = pageToken;

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
    await sleep(300);
  }

  return allPlaces;
}

/* ══════════════════════════════════════════════════════
   Website Scraping
   ══════════════════════════════════════════════════════ */

async function fetchWebsiteData(baseUrl: string): Promise<WebsiteData> {
  const cleanBase = baseUrl.replace(/\/$/, "");

  const urls = [
    { url: cleanBase, type: "homepage" },
    { url: cleanBase + "/impressum", type: "impressum" },
    { url: cleanBase + "/imprint", type: "impressum" },
    { url: cleanBase + "/ueber-uns", type: "about" },
    { url: cleanBase + "/about", type: "about" },
    { url: cleanBase + "/about-us", type: "about" },
    { url: cleanBase + "/unternehmen", type: "about" },
    { url: cleanBase + "/team", type: "team" },
    { url: cleanBase + "/unser-team", type: "team" },
    { url: cleanBase + "/partner", type: "team" },
    { url: cleanBase + "/geschaeftsfuehrung", type: "team" },
    { url: cleanBase + "/management", type: "team" },
    { url: cleanBase + "/kontakt", type: "kontakt" },
    { url: cleanBase + "/contact", type: "kontakt" },
  ];

  const seenTypes: Record<string, number> = {};
  const filteredUrls = urls.filter((u) => {
    seenTypes[u.type] = (seenTypes[u.type] || 0) + 1;
    return u.type === "homepage" || seenTypes[u.type] <= 2;
  });

  let combinedText = "";
  const pagesLoaded: string[] = [];
  const emailsFound: string[] = [];
  const phonesFound: string[] = [];
  let socialLinkedin: string | null = null;
  let socialFacebook: string | null = null;
  let socialInstagram: string | null = null;
  let socialXing: string | null = null;
  let socialTwitter: string | null = null;
  let socialYoutube: string | null = null;
  let socialTiktok: string | null = null;

  for (const entry of filteredUrls) {
    try {
      const response = await fetch(entry.url, {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadBot/1.0)" },
        redirect: "follow",
      });

      if (!response.ok) continue;
      const ct = response.headers.get("content-type") || "";
      if (!ct.includes("text/html")) continue;

      const html = await response.text();

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

      combinedText += `\n\n=== ${entry.type.toUpperCase()} ===\n${text}\n`;
      pagesLoaded.push(entry.type);

      // Emails
      const emails = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      emailsFound.push(...emails);

      // Phones
      const phones = html.match(/(?:\+[1-9]\d{0,2}|0)[\s\d\-\/()]{7,20}/g) || [];
      phonesFound.push(...phones.map((p) => p.replace(/[\s\-\/()]/g, "")));

      // Social Links
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
      if (!socialXing) {
        const m = html.match(/https?:\/\/([a-z]{2,3}\.)?xing\.com\/(?:profile|companies)\/[^\s"'<>]+/i);
        if (m) socialXing = m[0].split('"')[0].split("'")[0].split("?")[0];
      }
      if (!socialTwitter) {
        const m = html.match(/https?:\/\/([a-z]{2,3}\.)?(twitter\.com|x\.com)\/(?!intent|share)[^\s"'<>]+/i);
        if (m) socialTwitter = m[0].split('"')[0].split("'")[0].split("?")[0];
      }
      if (!socialYoutube) {
        const m = html.match(/https?:\/\/([a-z]{2,3}\.)?youtube\.com\/(channel|c|user|@)[^\s"'<>]+/i);
        if (m) socialYoutube = m[0].split('"')[0].split("'")[0].split("?")[0];
      }
      if (!socialTiktok) {
        const m = html.match(/https?:\/\/([a-z]{2,3}\.)?tiktok\.com\/@[^\s"'<>]+/i);
        if (m) socialTiktok = m[0].split('"')[0].split("'")[0].split("?")[0];
      }
    } catch {
      continue;
    }
  }

  return {
    emails: [...new Set(emailsFound)],
    phones: [...new Set(phonesFound)],
    websiteContent: combinedText.substring(0, 8000),
    pagesLoaded,
    socialLinkedin, socialFacebook, socialInstagram, socialXing,
    socialTwitter, socialYoutube, socialTiktok,
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
): Promise<LeadInsert | null> {
  const companyName = place.displayName?.text || "";
  const website = (place.websiteUri || "").replace(/\/$/, "");

  // Website scrapen (CEO-Suche macht jetzt Gemini via Google Search Grounding)
  const websiteData = website
    ? await fetchWebsiteData(website).catch((err) => {
        console.warn(`[Pipeline] Website-Scraping fehlgeschlagen für ${website}:`, err instanceof Error ? err.message : err);
        return null;
      })
    : null;

  // Valide Emails aus Scraping
  const validEmails = (websiteData?.emails || []).map(sanitizeEmail).filter(isValidEmail);

  // Gemini AI Extraktion mit Google Search Grounding
  // Gemini sucht selbst bei Google nach dem Geschäftsführer
  const geminiInput: GeminiInput = {
    companyName,
    website,
    address: place.formattedAddress || "",
    phone: place.internationalPhoneNumber || place.nationalPhoneNumber || null,
    pagesLoaded: websiteData?.pagesLoaded || [],
    websiteContent: websiteData?.websiteContent || "",
    ceoSnippets: "",
    emails: validEmails,
    phones: websiteData?.phones || [],
  };
  const aiResult = await extractWithGemini(geminiInput);

  // Email: Gemini's Vorschlag prüfen, dann Fallback auf eigene Logik
  let bestEmail: string | null = null;
  if (aiResult?.email) {
    const aiEmail = sanitizeEmail(aiResult.email);
    if (isValidEmail(aiEmail)) bestEmail = aiEmail;
  }
  if (!bestEmail) {
    bestEmail = selectBestEmail(websiteData?.emails || [], website);
  }

  // Keine valide Email → skip
  if (!bestEmail) return null;

  // Phone: Gemini's Vorschlag oder Google Places
  const bestPhone =
    aiResult?.phone ||
    place.internationalPhoneNumber ||
    place.nationalPhoneNumber ||
    (websiteData?.phones?.[0] || null);

  // CEO Name zusammenbauen
  const ceoName = aiResult ? buildCeoName(aiResult) : null;

  // Adresse: Gemini oder Fallback
  const fallbackAddress = parseAddress(place.formattedAddress || "", country);

  const postalCode = aiResult?.postal_code || fallbackAddress.postalCode || null;
  const leadCountry = aiResult?.country || fallbackAddress.country || country;
  const state = postalCodeToBundesland(postalCode);

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
    state: state,
    country: leadCountry,
    category: null,
    industry: aiResult?.industry || capitalizeFirst(query),
    legal_form: aiResult?.legal_form || null,
    employee_count: null,
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
    social_xing: websiteData?.socialXing || null,
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

function matchesCompanyType(legalForm: string, filter: string): boolean {
  const lf = legalForm.toLowerCase();
  switch (filter) {
    case "gmbh": return lf.includes("gmbh") && !lf.includes("co kg");
    case "eu": return lf.includes("e.u.") || lf.includes("einzelunternehmen");
    case "ag": return lf.includes("ag") && !lf.includes("gmbh");
    case "og": return lf.includes("og");
    case "kg": return lf.includes("kg") && !lf.includes("gmbh");
    case "gmbh_cokg": return lf.includes("gmbh") && lf.includes("co kg");
    default: return true;
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
