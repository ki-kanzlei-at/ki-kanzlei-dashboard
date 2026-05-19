/**
 * Geographic Bounding Boxes für DACH-Regionen
 * Ersetzt die REGION_CITIES Stadtlisten — Google Places locationRestriction
 * fängt ALLE Städte/Gemeinden in der Region ein, nicht nur hardcoded.
 *
 * Für große Regionen (>1.5° lat oder >2° lng) wird automatisch ein Grid
 * erzeugt, damit jeder Sub-Bereich ≤60 Google Places Ergebnisse liefert.
 */

export interface BoundingBox {
  south: number; // low latitude
  north: number; // high latitude
  west: number;  // low longitude
  east: number;  // high longitude
}

export interface RegionDef {
  name: string;
  country: "AT" | "DE" | "CH";
  box: BoundingBox;
}

/** Splits a large bounding box into a grid of smaller boxes */
export function splitBoundingBox(box: BoundingBox, maxLatSpan = 1.2, maxLngSpan = 1.6): BoundingBox[] {
  const latSpan = box.north - box.south;
  const lngSpan = box.east - box.west;
  const latCells = Math.ceil(latSpan / maxLatSpan);
  const lngCells = Math.ceil(lngSpan / maxLngSpan);

  if (latCells <= 1 && lngCells <= 1) return [box];

  const cellLat = latSpan / latCells;
  const cellLng = lngSpan / lngCells;
  const boxes: BoundingBox[] = [];

  for (let r = 0; r < latCells; r++) {
    for (let c = 0; c < lngCells; c++) {
      boxes.push({
        south: box.south + r * cellLat,
        north: box.south + (r + 1) * cellLat,
        west: box.west + c * cellLng,
        east: box.west + (c + 1) * cellLng,
      });
    }
  }
  return boxes;
}

// ── Österreich (9 Bundesländer) ──
const AT_REGIONS: RegionDef[] = [
  { name: "Wien",              country: "AT", box: { south: 48.12, north: 48.33, west: 16.18, east: 16.58 } },
  { name: "Niederösterreich",  country: "AT", box: { south: 47.42, north: 48.97, west: 14.45, east: 17.07 } },
  { name: "Oberösterreich",    country: "AT", box: { south: 47.45, north: 48.77, west: 12.75, east: 14.99 } },
  { name: "Salzburg",          country: "AT", box: { south: 46.90, north: 47.85, west: 12.10, east: 13.76 } },
  { name: "Tirol",             country: "AT", box: { south: 46.65, north: 47.75, west: 10.10, east: 12.97 } },
  { name: "Vorarlberg",        country: "AT", box: { south: 47.00, north: 47.58, west: 9.53, east: 10.24 } },
  { name: "Kärnten",           country: "AT", box: { south: 46.37, north: 47.13, west: 12.65, east: 15.03 } },
  { name: "Steiermark",        country: "AT", box: { south: 46.62, north: 47.83, west: 13.56, east: 16.17 } },
  { name: "Burgenland",        country: "AT", box: { south: 46.86, north: 48.12, west: 16.00, east: 17.17 } },
];

// ── Deutschland (16 Bundesländer) ──
const DE_REGIONS: RegionDef[] = [
  { name: "Bayern",                    country: "DE", box: { south: 47.27, north: 50.57, west: 8.98, east: 13.84 } },
  { name: "Nordrhein-Westfalen",       country: "DE", box: { south: 50.32, north: 52.53, west: 5.87, east: 9.46 } },
  { name: "Baden-Württemberg",         country: "DE", box: { south: 47.53, north: 49.79, west: 7.51, east: 10.50 } },
  { name: "Berlin",                    country: "DE", box: { south: 52.34, north: 52.68, west: 13.09, east: 13.76 } },
  { name: "Hamburg",                   country: "DE", box: { south: 53.39, north: 53.74, west: 9.73, east: 10.33 } },
  { name: "Hessen",                    country: "DE", box: { south: 49.39, north: 51.66, west: 7.77, east: 10.24 } },
  { name: "Niedersachsen",             country: "DE", box: { south: 51.30, north: 53.89, west: 6.65, east: 11.60 } },
  { name: "Rheinland-Pfalz",           country: "DE", box: { south: 48.97, north: 50.94, west: 6.11, east: 8.51 } },
  { name: "Sachsen",                   country: "DE", box: { south: 50.17, north: 51.68, west: 11.87, east: 15.04 } },
  { name: "Thüringen",                 country: "DE", box: { south: 50.20, north: 51.65, west: 9.88, east: 12.65 } },
  { name: "Brandenburg",               country: "DE", box: { south: 51.36, north: 53.56, west: 11.27, east: 14.77 } },
  { name: "Sachsen-Anhalt",            country: "DE", box: { south: 50.94, north: 53.04, west: 10.56, east: 13.19 } },
  { name: "Schleswig-Holstein",        country: "DE", box: { south: 53.36, north: 55.06, west: 8.34, east: 11.31 } },
  { name: "Mecklenburg-Vorpommern",    country: "DE", box: { south: 53.11, north: 54.69, west: 10.59, east: 14.41 } },
  { name: "Saarland",                  country: "DE", box: { south: 49.11, north: 49.64, west: 6.36, east: 7.41 } },
  { name: "Bremen",                    country: "DE", box: { south: 53.01, north: 53.60, west: 8.48, east: 8.99 } },
];

