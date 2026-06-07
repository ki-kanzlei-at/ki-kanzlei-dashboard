/* ── Person → LinkedIn-Profil auflösen ──
 * Grounding findet die echte Profil-URL, ConnectSafely lädt das volle Profil.
 * Fällt auf die ConnectSafely-Namenssuche zurück. Gibt eine ResearchPerson
 * zurück (oder null), die direkt als Chat-Nachricht gespeichert werden kann.
 */

import type { ConnectSafelyClient } from "./client";
import type { LegacyProfile } from "./types";
import { findLinkedInUrl } from "@/lib/research/engine";
import type { ResearchPerson } from "@/types/research";

/** ConnectSafely liefert location/headline manchmal als Objekt ({geoLocationName}) → in String wandeln. */
function str(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const c = o.geoLocationName ?? o.name ?? o.text ?? o.value;
    return typeof c === "string" ? c.trim() || null : null;
  }
  return null;
}

function mapProfile(p: LegacyProfile, url: string, fallbackName: string): ResearchPerson {
  return {
    id: p.public_identifier || p.provider_id || url,
    name: [p.first_name, p.last_name].filter(Boolean).join(" ") || fallbackName,
    headline: str(p.headline),
    location: str(p.location),
    profile_url: p.profile_url || url,
    public_profile_url: p.profile_url || url,
    profile_picture_url: p.profile_picture_url ?? null,
    first_name: p.first_name ?? null,
    last_name: p.last_name ?? null,
    public_identifier: p.public_identifier ?? null,
    provider_id: p.provider_id ?? null,
  };
}

type SearchItem = { name?: string; id?: string; public_identifier?: string; provider_id?: string; headline?: unknown; location?: unknown; profile_url?: string; public_profile_url?: string; profile_picture_url?: string; first_name?: string; last_name?: string };

function toPerson(it: SearchItem, fallbackName: string): ResearchPerson {
  return {
    id: it.id || it.public_identifier || it.provider_id || fallbackName,
    name: it.name || fallbackName,
    headline: str(it.headline),
    location: str(it.location),
    profile_url: it.profile_url ?? it.public_profile_url ?? null,
    public_profile_url: it.public_profile_url ?? it.profile_url ?? null,
    profile_picture_url: it.profile_picture_url ?? null,
    first_name: it.first_name ?? null,
    last_name: it.last_name ?? null,
    public_identifier: it.public_identifier ?? null,
    provider_id: it.provider_id ?? null,
  };
}

export async function findPersonProfile(
  client: ConnectSafelyClient,
  accountId: string,
  name: string,
  company: string,
  geminiKey: string | null,
  country?: string | null,
): Promise<ResearchPerson | null> {
  const clean = stripTitles(name);

  // 1) Echte URL über Grounding → ConnectSafely /profile
  const url = geminiKey ? await findLinkedInUrl(clean, company, geminiKey).catch(() => null) : null;
  if (url) {
    try {
      const p = await client.getProfile(accountId, url);
      return mapProfile(p, url, clean);
    } catch {
      return { id: url, name: clean, profile_url: url, public_profile_url: url };
    }
  }

  // 2) ConnectSafely-Suche: Name muss passen (Precision) UND das volle Profil muss die
  //    Firma bestätigen (sonst werden Namensvetter wie eine fremde „Elisabeth Mack" gezeigt).
  const cTokens = companyTokens(company);
  let weakFallback: ResearchPerson | null = null; // namensgleich, aber Firma nicht bestätigt
  for (const q of [`${company || ""} ${clean}`.trim(), clean]) {
    if (!q) continue;
    try {
      const res = await client.searchLinkedIn(accountId, q, { limit: 8 });
      const items = (res.items ?? []) as SearchItem[];
      for (const hit of items.filter((it) => nameMatches(it.name, clean)).slice(0, 4)) {
        const idf = hit.public_identifier || hit.profile_url || hit.public_profile_url || hit.provider_id;
        if (!idf) { weakFallback ??= toPerson(hit, clean); continue; }
        let full: LegacyProfile | null = null;
        try { full = await client.getProfile(accountId, idf); } catch { /* nicht abrufbar */ }
        if (!full) { weakFallback ??= toPerson(hit, clean); continue; }
        if (corroborated(full, cTokens, country)) {
          return mapProfile(full, hit.profile_url ?? hit.public_profile_url ?? idf, hit.name ?? clean);
        }
        weakFallback ??= mapProfile(full, hit.profile_url ?? hit.public_profile_url ?? idf, hit.name ?? clean);
      }
    } catch { /* nächste Query */ }
  }
  // Gibt es etwas zu prüfen (Firma/Land) und KEIN Treffer wurde bestätigt → lieber nichts
  // zeigen als die falsche Person (z.B. fremde Namensvetterin).
  return (cTokens.length || country) ? null : weakFallback;
}

