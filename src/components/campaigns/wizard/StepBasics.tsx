"use client";

import { Sparkles, Globe } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { BasicsState, Tone } from "./types";

interface StepBasicsProps {
  state: BasicsState;
  onChange: (next: BasicsState) => void;
}

const TONES: { value: Tone; label: string }[] = [
  { value: "formal",       label: "Formal" },
  { value: "professional", label: "Professionell" },
  { value: "casual",       label: "Locker" },
];

const LANGUAGES = [
  { value: "de-AT", label: "Deutsch (Österreich)" },
  { value: "de-DE", label: "Deutsch (Deutschland)" },
  { value: "de-CH", label: "Deutsch (Schweiz)" },
  { value: "en",    label: "Englisch" },
];

export function StepBasics({ state, onChange }: StepBasicsProps) {
  return (
    <>
      <div className="step-head">
        <div className="step-eyebrow">
          <Sparkles className="h-3 w-3" strokeWidth={1.75} />
          Schritt 2 von 5
        </div>
        <h1 className="step-heading">Kampagnen-Basics</h1>
        <p className="step-desc">
          Gib der Kampagne einen klaren Namen und definiere Absender:in.
          Den Inhalt der Mails schreibt die KI später eigenständig.
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
            placeholder="z. B. Steuerberater AT – Frühjahr 2026"
            className="h-10"
            autoFocus
          />
        </div>

        <div className="wiz-fields-row">
          <div className="space-y-2">
            <Label htmlFor="sender-name" className="text-[12px] font-medium text-foreground">
              Absender-Name
            </Label>
            <Input
              id="sender-name"
              value={state.senderName}
              onChange={(e) => onChange({ ...state, senderName: e.target.value })}
              placeholder="z. B. Maria Bauer"
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sender-email" className="text-[12px] font-medium text-foreground">
              Absender-E-Mail
            </Label>
            <Input
              id="sender-email"
              value={state.senderEmail}
              readOnly
              disabled
              placeholder="Wird aus der gewählten Mailbox übernommen"
              className="h-10 bg-muted"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reply-to" className="text-[12px] font-medium text-foreground">
            Antwort-Adresse{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="reply-to"
            value={state.replyTo}
            onChange={(e) => onChange({ ...state, replyTo: e.target.value })}
            placeholder="Standard: gleiche Adresse wie Absender"
            className="h-10"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="language" className="text-[12px] font-medium text-foreground">
            Sprache
          </Label>
          <Select
            value={state.language}
            onValueChange={(v) => onChange({ ...state, language: v })}
          >
            <SelectTrigger id="language" className="h-10 w-full">
              <Globe className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-[12px] font-medium text-foreground">Tonalität</Label>
          <div className="tone-grid">
            {TONES.map((t) => (
              <button
                key={t.value}
                type="button"
                className={cn("tone-pill", state.tone === t.value && "is-on")}
                onClick={() => onChange({ ...state, tone: t.value })}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
