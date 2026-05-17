/* ── Lead Typen ── */

export type LeadStatus = "new" | "contacted" | "interested" | "not_interested" | "converted";

export interface LeadFilters {
  status?: LeadStatus;
  city?: string | string[];
  /** Österreichisches Bundesland – wird serverseitig auf PLZ-Muster gemappt */
  state?: string | string[];
  country?: string;
  category?: string;
  industry?: string | string[];
  search_query?: string;
  search_location?: string;
  legal_form?: string | string[];
  /** Volltextsuche über Name, Firma, E-Mail */
  search?: string;
  /** ID-basierter Filter für CRM-Export */
  ids?: string[];
}

export interface SortOptions {
  sort_by?: string;
  sort_dir?: "asc" | "desc";
}

/** Anrede/Geschlecht des GF — Werte kommen 1:1 aus dem AI-Prompt */
export type CeoGender = "herr" | "frau" | "divers" | "unbekannt";

export interface Lead {
  id: string;
  created_at: string;
  updated_at: string;

  /* Basisdaten */
  name: string | null;
  /** Von Dashboard/API befüllt — Sync via DB-Trigger aus company_name */
  company: string;
  /** Von AI-Extraktion befüllt — Sync via DB-Trigger nach company */
  company_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;

  /* Standort */
  address: string | null;
  /** Straße + Hausnummer aus AI-Extraktion */
  street: string | null;
  city: string | null;
  postal_code: string | null;
  /** Bundesland / Kanton / State — aus PLZ abgeleitet oder manuell gesetzt */
  state: string | null;
  country: string;
  category: string | null;
  industry: string | null;

  /* Firmendaten */
  legal_form: string | null;
  employee_count: number | null;

  /* Ansprechpartner */
  ceo_name: string | null;
  ceo_title: string | null;
  ceo_first_name: string | null;
  ceo_last_name: string | null;
  ceo_gender: CeoGender | null;
  ceo_source: string | null;

  /* Google Places Daten */
  google_place_id: string | null;
  google_rating: number | null;
  google_reviews_count: number | null;

  /* Social Media */
  social_linkedin: string | null;
  social_facebook: string | null;
  social_instagram: string | null;
  social_xing: string | null;
  social_twitter: string | null;
  social_youtube: string | null;
  social_tiktok: string | null;

  /* Notizen */
  notes: string | null;

  /* Suche & Status */
  status: LeadStatus;
  search_query: string | null;
  search_location: string | null;
  search_job_id: string | null;
  raw_data: Record<string, unknown> | null;

  /* Multi-Tenancy */
  user_id: string;
}

/* Felder für das Erstellen eines neuen Leads */
export type LeadInsert = Omit<Lead, "id" | "created_at" | "updated_at" | "state"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
  state?: string | null;
};

/* Felder für das Aktualisieren eines Leads (alle optional) */
export type LeadUpdate = Partial<Pick<Lead,
  | "company" | "company_name" | "name" | "email" | "phone" | "website"
  | "address" | "street" | "city" | "postal_code" | "state" | "country"
  | "category" | "industry" | "legal_form" | "employee_count"
  | "ceo_name" | "ceo_title" | "ceo_first_name" | "ceo_last_name" | "ceo_gender" | "ceo_source"
  | "status" | "notes"
  | "social_linkedin" | "social_facebook" | "social_instagram"
  | "social_xing" | "social_twitter" | "social_youtube" | "social_tiktok"
>>;

