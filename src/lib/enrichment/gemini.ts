/* ── Gemini AI Extraktion ──
 * Repliziert den n8n Gemini-Prompt 1:1 (Lead Enrichment v11).
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { INDUSTRY_OPTIONS } from "@/types/leads";
import { geminiSemaphore } from "./semaphore";

const INDUSTRY_LIST = INDUSTRY_OPTIONS.map((o) => o.label).join(" | ");

export interface GeminiExtractionResult {
  company_name: string | null;
  ceo_title: string | null;
  ceo_first_name: string | null;
  ceo_last_name: string | null;
  ceo_gender: "herr" | "frau" | "divers" | "unbekannt";
  ceo_source: string | null;
  email: string | null;
  phone: string | null;
  industry: string | null;
  legal_form: string | null;
  street: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  confidence_score: number;
}

export interface GeminiInput {
  companyName: string;
  website: string;
  address: string;
  phone: string | null;
  pagesLoaded: string[];
  websiteContent: string;
  emails: string[];
  phones: string[];
}

const GEMINI_MODEL = "gemini-2.5-flash";
const SYSTEM_INSTRUCTION = "Du bist ein Daten-Extraktions-Spezialist fuer oesterreichische und deutsche Unternehmen. Antworte IMMER mit validem JSON ohne Markdown-Bloecke. Fuer ceo_gender NUR: herr, frau, divers, unbekannt. NIEMALS maennlich/weiblich! Bei Ehepaaren: nimm EINE Person. Fuer industry: waehle EXAKT einen Wert aus der vorgegebenen Liste.";

function is503(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  return e["status"] === 503 || String(e["message"] ?? "").includes("503");
}

/** Extract JSON from Gemini text response (grounding mode doesn't support responseMimeType) */
function parseJsonFromText(text: string): unknown {
  // Try direct parse first
  try { return JSON.parse(text); } catch { /* continue */ }
  // Extract from markdown code block
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) {
    try { return JSON.parse(match[1].trim()); } catch { /* continue */ }
  }
  // Try to find first { ... } block
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try { return JSON.parse(text.substring(start, end + 1)); } catch { /* continue */ }
  }
  return null;
}

