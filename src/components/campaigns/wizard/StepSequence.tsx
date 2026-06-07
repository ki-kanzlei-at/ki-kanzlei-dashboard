"use client";

import { Brain, Plus, Trash2, Clock, Sparkles, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SequenceState, SequenceStep } from "./types";

interface StepSequenceProps {
  state: SequenceState;
  onChange: (next: SequenceState) => void;
}

const PROMPT_TEMPLATES: { label: string; value: string }[] = [
  {
    label: "Kanzlei-Outreach (Standard)",
    value:
`Wir sind eine KI-Boutique aus Wien, die für Kanzleien (Steuerberater & Rechtsanwälte) Mandatsvorbereitungen automatisiert.

Unsere Software liest eingehende Dokumente (PDF, Mail, Scan), strukturiert sie, schlägt erste Bearbeitungsschritte vor und reduziert die Vorbereitungszeit pro Mandat um ~60 %.

Schreibe die Mail auf Augenhöhe — nicht aufdringlich, nicht generisch, ohne Marketing-Floskeln. Beziehe dich konkret auf die Kanzlei (Größe, Standort, Spezialgebiet, ggf. Online-Sichtbarkeit). Schreibe so kurz wie möglich. Frag am Ende um 15 Min. für eine kurze Demo.

Verwende „Sie" statt „Du" (formal). Vermeide Buzzwords wie „revolutionär", „bahnbrechend", „transformiert".`,
  },
];

export function StepSequence({ state, onChange }: StepSequenceProps) {
  function updateStep(idx: number, key: keyof SequenceStep, val: string) {
    const steps = [...state.steps];
    steps[idx] = { ...steps[idx], [key]: val };
    onChange({ ...state, steps });
  }
  function removeStep(idx: number) {
    if (state.steps.length <= 1) return;
    const steps = state.steps.filter((_, i) => i !== idx);
    const delays = state.delays.filter((_, i) => i !== Math.max(0, idx - 1));
    onChange({ ...state, steps, delays });
  }
  function addStep() {
    onChange({
      ...state,
      steps: [
        ...state.steps,
        { id: `s${state.steps.length + 1}-${Date.now()}`, intent: "Follow-up", desc: "Erinnerung an vorherige Mail, kurzer neuer Aspekt" },
      ],
      delays: [...state.delays, { value: 4, unit: "day" }],
    });
  }
  function updateDelay(idx: number, value: number) {
    const delays = [...state.delays];
    delays[idx] = { ...delays[idx], value };
    onChange({ ...state, delays });
  }
  function loadTemplate(text: string) {
    onChange({ ...state, systemPrompt: text });
  }

  return (
    <>
      <div className="step-head">
        <div className="step-eyebrow">
          <Brain className="h-3 w-3" strokeWidth={1.75} />
          Schritt 4 von 5
        </div>
        <h1 className="step-heading">Was soll die KI schreiben?</h1>
        <p className="step-desc">
          Keine Templates, keine Platzhalter. Beschreibe deine Kampagne in natürlicher Sprache —
          die KI schreibt jede Mail individuell, basierend auf dem Empfänger.
        </p>
      </div>

      {/* System Prompt */}
      <div className="wiz-section">
        <div className="wiz-section-head">
          <div className="left">
            <h3>
              <Brain className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
              Kampagnen-Anweisung
            </h3>
            <p>Wer du bist, was du anbietest, wie geschrieben werden soll.</p>
          </div>
          <Badge variant="secondary" className="font-normal text-[11px]">
            {state.systemPrompt.length} Zeichen
          </Badge>
        </div>
        <textarea
          className="prompt-area"
          value={state.systemPrompt}
          onChange={(e) => onChange({ ...state, systemPrompt: e.target.value })}
          placeholder="Beschreibe deine Kampagne — wer du bist, was du anbietest, welche Tonalität …"
          rows={11}
        />
        <div className="prompt-foot">
          {PROMPT_TEMPLATES.map((t) => (
            <Button
              key={t.label}
              variant="ghost"
              size="sm"
              className="h-7 text-[12px] gap-1.5"
              onClick={() => loadTemplate(t.value)}
            >
              <FileText className="h-3 w-3" strokeWidth={1.75} />
              {t.label}
            </Button>
          ))}
          <span className="ml-auto text-[11.5px] text-muted-foreground">
            Empfohlen: 200–600 Zeichen
          </span>
        </div>
      </div>

      {/* Sequence */}
      <div className="wiz-section">
        <div className="wiz-section-head">
          <div className="left">
            <h3>Mail-Abfolge</h3>
            <p>
              {state.steps.length} {state.steps.length === 1 ? "Mail" : "Mails"} — die KI schreibt jede einzeln,
              basierend auf der Anweisung oben.
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={addStep}>
            <Plus className="h-3 w-3" strokeWidth={1.75} />
            Mail hinzufügen
          </Button>
        </div>
        <div className="wiz-section-body">
          <div className="sequence-clean">
            {state.steps.map((step, idx) => (
              <div key={step.id}>
                <div className="seq-clean-row">
                  <div className="seq-clean-num">{idx + 1}</div>
                  <div className="seq-clean-card">
                    <div className="seq-clean-head">
                      <input
                        type="text"
                        className="seq-clean-intent"
                        value={step.intent}
                        onChange={(e) => updateStep(idx, "intent", e.target.value)}
                        placeholder="z. B. Erstkontakt"
                      />
                      {state.steps.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeStep(idx)}
                          title="Mail entfernen"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </Button>
                      )}
                    </div>
                    <input
                      type="text"
                      className="seq-clean-desc"
                      value={step.desc}
                      onChange={(e) => updateStep(idx, "desc", e.target.value)}
                      placeholder="Was soll diese Mail erreichen?"
                    />
                  </div>
                </div>

                {idx < state.steps.length - 1 && (
                  <div className="seq-clean-delay">
                    <div className="seq-clean-num is-delay">
                      <Clock className="h-3 w-3" strokeWidth={1.75} />
                    </div>
                    <div className="seq-clean-delay-input">
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={state.delays[idx]?.value ?? 3}
                        onChange={(e) => updateDelay(idx, Number(e.target.value) || 1)}
                      />
                      <span>Tage warten</span>
                      <span className="ml-1.5 text-muted-foreground font-normal">
                        · nur wenn keine Antwort
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Auto-stop info */}
      <div className="wiz-callout">
        <Sparkles className="ico h-4 w-4" strokeWidth={1.75} />
        <div>
          <div className="t">Antworten stoppen die Sequenz automatisch</div>
          <div className="b">
            Sobald ein:e Empfänger:in antwortet, wird die Sequenz gestoppt und die Antwort landet
            direkt in deiner Inbox. Du musst nichts manuell pausieren.
          </div>
        </div>
      </div>
    </>
  );
}
