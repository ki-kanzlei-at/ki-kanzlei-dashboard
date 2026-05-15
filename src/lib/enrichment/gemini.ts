/* ── Gemini AI Extraktion ──
 * Repliziert den n8n Gemini-Prompt 1:1 (Lead Enrichment v11).
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { INDUSTRY_OPTIONS } from "@/types/leads";

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

interface GeminiInput {
  companyName: string;
  website: string;
  address: string;
  phone: string | null;
  pagesLoaded: string[];
  websiteContent: string;
  ceoSnippets: string;
  emails: string[];
  phones: string[];
}

// Modelle in Fallback-Reihenfolge: 2.5-flash zuerst, dann 2.0-flash als Backup
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];
const SYSTEM_INSTRUCTION = "Du bist ein Daten-Extraktions-Spezialist fuer oesterreichische und deutsche Unternehmen. Antworte IMMER mit validem JSON ohne Markdown-Bloecke. Fuer ceo_gender NUR: herr, frau, divers, unbekannt. NIEMALS maennlich/weiblich! Bei Ehepaaren: nimm EINE Person. Fuer industry: waehle EXAKT einen Wert aus der vorgegebenen Liste.";

function is503(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  return e["status"] === 503 || String(e["message"] ?? "").includes("503");
}

async function tryModel(
  genAI: GoogleGenerativeAI,
  modelName: string,
  prompt: string,
): Promise<GeminiExtractionResult | null> {
  const MAX_RETRIES = 4;
  // Backoff-Delays für 503: 3s, 8s, 20s, 45s
  const DELAYS_503 = [3000, 8000, 20000, 45000];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_INSTRUCTION,
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      });
      const result = await model.generateContent(prompt);
      return JSON.parse(result.response.text()) as GeminiExtractionResult;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delay = is503(err) ? DELAYS_503[attempt] : 1000 * Math.pow(2, attempt);
        console.warn(`[Gemini:${modelName}] Retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms (${is503(err) ? "503 overload" : "error"})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      // Alle Retries aufgebraucht
      if (is503(err)) {
        console.warn(`[Gemini:${modelName}] Nach ${MAX_RETRIES} Retries aufgegeben (503 overload)`);
      } else {
        console.error(`[Gemini:${modelName}] Fehlgeschlagen:`, err);
      }
      return null;
    }
  }
  return null;
}

export async function extractWithGemini(
  input: GeminiInput,
): Promise<GeminiExtractionResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[Gemini] GEMINI_API_KEY nicht gesetzt, überspringe AI-Extraktion");
    return null;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const prompt = buildPrompt(input);

  for (const modelName of GEMINI_MODELS) {
    const parsed = await tryModel(genAI, modelName, prompt);
    if (parsed) {
      if (modelName !== GEMINI_MODELS[0]) {
        console.info(`[Gemini] Erfolg mit Fallback-Modell: ${modelName}`);
      }
      // Gender normalisieren
      parsed.ceo_gender = normalizeGender(parsed.ceo_gender);
      // Branche normalisieren
      parsed.industry = normalizeIndustry(parsed.industry);
      // Confidence Score validieren
      if (typeof parsed.confidence_score !== "number" || parsed.confidence_score < 0 || parsed.confidence_score > 1) {
        parsed.confidence_score = 0.5;
      }
      return parsed;
    }
    if (modelName !== GEMINI_MODELS[GEMINI_MODELS.length - 1]) {
      console.warn(`[Gemini] Wechsle zu Fallback-Modell nach Fehler mit ${modelName}`);
    }
  }

  console.error(`[Gemini] Alle Modelle fehlgeschlagen für "${input.companyName}"`);
  return null;
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

function buildPrompt(input: GeminiInput): string {
  return `Analysiere diese Daten und extrahiere strukturierte Informationen.

FIRMA: ${input.companyName}
WEBSITE: ${input.website}
ADRESSE: ${input.address}
TELEFON (Google): ${input.phone || ""}

GELADENE SEITEN: ${input.pagesLoaded.join(", ")}

WEBSITE-CONTENT:
${input.websiteContent.substring(0, 6000)}

LANGSEARCH-SUCHERGEBNISSE ZUM GESCHAEFTSFUEHRER:
${input.ceoSnippets.substring(0, 3000)}

BEREITS GEFUNDENE DATEN:
- Emails: ${JSON.stringify(input.emails)}
- Telefone: ${JSON.stringify(input.phones)}

AUFGABE:
1. Finde den Ansprechpartner (Geschaeftsfuehrer/Inhaber/CEO)
   - Muss ein echter Personenname sein (Vorname + Nachname)
   - NICHT den Firmennamen als Person verwenden
   - "Familie X" oder "Team Y" ist KEIN gueltiger Name
   - Bei Ehepaaren (z.B. "Dagmar & Christian Santner"): nimm EINE Person, vorzugsweise die zuerst genannte
   - Wenn kein Name gefunden wird: alle CEO-Felder = null

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