/** Einzelner Gemini-Call mit Retry-Logik */
async function callGemini(
  genAI: GoogleGenerativeAI,
  prompt: string,
  useGrounding: boolean,
): Promise<GeminiExtractionResult | null> {
  const MAX_RETRIES = 3;
  const DELAYS = [2000, 5000, 15000];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const modelConfig: Record<string, unknown> = {
        model: GEMINI_MODEL,
        systemInstruction: SYSTEM_INSTRUCTION,
        generationConfig: useGrounding
          ? { temperature: 0.1 }
          : { temperature: 0.1, responseMimeType: "application/json" },
      };
      if (useGrounding) {
        modelConfig.tools = [{ googleSearch: {} }];
      }

      const model = genAI.getGenerativeModel(modelConfig as unknown as Parameters<GoogleGenerativeAI["getGenerativeModel"]>[0]);
      // Globaler Semaphore: max GEMINI_GLOBAL_CONCURRENCY parallele Calls
      const result = await geminiSemaphore.run(() => model.generateContent(prompt));
      const text = result.response.text();

      // Log grounding metadata if available
      if (useGrounding) {
        const meta = result.response.candidates?.[0]?.groundingMetadata;
        const sources = (meta as Record<string, unknown[]> | undefined)?.groundingChunks?.length ?? 0;
        console.info(`[Gemini] Grounding: ${sources} Quellen gefunden`);
      }

      const parsed = useGrounding ? parseJsonFromText(text) : JSON.parse(text);
      if (!parsed) {
        console.warn(`[Gemini] JSON-Parsing fehlgeschlagen: ${text.substring(0, 200)}`);
        return null;
      }
      return parsed as GeminiExtractionResult;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delay = is503(err) ? DELAYS[attempt] * 2 : DELAYS[attempt];
        const reason = is503(err) ? "503 overload" : "error";
        console.warn(`[Gemini] Retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms (${reason})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      console.error(`[Gemini] Fehlgeschlagen nach ${MAX_RETRIES} Retries:`, (err as Error).message?.substring(0, 150));
      return null;
    }
  }
  return null;
}

export interface ExtractionStats {
  stage1Calls: number;
  stage2Calls: number;
}

/**
 * 2-Stufen AI-Extraktion:
 * 1. Schneller Call OHNE Grounding (~2-3s, $0.001) — reicht wenn CEO auf Website steht
 * 2. Falls kein CEO UND opts.useGrounding=true: zweiter Call MIT Grounding (~8-10s, $0.035)
 *
 * `useGrounding`-Flag: nur bei requireCeo=true sinnvoll, sonst keine teure Google-Search-Suche.
 * Spart ~70% Grounding-Kosten bei gleicher CEO-Findungsrate.
 */
export async function extractWithGemini(
  input: GeminiInput,
  opts: { useGrounding?: boolean; stats?: ExtractionStats } = {},
): Promise<GeminiExtractionResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[Gemini] GEMINI_API_KEY nicht gesetzt, überspringe AI-Extraktion");
    return null;
  }

  const useGrounding = opts.useGrounding ?? false;
  const stats = opts.stats;
  const genAI = new GoogleGenerativeAI(apiKey);
  const prompt = buildPrompt(input);

  // Stage 1: Ohne Grounding (schnell + billig)
  if (stats) stats.stage1Calls++;
  const stage1 = await callGemini(genAI, prompt, false);
  if (stage1) {
    const result = postProcess(stage1);
    // Anti-Halluzination: Stage 1 ohne Grounding kann nicht "search" als Source haben
    // Gemini lügt manchmal — wir korrigieren auf "website" oder null
    if (result.ceo_source === "search") {
      result.ceo_source = result.ceo_first_name || result.ceo_last_name ? "website" : null;
    }
    const ceoName = buildCeoName({ ...result }); // Test ob CEO-Name valide
    if (ceoName) {
      console.info(`[Gemini] Stage 1 (ohne Grounding): CEO "${ceoName}" gefunden`);
      return result;
    }
    // Stage 1 hat Daten aber keinen CEO → Stage 2 nur wenn explizit gewünscht
    if (!useGrounding) {
      return result; // ohne Grounding fertig, CEO bleibt leer
    }
    console.info(`[Gemini] Stage 1: kein CEO → starte Grounding-Suche...`);
    if (stats) stats.stage2Calls++;
    const stage2 = await callGemini(genAI, prompt, true);
    if (stage2) {
      const result2 = postProcess(stage2);
      // Merge: CEO-Daten aus Stage 2, Rest aus Stage 1
      return {
        ...result,
        ceo_title: result2.ceo_title || result.ceo_title,
        ceo_first_name: result2.ceo_first_name || result.ceo_first_name,
        ceo_last_name: result2.ceo_last_name || result.ceo_last_name,
        ceo_gender: result2.ceo_first_name ? result2.ceo_gender : result.ceo_gender,
        ceo_source: result2.ceo_first_name ? result2.ceo_source : result.ceo_source,
      };
    }
    return result; // Stage 2 fehlgeschlagen, Stage 1 Daten zurückgeben
  }

  // Stage 1 komplett fehlgeschlagen → direkt mit Grounding nur falls erlaubt
  if (!useGrounding) {
    console.warn(`[Gemini] Stage 1 fehlgeschlagen, useGrounding=false → null`);
    return null;
  }
  console.warn(`[Gemini] Stage 1 fehlgeschlagen → direkt Grounding`);
  if (stats) stats.stage2Calls++;
  const fallback = await callGemini(genAI, prompt, true);
  if (fallback) return postProcess(fallback);

  console.error(`[Gemini] Alle Stufen fehlgeschlagen für "${input.companyName}"`);
  return null;
}

/** Entfernt Emojis und Pictogramme aus AI-Output (Gemini halluziniert manchmal Deko-Emojis). */
function stripEmojis(text: string | null | undefined): string | null {
  if (!text) return text ?? null;
  const cleaned = text
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")   // Emoji-Blöcke (Pictographs, Emoticons, Transport, Symbols Extended)
    .replace(/[\u{2600}-\u{27BF}]/gu, "")     // Misc Symbols + Dingbats
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "")   // Regional Indicator (Flaggen)
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")     // Variation Selectors
    .replace(/[\u{200D}\u{20E3}]/gu, "")      // Zero-Width Joiner + Keycap-Combiner
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

/** Post-Processing: Normalisierung, Validation, Cleanup */
function postProcess(parsed: GeminiExtractionResult): GeminiExtractionResult {
  // Emojis aus allen Text-Feldern strippen (Gemini halluziniert z.B. "🍕 Mario's Pizza")
  parsed.company_name  = stripEmojis(parsed.company_name);
  parsed.ceo_title     = stripEmojis(parsed.ceo_title);
  parsed.ceo_first_name = stripEmojis(parsed.ceo_first_name);
  parsed.ceo_last_name = stripEmojis(parsed.ceo_last_name);
  parsed.ceo_source    = stripEmojis(parsed.ceo_source);
  parsed.email         = stripEmojis(parsed.email);
  parsed.phone         = stripEmojis(parsed.phone);
  parsed.industry      = stripEmojis(parsed.industry);
  parsed.legal_form    = stripEmojis(parsed.legal_form);
  parsed.street        = stripEmojis(parsed.street);
  parsed.city          = stripEmojis(parsed.city);
  parsed.postal_code   = stripEmojis(parsed.postal_code);
  parsed.country       = stripEmojis(parsed.country);
  // Gender normalisieren
  parsed.ceo_gender = normalizeGender(parsed.ceo_gender);
  // Branche normalisieren
  parsed.industry = normalizeIndustry(parsed.industry);
  // Confidence Score validieren
  if (typeof parsed.confidence_score !== "number" || parsed.confidence_score < 0 || parsed.confidence_score > 1) {
    parsed.confidence_score = 0.5;
  }
  // CEO-Name Cleanup
  parsed.ceo_first_name = normalizeCeoName(parsed.ceo_first_name);
  parsed.ceo_last_name = normalizeCeoName(parsed.ceo_last_name);
  // Titel: nur ersten akademischen Grad behalten
  parsed.ceo_title = normalizeTitle(parsed.ceo_title);
  return parsed;
}

// Map ASCII-Keys (alte Werte) auf Labels mit Umlauten
const INDUSTRY_VALUE_TO_LABEL = new Map<string, string>();
const INDUSTRY_LABELS_LOWER = new Map<string, string>();
for (const opt of INDUSTRY_OPTIONS) {
  INDUSTRY_VALUE_TO_LABEL.set(opt.value.toLowerCase(), opt.label);
  INDUSTRY_LABELS_LOWER.set(opt.label.toLowerCase(), opt.label);
}

function normalizeIndustry(val: string | null | undefined): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  // Exakter Label-Match (Gemini gibt jetzt Labels zurück)
  const byLabel = INDUSTRY_LABELS_LOWER.get(trimmed.toLowerCase());
  if (byLabel) return byLabel;
  // Fallback: alter ASCII-Key (z.B. "Bautraeger" → "Bauträger")
  const byKey = INDUSTRY_VALUE_TO_LABEL.get(trimmed.toLowerCase());
  if (byKey) return byKey;
  return trimmed;
}

function normalizeGender(g: string | null | undefined): "herr" | "frau" | "divers" | "unbekannt" {
  if (!g) return "unbekannt";
  const v = g.toLowerCase().trim();
  if (["herr", "maennlich", "männlich", "male", "m"].includes(v)) return "herr";
  if (["frau", "weiblich", "female", "w", "f"].includes(v)) return "frau";
  if (["divers", "x", "nonbinary"].includes(v)) return "divers";
  return "unbekannt";
}

/** Normalisiert CEO-Namen: UPPERCASE→TitleCase, "unbekannt"→null */
function normalizeCeoName(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  // "unbekannt", "null", "–", "n/a" → null
  if (["unbekannt", "null", "n/a", "–", "-", "unknown", "keine"].includes(trimmed.toLowerCase())) return null;
  // ALL UPPERCASE → Title Case (STEINHUBER → Steinhuber)
  if (trimmed === trimmed.toUpperCase() && trimmed.length > 2) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  }
  return trimmed;
}

/** Normalisiert Titel: nur ersten akademischen Grad behalten */
function normalizeTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const trimmed = title.trim();
  if (!trimmed) return null;
  // Bekannte einzelne Titel direkt zurückgeben
  const KNOWN_TITLES = ["Dr.", "Mag.", "DI", "Ing.", "MBA", "Prof.", "Dr. jur.", "Dr. med.", "LL.M."];
  for (const t of KNOWN_TITLES) {
    if (trimmed.toLowerCase() === t.toLowerCase()) return t;
  }
  // Mehrere Titel (z.B. "Dr., LLM, MBA") → nur den ersten behalten
  const parts = trimmed.split(/[,\s]+/).filter(Boolean);
  if (parts.length > 1) {
    const first = parts[0].replace(/,$/, "");
    for (const t of KNOWN_TITLES) {
      if (first.toLowerCase() === t.toLowerCase().replace(/\.$/, "")) return t;
      if (first.toLowerCase() === t.toLowerCase()) return t;
    }
    return first.endsWith(".") ? first : first + ".";
  }
  return trimmed;
}

/** Wörter die auf einen Geschäftsnamen (nicht Personenname) hindeuten */
const BUSINESS_NAME_KEYWORDS = [
  "hotel", "restaurant", "gasthof", "gasthaus", "gastagwirt", "wirtshaus",
  "pension", "cafe", "café", "bar", "bistro", "pizzeria", "brauerei",
  "gmbh", "co kg", "cokg", "ag", "e.u.", "o.g.", "kg",
  "betrieb", "unternehmen", "firma", "verwaltung", "service",
  "aichingerwirt", "bräu", "stüberl", "alm", "hütte", "stube",
  "kanzlei", "praxis", "büro", "studio", "salon",
  "fischerei", "bäckerei", "metzgerei", "fleischhauerei",
  "landgasthof", "seehotel", "schlosshotel", "sporthotel", "berghotel",
  "naturkuchl", "jausenstation", "imbiss",
];

/** Prüft ob ein Name ein Geschäfts/Markenname ist statt ein Personenname */
function isBusinessName(name: string | null): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  // Mehr als 3 Wörter → wahrscheinlich kein Personenname
  if (name.trim().split(/\s+/).length > 3) return true;
  // Enthält Business-Keywords
  return BUSINESS_NAME_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Baut ceo_name aus Teilen zusammen (wie n8n "11. Prepare Lead") */
export function buildCeoName(result: GeminiExtractionResult): string | null {
  // Prüfen ob Gemini einen Geschäftsnamen statt Personennamen zurückgegeben hat
  if (isBusinessName(result.ceo_first_name) || isBusinessName(result.ceo_last_name)) {
    result.ceo_first_name = null;
    result.ceo_last_name = null;
    result.ceo_gender = "unbekannt";
    result.ceo_source = null;
    return null;
  }

  const parts: string[] = [];
  if (result.ceo_title) parts.push(result.ceo_title);
  if (result.ceo_first_name) parts.push(result.ceo_first_name);
  if (result.ceo_last_name) parts.push(result.ceo_last_name);
  // Mindestens 2 Teile nötig (Vorname + Nachname), sonst null
  if (parts.length < 2) return null;
  // Nur Titel ohne echten Namen → null
  if (!result.ceo_first_name && !result.ceo_last_name) return null;
  if (!result.ceo_last_name) return null; // "Gerhard" alleine → null
  return parts.join(" ");
}

/** Anti-Gambling: verifiziert dass eine Email entweder in den scraped emails ist
 * ODER literal im websiteContent vorkommt. Sonst → null (Pipeline fällt dann auf
 * selectBestEmail aus scraped emails zurück). */
export function verifyEmailOrNull(
  emailSuggestion: string | null,
  scrapedEmails: string[],
  websiteContent: string,
): string | null {
  if (!emailSuggestion) return null;
  const email = emailSuggestion.toLowerCase().trim();
  const scrapedLower = new Set(scrapedEmails.map((e) => e.toLowerCase().trim()));

  // Aus scraping → ok
  if (scrapedLower.has(email)) return emailSuggestion;

  // Literal im website-content → ok
  if (websiteContent && websiteContent.toLowerCase().includes(email)) return emailSuggestion;

  // Gemini hat sich die Email ausgedacht
  console.warn(`[Gemini] Email verworfen (nicht in scraped/content): "${email}" — Gambling-Schutz greift`);
  return null;
}

/** Anti-Gambling: verifiziert dass der CEO-Name wirklich aus der Quelle stammt.
 * Stage 1 (ceo_source="website"): Vor- UND Nachname müssen literal im websiteContent vorkommen.
 * Stage 2 (ceo_source="search"): vertrauen wir Google Search Grounding, aber min. Confidence verlangen.
 * Wenn Verifikation fehlschlägt → CEO-Felder auf null setzen. Lead wird trotzdem inserted (ohne CEO).
 */
export function verifyCeoOrNull(
  result: GeminiExtractionResult,
  websiteContent: string,
): GeminiExtractionResult {
  if (!result.ceo_first_name && !result.ceo_last_name) return result;

  const first = (result.ceo_first_name || "").trim().toLowerCase();
  const last = (result.ceo_last_name || "").trim().toLowerCase();

  // 1. Min. Confidence 0.4 (sonst null)
  if (typeof result.confidence_score === "number" && result.confidence_score < 0.4) {
    console.warn(`[Gemini] CEO verworfen (confidence=${result.confidence_score} < 0.4): "${first} ${last}"`);
    return { ...result, ceo_first_name: null, ceo_last_name: null, ceo_gender: "unbekannt", ceo_source: null };
  }

  // 2. Wenn ceo_source nicht gesetzt → null
  if (!result.ceo_source) {
    console.warn(`[Gemini] CEO verworfen (kein ceo_source): "${first} ${last}"`);
    return { ...result, ceo_first_name: null, ceo_last_name: null, ceo_gender: "unbekannt" };
  }

  // 3. Bei ceo_source="website": Name MUSS literal im Content vorkommen (Anti-Gambling)
  if (result.ceo_source === "website" && websiteContent) {
    const content = websiteContent.toLowerCase();
    const firstFound = first && content.includes(first);
    const lastFound = last && content.includes(last);
    if (!lastFound || (first && !firstFound)) {
      console.warn(`[Gemini] CEO verworfen (nicht im website-content): "${first} ${last}" — Gemini hat sich das ausgedacht`);
      return { ...result, ceo_first_name: null, ceo_last_name: null, ceo_gender: "unbekannt", ceo_source: null };
    }
  }

  // 4. Mindestlängen
  if (first.length < 2 || last.length < 2) {
    console.warn(`[Gemini] CEO verworfen (zu kurz): "${first} ${last}"`);
    return { ...result, ceo_first_name: null, ceo_last_name: null, ceo_gender: "unbekannt", ceo_source: null };
  }

  return result;
}

function buildPrompt(input: GeminiInput): string {
  return `Analysiere diese Daten und extrahiere strukturierte Informationen.

FIRMA: ${input.companyName}
WEBSITE: ${input.website}
ADRESSE: ${input.address}
TELEFON (Google): ${input.phone || ""}

GELADENE SEITEN: ${input.pagesLoaded.join(", ")}

WEBSITE-CONTENT:
${input.websiteContent.substring(0, 6000)}

BEREITS GEFUNDENE DATEN:
- Emails: ${JSON.stringify(input.emails)}
- Telefone: ${JSON.stringify(input.phones)}

AUFGABE:
1. Finde den Ansprechpartner (Geschaeftsfuehrer/Inhaber/CEO)
   - WICHTIG: Wenn der Name NICHT im Website-Content steht, nutze Google Search um nach "Geschäftsführer ${input.companyName}" oder "Inhaber ${input.companyName}" zu suchen!
   - Muss ein echter Personenname sein (Vorname + Nachname)
   - NICHT den Firmennamen als Person verwenden
   - "Familie X" oder "Team Y" ist KEIN gueltiger Name
   - Bei Ehepaaren (z.B. "Dagmar & Christian Santner"): nimm EINE Person, vorzugsweise die zuerst genannte
   - Wenn kein Name gefunden wird: alle CEO-Felder = null
   - ceo_source: "website" wenn aus Website-Content, "search" wenn via Google Search gefunden

2. ANREDE (ceo_gender) – NUR diese 4 Werte:
   - "herr" → maennlicher Vorname (Michael, Thomas, Hans, Christian, Peter, ...)
   - "frau" → weiblicher Vorname (Maria, Sandra, Dagmar, Christine, Anna, ...)
   - "divers" → explizit non-binaer
   - "unbekannt" → unklar, Initialen, kein Name gefunden
   VERBOTEN: "maennlich", "weiblich", "male", "female"!

3. Akademischer TITEL (ceo_title): Mag., Dr., DI, Ing., MBA, etc. – null wenn keiner

4. Beste Kontakt-Email (persoenlich vor info@)
5. Beste Telefonnummer (Direktwahl vor Zentrale)
6. Firmendaten (Rechtsform)
7. Strasse und Hausnummer extrahieren (NUR Strasse + Nummer, OHNE PLZ/Ort)
8. Stadt und PLZ aus der Adresse extrahieren

9. BRANCHE: Waehle GENAU EINE aus dieser Liste:
   ${INDUSTRY_LIST}
   Wenn KEINE passt: Sonstige

ANTWORTE NUR MIT VALIDEM JSON (kein Markdown, keine Erklaerungen):
{
  "ceo_title": "Mag.|Dr.|DI|Ing.|MBA oder null",
  "ceo_first_name": "Vorname oder null",
  "ceo_last_name": "Nachname oder null",
  "ceo_gender": "herr|frau|divers|unbekannt",
  "ceo_source": "website|search|unknown",
  "email": "beste Email oder null",
  "phone": "beste Telefonnummer oder null",
  "company_name": "Offizieller Firmenname",
  "industry": "EXAKT eine Branche aus der obigen Liste",
  "legal_form": "GmbH/AG/e.U./etc. oder null",
  "street": "Strasse und Hausnummer oder null",
  "city": "Stadt oder null",
  "postal_code": "PLZ oder null",
  "country": "AT|DE|CH oder null",
  "confidence_score": 0.0
}`;
}