const GENERIC_CO = new Set([
  "gmbh", "mbh", "gesmbh", "gesellschaft", "holding", "group", "gruppe", "consulting", "services",
  "solutions", "systems", "austria", "österreich", "deutschland", "schweiz", "international", "beteiligung",
  "beteiligungs", "verwaltung", "steuerberatung", "wirtschaftsprüfung", "rechtsanwälte", "company", "kgaa",
]);
/** Markante Firmen-Tokens (zur Bestätigung im Profil). */
function companyTokens(company: string): string[] {
  return (company || "")
    .toLowerCase().replace(/[®©™.,/()&-]/g, " ").split(/\s+/)
    .filter((t) => t.length >= 4 && !GENERIC_CO.has(t))
    .slice(0, 2);
}
/** Bestätigt ein Profil die Firma (Headline/Zusammenfassung/Berufserfahrung)? */
function profileMatchesCompany(p: LegacyProfile, tokens: string[]): boolean {
  if (!tokens.length) return false;
  const hay = [
    p.headline, p.summary,
    ...(p.work_experience ?? []).map((e) => `${e.company ?? ""} ${e.company_name ?? ""}`),
  ].filter(Boolean).join(" ").toLowerCase();
  return tokens.some((t) => hay.includes(t));
}
const COUNTRY_HINTS: Record<string, string[]> = {
  AT: ["österreich", "austria", "wien", "vienna", "salzburg", "graz", "linz", "innsbruck", "klagenfurt"],
  DE: ["deutschland", "germany", "berlin", "münchen", "munich", "hamburg", "frankfurt", "köln", "cologne", "stuttgart"],
  CH: ["schweiz", "switzerland", "suisse", "zürich", "zurich", "genf", "geneva", "basel", "bern"],
};
/** Passt der Profil-Standort zum Land des Leads? */
function matchesCountry(p: LegacyProfile, country?: string | null): boolean {
  if (!country) return false;
  const hints = COUNTRY_HINTS[country.toUpperCase()];
  if (!hints) return false;
  const loc = (typeof p.location === "string" ? p.location : "").toLowerCase();
  return !!loc && hints.some((h) => loc.includes(h));
}
/** Treffer gilt als bestätigt, wenn Firma ODER Land passt (bei häufigen Namen entscheidend). */
function corroborated(p: LegacyProfile, cTokens: string[], country?: string | null): boolean {
  if (profileMatchesCompany(p, cTokens)) return true;
  if (matchesCountry(p, country)) return true;
  if (!cTokens.length && !country) return true; // nichts zum Prüfen → durchlassen
  return false;
}

/** Akademische Titel / Anreden aus einem Namen entfernen (bessere Suche & Matching). */
function stripTitles(s: string): string {
  return s
    .replace(/\b(dr|mag|ing|dipl[.-]?ing|di|prof|herr|frau|mmag|ddr|ba|ma|msc|bsc|llm|fh)\.?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Prüft, ob ein Suchtreffer-Name zum gesuchten Namen passt: Vor- UND Nachname
 *  als GANZE Wörter (verhindert Substring-Treffer wie „Buchebner" für „Ebner"). */
function nameMatches(resultName: string | undefined, query: string): boolean {
  if (!resultName) return false;
  const rTokens = resultName.toLowerCase().split(/[\s,./-]+/).filter(Boolean);
  const qTokens = stripTitles(query).toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
  if (!qTokens.length) return false;
  const has = (t: string) => rTokens.includes(t);
  const first = qTokens[0];
  const last = qTokens[qTokens.length - 1];
  return qTokens.length === 1 ? has(last) : has(first) && has(last);
}