/* Normalisierte Branchenliste (AI-Output als value, Anzeige als label) */
export const INDUSTRY_OPTIONS = [
  { value: "Rechtsanwalt",          label: "Rechtsanwalt" },
  { value: "Kanzlei",               label: "Kanzlei" },
  { value: "Steuerberater",         label: "Steuerberater" },
  { value: "Personalverrechnung",   label: "Personalverrechnung" },
  { value: "Buchhaltung",           label: "Buchhaltung" },
  { value: "Wirtschaftsprüfer",     label: "Wirtschaftsprüfer" },
  { value: "Notar",                 label: "Notar" },
  { value: "Patentanwalt",          label: "Patentanwalt" },
  { value: "Arzt",                  label: "Arzt" },
  { value: "Hausarzt",              label: "Hausarzt" },
  { value: "Internist",             label: "Internist" },
  { value: "Facharzt",              label: "Facharzt" },
  { value: "Orthopäde",             label: "Orthopäde" },
  { value: "Augenarzt",             label: "Augenarzt" },
  { value: "Hautarzt",              label: "Hautarzt" },
  { value: "Kinderarzt",            label: "Kinderarzt" },
  { value: "Gynäkologe",            label: "Gynäkologe" },
  { value: "HNO-Arzt",              label: "HNO-Arzt" },
  { value: "Kardiologe",            label: "Kardiologe" },
  { value: "Zahnarzt",              label: "Zahnarzt" },
  { value: "Zahntechniker",         label: "Zahntechniker" },
  { value: "Tierarzt",              label: "Tierarzt" },
  { value: "Apotheke",              label: "Apotheke" },
  { value: "Physiotherapie",        label: "Physiotherapie" },
  { value: "Heilpraktiker",         label: "Heilpraktiker" },
  { value: "Psychotherapie",        label: "Psychotherapie" },
  { value: "Psychologie",           label: "Psychologie" },
  { value: "Krankenhaus",           label: "Krankenhaus" },
  { value: "Pflegeheim",            label: "Pflegeheim" },
  { value: "Pflegedienst",          label: "Pflegedienst" },
  { value: "Labor",                 label: "Labor" },
  { value: "Medizintechnik",        label: "Medizintechnik" },
  { value: "Immobilienmakler",      label: "Immobilienmakler" },
  { value: "Hausverwaltung",        label: "Hausverwaltung" },
  { value: "Bauträger",             label: "Bauträger" },
  { value: "Architekt",             label: "Architekt" },
  { value: "Innenarchitekt",        label: "Innenarchitekt" },
  { value: "Gutachter",             label: "Gutachter" },
  { value: "Ingenieurbüro",         label: "Ingenieurbüro" },
  { value: "Vermessungsbüro",       label: "Vermessungsbüro" },
  { value: "Bauunternehmen",        label: "Bauunternehmen" },
  { value: "Handwerksbetrieb",      label: "Handwerksbetrieb" },
  { value: "Elektrotechnik",        label: "Elektrotechnik" },
  { value: "Sanitär",               label: "Sanitär" },
  { value: "Heizung",               label: "Heizung" },
  { value: "Klimatechnik",          label: "Klimatechnik" },
  { value: "Installateur",          label: "Installateur" },
  { value: "Malerbetrieb",          label: "Malerbetrieb" },
  { value: "Bodenleger",            label: "Bodenleger" },
  { value: "Tischlerei",            label: "Tischlerei" },
  { value: "Schreinerei",           label: "Schreinerei" },
  { value: "Schlosserei",           label: "Schlosserei" },
  { value: "Dachdeckerei",          label: "Dachdeckerei" },
  { value: "Zimmerei",              label: "Zimmerei" },
  { value: "Glaserei",              label: "Glaserei" },
  { value: "Fliesenleger",          label: "Fliesenleger" },
  { value: "Gerüstbau",             label: "Gerüstbau" },
  { value: "Metallbau",             label: "Metallbau" },
  { value: "Schornsteinfeger",      label: "Schornsteinfeger" },
  { value: "Gebäudetechnik",        label: "Gebäudetechnik" },
  { value: "KFZ-Werkstatt",         label: "KFZ-Werkstatt" },
  { value: "Autohandel",            label: "Autohandel" },
  { value: "Autohaus",              label: "Autohaus" },
  { value: "Tankstelle",            label: "Tankstelle" },
  { value: "Hotel",                 label: "Hotel" },
  { value: "Pension",               label: "Pension" },
  { value: "Campingplatz",          label: "Campingplatz" },
  { value: "Ferienhaus",            label: "Ferienhaus" },
  { value: "Tourismus",             label: "Tourismus" },
  { value: "Restaurant",            label: "Restaurant" },
  { value: "Café",                  label: "Café" },
  { value: "Bäckerei",              label: "Bäckerei" },
  { value: "Metzgerei",             label: "Metzgerei" },
  { value: "Catering",              label: "Catering" },
  { value: "Imbiss",                label: "Imbiss" },
  { value: "Weingut",               label: "Weingut" },
  { value: "Brauerei",              label: "Brauerei" },
  { value: "Einzelhandel",          label: "Einzelhandel" },
  { value: "Supermarkt",            label: "Supermarkt" },
  { value: "Modegeschäft",          label: "Modegeschäft" },
  { value: "Juwelier",              label: "Juwelier" },
  { value: "Buchhandlung",          label: "Buchhandlung" },
  { value: "Großhandel",            label: "Großhandel" },
  { value: "Vertrieb",              label: "Vertrieb" },
  { value: "Import-Export",         label: "Import-Export" },
  { value: "E-Commerce",            label: "E-Commerce" },
  { value: "IT-Dienstleister",      label: "IT-Dienstleister" },
  { value: "Softwareentwicklung",   label: "Softwareentwicklung" },
  { value: "Coworking",             label: "Coworking" },
  { value: "Technologiepark",       label: "Technologiepark" },
  { value: "Webdesign",             label: "Webdesign" },
  { value: "Webagentur",            label: "Webagentur" },
  { value: "Marketingagentur",      label: "Marketingagentur" },
  { value: "Werbeagentur",          label: "Werbeagentur" },
  { value: "PR-Agentur",            label: "PR-Agentur" },
  { value: "Medien",                label: "Medien" },
  { value: "Unternehmensberatung",  label: "Unternehmensberatung" },
  { value: "Wirtschaftsberatung",   label: "Wirtschaftsberatung" },
  { value: "Versicherungsmakler",   label: "Versicherungsmakler" },
  { value: "Finanzberater",         label: "Finanzberater" },
  { value: "Bank",                  label: "Bank" },
  { value: "Vermögensverwaltung",   label: "Vermögensverwaltung" },
  { value: "Versicherung",          label: "Versicherung" },
  { value: "Inkasso",               label: "Inkasso" },
  { value: "Treuhand",              label: "Treuhand" },
  { value: "Leasing",               label: "Leasing" },
  { value: "Fitnessstudio",         label: "Fitnessstudio" },
  { value: "Sportverein",           label: "Sportverein" },
  { value: "Wellnesscenter",        label: "Wellnesscenter" },
  { value: "Friseur",               label: "Friseur" },
  { value: "Kosmetikstudio",        label: "Kosmetikstudio" },
  { value: "Beautysalon",           label: "Beautysalon" },
  { value: "Nagelstudio",           label: "Nagelstudio" },
  { value: "Tattoo-Studio",         label: "Tattoo-Studio" },
  { value: "Fahrschule",            label: "Fahrschule" },
  { value: "Nachhilfe",             label: "Nachhilfe" },
  { value: "Sprachschule",          label: "Sprachschule" },
  { value: "Musikschule",           label: "Musikschule" },
  { value: "Kindergarten",          label: "Kindergarten" },
  { value: "Tanzschule",            label: "Tanzschule" },
  { value: "Coaching",              label: "Coaching" },
  { value: "Fotograf",              label: "Fotograf" },
  { value: "Videoproduktion",       label: "Videoproduktion" },
  { value: "Grafikdesign",          label: "Grafikdesign" },
  { value: "Tonstudio",             label: "Tonstudio" },
  { value: "Druckerei",             label: "Druckerei" },
  { value: "Werbetechnik",          label: "Werbetechnik" },
  { value: "Reinigungsfirma",       label: "Reinigungsfirma" },
  { value: "Facility Management",   label: "Facility Management" },
  { value: "Gebäudeservice",        label: "Gebäudeservice" },
  { value: "Spedition",             label: "Spedition" },
  { value: "Logistik",              label: "Logistik" },
  { value: "Transportunternehmen",  label: "Transportunternehmen" },
  { value: "Kurierdienst",          label: "Kurierdienst" },
  { value: "Umzugsunternehmen",     label: "Umzugsunternehmen" },
  { value: "Gartenbau",             label: "Gartenbau" },
  { value: "Landschaftspflege",     label: "Landschaftspflege" },
  { value: "Floristik",             label: "Floristik" },
  { value: "Landwirtschaft",        label: "Landwirtschaft" },
  { value: "Bestattung",            label: "Bestattung" },
  { value: "Optiker",               label: "Optiker" },
  { value: "Hörgeräteakustiker",    label: "Hörgeräteakustiker" },
  { value: "Personalvermittlung",   label: "Personalvermittlung" },
  { value: "Zeitarbeit",            label: "Zeitarbeit" },
  { value: "Personalberatung",      label: "Personalberatung" },
  { value: "Sicherheitsdienst",     label: "Sicherheitsdienst" },
  { value: "Detektei",              label: "Detektei" },
  { value: "Eventmanagement",       label: "Eventmanagement" },
  { value: "Veranstaltungstechnik", label: "Veranstaltungstechnik" },
  { value: "Reisebüro",             label: "Reisebüro" },
  { value: "Tierhandlung",          label: "Tierhandlung" },
  { value: "Hundeschule",           label: "Hundeschule" },
  { value: "Rechenzentrum",         label: "Rechenzentrum" },
  { value: "Hosting",               label: "Hosting" },
  { value: "Telekommunikation",     label: "Telekommunikation" },
  { value: "Energieversorger",      label: "Energieversorger" },
  { value: "Photovoltaik",          label: "Photovoltaik" },
  { value: "Energieberatung",       label: "Energieberatung" },
  { value: "Wärmepumpe",            label: "Wärmepumpe" },
  { value: "Abfallentsorgung",      label: "Abfallentsorgung" },
  { value: "Recycling",             label: "Recycling" },
  { value: "Sonstige",              label: "Sonstige" },
] as const;

