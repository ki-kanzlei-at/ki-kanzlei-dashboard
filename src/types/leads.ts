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
  /** Filter auf alle Leads aus einem konkreten Suchauftrag */
  search_job_id?: string;
  /** Präsenz-Filter: nur Leads mit bestimmten Feldern */
  has_ceo?: boolean;
  has_email?: boolean;
  has_phone?: boolean;
  has_website?: boolean;
  /** Lead hat mindestens ein Social-Media-Profil (LinkedIn/Facebook/Instagram/X/YouTube/TikTok) */
  has_social?: boolean;
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
  industry: string | null;

  /* Firmendaten */
  legal_form: string | null;

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

  /* Social Media (für B2B-Outreach in DACH) */
  social_linkedin: string | null;
  social_facebook: string | null;
  social_instagram: string | null;
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
  | "industry" | "legal_form"
  | "ceo_name" | "ceo_title" | "ceo_first_name" | "ceo_last_name" | "ceo_gender" | "ceo_source"
  | "status" | "notes" | "raw_data"
  | "social_linkedin" | "social_facebook" | "social_instagram"
  | "social_twitter" | "social_youtube" | "social_tiktok"
>>;

/* Normalisierte Branchenliste — konsolidiert auf ~55 brauchbare Kategorien.
 * Frühere Sub-Branchen (10 Fachärzte, 14 Handwerks-Subs etc.) sind zusammengefasst.
 * AI-Output und UI-Filter nutzen diese Liste exklusiv. */
