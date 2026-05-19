/* Generiert region-tiles.json aus OpenStreetMap Nominatim.
 *
 * Strategie (Apify-Style):
 *  1. Pro DACH-Region (Bundesland/Kanton) das echte Polygon von Nominatim holen
 *  2. Polygon in Rectangle-Tiles (~12-15km) zerlegen
 *  3. Nur Tiles behalten deren Center IM Polygon liegt
 *  → Coverage exakt auf Region beschränkt, kein Übergreifen in Nachbarn
 *
 * Verwendung: npx tsx scripts/generate-region-tiles.ts
 * Output: src/lib/enrichment/region-tiles.json
 */
import { writeFileSync } from "fs";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "ki-kanzlei-dashboard/1.0 (markus@ki-kanzlei.at)";
const RATE_LIMIT_MS = 1100; // Nominatim Usage Policy: max 1 req/sec

const TILE_SIZE_LAT = 0.13;  // ~14 km
const TILE_SIZE_LNG = 0.18;  // ~13 km bei 47°N

const REGIONS: { name: string; country: "AT" | "DE" | "CH"; query: string }[] = [
  // ── Österreich (9 Bundesländer) ──
  { name: "Wien",             country: "AT", query: "Wien, Austria" },
  { name: "Niederösterreich", country: "AT", query: "Niederösterreich, Austria" },
  { name: "Oberösterreich",   country: "AT", query: "Oberösterreich, Austria" },
  { name: "Salzburg",         country: "AT", query: "Salzburg, Österreich" },
  { name: "Tirol",            country: "AT", query: "Tirol, Austria" },
  { name: "Vorarlberg",       country: "AT", query: "Vorarlberg, Austria" },
  { name: "Kärnten",          country: "AT", query: "Kärnten, Austria" },
  { name: "Steiermark",       country: "AT", query: "Steiermark, Austria" },
  { name: "Burgenland",       country: "AT", query: "Burgenland, Austria" },

  // ── Deutschland (16 Bundesländer) ──
  { name: "Bayern",                country: "DE", query: "Bayern, Deutschland" },
  { name: "Nordrhein-Westfalen",   country: "DE", query: "Nordrhein-Westfalen, Deutschland" },
  { name: "Baden-Württemberg",     country: "DE", query: "Baden-Württemberg, Deutschland" },
  { name: "Berlin",                country: "DE", query: "Berlin, Deutschland" },
  { name: "Hamburg",               country: "DE", query: "Hamburg, Deutschland" },
  { name: "Hessen",                country: "DE", query: "Hessen, Deutschland" },
  { name: "Niedersachsen",         country: "DE", query: "Niedersachsen, Deutschland" },
  { name: "Rheinland-Pfalz",       country: "DE", query: "Rheinland-Pfalz, Deutschland" },
  { name: "Sachsen",               country: "DE", query: "Sachsen, Deutschland" },
  { name: "Thüringen",             country: "DE", query: "Thüringen, Deutschland" },
  { name: "Brandenburg",           country: "DE", query: "Brandenburg, Deutschland" },
  { name: "Sachsen-Anhalt",        country: "DE", query: "Sachsen-Anhalt, Deutschland" },
  { name: "Schleswig-Holstein",    country: "DE", query: "Schleswig-Holstein, Deutschland" },
  { name: "Mecklenburg-Vorpommern",country: "DE", query: "Mecklenburg-Vorpommern, Deutschland" },
  { name: "Saarland",              country: "DE", query: "Saarland, Deutschland" },
  { name: "Bremen",                country: "DE", query: "Bremen, Deutschland" },

  // ── Schweiz (26 Kantone) ──
  { name: "Zürich",                  country: "CH", query: "Kanton Zürich, Schweiz" },
  { name: "Bern",                    country: "CH", query: "Kanton Bern, Schweiz" },
  { name: "Luzern",                  country: "CH", query: "Kanton Luzern, Schweiz" },
  { name: "Uri",                     country: "CH", query: "Kanton Uri, Schweiz" },
  { name: "Schwyz",                  country: "CH", query: "Kanton Schwyz, Schweiz" },
  { name: "Obwalden",                country: "CH", query: "Kanton Obwalden, Schweiz" },
  { name: "Nidwalden",               country: "CH", query: "Kanton Nidwalden, Schweiz" },
  { name: "Glarus",                  country: "CH", query: "Kanton Glarus, Schweiz" },
  { name: "Zug",                     country: "CH", query: "Kanton Zug, Schweiz" },
  { name: "Freiburg",                country: "CH", query: "Kanton Freiburg, Schweiz" },
  { name: "Solothurn",               country: "CH", query: "Kanton Solothurn, Schweiz" },
  { name: "Basel-Stadt",             country: "CH", query: "Kanton Basel-Stadt, Schweiz" },
  { name: "Basel-Landschaft",        country: "CH", query: "Kanton Basel-Landschaft, Schweiz" },
  { name: "Schaffhausen",            country: "CH", query: "Kanton Schaffhausen, Schweiz" },
  { name: "Appenzell Ausserrhoden",  country: "CH", query: "Kanton Appenzell Ausserrhoden, Schweiz" },
  { name: "Appenzell Innerrhoden",   country: "CH", query: "Kanton Appenzell Innerrhoden, Schweiz" },
  { name: "St. Gallen",              country: "CH", query: "Kanton St. Gallen, Schweiz" },
  { name: "Graubünden",              country: "CH", query: "Kanton Graubünden, Schweiz" },
  { name: "Aargau",                  country: "CH", query: "Kanton Aargau, Schweiz" },
  { name: "Thurgau",                 country: "CH", query: "Kanton Thurgau, Schweiz" },
  { name: "Tessin",                  country: "CH", query: "Ticino, Switzerland" },
  { name: "Waadt",                   country: "CH", query: "Kanton Waadt, Schweiz" },
  { name: "Wallis",                  country: "CH", query: "Kanton Wallis, Schweiz" },
  { name: "Neuenburg",               country: "CH", query: "Kanton Neuenburg, Schweiz" },
  { name: "Genf",                    country: "CH", query: "Kanton Genf, Schweiz" },
  { name: "Jura",                    country: "CH", query: "République et Canton du Jura, Switzerland" },
];

