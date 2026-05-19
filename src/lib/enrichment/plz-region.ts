/**
 * PLZ → Region (Bundesland/Kanton) Mapping für DACH.
 * Anti-"Bounding-Box-greift-in-Nachbarn"-Filter.
 *
 * Wird in der Pipeline nach Google-Places-Suche angewendet:
 *   - aus place.formattedAddress die PLZ extrahieren
 *   - plzToRegion(plz, country) → erwartete Region
 *   - wenn != gesuchte Region → drop (vor Gemini-Call → spart Geld)
 */

export type Country = "AT" | "DE" | "CH";

/** Extrahiert PLZ aus Google's formattedAddress.
 *  AT/DE = 4-5 stellig, CH = 4-stellig.
 */
export function extractPlz(address: string | undefined | null): string | null {
  if (!address) return null;
  // Suche nach PLZ-Muster: AT/CH=4 digits, DE=5 digits. Beide vor Stadt.
  // Beispiel: "Hauptstr. 1, 3013 Bern, Schweiz" oder "Musterstr. 5, 80331 München, Deutschland"
  const matches = address.match(/\b(\d{4,5})\b/g);
  if (!matches) return null;
  // Heuristic: erste 4-5 stellige Zahl ist üblicherweise die PLZ
  return matches[0];
}

/* ══ Österreich (4 Ziffern) ══ */
function plzToAtBundesland(plz: string): string | null {
  if (plz.length !== 4) return null;
  const p2 = plz.slice(0, 2);
  const p1 = plz[0];
  if (["67", "68", "69"].includes(p2)) return "Vorarlberg";
  if (["60", "61", "62", "63", "64", "65", "66", "99"].includes(p2)) return "Tirol";
  if (p1 === "9") return "Kärnten";
  if (p1 === "1") return "Wien";
  if (p1 === "2" || p1 === "3") return "Niederösterreich";
  if (p1 === "4") return "Oberösterreich";
  if (p1 === "5") return "Salzburg";
  if (p1 === "7") return "Burgenland";
  if (p1 === "8") return "Steiermark";
  return null;
}

/* ══ Deutschland (5 Ziffern) — grobes Bundesland-Mapping ══
 * Quelle: deutsche PLZ-Zonen. Manche PLZ-Bereiche überlappen Bundesländer,
 * wir nehmen die häufigste Zuordnung. Für 100% Accuracy bräuchte man eine
 * vollständige PLZ-DB (~80k Einträge).
 */
function plzToDeBundesland(plz: string): string | null {
  if (plz.length !== 5) return null;
  const n = parseInt(plz, 10);
  if (n >= 1000 && n <= 1999) return "Sachsen";            // 01xxx (auch 02 Dresden) - vereinfacht
  if (n >= 2000 && n <= 2199) return "Hamburg";
  if (n >= 2200 && n <= 2599) return "Schleswig-Holstein";
  if (n >= 2600 && n <= 2999) return "Niedersachsen";
  if (n >= 3000 && n <= 3199) return "Niedersachsen";      // 30xxx Hannover area
  if (n >= 3200 && n <= 3799) return "Niedersachsen";
  if (n >= 3800 && n <= 3999) return "Sachsen-Anhalt";
  if (n >= 4000 && n <= 4299) return "Niedersachsen";
  if (n >= 4300 && n <= 4499) return "Nordrhein-Westfalen";
  if (n >= 4500 && n <= 4999) return "Nordrhein-Westfalen";
  if (n >= 5000 && n <= 5399) return "Nordrhein-Westfalen";
  if (n >= 5400 && n <= 5599) return "Rheinland-Pfalz";
  if (n >= 5600 && n <= 5699) return "Rheinland-Pfalz";
  if (n >= 5700 && n <= 5999) return "Nordrhein-Westfalen";
  if (n >= 6000 && n <= 6399) return "Hessen";              // Frankfurt
  if (n >= 6400 && n <= 6499) return "Hessen";
  if (n >= 6500 && n <= 6799) return "Rheinland-Pfalz";
  if (n >= 6800 && n <= 6899) return "Hessen";
  if (n >= 6900 && n <= 6999) return "Baden-Württemberg";
  if (n >= 7000 && n <= 7999) return "Baden-Württemberg";   // Stuttgart
  if (n >= 8000 && n <= 8999) return "Bayern";              // München, Nürnberg
  if (n >= 9000 && n <= 9699) return "Bayern";
  if (n >= 9700 && n <= 9799) return "Bayern";
  if (n >= 9800 && n <= 9999) return "Thüringen";
  if (n >= 10000 && n <= 14199) return "Berlin";
  if (n >= 14400 && n <= 16999) return "Brandenburg";
  if (n >= 17000 && n <= 17999) return "Mecklenburg-Vorpommern";
  if (n >= 18000 && n <= 19999) return "Mecklenburg-Vorpommern";
  if (n >= 20000 && n <= 21299) return "Hamburg";
  if (n >= 21300 && n <= 21999) return "Niedersachsen";
  if (n >= 22000 && n <= 22999) return "Hamburg";
  if (n >= 23000 && n <= 23999) return "Schleswig-Holstein";
  if (n >= 24000 && n <= 25999) return "Schleswig-Holstein";
  if (n >= 26000 && n <= 27999) return "Niedersachsen";
  if (n >= 28000 && n <= 28999) return "Bremen";
  if (n >= 29000 && n <= 31999) return "Niedersachsen";
  if (n >= 32000 && n <= 33999) return "Nordrhein-Westfalen";
  if (n >= 34000 && n <= 34999) return "Hessen";
  if (n >= 35000 && n <= 35999) return "Hessen";
  if (n >= 36000 && n <= 36399) return "Hessen";
  if (n >= 36400 && n <= 36499) return "Thüringen";
  if (n >= 37000 && n <= 37999) return "Niedersachsen";
  if (n >= 38000 && n <= 38999) return "Niedersachsen";
  if (n >= 39000 && n <= 39999) return "Sachsen-Anhalt";
  if (n >= 40000 && n <= 48999) return "Nordrhein-Westfalen";
  if (n >= 49000 && n <= 49999) return "Niedersachsen";
  if (n >= 50000 && n <= 53999) return "Nordrhein-Westfalen";
  if (n >= 54000 && n <= 56999) return "Rheinland-Pfalz";
  if (n >= 57000 && n <= 59999) return "Nordrhein-Westfalen";
  if (n >= 60000 && n <= 63999) return "Hessen";
  if (n >= 64000 && n <= 65999) return "Hessen";
  if (n >= 66000 && n <= 66999) return "Saarland";
  if (n >= 67000 && n <= 67999) return "Rheinland-Pfalz";
  if (n >= 68000 && n <= 69999) return "Baden-Württemberg";
  if (n >= 70000 && n <= 79999) return "Baden-Württemberg";
  if (n >= 80000 && n <= 87999) return "Bayern";
  if (n >= 88000 && n <= 88999) return "Baden-Württemberg";
  if (n >= 89000 && n <= 89999) return "Bayern";
  if (n >= 90000 && n <= 96999) return "Bayern";
  if (n >= 97000 && n <= 97999) return "Bayern";
  if (n >= 98000 && n <= 99999) return "Thüringen";
  return null;
}

