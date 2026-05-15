/**
 * Österreichische Bundesländer – PLZ-basierte Zuordnung
 * Nutzt die ersten 1–2 Ziffern der 4-stelligen österreichischen Postleitzahl.
 */

export const AT_BUNDESLAENDER: { value: string; label: string }[] = [
  { value: "Wien", label: "Wien" },
  { value: "Niederösterreich", label: "Niederösterreich" },
  { value: "Oberösterreich", label: "Oberösterreich" },
  { value: "Salzburg", label: "Salzburg" },
  { value: "Tirol", label: "Tirol" },
  { value: "Vorarlberg", label: "Vorarlberg" },
  { value: "Burgenland", label: "Burgenland" },
  { value: "Steiermark", label: "Steiermark" },
  { value: "Kärnten", label: "Kärnten" },
];

/**
 * Leitet aus einer österreichischen PLZ das Bundesland ab.
 * Gibt null zurück wenn die PLZ nicht erkannt wird (z.B. DE/CH).
 */
export function postalCodeToBundesland(plz: string | null | undefined): string | null {
  if (!plz) return null;
  const digits = plz.replace(/\D/g, "");
  if (digits.length !== 4) return null; // AT PLZ sind immer 4-stellig

  const p2 = digits.slice(0, 2);
  const p1 = digits[0];

  if (["67", "68", "69"].includes(p2)) return "Vorarlberg";
  if (["60", "61", "62", "63", "64", "65", "66"].includes(p2)) return "Tirol";
  if (p2 === "99") return "Tirol"; // Osttirol
  if (p1 === "9") return "Kärnten";
  if (p1 === "1") return "Wien";
  if (p1 === "2" || p1 === "3") return "Niederösterreich";
  if (p1 === "4") return "Oberösterreich";
  if (p1 === "5") return "Salzburg";
  if (p1 === "7") return "Burgenland";
  if (p1 === "8") return "Steiermark";
  return null;
}

/**
 * Gibt Supabase OR-Klausel-Einträge zurück, um nach einem AT-Bundesland zu filtern.
 * Basiert auf PLZ-Präfixen. Der aufrufende Code muss zusätzlich country='AT' setzen,
 * damit keine DE-Postleitzahlen falsch gematcht werden.
 */
export function bundeslandToOrClauses(bundesland: string): string[] {
  switch (bundesland) {
    case "Wien":
      return ["postal_code.like.1%"];
    case "Niederösterreich":
      return ["postal_code.like.2%", "postal_code.like.3%"];
    case "Oberösterreich":
      return ["postal_code.like.4%"];
    case "Salzburg":
      return ["postal_code.like.5%"];
    case "Tirol":
      return [
        "postal_code.like.60%",
        "postal_code.like.61%",
        "postal_code.like.62%",
        "postal_code.like.63%",
        "postal_code.like.64%",
        "postal_code.like.65%",
        "postal_code.like.66%",
        "postal_code.like.99%",
      ];
    case "Vorarlberg":
      return ["postal_code.like.67%", "postal_code.like.68%", "postal_code.like.69%"];
    case "Burgenland":
      return ["postal_code.like.7%"];
    case "Steiermark":
      return ["postal_code.like.8%"];
    case "Kärnten":
      return [
        "postal_code.like.90%",
        "postal_code.like.91%",
        "postal_code.like.92%",
        "postal_code.like.93%",
        "postal_code.like.94%",
        "postal_code.like.95%",
        "postal_code.like.96%",
        "postal_code.like.97%",
        "postal_code.like.98%",
      ];
    default:
      return [];
  }
}
