"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { BasicsState } from "./types";

interface StepBasicsProps {
  state: BasicsState;
  onChange: (next: BasicsState) => void;
  /** Firmenname aus den Einstellungen — für einen echten Namensvorschlag. */
  companyName: string | null;
}

const LANGUAGES = [
  { value: "de-AT", label: "Deutsch (AT)" },
  { value: "de-DE", label: "Deutsch (DE)" },
  { value: "de-CH", label: "Deutsch (CH)" },
  { value: "en",    label: "Englisch" },
];

const MONTHS = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export function StepBasics({ state, onChange, companyName }: StepBasicsProps) {
  const now = new Date();
  const namePlaceholder = `z. B. Neukunden ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <>
      <div className="step-head">
        <div className="step-eyebrow">Schritt 2 von 5</div>
        <h1 className="step-heading">Kampagne benennen</h1>
        <p className="step-desc">
          Der Name ist nur intern sichtbar. Absender und Antwort-Adresse kommen
          aus dem gewählten Postfach.
        </p>
      </div>

      <div className="wiz-fields">
        <div className="space-y-2">
          <Label htmlFor="campaign-name" className="text-[12px] font-medium text-foreground">
            Kampagnenname
          </Label>
          <Input
            id="campaign-name"
            value={state.name}
            onChange={(e) => onChange({ ...state, name: e.target.value })}
            placeholder={namePlaceholder}
            className="h-10"
            autoFocus
          />
          {companyName && (
            <p className="text-[11px] text-muted-foreground">
              Tipp: kurz und wiedererkennbar — z. B. nach Zielgruppe oder Zeitraum.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-[12px] font-medium text-foreground">Sprache der E-Mails</Label>
          <div className="pill-grid">
            {LANGUAGES.map((l) => (
              <button
                key={l.value}
                type="button"
                className={cn("pill-item", state.language === l.value && "is-on")}
                onClick={() => onChange({ ...state, language: l.value })}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-[12px] font-medium text-foreground">Absender</Label>
          <div className="rounded-[10px] border bg-muted/40 px-3.5 py-3 text-[13px]">
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="font-medium text-foreground">
                {state.senderName || <span className="font-normal text-muted-foreground">Kein Absender-Name hinterlegt</span>}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{state.senderEmail || "—"}</span>
            </div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">
              Antworten an: {state.replyTo || state.senderEmail || "gleiche Adresse wie Absender"}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
