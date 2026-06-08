/* Shared types for the 5-step campaign creation wizard. */

export type WizardStep = 0 | 1 | 2 | 3 | 4 | 5; // 0..4 = steps, 5 = review

export type Tone = "formal" | "professional" | "casual";

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
  mailboxId: string | null;
  email: string;
  provider: EmailProvider | null;
  senderName: string;
  replyTo: string;
}

export interface BasicsState {
  name: string;
  senderName: string;
  senderEmail: string;
  replyTo: string;
  language: string;
  tone: Tone;
}

export interface AudienceState {
  selectedLeadIds: Set<string>;
  excludeContacted: boolean;
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
  /** Gesamtzahl Mails inkl. Erstkontakt (1..5). */
  mailCount: number;
  /** Tage Wartezeit vor jeder Folge-Mail (Länge = mailCount-1). */
  delayDays: number[];
  autoStopOnReply: boolean;
}

/** Leitet die (für den Versand nötigen) Sequenz-Steps automatisch aus der
 *  Mail-Anzahl ab — der/die User konfiguriert keine Intents/Beschreibungen mehr. */
export function buildAutoSteps(count: number): SequenceStep[] {
  const n = Math.max(1, Math.min(5, count));
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
  { key: "mailbox",  name: "Mailbox wählen",     sub: "Absender für diese Kampagne" },
  { key: "basics",   name: "Kampagne",           sub: "Name, Tonalität, Sprache" },
  { key: "audience", name: "Zielgruppe",         sub: "Welche Leads kontaktieren" },
  { key: "sequence", name: "KI-Briefing",        sub: "Was die KI schreiben soll" },
  { key: "schedule", name: "Zeitplan & Start",   sub: "Sendefenster & Limits" },
] as const;
