"use client";

import { Button } from "@/components/ui/button";
import type { WizardState } from "./types";

interface StepReviewProps {
  state: WizardState;
  onJump: (idx: number) => void;
}

const LANGUAGE_LABEL: Record<string, string> = {
  "de-AT": "Deutsch (Österreich)",
  "de-DE": "Deutsch (Deutschland)",
  "de-CH": "Deutsch (Schweiz)",
  "en":    "Englisch",
};

const DAY_LABEL = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function StepReview({ state, onJump }: StepReviewProps) {
  const audienceCount = state.audience.selectedLeadIds.size;
  const mailboxCount = state.mailbox.mailboxIds.length;
  const dayString = state.schedule.days
    .map((on, i) => on ? DAY_LABEL[i] : null)
    .filter(Boolean)
    .join(", ") || "—";
  const followUps = Math.max(0, state.sequence.mailCount - 1);

  const rows: { k: string; v: string; sub?: string; jump: number }[] = [
    {
      k: mailboxCount > 1 ? "Mailboxen" : "Mailbox",
      v: state.mailbox.emails.join(", ") || "Nicht ausgewählt",
      sub: mailboxCount > 1
        ? `Automatische Rotation über ${mailboxCount} Konten`
        : undefined,
      jump: 0,
    },
    {
      k: "Empfänger",
      v: `${audienceCount.toLocaleString("de-DE")} Leads`,
      sub: "Bereits kontaktierte automatisch ausgenommen",
      jump: 1,
    },
    {
      k: "Kampagne",
      v: state.basics.name || "—",
      sub: LANGUAGE_LABEL[state.basics.language] ?? state.basics.language,
      jump: 2,
    },
    {
      k: "Briefing",
      v: `${state.sequence.mailCount} ${state.sequence.mailCount === 1 ? "Mail" : "Mails"}`,
      sub: followUps > 0
        ? `Erstkontakt + ${followUps} Follow-up${followUps > 1 ? "s" : ""} · stoppt bei Antwort`
        : "Nur Erstkontakt",
      jump: 2,
    },
    {
      k: "Sendefenster",
      v: `${dayString} · ${state.schedule.timeFrom} – ${state.schedule.timeTo}`,
      sub: `Max. ${state.schedule.daily} E-Mails / Tag`,
      jump: 3,
    },
  ];

  return (
    <>
      <div className="step-head">
        <div className="step-eyebrow">Prüfen &amp; starten</div>
        <h1 className="step-heading">Alles bereit</h1>
        <p className="step-desc">
          Kurz prüfen — danach startet der Versand im nächsten offenen Sendefenster.
        </p>
      </div>
      <div className="review-card">
        {rows.map((r, i) => (
          <div key={i} className="review-row">
            <span className="key">{r.k}</span>
            <span className="val">
              {r.v}
              {r.sub && <span className="sub">{r.sub}</span>}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-primary hover:text-primary"
              onClick={() => onJump(r.jump)}
            >
              Bearbeiten
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}
