/* ── JustizOnline IWG — HVD-Firmenbuch (SOAP) ──
 * Offizielle österreichische Firmenbuch-Daten: FN, Rechtsform, Sitz, Adresse,
 * Gründungsjahr und Organe (Geschäftsführer/vertretungsbefugte Personen).
 *
 * Auth: HTTP-Header `X-Api-Key` mit dem persönlichen IWG-Zugriffstoken
 * (Env: JUSTIZONLINE_IWG_TOKEN). SOAP 1.2, ein Endpunkt für alle Operationen.
 */

const ENDPOINT = "https://justizonline.gv.at/jop/api/at.gv.justiz.fbw/ws";

export interface FirmenbuchManager {
  name: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
}

export interface FirmenbuchCompany {
  fnr: string;
  name: string;
  legalForm: string | null;
  legalFormCode: string | null;
  seat: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  foundedYear: number | null;
  court: string | null;
  managers: FirmenbuchManager[];
}

export function isJustizConfigured(): boolean {
  return !!process.env.JUSTIZONLINE_IWG_TOKEN?.trim();
}

/* ── XML-Helfer (Namespace-Präfix-tolerant, Regex-basiert) ── */
function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
}
function tagAll(name: string, xml: string): string[] {
  const re = new RegExp(`<(?:[\\w]+:)?${name}>([^<]*)</(?:[\\w]+:)?${name}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(decode(m[1]));
  return out;
}
function tag(name: string, xml: string): string | null {
  return tagAll(name, xml)[0] ?? null;
}
function block(name: string, xml: string): string {
  const re = new RegExp(`<(?:[\\w]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?${name}>`);
  return re.exec(xml)?.[1] ?? "";
}

/* ── SOAP-Call ── */
async function soapCall(bodyXml: string): Promise<string | null> {
  const token = process.env.JUSTIZONLINE_IWG_TOKEN?.trim();
  if (!token) return null;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/soap+xml;charset=UTF-8",
        SOAPAction: '""',
        "X-Api-Key": token,
      },
      body: bodyXml,
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    if (!res.ok || text.includes(":Fault>")) {
      console.warn("[justizonline] SOAP-Fehler HTTP", res.status, text.slice(0, 200));
      return res.ok ? text : null;
    }
    return text;
  } catch (e) {
    console.warn("[justizonline] Request fehlgeschlagen:", e instanceof Error ? e.message : e);
    return null;
  }
}

function searchBody(wortlaut: string): string {
  const safe = wortlaut.replace(/[<>&]/g, " ").trim();
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:suc="ns://firmenbuch.justiz.gv.at/Abfrage/SucheFirmaRequest">
  <soap:Header/>
  <soap:Body>
    <suc:SUCHEFIRMAREQUEST>
      <suc:FIRMENWORTLAUT>${safe}</suc:FIRMENWORTLAUT>
      <suc:EXAKTESUCHE>false</suc:EXAKTESUCHE>
      <suc:SUCHBEREICH>1</suc:SUCHBEREICH>
      <suc:GERICHT></suc:GERICHT>
      <suc:RECHTSFORM></suc:RECHTSFORM>
      <suc:RECHTSEIGENSCHAFT></suc:RECHTSEIGENSCHAFT>
      <suc:ORTNR></suc:ORTNR>
    </suc:SUCHEFIRMAREQUEST>
  </soap:Body>
</soap:Envelope>`;
}

function auszugBody(fnr: string): string {
  const stichtag = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:aus="ns://firmenbuch.justiz.gv.at/Abfrage/v2/AuszugRequest">
  <soap:Header/>
  <soap:Body>
    <aus:AUSZUG_V2_REQUEST>
      <aus:FNR>${fnr}</aus:FNR>
      <aus:STICHTAG>${stichtag}</aus:STICHTAG>
      <aus:UMFANG>Kurzinformation</aus:UMFANG>
    </aus:AUSZUG_V2_REQUEST>
  </soap:Body>
</soap:Envelope>`;
}

export interface FirmenbuchHit {
  fnr: string;
  name: string;
  seat: string | null;
  legalForm: string | null;
}

/** Firmensuche nach Wortlaut → Trefferliste (FN + Name + Sitz + Rechtsform). */
export async function searchCompany(wortlaut: string): Promise<FirmenbuchHit[]> {
  const xml = await soapCall(searchBody(wortlaut));
  if (!xml) return [];
  const hits: FirmenbuchHit[] = [];
  const re = /<(?:[\w]+:)?ERGEBNIS>([\s\S]*?)<\/(?:[\w]+:)?ERGEBNIS>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const e = m[1];
    const fnr = tag("FNR", e);
    if (!fnr) continue;
    hits.push({
      fnr,
      name: tagAll("NAME", e).join(" ").trim(),
      seat: tag("SITZ", e),
      legalForm: tag("TEXT", block("RECHTSFORM", e)),
    });
  }
  return hits;
}

/** Vollständiger Auszug zu einer FN → strukturierte Firmendaten inkl. Organe. */
export async function getExtract(fnr: string): Promise<FirmenbuchCompany | null> {
  const xml = await soapCall(auszugBody(fnr));
  if (!xml) return null;

  const respFnr = /<(?:[\w]+:)?AUSZUG_V2_RESPONSE[^>]*?(?:[\w]+:)?FNR="([^"]+)"/.exec(xml)?.[1] ?? fnr;
  const firma = block("FIRMA", xml);

  const name = tagAll("BEZEICHNUNG", firma).join(" ").trim();
  const dat = tag("DATERST", firma); // z.B. 19390819
  const foundedYear = dat && /^\d{4}/.test(dat) ? parseInt(dat.slice(0, 4), 10) : null;
  const hausnr = tag("HAUSNUMMER", firma);
  const strasse = tag("STRASSE", firma);

  // Geschäftsführer: FUN-Blöcke mit FKEN="GF" → PNR sammeln, dann passende PER-Blöcke auflösen
  const gfPnrs = new Set<string>();
  const funRe = /<(?:[\w]+:)?FUN\s([^>]*?)>/g;
  let fm: RegExpExecArray | null;
  while ((fm = funRe.exec(xml))) {
    const attrs = fm[1];
    const fken = /(?:[\w]+:)?FKEN="([^"]*)"/.exec(attrs)?.[1];
    const pnr = /(?:[\w]+:)?PNR="([^"]*)"/.exec(attrs)?.[1];
    if ((fken === "GF" || fken === "VST") && pnr) gfPnrs.add(pnr);
  }
  const managers: FirmenbuchManager[] = [];
  const perRe = /<(?:[\w]+:)?PER\s([^>]*?)>([\s\S]*?)<\/(?:[\w]+:)?PER>/g;
  let pm: RegExpExecArray | null;
  while ((pm = perRe.exec(xml))) {
    const pnr = /(?:[\w]+:)?PNR="([^"]*)"/.exec(pm[1])?.[1];
    if (!pnr || !gfPnrs.has(pnr)) continue;
    const inner = pm[2];
    const first = tag("VORNAME", inner);
    const last = tag("NACHNAME", inner);
    const title = tag("TITELVOR", inner);
    const formatted = tag("NAME_FORMATIERT", inner);
    if (last || formatted) {
      managers.push({
        name: formatted || [title, first, last].filter(Boolean).join(" "),
        firstName: first,
        lastName: last,
        title,
      });
    }
  }

  return {
    fnr: respFnr,
    name: name || "",
    legalForm: tag("TEXT", block("RECHTSFORM", firma)),
    legalFormCode: tag("CODE", block("RECHTSFORM", firma)),
    seat: tag("SITZ", firma),
    street: strasse ? [strasse, hausnr].filter(Boolean).join(" ") : null,
    postalCode: tag("PLZ", firma),
    city: tag("ORT", firma),
    country: tag("STAAT", firma),
    foundedYear,
    court: tag("TEXT", block("HGALT", firma)),
    managers,
  };
}

/* ── Treffer-Validierung (verhindert Falsch-Matches bei vagen Namen wie „lbg") ── */
const STOPWORDS = new Set([
  "gmbh", "ag", "kg", "og", "se", "eu", "co", "gesellschaft", "mit", "beschränkter",
  "beschraenkter", "haftung", "wirtschaftsprüfung", "wirtschaftspruefung", "steuerberatung",
  "the", "and", "und", "ges", "mbh", "holding", "group", "gruppe",
]);
function normTokens(s: string): string[] {
  return s.toLowerCase()
    .replace(/[&.,/()\-]/g, " ")
    .replace(/\s+/g, " ").trim()
    .split(" ")
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}
function pickBestHit(query: string, hits: FirmenbuchHit[]): FirmenbuchHit | null {
  const q = normTokens(query);
  if (!q.length || !hits.length) return null;
  const main = [...q].sort((a, b) => b.length - a.length)[0]; // markantestes Wort
  const singleWord = q.length === 1; // markenartige Einzelwort-Suche (z.B. „Fonio")
  let best: FirmenbuchHit | null = null;
  let bestScore = 0;
  for (const h of hits) {
    const f = normTokens(h.name);
    if (!f.includes(main)) continue; // das markanteste Query-Wort MUSS exakt vorkommen
    // Einzelwort-Marke: der Treffer MUSS mit diesem Wort BEGINNEN, sonst werden
    // Namensvetter wie „Bruno Fonio KEG" (Fonio = Nachname) fälschlich gematcht.
    if (singleWord && f[0] !== main) continue;
    const overlap = q.filter((w) => f.includes(w)).length;
    if (overlap > bestScore) { bestScore = overlap; best = h; }
  }
  return best;
}

/** Kern-Suchbegriff: erste markante Wörter vor der Rechtsform (volle Legal-Namen matchen sonst nicht). */
function searchTerm(name: string): string {
  const words = name.replace(/[&.,/()-]/g, " ").split(/\s+/).filter(Boolean);
  const core: string[] = [];
  for (const w of words) {
    if (STOPWORDS.has(w.toLowerCase())) break;
    core.push(w);
    if (core.length >= 3) break;
  }
  return core.length ? core.join(" ") : name;
}

/** High-Level: Firma per Name suchen, besten validierten Treffer als vollständigen Auszug zurückgeben. */
export async function lookupCompany(name: string): Promise<FirmenbuchCompany | null> {
  if (!isJustizConfigured() || !name.trim()) return null;
  const hits = await searchCompany(searchTerm(name));
  const best = pickBestHit(name, hits); // gegen den VOLLEN Namen validieren
  if (!best) return null;
  return getExtract(best.fnr);
}