/* ══ Schweiz (4 Ziffern) — Kanton-Mapping ══ */
function plzToChKanton(plz: string): string | null {
  if (plz.length !== 4) return null;
  const n = parseInt(plz, 10);
  if (n >= 1000 && n <= 1299) return "Waadt";
  if (n >= 1200 && n <= 1299) return "Genf";
  if (n >= 1290 && n <= 1299) return "Genf";
  if (n >= 1300 && n <= 1349) return "Waadt";
  if (n >= 1350 && n <= 1399) return "Waadt";
  if (n >= 1400 && n <= 1599) return "Waadt";
  if (n >= 1530 && n <= 1599) return "Freiburg";
  if (n >= 1600 && n <= 1699) return "Freiburg";
  if (n >= 1700 && n <= 1799) return "Freiburg";
  if (n >= 1800 && n <= 1899) return "Waadt";
  if (n >= 1860 && n <= 1899) return "Wallis";
  if (n >= 1900 && n <= 1999) return "Wallis";
  if (n >= 2000 && n <= 2099) return "Neuenburg";
  if (n >= 2100 && n <= 2199) return "Neuenburg";
  if (n >= 2200 && n <= 2299) return "Neuenburg";
  if (n >= 2300 && n <= 2399) return "Neuenburg";
  if (n >= 2400 && n <= 2499) return "Neuenburg";
  if (n >= 2500 && n <= 2599) return "Bern";       // Biel
  if (n >= 2600 && n <= 2899) return "Jura";
  if (n >= 2900 && n <= 2999) return "Jura";
  if (n >= 3000 && n <= 3999) return "Bern";
  if (n >= 4000 && n <= 4099) return "Basel-Stadt";
  if (n >= 4100 && n <= 4299) return "Basel-Landschaft";
  if (n >= 4300 && n <= 4399) return "Basel-Landschaft";
  if (n >= 4400 && n <= 4499) return "Basel-Landschaft";
  if (n >= 4500 && n <= 4699) return "Solothurn";
  if (n >= 4700 && n <= 4799) return "Solothurn";
  if (n >= 4800 && n <= 4999) return "Aargau";
  if (n >= 5000 && n <= 5999) return "Aargau";
  if (n >= 6000 && n <= 6299) return "Luzern";
  if (n >= 6300 && n <= 6399) return "Zug";
  if (n >= 6400 && n <= 6499) return "Schwyz";
  if (n >= 6500 && n <= 6599) return "Tessin";
  if (n >= 6600 && n <= 6999) return "Tessin";
  if (n >= 7000 && n <= 7599) return "Graubünden";
  if (n >= 8000 && n <= 8099) return "Zürich";
  if (n >= 8100 && n <= 8499) return "Zürich";
  if (n >= 8500 && n <= 8599) return "Thurgau";
  if (n >= 8600 && n <= 8699) return "Zürich";
  if (n >= 8700 && n <= 8999) return "Schwyz";
  if (n >= 9000 && n <= 9099) return "St. Gallen";
  if (n >= 9100 && n <= 9499) return "St. Gallen";
  return null;
}

/** Map PLZ to expected region name (Bundesland/Kanton) for the given country. */
export function plzToRegion(plz: string | null, country: Country): string | null {
  if (!plz) return null;
  const digits = plz.replace(/\D/g, "");
  if (country === "AT") return plzToAtBundesland(digits);
  if (country === "DE") return plzToDeBundesland(digits);
  if (country === "CH") return plzToChKanton(digits);
  return null;
}

/** Prüft ob die Place-Adresse im erwarteten Bundesland/Kanton liegt.
 * - Wenn PLZ extrahierbar UND nicht in erwarteter Region → return false (drop)
 * - Wenn PLZ nicht extrahierbar oder Mapping unklar → return true (behalten — bei Zweifel keep)
 */
export function placeMatchesRegion(
  address: string | null | undefined,
  country: string,
  expectedRegion: string,
): boolean {
  if (!["AT", "DE", "CH"].includes(country)) return true;
  const plz = extractPlz(address);
  if (!plz) return true; // keine PLZ extrahierbar → behalten
  const actualRegion = plzToRegion(plz, country as Country);
  if (!actualRegion) return true; // mapping unklar → behalten
  return actualRegion === expectedRegion;
}
