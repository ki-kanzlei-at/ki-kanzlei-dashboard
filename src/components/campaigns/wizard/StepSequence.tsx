"use client";

import { useState } from "react";
import { Plus, Minus, Clock, Eye, FileText, Loader2, Reply } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SequenceState } from "./types";

interface PreviewContext {
  leadId: string | null;
  tone: string;
  language: string;
  senderName: string;
}

interface StepSequenceProps {
  state: SequenceState;
  onChange: (next: SequenceState) => void;
  preview: PreviewContext;
}

interface PreviewResult {
  subject: string;
  body: string;
  generator: string;
  lead?: { company: string | null; ceo_name: string | null; city: string | null; industry: string | null };
}

const PROMPT_TEMPLATES: { label: string; value: string }[] = [
  {
    label: "Kanzlei-Outreach (Standard)",
    value:
`Wir sind eine KI-Boutique aus Wien, die für Kanzleien (Steuerberater & Rechtsanwälte) Mandatsvorbereitungen automatisiert.

Unsere Software liest eingehende Dokumente (PDF, Mail, Scan), strukturiert sie, schlägt erste Bearbeitungsschritte vor und reduziert die Vorbereitungszeit pro Mandat um ~60 %.

Schreibe die Mail auf Augenhöhe, nicht aufdringlich, nicht generisch, ohne Marketing-Floskeln. Beziehe dich konkret auf die Kanzlei (Größe, Standort, Spezialgebiet, ggf. Online-Sichtbarkeit). Schreibe so kurz wie möglich. Frag am Ende um 15 Min. für eine kurze Demo.

Verwende „Sie" statt „Du" (formal). Vermeide Buzzwords wie „revolutionär", „bahnbrechend", „transformiert".`,
  },
];