export type Industry = (typeof INDUSTRY_OPTIONS)[number]["value"];

/* ── Search Job Typen ── */

export type SearchJobStatus = "pending" | "running" | "completed" | "failed";

export interface SearchJob {
  id: string;
  user_id: string;
  query: string;
  location: string;
  country: string;
  status: SearchJobStatus;
  results_count: number;
  total_count: number | null;
  estimated_end_at: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type SearchJobInsert = Omit<SearchJob, "id" | "created_at" | "updated_at" | "started_at" | "completed_at" | "results_count" | "total_count" | "estimated_end_at" | "error_message" | "status"> & {
  id?: string;
  status?: SearchJobStatus;
  radius_km?: number;
};

/* ── Länder-Mapping (ISO-Codes → Anzeigename) ── */
export const COUNTRY_MAP: Record<string, string> = {
  AT: "Österreich",
  DE: "Deutschland",
  CH: "Schweiz",
  LI: "Liechtenstein",
  IT: "Italien",
  HU: "Ungarn",
  CZ: "Tschechien",
  SK: "Slowakei",
  SI: "Slowenien",
  PL: "Polen",
  NL: "Niederlande",
  BE: "Belgien",
  FR: "Frankreich",
  LU: "Luxemburg",
};

/** ISO-Code → Anzeigename */
export function countryLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return COUNTRY_MAP[code.toUpperCase()] ?? code;
}

