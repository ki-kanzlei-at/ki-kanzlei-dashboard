/* Shared types for the 5-step campaign creation wizard. */

export type WizardStep = 0 | 1 | 2 | 3 | 4 | 5; // 0..4 = steps, 5 = review

export type Tone = "formal" | "professional" | "casual";

export type EmailProvider = "google" | "microsoft_graph" | "smtp";

export interface MailboxOption {
  id: string;
  provider: EmailProvider;
  sender_email: string;
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
  systemPrompt: string;
  steps: SequenceStep[];
  delays: SequenceDelay[];
  autoStopOnReply: boolean;
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