export function StepSequence({ state, onChange, preview }: StepSequenceProps) {
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const canPreview = state.systemPrompt.trim().length >= 20;

  async function generatePreview() {
    if (!canPreview) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch("/api/campaigns/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_prompt: state.systemPrompt,
          tone: preview.tone,
          language: preview.language,
          sender_name: preview.senderName,
          lead_id: preview.leadId,
          intent: "Erstkontakt",
          desc: "Kurzer Pitch mit konkretem Bezug auf den Empfänger",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setPreviewError(json?.error || "Vorschau fehlgeschlagen"); return; }
      setPreviewResult(json.data as PreviewResult);
    } catch {
      setPreviewError("Netzwerkfehler bei der Vorschau");
    } finally {
      setPreviewLoading(false);
    }
  }

  function setMailCount(count: number) {
    const n = Math.max(1, Math.min(5, count));
    const delayDays = [...state.delayDays];
    while (delayDays.length < n - 1) delayDays.push(delayDays[delayDays.length - 1] ?? 4);
    onChange({ ...state, mailCount: n, delayDays: delayDays.slice(0, Math.max(0, n - 1)) });
  }
  function updateDelay(idx: number, value: number) {
    const delayDays = [...state.delayDays];
    delayDays[idx] = Math.max(1, Math.min(30, value || 1));
    onChange({ ...state, delayDays });
  }
  function loadTemplate(text: string) {
    onChange({ ...state, systemPrompt: text });
  }

  const followUps = Math.max(0, state.mailCount - 1);

  return (
    <>
      <div className="step-head">
        <div className="step-eyebrow">
          <FileText className="h-3 w-3" strokeWidth={1.75} />
          Schritt 4 von 5
        </div>
        <h1 className="step-heading">Was soll die KI schreiben?</h1>
        <p className="step-desc">
          Keine Templates, keine Platzhalter. Beschreibe deine Kampagne in natürlicher Sprache.
          Die KI schreibt jede Mail individuell, basierend auf dem Empfänger.
        </p>
      </div>

      {/* System Prompt */}
      <div className="wiz-section">
        <div className="wiz-section-head">
          <div className="left">
            <h3>
              <FileText className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
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
          placeholder="Beschreibe deine Kampagne: wer du bist, was du anbietest, welche Tonalität …"
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

      {/* Live-Vorschau */}
      <div className="wiz-section">
        <div className="wiz-section-head">
          <div className="left">
            <h3>
              <Eye className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
              Live-Vorschau
            </h3>
            <p>So schreibt die KI mit deiner Anweisung, anhand echter Lead-Daten (Ansprechperson, Branche, Standort).</p>
          </div>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={generatePreview}
            disabled={!canPreview || previewLoading}
            title={!canPreview ? "Bitte zuerst die Kampagnen-Anweisung schreiben" : undefined}
          >
            {previewLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />}
            {previewResult ? "Neu generieren" : "Beispiel-Mail generieren"}
          </Button>
        </div>
        <div className="wiz-section-body">
          {previewError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-[12.5px] text-destructive">
              {previewError}
            </div>
          )}

          {!previewResult && !previewLoading && !previewError && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-10 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Eye className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <p className="mt-3 text-[13px] font-medium text-foreground">Noch keine Vorschau</p>
              <p className="mt-1 max-w-xs text-[12px] leading-relaxed text-muted-foreground">
                Generiere eine Beispiel-Mail, um zu sehen, was deine Empfänger:innen tatsächlich erhalten.
              </p>
            </div>
          )}

          {previewLoading && (
            <div className="space-y-2.5 rounded-xl border bg-card p-4">
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              <div className="mt-3 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-3 animate-pulse rounded bg-muted" style={{ width: `${92 - i * 9}%` }} />
                ))}
              </div>
            </div>
          )}

          {previewResult && !previewLoading && (
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
              {/* Mail-Kopf */}
              <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5 text-[12px]">
                <span className="font-medium text-foreground">An:</span>
                <span className="text-muted-foreground">
                  {previewResult.lead?.ceo_name || previewResult.lead?.company || "Empfänger:in"}
                  {previewResult.lead?.company && previewResult.lead?.ceo_name ? ` · ${previewResult.lead.company}` : ""}
                </span>
                <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-medium text-primary">
                  Beispiel
                </span>
              </div>
              {/* Betreff */}
              <div className="border-b px-4 py-3">
                <div className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">Betreff</div>
                <div className="mt-0.5 text-[14px] font-semibold text-foreground">{previewResult.subject}</div>
              </div>
              {/* Body */}
              <div className="whitespace-pre-line px-4 py-4 text-[13.5px] leading-relaxed text-foreground">
                {previewResult.body}
              </div>
              <div className="border-t bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
                {previewResult.generator === "gemini"
                  ? "Von Gemini generiert · jede Mail wird individuell pro Empfänger:in geschrieben."
                  : "Vorlagen-Vorschau · mit aktivem KI-Schlüssel schreibt Gemini individuell."}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mail-Anzahl + Wartezeiten (keine Intent/Text-Konfiguration mehr) */}
      <div className="wiz-section">
        <div className="wiz-section-head">
          <div className="left">
            <h3>Anzahl Mails &amp; Wartezeit</h3>
            <p>
              Eine Erstkontakt-Mail plus optionale Follow-ups. Die KI schreibt jede aus deiner Anweisung,
              passend zur Position in der Abfolge.
            </p>
          </div>
        </div>
        <div className="wiz-section-body">
          {/* Stepper: Gesamtzahl Mails */}
          <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
            <div>
              <div className="text-[13px] font-medium text-foreground">Mails insgesamt</div>
              <div className="mt-0.5 text-[12px] text-muted-foreground">
                Erstkontakt {followUps > 0 ? `+ ${followUps} Follow-up${followUps > 1 ? "s" : ""}` : "(ohne Follow-up)"}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMailCount(state.mailCount - 1)} disabled={state.mailCount <= 1} aria-label="Weniger Mails">
                <Minus className="h-3.5 w-3.5" strokeWidth={2} />
              </Button>
              <span className="w-5 text-center text-[15px] font-semibold tabular-nums">{state.mailCount}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMailCount(state.mailCount + 1)} disabled={state.mailCount >= 5} aria-label="Mehr Mails">
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              </Button>
            </div>
          </div>

          {/* Wartezeit je Follow-up */}
          {followUps > 0 && (
            <div className="mt-3 grid gap-2">
              {Array.from({ length: followUps }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border bg-muted/20 px-4 py-2.5 text-[13px]">
                  <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                  <span className="text-muted-foreground">Follow-up {i + 1} nach</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={state.delayDays[i] ?? 3}
                    onChange={(e) => updateDelay(i, Number(e.target.value))}
                    className="h-8 w-16 rounded-md border border-input bg-background px-2 text-center text-[13px] outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                  />
                  <span className="text-muted-foreground">Tagen, falls keine Antwort kam</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Auto-stop info */}
      <div className="wiz-callout">
        <Reply className="ico h-4 w-4" strokeWidth={1.75} />
        <div>
          <div className="t">Antworten stoppen die Abfolge automatisch</div>
          <div className="b">
            Sobald jemand antwortet, wird die Abfolge gestoppt und die Antwort landet
            direkt in deiner Inbox. Du musst nichts manuell pausieren.
          </div>
        </div>
      </div>
    </>
  );
}
