/* ── Wikidata-Connector (frei, live) ──
 * Liefert für DE-Firmen (und als Ergänzung andere) register-ähnliche Eckdaten:
 * Rechtsform, Sitz, Gründungsjahr, Geschäftsführer/Vorstand, Land.
 * Keine Auth, kein Hosting nötig. Quelle: Wikidata (CC0).
 */

import type { OfficialCompany } from "@/lib/registry";

const API = "https://www.wikidata.org/w/api.php";
const UA = "KI-Kanzlei-LeadResearch/1.0 (kontakt@ki-kanzlei.at)";

type Claims = Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>>;

async function wd(params: Record<string, string>): Promise<Record<string, unknown>> {
  const u = new URL(API);
  Object.entries({ format: "json", origin: "*", ...params }).forEach(([k, v]) => u.searchParams.set(k, v));
  const res = await fetch(u.toString(), { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`wikidata ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

function entityId(claims: Claims, prop: string): string | null {
  const v = claims[prop]?.[0]?.mainsnak?.datavalue?.value as { id?: string } | undefined;
  return v?.id ?? null;
}
function year(claims: Claims, prop: string): number | null {
  const v = claims[prop]?.[0]?.mainsnak?.datavalue?.value as { time?: string } | undefined;
  const m = v?.time?.match(/^\+?(\d{3,4})-/);
  return m ? Number(m[1]) : null;
}

/** Firma in Wikidata suchen und zu OfficialCompany mappen. */
export async function wikidataLookup(name: string, country = "DE"): Promise<OfficialCompany | null> {
  if (!name.trim()) return null;
  try {
    const search = await wd({ action: "wbsearchentities", search: name.trim(), language: "de", uselang: "de", type: "item", limit: "6" });
    const hits = (search.search as Array<{ id: string }> | undefined) ?? [];
    if (!hits.length) return null;

    const ids = hits.map((h) => h.id).join("|");
    const got = await wd({ action: "wbgetentities", ids, props: "claims|labels", languages: "de|en" });
    const entities = (got.entities as Record<string, { claims?: Claims; labels?: Record<string, { value?: string }> }>) ?? {};

    // Ersten firmenartigen Treffer wählen (Sitz/Rechtsform/Branche/Vorstand/CEO/Gründer)
    let entId: string | null = null;
    let claims: Claims | null = null;
    for (const h of hits) {
      const c = entities[h.id]?.claims;
      if (c && (c.P159 || c.P1454 || c.P452 || c.P3320 || c.P169 || c.P112 || c.P127)) { entId = h.id; claims = c; break; }
    }
    if (!entId || !claims) return null;

    // Referenzierte Entitäten (Rechtsform, Sitz, Land, CEO/Vorstand) → Labels auflösen
    const ceoId = entityId(claims, "P169") || entityId(claims, "P488") || entityId(claims, "P1037");
    const refIds = [entityId(claims, "P1454"), entityId(claims, "P159"), entityId(claims, "P17"), ceoId].filter(Boolean) as string[];
    const labels: Record<string, string | null> = {};
    if (refIds.length) {
      const r = await wd({ action: "wbgetentities", ids: [...new Set(refIds)].join("|"), props: "labels", languages: "de|en" });
      const re = (r.entities as Record<string, { labels?: Record<string, { value?: string }> }>) ?? {};
      for (const [id, ent] of Object.entries(re)) labels[id] = ent.labels?.de?.value ?? ent.labels?.en?.value ?? null;
    }
    const lbl = (id: string | null) => (id ? labels[id] ?? null : null);

    const main = entities[entId];
    const compName = main.labels?.de?.value ?? main.labels?.en?.value ?? name.trim();
    const ceoName = lbl(ceoId);
    const ceoParts = (ceoName ?? "").split(/\s+/).filter(Boolean);

    return {
      source: "wikidata",
      sourceLabel: `Wikidata ${entId}`,
      name: compName,
      legalForm: lbl(entityId(claims, "P1454")),
      seat: lbl(entityId(claims, "P159")),
      street: null,
      postalCode: null,
      city: lbl(entityId(claims, "P159")),
      country: lbl(entityId(claims, "P17")) ?? country,
      foundedYear: year(claims, "P571"),
      managers: ceoName
        ? [{ name: ceoName, firstName: ceoParts[0] ?? null, lastName: ceoParts.length > 1 ? ceoParts.slice(1).join(" ") : null, title: null }]
        : [],
    };
  } catch {
    return null;
  }
}