/** Anzeigename → ISO-Code (für Select-Dropdown) */
export const COUNTRY_OPTIONS = Object.entries(COUNTRY_MAP).map(([value, label]) => ({
  value,
  label,
}));

/* Rechtsform-Filter */
export const COMPANY_TYPE_OPTIONS = [
  { value: "all", label: "Alle Rechtsformen" },
  { value: "gmbh", label: "GmbH" },
  { value: "eu", label: "Einzelunternehmen (e.U.)" },
  { value: "ag", label: "AG" },
  { value: "og", label: "OG" },
  { value: "kg", label: "KG" },
  { value: "gmbh_cokg", label: "GmbH & Co KG" },
] as const;

/* Bundesländer (Österreich) */
export const BUNDESLAND_OPTIONS = [
  { value: "all", label: "Alle Bundesländer" },
  { value: "Wien", label: "Wien" },
  { value: "Niederösterreich", label: "Niederösterreich" },
  { value: "Oberösterreich", label: "Oberösterreich" },
  { value: "Steiermark", label: "Steiermark" },
  { value: "Salzburg", label: "Salzburg" },
  { value: "Tirol", label: "Tirol" },
  { value: "Kärnten", label: "Kärnten" },
  { value: "Vorarlberg", label: "Vorarlberg" },
  { value: "Burgenland", label: "Burgenland" },
] as const;

