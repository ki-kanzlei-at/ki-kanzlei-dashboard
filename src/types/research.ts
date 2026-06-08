/* ── AI Researcher Typen ── */

import type { LeadStatus } from "./leads";

/** Quellen-Art für die farbcodierten Quellen-Badges. */
export type SourceKind =
  | "website"
  | "firmenbuch"
  | "wko"
  | "linkedin"
  | "google"
  | "news";

export interface ResearchSource {
  n: number;
  kind: SourceKind;
  title: string;
  sub?: string;
  url?: string;
}

/** Strukturierte Blöcke einer KI-Antwort. */
export type ResearchBlock =
  | { type: "p"; text: string }
  | { type: "h"; text: string }
  | { type: "ul"; items: string[] };

export type ResearchRole = "user" | "ai" | "system";

export interface SavedCardItem {
  icon: string;
  label: string;
  detail: string;
}

export interface SavedCard {
  company: string;
  when: string;
  items: SavedCardItem[];
  /** Lead-ID für den Deep-Link „Im Lead öffnen" (öffnet die Lead-Sidebar). */
  leadId?: string;
}

/** LinkedIn-Profil-Treffer, der als Nachricht im Chat gespeichert wird. */
export interface ResearchPerson {
  id: string;
  name: string;
  headline?: string | null;
  location?: string | null;
  profile_url?: string | null;
  public_profile_url?: string | null;
  profile_picture_url?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  public_identifier?: string | null;
  provider_id?: string | null;
}

export interface ResearchMessage {
  id: string;
  role: ResearchRole;
  /** User-Frage oder Roh-Text */
  text?: string | null;
  /** AI-Antwort als strukturierte Blöcke */
  blocks?: ResearchBlock[] | null;
  /** System-„In Leads gespeichert"-Karte */
  card?: SavedCard | null;
  /** LinkedIn-Profilkarte (persistierte Personensuche) */
  person?: ResearchPerson | null;
  created_at: string;
}

/** Strukturierte Lead-Felder aus der Recherche — werden beim Speichern in echte Lead-Spalten gemappt. */
export interface LeadFields {
  email?: string | null;
  phone?: string | null;
  ceo_name?: string | null;
  ceo_title?: string | null;
  legal_form?: string | null;
  street?: string | null;
  postal_code?: string | null;
  social_linkedin?: string | null;
  social_facebook?: string | null;
  social_instagram?: string | null;
  // Zusätzliche Recherche-Erkenntnisse für eine strukturierte Lead-Notiz
  summary?: string | null;        // 1–2 Sätze, was die Firma macht
  employees?: string | null;      // Mitarbeiterzahl / Größenklasse
  revenue?: string | null;        // Umsatz (falls öffentlich)
  founded_year?: string | null;   // Gründungsjahr
  pain_points?: string | null;    // mögliche Pain Points
  our_solution?: string | null;   // was wir anbieten könnten
}

export type ResearchMethod = "target" | "crm" | "url";

export interface ResearchSession {
  id: string;
  method: ResearchMethod;
  lead_id: string | null;
  company: string;
  website: string | null;
  industry: string | null;
  city: string | null;
  state: string | null;
  country: string;
  score: number | null;
  status: LeadStatus | null;
  facts: string | null;
  lead_fields: LeadFields;
  sources: ResearchSource[];
  suggestions: string[];
  saved_lead_id: string | null;
  saved_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Session inkl. Verlauf (für die Detail-Ansicht). */
export interface ResearchSessionWithMessages extends ResearchSession {
  messages: ResearchMessage[];
}

/** Ein per Discovery gefundenes Unternehmen (Modal „Zielgruppe"). */
export interface DiscoveryCandidate {
  company: string;
  website: string | null;
  industry: string | null;
  city: string | null;
  state: string | null;
  country: string;
}