// ── Schweiz (26 Kantone) ──
const CH_REGIONS: RegionDef[] = [
  { name: "Zürich",                    country: "CH", box: { south: 47.16, north: 47.70, west: 8.36, east: 8.99 } },
  { name: "Bern",                      country: "CH", box: { south: 46.33, north: 47.35, west: 6.86, east: 8.46 } },
  { name: "Luzern",                    country: "CH", box: { south: 46.77, north: 47.27, west: 7.84, east: 8.52 } },
  { name: "Uri",                       country: "CH", box: { south: 46.41, north: 46.93, west: 8.39, east: 8.93 } },
  { name: "Schwyz",                    country: "CH", box: { south: 46.93, north: 47.23, west: 8.53, east: 8.98 } },
  { name: "Obwalden",                  country: "CH", box: { south: 46.73, north: 46.99, west: 8.07, east: 8.49 } },
  { name: "Nidwalden",                 country: "CH", box: { south: 46.77, north: 47.02, west: 8.24, east: 8.60 } },
  { name: "Glarus",                    country: "CH", box: { south: 46.79, north: 47.17, west: 8.83, east: 9.23 } },
  { name: "Zug",                       country: "CH", box: { south: 47.06, north: 47.24, west: 8.42, east: 8.63 } },
  { name: "Freiburg",                  country: "CH", box: { south: 46.55, north: 47.00, west: 6.74, east: 7.39 } },
  { name: "Solothurn",                 country: "CH", box: { south: 47.07, north: 47.50, west: 7.34, east: 7.95 } },
  { name: "Basel-Stadt",               country: "CH", box: { south: 47.52, north: 47.59, west: 7.56, east: 7.67 } },
  { name: "Basel-Landschaft",          country: "CH", box: { south: 47.33, north: 47.56, west: 7.32, east: 7.81 } },
  { name: "Schaffhausen",              country: "CH", box: { south: 47.65, north: 47.82, west: 8.40, east: 8.87 } },
  { name: "Appenzell Ausserrhoden",    country: "CH", box: { south: 47.31, north: 47.47, west: 9.22, east: 9.55 } },
  { name: "Appenzell Innerrhoden",     country: "CH", box: { south: 47.26, north: 47.41, west: 9.35, east: 9.53 } },
  { name: "St. Gallen",               country: "CH", box: { south: 46.87, north: 47.53, west: 8.80, east: 9.68 } },
  { name: "Graubünden",               country: "CH", box: { south: 46.17, north: 47.06, west: 8.65, east: 10.49 } },
  { name: "Aargau",                    country: "CH", box: { south: 47.14, north: 47.62, west: 7.71, east: 8.46 } },
  { name: "Thurgau",                   country: "CH", box: { south: 47.38, north: 47.70, west: 8.64, east: 9.40 } },
  { name: "Tessin",                    country: "CH", box: { south: 45.82, north: 46.64, west: 8.38, east: 9.17 } },
  { name: "Waadt",                     country: "CH", box: { south: 46.20, north: 46.97, west: 6.06, east: 7.14 } },
  { name: "Wallis",                    country: "CH", box: { south: 45.87, north: 46.66, west: 6.77, east: 8.47 } },
  { name: "Neuenburg",                 country: "CH", box: { south: 46.82, north: 47.10, west: 6.46, east: 6.99 } },
  { name: "Genf",                      country: "CH", box: { south: 46.13, north: 46.37, west: 5.96, east: 6.31 } },
  { name: "Jura",                      country: "CH", box: { south: 47.15, north: 47.50, west: 6.85, east: 7.34 } },
];

/** All DACH region definitions */
export const ALL_REGIONS: RegionDef[] = [...AT_REGIONS, ...DE_REGIONS, ...CH_REGIONS];

/** Lookup region by name */
export function getRegion(name: string): RegionDef | undefined {
  return ALL_REGIONS.find((r) => r.name === name);
}

// ── OSM-Nominatim Tile-Set für jede Region (apify-style polygon decomposition) ──
// Generiert via scripts/generate-region-tiles.ts; ~50 Tiles pro Region (Bayern 303, Genf 1).
// Vorteil ggü single bounding-box: kein Übergreifen in Nachbarkantone/-bundesländer.
import regionTilesData from "./region-tiles.json";

interface TileSet {
  name: string;
  country: string;
  tiles: BoundingBox[];
  bbox: BoundingBox;
}
const REGION_TILES = regionTilesData as TileSet[];

/** Get search boxes for a region.
 * Nutzt polygon-zerlegte Tiles aus OSM Nominatim (region-tiles.json).
 * Falls Region nicht in JSON → fallback auf legacy Bounding-Box + grid-split.
 */
export function getSearchBoxes(regionName: string): BoundingBox[] {
  const fromTiles = REGION_TILES.find((r) => r.name === regionName);
  if (fromTiles && fromTiles.tiles.length > 0) {
    return fromTiles.tiles;
  }
  const region = getRegion(regionName);
  if (!region) return [];
  return splitBoundingBox(region.box);
}
