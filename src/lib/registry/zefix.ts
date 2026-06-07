/* ── Zefix (CH) — Schweizer Handelsregister, öffentliche REST-API ──
 * Frei nutzbar, aber Account erforderlich (HTTP Basic Auth).
 * Env: ZEFIX_USER + ZEFIX_PASSWORD. Ohne Creds → no-op.
 * Doku: https://www.zefix.admin.ch/ZefixPublicREST/swagger-ui/index.html
 */

import type { OfficialCompany } from "./index";

const BASE = "https://www.zefix.admin.ch/ZefixPublicREST";

function authHeader(): string | null {
  const u = process.env.ZEFIX_USER?.trim();
  const p = process.env.ZEFIX_PASSWORD?.trim();
  if (!u || !p) return null;
  return "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
}
export function isZefixConfigured(): boolean {
  return !!authHeader();
}

async function zefixFetch(path: string, init: { method: string; body?: string }): Promise<unknown | null> {
  const auth = authHeader();
  if (!auth) return null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: init.method,
      body: init.body,
      headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) { console.warn("[zefix] HTTP", res.status); return null; }
    return await res.json();
  } catch (e) {
    console.warn("[zefix] Request fehlgeschlagen:", e instanceof Error ? e.message : e);
    return null;
  }
}

type ZefixCompany = {
  name?: string;
  uid?: string;
  legalForm?: { name?: string } | null;
  legalSeat?: string | null;
  address?: { street?: string; houseNumber?: string; city?: string; swissZipCode?: number | string } | null;
};

function toOfficial(c: ZefixCompany): OfficialCompany {
  const a = c.address ?? {};
  return {
    source: "zefix",
    sourceLabel: c.uid ? `Zefix ${c.uid}` : "Zefix",
    name: c.name ?? "",
    legalForm: c.legalForm?.name ?? null,
    seat: c.legalSeat ?? null,
    street: [a.street, a.houseNumber].filter(Boolean).join(" ") || null,
    postalCode: a.swissZipCode != null ? String(a.swissZipCode) : null,
    city: a.city ?? null,
    country: "CH",
    foundedYear: null,
    managers: [], // Zefix-Schema enthält keine Organe/Geschäftsführer
  };
}

export async function zefixLookup(name: string): Promise<OfficialCompany | null> {
  if (!isZefixConfigured() || name.trim().length < 3) return null;
  const list = await zefixFetch("/api/v1/company/search", {
    method: "POST",
    body: JSON.stringify({ name: name.trim(), activeOnly: true }),
  });
  if (!Array.isArray(list) || !list.length) return null;
  const short = list[0] as ZefixCompany;
  if (!short.uid) return toOfficial(short);
  const full = await zefixFetch(`/api/v1/company/uid/${encodeURIComponent(short.uid)}`, { method: "GET" });
  const f = Array.isArray(full) ? (full[0] as ZefixCompany) : (full as ZefixCompany | null);
  return toOfficial(f ?? short);
}