interface Tile {
  south: number;
  north: number;
  west: number;
  east: number;
}

interface RegionResult {
  name: string;
  country: string;
  tiles: Tile[];
  bbox: Tile;
}

/** Point-in-Polygon via Ray-Casting (für ein Ring, [lng,lat]-Array). */
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Point-in-(Multi)Polygon. Außenring true → drinnen, sofern kein Loch matcht. */
function pointInPolygon(lng: number, lat: number, geojson: { type: string; coordinates: number[][][] | number[][][][] }): boolean {
  if (geojson.type === "Polygon") {
    const rings = geojson.coordinates as number[][][];
    if (!pointInRing(lng, lat, rings[0])) return false;
    for (let i = 1; i < rings.length; i++) if (pointInRing(lng, lat, rings[i])) return false;
    return true;
  }
  if (geojson.type === "MultiPolygon") {
    const polys = geojson.coordinates as number[][][][];
    for (const rings of polys) {
      if (!pointInRing(lng, lat, rings[0])) continue;
      let inHole = false;
      for (let i = 1; i < rings.length; i++) {
        if (pointInRing(lng, lat, rings[i])) { inHole = true; break; }
      }
      if (!inHole) return true;
    }
    return false;
  }
  return false;
}

interface NominatimHit {
  class?: string;
  type?: string;
  place_rank?: number;
  geojson?: { type: string; coordinates: number[][][] | number[][][][] };
  boundingbox?: string[];
  display_name?: string;
}

/** Wählt das beste Ergebnis: bevorzugt class=boundary mit place_rank ≤ 10 (state/region/county level). */
function pickBestBoundary(hits: NominatimHit[]): NominatimHit | null {
  if (hits.length === 0) return null;
  const withBoundary = hits.filter((h) => h.class === "boundary" && h.geojson && h.boundingbox);
  if (withBoundary.length === 0) return null;
  // place_rank: 4=country, 6=state, 8=region, 10=county, 12=city, 16=street
  // Wir wollen ≤ 10 = Bundesland/Kanton, nicht Stadt
  const regionLevel = withBoundary.find((h) => (h.place_rank ?? 99) <= 10);
  return regionLevel ?? withBoundary[0];
}

