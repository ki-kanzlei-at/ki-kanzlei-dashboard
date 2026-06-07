/* ── AI Researcher: reine Helfer (server + client) ── */

import type { ResearchBlock, SourceKind } from "@/types/research";

/* ── Branche (Label) → farbcodierter Design-Code (.ind-*) ── */
const IND_MAP: Record<string, string> = {
  steuerberater: "steuer",
  buchhaltung: "steuer",
  rechtsanwalt: "recht",
  notar: "notar",
  wirtschaftsprüfer: "wp",
  wirtschaftspruefer: "wp",
};
const MEDIZIN = new Set([
  "arzt", "facharzt", "zahnarzt", "tierarzt", "apotheke", "physiotherapie",
  "psychotherapie", "heilpraktiker", "krankenhaus", "pflegeheim", "pflegedienst",
]);

/** Mappt ein Branchen-Label auf den Design-Farbcode für `.ind-<code>`. */
export function industryToInd(industry: string | null | undefined): string {
  if (!industry) return "multi";
  const key = industry.toLowerCase().trim();
  if (IND_MAP[key]) return IND_MAP[key];
  if (MEDIZIN.has(key)) return "medizin";
  if (key.includes("steuer") || key.includes("buchhalt")) return "steuer";
  if (key.includes("recht") || key.includes("anwalt")) return "recht";
  if (key.includes("notar")) return "notar";
  if (key.includes("prüf") || key.includes("pruef")) return "wp";
  return "multi";
}

/** Score → Klasse für den Score-Balken (.score-hi/mid/low/vlo). */
export function scoreClass(s: number | null | undefined): string {
  if (s == null) return "score-vlo";
  if (s >= 80) return "score-hi";
  if (s >= 60) return "score-mid";
  if (s >= 40) return "score-low";
  return "score-vlo";
}

/* ── Quellen-Klassifizierung anhand der Domain ── */
const NEWS_HINTS = [
  "derstandard", "diepresse", "kurier", "krone", "orf.at", "salzburg24",
  "meinbezirk", "wirtschaftszeit", "trendingtopics", "horizont", "news.at",
  "tt.com", "vol.at", "nachrichten.at", "kleinezeitung",
];

export function classifySourceKind(url: string | null | undefined): SourceKind {
  if (!url) return "website";
  const u = url.toLowerCase();
  if (u.includes("linkedin.")) return "linkedin";
  if (u.includes("firmenbuch") || u.includes("justizonline") || u.includes("compass.at") || u.includes("firmenabc")) return "firmenbuch";
  if (u.includes("wko.at") || u.includes("firmen.wko")) return "wko";
  if (u.includes("google.") || u.includes("g.page") || u.includes("/maps")) return "google";
  if (NEWS_HINTS.some((h) => u.includes(h))) return "news";
  return "website";
}

/** Lesbarer Domain-Name aus einer URL (für Quellen-Titel). */
export function domainFromUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    return host.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

/* ── Markdown-artigen Antworttext → strukturierte Blöcke ──
   Erhält `[[n]]`-Zitate und `**fett**` (werden client-seitig gerendert). */
export function parseBlocks(text: string): ResearchBlock[] {
  const blocks: ResearchBlock[] = [];
  const lines = sanitizeCitations(text).replace(/\r/g, "").split("\n");

  let para: string[] = [];
  let bullets: string[] = [];

  const flushPara = () => {
    if (para.length) { blocks.push({ type: "p", text: para.join(" ").trim() }); para = []; }
  };
  const flushBullets = () => {
    if (bullets.length) { blocks.push({ type: "ul", items: bullets.slice() }); bullets = []; }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushPara(); flushBullets(); continue; }

    // Überschrift: "## ...", "### ..." oder eine reine **fette** Zeile als Heading
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (h) {
      flushPara(); flushBullets();
      blocks.push({ type: "h", text: stripTrailingColon(h[1]) });
      continue;
    }

    // Aufzählung: "- ", "* ", "• "
    const b = line.match(/^[-*•]\s+(.*)$/);
    if (b) {
      flushPara();
      bullets.push(b[1].trim());
      continue;
    }

    flushBullets();
    para.push(line);
  }
  flushPara(); flushBullets();

  return blocks.length ? blocks : [{ type: "p", text: text.trim() }];
}

function stripTrailingColon(s: string): string {
  return s.replace(/\s*:\s*$/, "");
}

/** Zitate normalisieren: einzelne [n] → [[n]], leere []/[[]] entfernen, Leerzeichen vor Satzzeichen säubern. */
function sanitizeCitations(t: string): string {
  return t
    .replace(/\[\[\s*\]\]/g, "")
    .replace(/\[\s*\]/g, "")
    .replace(/(?<!\[)\[(\d{1,2})\](?!\])/g, "[[$1]]")
    .replace(/\s+([.,;:])/g, "$1");
}

/** Roh-Eingabe → reine Domain (ohne Schema/www/Pfad). */
export function normalizeDomain(raw: string): string {
  return raw.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
}

/** Domain → menschenlesbarer Firmenname (Fallback, bis die KI den echten Namen liefert). */
export function companyFromDomain(domain: string): string {
  const root = domain.split(".")[0] || domain;
  const name = root.split(/[-_]/).map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
  return name || domain;
}

/** Blöcke → Markdown — behält `[[n]]`-Zitate und `**fett**` (für Neu-Formulierung). */
export function blocksToMarkdown(blocks: ResearchBlock[] | null | undefined): string {
  if (!blocks) return "";
  const out: string[] = [];
  for (const blk of blocks) {
    if (blk.type === "h") out.push(`## ${blk.text}`);
    else if (blk.type === "ul") out.push(...blk.items.map((i) => `- ${i}`));
    else out.push(blk.text);
  }
  return out.join("\n").trim();
}

/** Reiner Text aus Blöcken (z.B. für Notizen / Lead-Speicherung). */
export function blocksToPlainText(blocks: ResearchBlock[] | null | undefined): string {
  if (!blocks) return "";
  const out: string[] = [];
  for (const blk of blocks) {
    if (blk.type === "h") out.push(blk.text);
    else if (blk.type === "ul") out.push(...blk.items.map((i) => `• ${i}`));
    else out.push(blk.text);
  }
  // Zitate + Markdown für Klartext entfernen
  return out.join("\n").replace(/\[\[\d+\]\]/g, "").replace(/\*\*([^*]+)\*\*/g, "$1").trim();
}
