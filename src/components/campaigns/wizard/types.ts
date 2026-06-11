/* Shared types for the 4-step campaign creation wizard. */

import { MAX_SEQUENCE_STEPS } from "@/types/campaigns";

export type WizardStep = 0 | 1 | 2 | 3 | 4; // 0..3 = steps, 4 = review

export type EmailProvider = "google" | "google_oauth" | "microsoft_graph" | "microsoft_oauth" | "smtp";

export interface MailboxOption {
  id: string;
  provider: EmailProvider;
  sender_email: string;
  sender_name: string | null;
  reply_to: string | null;
  label: string | null;
  is_active: boolean;
  warmup_enabled: boolean;
  warmup_day: number;
  warmup_start: number;
  warmup_increment: number;
  daily_limit: number;
  sent_today: number;
  health_status: "good" | "warning" | "bad" | string;
}

export interface MailboxState {
  /** Mehrfachauswahl — bei mehr als einer Mailbox rotiert der Versand automatisch. */
  mailboxIds: string[];
  /** Anzeige-E-Mails der gewählten Konten (gleiche Reihenfolge wie mailboxIds). */
  emails: string[];
  /** Absender-Name des zuerst gewählten Kontos (Anzeige im Review). */
  senderName: string;
}

export interface BasicsState {
  name: string;
  language: string;
}

export interface AudienceState {
  selectedLeadIds: Set<string>;
}

export interface SequenceStep {
  id: string;
  intent: string;
  desc: string;
}

export interface SequenceDelay {
  value: number;
  unit: "day";
}

export interface SequenceState {
  /** Master-Prompt: einmal einstellen, die KI schreibt jede Mail daraus. */
  systemPrompt: string;
  /** Gesamtzahl Mails inkl. Erstkontakt (1..MAX_SEQUENCE_STEPS). */
  mailCount: number;
  /** Tage Wartezeit vor jeder Folge-Mail (Länge = mailCount-1). */
  delayDays: number[];
  autoStopOnReply: boolean;
}

/** Leitet die (für den Versand nötigen) Sequenz-Steps automatisch aus der
 *  Mail-Anzahl ab — der/die User konfiguriert keine Intents/Beschreibungen mehr. */
export function buildAutoSteps(count: number): SequenceStep[] {
  const n = Math.max(1, Math.min(MAX_SEQUENCE_STEPS, count));
  return Array.from({ length: n }, (_, i) => {
    const isFirst = i === 0;
    const isLast = i === n - 1 && n > 1;
    const intent = isFirst ? "Erstkontakt" : isLast ? "Letzter Versuch" : "Follow-up";
    const desc = isFirst
      ? "Kurzer Pitch mit konkretem Bezug auf den Empfänger"
      : isLast
        ? "Freundliche letzte Nachfrage, ob es grundsätzlich passt"
        : "Kurze Erinnerung mit einem neuen, konkreten Mehrwert";
    return { id: `s${i + 1}`, intent, desc };
  });
}

/* ── Firmenprofil (brand_settings) → vorausgefülltes KI-Briefing ── */

export interface BrandInfo {
  companyName: string | null;
  offering: string | null;
  valueProp: string | null;
  targetCustomer: string | null;
}

/**
 * Baut das Standard-Briefing aus dem Firmenprofil der Einstellungen.
 * Mit gepflegtem Profil entsteht ein sofort nutzbarer, echter Prompt —
 * ohne Profil ein Gerüst mit klar markierten Lücken.
 */
export function buildDefaultPrompt(brand: BrandInfo): string {
  const company  = brand.companyName?.trim();
  const offering = brand.offering?.trim();
  const value    = brand.valueProp?.trim();
  const target   = brand.targetCustomer?.trim();

  const intro: string[] = [];
  if (company && offering) intro.push(`Wir sind ${company}. ${offering}`);
  else if (company)        intro.push(`Wir sind ${company}.`);
  else if (offering)       intro.push(offering);
  else                     intro.push("Wir sind [Firmenname] und bieten [kurz beschreiben, was ihr macht].");

  if (value)  intro.push(`Unser Nutzen für Kund:innen: ${value}`);
  if (target) intro.push(`Wir richten uns an: ${target}`);
  if (!value && !target) {
    intro.push("Unser Nutzen für Kund:innen: [konkreter Mehrwert, z. B. Zeitersparnis, Ergebnis].");
  }

  const rules =
    "Schreibe kurz und auf Augenhöhe, ohne Marketing-Floskeln und Superlative. " +
    "Beziehe dich konkret auf das Unternehmen der Empfänger:in (Branche, Standort). " +
    "Verwende die Sie-Form. Ziel: ein kurzes Erstgespräch (15 Minuten) vereinbaren.";

  return `${intro.join("\n\n")}\n\n${rules}`;
}

export interface ScheduleState {
  days: boolean[]; // length 7, Mo..So
  timeFrom: string;
  timeTo: string;
  timezone: string;
  daily: number;
  gap: number; // seconds between sends
  trackOpens: boolean;
  trackClicks: boolean;
  trackReplies: boolean;
}

export interface WizardState {
  mailbox: MailboxState;
  basics: BasicsState;
  audience: AudienceState;
  sequence: SequenceState;
  schedule: ScheduleState;
}

export const STEPS = [
  { key: "mailbox",  name: "Mailbox",   sub: "Absender & Rotation" },
  { key: "audience", name: "Empfänger", sub: "Leads auswählen" },
  { key: "sequence", name: "Briefing",  sub: "Name & Inhalt" },
  { key: "schedule", name: "Zeitplan",  sub: "Sendefenster & Limit" },
] as const;
