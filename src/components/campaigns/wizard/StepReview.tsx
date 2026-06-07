"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WizardState } from "./types";

interface StepReviewProps {
  state: WizardState;
  onJump: (idx: number) => void;
}

const PROVIDER_LABEL: Record<string, string> = {
  google: "Google Workspace",
  microsoft_graph: "Microsoft 365",
  smtp: "SMTP",
};

const TONE_LABEL: Record<string, string> = {
  formal: "Formal",
  professional: "Professionell",
  casual: "Locker",
};

const DAY_LABEL = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function StepReview({ state, onJump }: StepReviewProps) {
  const audienceCount = state.audience.selectedLeadIds.size;
  const dayString = state.schedule.days
    .map((on, i) => on ? DAY_LABEL[i] : null)
    .filter(Boolean)
    .join(", ") || "—";

  const rows: { k: string; v: string; sub?: string; jump: number }[] = [
    {
      k: "Mailbox",
      v: state.mailbox.email || "Nicht ausgewählt",
      sub: state.mailbox.provider ? PROVIDER_LABEL[state.mailbox.provider] : undefined,
      jump: 0,
    },
    {
      k: "Kampagnenname",
      v: state.basics.name || "—",
      sub: `${TONE_LABEL[state.basics.tone] ?? state.basics.tone} · ${state.basics.language}`,
      jump: 1,
    },
    {
      k: "Absender:in",
      v: state.basics.senderName || "—",
      sub: state.basics.senderEmail || state.mailbox.email,
      jump: 1,
    },
    {
      k: "Zielgruppe",
      v: `${audienceCount.toLocaleString("de-DE")} Empfänger:innen`,
      sub: state.audience.excludeContacted ? "Bereits kontaktierte ausgeblendet" : "Alle Leads",
      jump: 2,
    },
    {
      k: "KI-Anweisung",
      v: `${state.sequence.systemPrompt.length} Zeichen Prompt`,
      sub: `${state.sequence.steps.length} ${state.sequence.steps.length === 1 ? "Mail" : "Mails"} autonom geschrieben`,
      jump: 3,
    },
    {
      k: "Sendefenster",
      v: `${dayString} · ${state.schedule.timeFrom} – ${state.schedule.timeTo}`,
      sub: state.schedule.timezone,
      jump: 4,
    },
    {
      k: "Tägl. Limit",
      v: `${state.schedule.daily} E-Mails / Tag`,
      sub: `Abstand: ${state.schedule.gap} Sek. (random ± 20 %)`,
      jump: 4,
    },
  ];

  return (
    <>
      <div className="step-head">
        <div className="step-eyebrow">
          <Check className="h-3 w-3" strokeWidth={2.25} />
          Letzte Prüfung
        </div>
        <h1 className="step-heading">Alles bereit zum Start</h1>
        <p className="step-desc">
          Überprüfe die Einstellungen. Klicke &bdquo;Bearbeiten&ldquo; zu jedem Punkt, um zurückzuspringen.
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
