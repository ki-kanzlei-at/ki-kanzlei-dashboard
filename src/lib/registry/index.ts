/* ── Offizielle Handelsregister — länderübergreifender Router ──
 * AT → JustizOnline Firmenbuch (IWG-Token)
 * CH → Zefix (Basic-Auth-Account)
 * DE → über grounded Web-Recherche abgedeckt (kein dedizierter freier API-Client mit Organen)
 */

import { lookupCompany as firmenbuchLookup, type FirmenbuchCompany } from "@/lib/justizonline/client";
import { zefixLookup, isZefixConfigured } from "./zefix";
import { wikidataLookup } from "@/lib/wikidata/client";

export interface OfficialCompanyManager {
  name: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
}

/** Vereinheitlichte offizielle Firmendaten aus einem Handelsregister. */
export interface OfficialCompany {
  source: "firmenbuch" | "zefix" | "wikidata";
  sourceLabel: string;       // z.B. "Firmenbuch FN 75837a" · "Zefix CHE-123.456.789"
  name: string;
  legalForm: string | null;
  seat: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  foundedYear: number | null;
  managers: OfficialCompanyManager[];
}

function fromFirmenbuch(fb: FirmenbuchCompany | null): OfficialCompany | null {
  if (!fb) return null;
  return {
    source: "firmenbuch",
    sourceLabel: `Firmenbuch FN ${fb.fnr}`,
    name: fb.name,
    legalForm: fb.legalForm,
    seat: fb.seat,
    street: fb.street,
    postalCode: fb.postalCode,
    city: fb.city,
    country: "AT",
    foundedYear: fb.foundedYear,
    managers: fb.managers,
  };
}

/** Firma im passenden offiziellen Register nachschlagen (nach Land). */
export async function lookupOfficialCompany(
  name: string,
  country?: string | null,
): Promise<OfficialCompany | null> {
  if (!name.trim()) return null;
  const c = (country || "AT").toUpperCase();
  try {
    if (c === "AT") return fromFirmenbuch(await firmenbuchLookup(name));
    if (c === "CH") return (await zefixLookup(name)) ?? (await wikidataLookup(name, "CH"));
    if (c === "DE") return await wikidataLookup(name, "DE");
    // Sonstige Länder: Wikidata als breite, freie Quelle.
    return await wikidataLookup(name, c);
  } catch { /* best-effort */ }
  return null;
}

export { isZefixConfigured };