/* Bundesländer (Deutschland) */
export const BUNDESLAENDER_DE = [
  { value: "all", label: "Alle Bundesländer" },
  { value: "Bayern", label: "Bayern" },
  { value: "Nordrhein-Westfalen", label: "Nordrhein-Westfalen" },
  { value: "Baden-Württemberg", label: "Baden-Württemberg" },
  { value: "Berlin", label: "Berlin" },
  { value: "Hamburg", label: "Hamburg" },
  { value: "Hessen", label: "Hessen" },
  { value: "Niedersachsen", label: "Niedersachsen" },
  { value: "Rheinland-Pfalz", label: "Rheinland-Pfalz" },
  { value: "Sachsen", label: "Sachsen" },
  { value: "Thüringen", label: "Thüringen" },
  { value: "Brandenburg", label: "Brandenburg" },
  { value: "Sachsen-Anhalt", label: "Sachsen-Anhalt" },
  { value: "Schleswig-Holstein", label: "Schleswig-Holstein" },
  { value: "Mecklenburg-Vorpommern", label: "Mecklenburg-Vorpommern" },
  { value: "Saarland", label: "Saarland" },
  { value: "Bremen", label: "Bremen" },
] as const;

/* Kantone (Schweiz) — alle 26 */
export const KANTONE_CH = [
  { value: "all", label: "Alle Kantone" },
  { value: "Zürich", label: "Zürich" },
  { value: "Bern", label: "Bern" },
  { value: "Luzern", label: "Luzern" },
  { value: "Uri", label: "Uri" },
  { value: "Schwyz", label: "Schwyz" },
  { value: "Obwalden", label: "Obwalden" },
  { value: "Nidwalden", label: "Nidwalden" },
  { value: "Glarus", label: "Glarus" },
  { value: "Zug", label: "Zug" },
  { value: "Freiburg", label: "Freiburg" },
  { value: "Solothurn", label: "Solothurn" },
  { value: "Basel-Stadt", label: "Basel-Stadt" },
  { value: "Basel-Landschaft", label: "Basel-Landschaft" },
  { value: "Schaffhausen", label: "Schaffhausen" },
  { value: "Appenzell Ausserrhoden", label: "Appenzell Ausserrhoden" },
  { value: "Appenzell Innerrhoden", label: "Appenzell Innerrhoden" },
  { value: "St. Gallen", label: "St. Gallen" },
  { value: "Graubünden", label: "Graubünden" },
  { value: "Aargau", label: "Aargau" },
  { value: "Thurgau", label: "Thurgau" },
  { value: "Tessin", label: "Tessin" },
  { value: "Waadt", label: "Waadt" },
  { value: "Wallis", label: "Wallis" },
  { value: "Neuenburg", label: "Neuenburg" },
  { value: "Genf", label: "Genf" },
  { value: "Jura", label: "Jura" },
] as const;

/* DACH Länder */
export const DACH_COUNTRIES = [
  { value: "AT", label: "Österreich", flag: "🇦🇹" },
  { value: "DE", label: "Deutschland", flag: "🇩🇪" },
  { value: "CH", label: "Schweiz",     flag: "🇨🇭" },
] as const;

/** Regionen je nach Land */
export function getRegionOptions(country: string): readonly { value: string; label: string }[] {
  switch (country) {
    case "DE": return BUNDESLAENDER_DE;
    case "CH": return KANTONE_CH;
    default:   return BUNDESLAND_OPTIONS;
  }
}

/** Label für Region-Dropdown je nach Land */
export function getRegionLabel(country: string): string {
  switch (country) {
    case "DE": return "Bundesland";
    case "CH": return "Kanton";
    default:   return "Bundesland";
  }
}

export type CompanyTypeFilter = (typeof COMPANY_TYPE_OPTIONS)[number]["value"];

/* Suchanfrage-Typ */
export interface SearchQuery {
  query: string;
  location: string;
  country?: string;
  radius_km?: number;
  company_types?: CompanyTypeFilter[];
}