async function fetchRegion(query: string): Promise<{
  bbox: [number, number, number, number]; // [south, north, west, east]
  geojson: { type: string; coordinates: number[][][] | number[][][][] };
} | null> {
  // featuretype=state filtert Apartments/Routen raus, aber match nicht immer
  let hits: NominatimHit[] = [];
  for (const params of [
    `q=${encodeURIComponent(query)}&format=json&polygon_geojson=1&limit=5&featuretype=state`,
    `q=${encodeURIComponent(query)}&format=json&polygon_geojson=1&limit=5`,
  ]) {
    const res = await fetch(`${NOMINATIM_BASE}?${params}`, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) continue;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      hits = data as NominatimHit[];
      break;
    }
    await sleep(RATE_LIMIT_MS / 2);
  }
  const best = pickBestBoundary(hits);
  if (!best) {
    console.error(`  ⚠️ Kein Boundary-Treffer für "${query}"`);
    return null;
  }
  console.log(`  ↳ matched: "${best.display_name?.substring(0, 80)}" (rank=${best.place_rank})`);
  const [s, n, w, e] = best.boundingbox!.map(parseFloat);
  return { bbox: [s, n, w, e], geojson: best.geojson! };
}

function tilesFromPolygon(bbox: [number, number, number, number], geojson: { type: string; coordinates: number[][][] | number[][][][] }): Tile[] {
  const [south, north, west, east] = bbox;
  const tiles: Tile[] = [];
  for (let lat = south; lat < north; lat += TILE_SIZE_LAT) {
    for (let lng = west; lng < east; lng += TILE_SIZE_LNG) {
      const tile: Tile = {
        south: lat,
        north: Math.min(lat + TILE_SIZE_LAT, north),
        west: lng,
        east: Math.min(lng + TILE_SIZE_LNG, east),
      };
      const cLng = (tile.west + tile.east) / 2;
      const cLat = (tile.south + tile.north) / 2;
      if (pointInPolygon(cLng, cLat, geojson)) {
        tiles.push(tile);
      }
    }
  }
  return tiles;
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const out: RegionResult[] = [];
  for (let i = 0; i < REGIONS.length; i++) {
    const r = REGIONS[i];
    console.log(`[${i + 1}/${REGIONS.length}] ${r.name} (${r.country}) — fetch...`);
    const data = await fetchRegion(r.query);
    if (!data) {
      console.error(`  ❌ Skip ${r.name}`);
      await sleep(RATE_LIMIT_MS);
      continue;
    }
    const [s, n, w, e] = data.bbox;
    let tiles = tilesFromPolygon(data.bbox, data.geojson);
    // Fallback: bei sehr kleinen Regionen (Basel-Stadt, Salzburg-City etc.) wo kein Tile-Center
    // im Polygon liegt → bounding-box als 1 Tile nehmen.
    if (tiles.length === 0) {
      console.log(`  ⚠️ 0 Tiles via Polygon-Filter → fallback auf bbox`);
      tiles = [{ south: s, north: n, west: w, east: e }];
    }
    console.log(`  ✓ ${tiles.length} Tiles für ${r.name} (bbox: ${s.toFixed(2)},${w.toFixed(2)} → ${n.toFixed(2)},${e.toFixed(2)})`);
    out.push({
      name: r.name,
      country: r.country,
      bbox: { south: s, north: n, west: w, east: e },
      tiles,
    });
    await sleep(RATE_LIMIT_MS);
  }

  writeFileSync("src/lib/enrichment/region-tiles.json", JSON.stringify(out, null, 2), "utf8");
  const totalTiles = out.reduce((sum, r) => sum + r.tiles.length, 0);
  console.log(`\n✓ Geschrieben: src/lib/enrichment/region-tiles.json`);
  console.log(`  ${out.length} Regionen, ${totalTiles} Tiles total (avg ${(totalTiles / out.length).toFixed(0)}/Region)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
