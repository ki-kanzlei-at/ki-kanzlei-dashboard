/* ── Gemini: Brand-/Positionierungs-Analyse aus Website-Content ──
 * Liefert Positionierungs-Felder (Angebot, USP, Zielkunde, Tagline) für brand_settings.
 * Eigenständig (nicht der Lead-CEO-Extractor in ./gemini) — nutzt denselben
 * Semaphore und dasselbe Modell. */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { geminiSemaphore } from "./semaphore";

const GEMINI_MODEL = "gemini-2.5-flash";
const SYSTEM_INSTRUCTION =
  "Du bist ein B2B-Positionierungs-Analyst. Du liest Website-Texte eines Unternehmens und fasst dessen Angebot, Nutzenversprechen und Zielkunden knapp und konkret zusammen. Antworte IMMER mit validem JSON ohne Markdown-Bloecke. Keine Floskeln, kein Marketing-Blabla — konkret und auf Deutsch.";

export interface BrandExtractionResult {
  company_name: string | null;
  tagline: string | null;
  offering: string | null;
  value_prop: string | null;
  target_customer: string | null;
}

export interface BrandAnalysisInput {
  companyName: string;
  website: string;
  pagesLoaded: string[];
  websiteContent: string;
}

/** JSON aus Gemini-Text robust parsen (direkt / Codeblock / erstes {…}). */
function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { /* continue */ }
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) { try { return JSON.parse(m[1].trim()); } catch { /* continue */ } }
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s !== -1 && e > s) { try { return JSON.parse(text.substring(s, e + 1)); } catch { /* continue */ } }
  return null;
}

/** Trimmt und filtert Platzhalter-/Leerwerte auf null. */
function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || ["null", "n/a", "-", "–", "unbekannt", "keine angabe"].includes(t.toLowerCase())) return null;
  return t;
}

function buildPrompt(input: BrandAnalysisInput): string {
  return `Analysiere die Website dieses Unternehmens und leite die Positionierung ab.

FIRMA: ${input.companyName}
WEBSITE: ${input.website}
GELADENE SEITEN: ${input.pagesLoaded.join(", ")}

WEBSITE-CONTENT:
${input.websiteContent.substring(0, 6000)}

AUFGABE — fülle diese Felder knapp, konkret und auf Deutsch:
- company_name: offizieller Firmenname
- tagline: kurzer Slogan / Claim (max. 8 Woerter), null wenn keiner erkennbar
- offering: Produkte & Dienstleistungen — was bietet die Firma konkret an? (1–3 Saetze)
- value_prop: Nutzenversprechen / USP — warum diese Firma, was ist der konkrete Vorteil? (1–2 Saetze)
- target_customer: typische Zielkunden / Branchen / Unternehmensgroessen (1 Satz)

Nutze NUR Informationen aus dem Content. Wenn ein Feld nicht erkennbar ist: null. Keine erfundenen Angaben.

ANTWORTE NUR MIT VALIDEM JSON (kein Markdown, keine Erklaerungen):
{
  "company_name": "Firmenname oder null",
  "tagline": "Slogan oder null",
  "offering": "Angebot oder null",
  "value_prop": "USP oder null",
  "target_customer": "Zielkunden oder null"
}`;
}

/** Lädt Website-Content (extern bereitgestellt) und extrahiert die Positionierung. */
export async function extractBrandFromWebsite(
  input: BrandAnalysisInput,
): Promise<BrandExtractionResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[Gemini Brand] GEMINI_API_KEY nicht gesetzt, überspringe Analyse");
    return null;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
  });
  const prompt = buildPrompt(input);

  const DELAYS = [2000, 5000, 15000];
  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      const result = await geminiSemaphore.run(() => model.generateContent(prompt));
      const parsed = parseJson(result.response.text());
      if (!parsed || typeof parsed !== "object") {
        console.warn("[Gemini Brand] JSON-Parsing fehlgeschlagen");
        return null;
      }
      const p = parsed as Record<string, unknown>;
      return {
        company_name:    clean(p.company_name),
        tagline:         clean(p.tagline),
        offering:        clean(p.offering),
        value_prop:      clean(p.value_prop),
        target_customer: clean(p.target_customer),
      };
    } catch (err) {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, DELAYS[attempt]));
        continue;
      }
      console.error("[Gemini Brand] Fehlgeschlagen nach Retries:", (err as Error).message?.substring(0, 150));
      return null;
    }
  }
  return null;
}
