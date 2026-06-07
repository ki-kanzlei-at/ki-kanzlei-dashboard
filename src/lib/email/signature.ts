/* ── E-Mail-Signatur rendern (Plaintext ODER Rich-Text/HTML) ──
 * Single Source of Truth, genutzt von Test-Mail & Kampagnen-Generator.
 * Die Signatur stammt aus dem eigenen Postfach des Users (geringes Risiko),
 * wird aber trotzdem auf eine sichere HTML-Teilmenge reduziert.
 */

const LOOKS_LIKE_HTML = /<\/?(p|br|div|span|b|strong|i|em|u|a|ul|ol|li|h[1-6])\b/i;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Entfernt gefährliche Elemente/Attribute aus User-HTML (script/style/on*-Handler/javascript:). */
function sanitizeSignatureHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "");
}

/** True, wenn die Signatur als (Rich-Text-)HTML behandelt werden soll. */
export function isHtmlSignature(sig: string | null | undefined): boolean {
  return !!sig && LOOKS_LIKE_HTML.test(sig);
}

/**
 * Sanitisiert die Signatur fürs Speichern (campaign_settings.signature).
 * HTML wird auf eine sichere Teilmenge reduziert (statt `<>` blind zu strippen),
 * Plaintext bleibt Plaintext. Länge gedeckelt.
 */
export function sanitizeSignatureForStorage(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const capped = raw.slice(0, 5000);
  if (isHtmlSignature(capped)) return sanitizeSignatureHtml(capped).trim();
  return capped.replace(/[<>]/g, "").trim();
}

/** Signatur als HTML-Fragment (für den HTML-Body). Leer → "". */
export function renderSignatureHtml(sig: string | null | undefined): string {
  if (!sig || !sig.trim()) return "";
  if (isHtmlSignature(sig)) return sanitizeSignatureHtml(sig).trim();
  // Plaintext → escapen + Zeilenumbrüche
  return escapeHtml(sig.trim()).replace(/\n/g, "<br/>");
}

/** Signatur als Plaintext (für den Text-Body / Inbox-Spiegelung). */
export function renderSignaturePlain(sig: string | null | undefined): string {
  if (!sig || !sig.trim()) return "";
  if (!isHtmlSignature(sig)) return sig.trim();
  return sig
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