export const INDUSTRY_OPTIONS = [
  /* ── Recht & Steuern ── */
  { value: "Rechtsanwalt",          label: "Rechtsanwalt" },
  { value: "Notar",                 label: "Notar" },
  { value: "Steuerberater",         label: "Steuerberater" },
  { value: "Wirtschaftsprüfer",     label: "Wirtschaftsprüfer" },
  { value: "Buchhaltung",           label: "Buchhaltung" },

  /* ── Gesundheit & Praxis ── */
  { value: "Arzt",                  label: "Arzt (Allgemein)" },
  { value: "Facharzt",              label: "Facharzt" },
  { value: "Zahnarzt",              label: "Zahnarzt" },
  { value: "Tierarzt",              label: "Tierarzt" },
  { value: "Apotheke",              label: "Apotheke" },
  { value: "Physiotherapie",        label: "Physiotherapie" },
  { value: "Psychotherapie",        label: "Psychotherapie" },
  { value: "Heilpraktiker",         label: "Heilpraktiker" },

  /* ── Klinik & Pflege ── */
  { value: "Krankenhaus",           label: "Krankenhaus" },
  { value: "Pflegeheim",            label: "Pflegeheim" },
  { value: "Pflegedienst",          label: "Pflegedienst" },
  { value: "Medizintechnik",        label: "Medizintechnik" },
  { value: "Optiker",               label: "Optiker" },

  /* ── Immobilien ── */
  { value: "Immobilienmakler",      label: "Immobilienmakler" },
  { value: "Hausverwaltung",        label: "Hausverwaltung" },
  { value: "Bauträger",             label: "Bauträger" },

  /* ── Planung & Bau ── */
  { value: "Architekt",             label: "Architekt" },
  { value: "Ingenieurbüro",         label: "Ingenieurbüro" },
  { value: "Gutachter",             label: "Gutachter" },
  { value: "Bauunternehmen",        label: "Bauunternehmen" },

  /* ── Handwerk ── */
  { value: "Handwerksbetrieb",      label: "Handwerksbetrieb" },
  { value: "Elektrotechnik",        label: "Elektrotechnik" },
  { value: "Sanitär",               label: "Sanitär" },
  { value: "Heizung",               label: "Heizung" },
  { value: "Klimatechnik",          label: "Klimatechnik" },
  { value: "Installateur",          label: "Installateur" },
  { value: "Schreinerei",           label: "Schreinerei / Tischlerei" },
  { value: "Schlosserei",           label: "Schlosserei / Metallbau" },
  { value: "Dachdeckerei",          label: "Dachdeckerei / Zimmerei" },
  { value: "Malerbetrieb",          label: "Malerbetrieb" },
  { value: "Bodenleger",            label: "Bodenleger / Fliesenleger" },
  { value: "Glaserei",              label: "Glaserei" },

  /* ── Auto & Verkehr ── */
  { value: "KFZ-Werkstatt",         label: "KFZ-Werkstatt" },
  { value: "Autohaus",              label: "Autohaus / Autohandel" },
  { value: "Tankstelle",            label: "Tankstelle" },

  /* ── Logistik ── */
  { value: "Spedition",             label: "Spedition / Logistik" },
  { value: "Kurierdienst",          label: "Kurierdienst" },
  { value: "Umzugsunternehmen",     label: "Umzugsunternehmen" },

  /* ── Hospitality & Gastronomie ── */
  { value: "Hotel",                 label: "Hotel" },
  { value: "Pension",               label: "Pension" },
  { value: "Campingplatz",          label: "Campingplatz" },
  { value: "Ferienhaus",            label: "Ferienhaus / Ferienwohnung" },
  { value: "Tourismus",             label: "Tourismus" },
  { value: "Reisebüro",             label: "Reisebüro" },
  { value: "Restaurant",            label: "Restaurant" },
  { value: "Café",                  label: "Café" },
  { value: "Catering",              label: "Catering" },
  { value: "Bäckerei",              label: "Bäckerei" },
  { value: "Metzgerei",             label: "Metzgerei" },
  { value: "Weingut",               label: "Weingut / Brauerei" },

  /* ── Handel ── */
  { value: "Einzelhandel",          label: "Einzelhandel" },
  { value: "Großhandel",            label: "Großhandel" },
  { value: "E-Commerce",            label: "E-Commerce" },
  { value: "Modegeschäft",          label: "Modegeschäft" },
  { value: "Supermarkt",            label: "Supermarkt" },
  { value: "Juwelier",              label: "Juwelier" },
  { value: "Buchhandlung",          label: "Buchhandlung" },
  { value: "Vertrieb",              label: "Vertrieb / Import-Export" },

  /* ── IT & Digital ── */
  { value: "IT-Dienstleister",      label: "IT-Dienstleister" },
  { value: "Softwareentwicklung",   label: "Softwareentwicklung" },
  { value: "Hosting",               label: "Hosting / Rechenzentrum" },
  { value: "Telekommunikation",     label: "Telekommunikation" },

  /* ── Marketing & Medien ── */
  { value: "Werbeagentur",          label: "Werbeagentur" },
  { value: "Marketingagentur",      label: "Marketingagentur" },
  { value: "Webagentur",            label: "Webagentur / Webdesign" },
  { value: "PR-Agentur",            label: "PR-Agentur" },
  { value: "Grafikdesign",          label: "Grafikdesign" },
  { value: "Druckerei",             label: "Druckerei" },
  { value: "Werbetechnik",          label: "Werbetechnik" },
  { value: "Fotograf",              label: "Fotograf" },
  { value: "Videoproduktion",       label: "Videoproduktion / Tonstudio" },
  { value: "Medien",                label: "Medien / Verlag" },

  /* ── Beratung & Personal ── */
  { value: "Unternehmensberatung",  label: "Unternehmensberatung" },
  { value: "Wirtschaftsberatung",   label: "Wirtschaftsberatung" },
  { value: "Coaching",              label: "Coaching" },
  { value: "Personalvermittlung",   label: "Personalvermittlung" },
  { value: "Personalberatung",      label: "Personalberatung" },

  /* ── Finanzen ── */
  { value: "Bank",                  label: "Bank" },
  { value: "Versicherung",          label: "Versicherung" },
  { value: "Versicherungsmakler",   label: "Versicherungsmakler" },
  { value: "Finanzberater",         label: "Finanzberater" },
  { value: "Vermögensverwaltung",   label: "Vermögensverwaltung" },
  { value: "Leasing",               label: "Leasing / Inkasso" },

  /* ── Beauty & Wellness ── */
  { value: "Friseur",               label: "Friseur" },
  { value: "Kosmetikstudio",        label: "Kosmetikstudio" },
  { value: "Wellnesscenter",        label: "Wellness / Spa" },
  { value: "Nagelstudio",           label: "Nagelstudio" },
  { value: "Tattoo-Studio",         label: "Tattoo-Studio" },

  /* ── Sport ── */
  { value: "Fitnessstudio",         label: "Fitnessstudio" },
  { value: "Sportverein",           label: "Sportverein" },
  { value: "Tanzschule",            label: "Tanzschule" },

  /* ── Bildung ── */
  { value: "Fahrschule",            label: "Fahrschule" },
  { value: "Sprachschule",          label: "Sprachschule / Nachhilfe" },
  { value: "Musikschule",           label: "Musikschule" },
  { value: "Kindergarten",          label: "Kindergarten" },

  /* ── Service ── */
  { value: "Reinigungsfirma",       label: "Reinigungsfirma" },
  { value: "Facility Management",   label: "Facility Management" },
  { value: "Sicherheitsdienst",     label: "Sicherheitsdienst" },
  { value: "Eventmanagement",       label: "Eventmanagement" },
  { value: "Bestattung",            label: "Bestattung" },

  /* ── Garten & Landwirtschaft ── */
  { value: "Gartenbau",             label: "Gartenbau / Landschaftspflege" },
  { value: "Floristik",             label: "Floristik" },
  { value: "Landwirtschaft",        label: "Landwirtschaft" },

  /* ── Energie & Umwelt ── */
  { value: "Energieversorger",      label: "Energieversorger" },
  { value: "Photovoltaik",          label: "Photovoltaik / Wärmepumpe" },
  { value: "Energieberatung",       label: "Energieberatung" },
  { value: "Recycling",             label: "Recycling / Abfallentsorgung" },

  /* ── Fallback ── */
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
  /** Optionale Stadt-Eingrenzung zusätzlich zu location. */
  city: string | null;
  /** Rechtsform-Filter (gmbh, ag, …) oder null für alle. */
  company_type: string | null;
  /** Pipeline-Skip-Flag: nur Leads mit Entscheider behalten. */
  require_ceo: boolean;
  /** Pipeline-Skip-Flag: nur Leads mit gültiger E-Mail behalten. */
  require_email: boolean;
  /** Pipeline-Skip-Flag: nur Leads mit Website behalten. */
  require_website: boolean;
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

export type SearchJobInsert = Omit<SearchJob, "id" | "created_at" | "updated_at" | "started_at" | "completed_at" | "results_count" | "total_count" | "estimated_end_at" | "error_message" | "status" | "city" | "company_type" | "require_ceo" | "require_email" | "require_website"> & {
  id?: string;
  status?: SearchJobStatus;
  radius_km?: number;
  city?: string | null;
  company_type?: string | null;
  require_ceo?: boolean;
  require_email?: boolean;
  require_website?: boolean;
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

/* Rechtsform-Filter — offizielle Rechtsformen für AT, DE, CH (DACH) */
export const COMPANY_TYPE_OPTIONS = [
  { value: "all",        label: "Alle Rechtsformen" },
  /* AT + DE + CH gemeinsam */
  { value: "gmbh",       label: "GmbH" },
  { value: "ag",         label: "AG" },
  { value: "kg",         label: "KG" },
  { value: "gmbh_cokg",  label: "GmbH & Co KG" },
  { value: "eu",         label: "Einzelunternehmen (e.U.)" },
  { value: "se",         label: "SE — Societas Europaea" },
  { value: "genossenschaft", label: "Genossenschaft" },
  { value: "stiftung",   label: "Stiftung" },
  /* AT-spezifisch */
  { value: "og",         label: "OG (Offene Gesellschaft)" },
  { value: "flexco",     label: "FlexCo (Flexible Kapitalgesellschaft)" },
  /* DE-spezifisch */
  { value: "ug",         label: "UG (haftungsbeschränkt)" },
  { value: "ohg",        label: "OHG (Offene Handelsgesellschaft)" },
  { value: "gbr",        label: "GbR (Gesellschaft bürgerlichen Rechts)" },
  { value: "kgaa",       label: "KGaA" },
  { value: "partg",      label: "PartG (Partnerschaftsgesellschaft)" },
  { value: "partgmbb",   label: "PartG mbB" },
  { value: "ev",         label: "e.V. (eingetragener Verein)" },
  /* CH-spezifisch */
  { value: "klg",        label: "KlG (Kollektivgesellschaft)" },
  { value: "kmg",        label: "KmG (Kommanditgesellschaft, CH)" },
  { value: "kmag",       label: "KmAG (Kommandit-AG)" },
  { value: "verein",     label: "Verein" },
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
