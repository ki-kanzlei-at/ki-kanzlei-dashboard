"use client";

import { useState } from "react";
import { Plus, Minus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SequenceState } from "./types";

interface PreviewContext {
  leadId: string | null;
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

  const followUps = Math.max(0, state.mailCount - 1);

  return (
    <>
      <div className="step-head">
        <div className="step-eyebrow">Schritt 4 von 5</div>
        <h1 className="step-heading">Briefing für deine Mails</h1>
        <p className="step-desc">
          Wir haben das Briefing aus deinem Firmenprofil vorbereitet — passe es an,
          wo du willst. Jede Mail wird daraus individuell pro Empfänger:in geschrieben.
        </p>
      </div>

      {/* Briefing */}
      <div className="wiz-section">
        <div className="wiz-section-head">
          <div className="left">
            <h3>Briefing</h3>
            <p>Wer ihr seid, was ihr anbietet, wie geschrieben werden soll.</p>
          </div>
        </div>
        <textarea
          className="prompt-area"
          value={state.systemPrompt}
          onChange={(e) => onChange({ ...state, systemPrompt: e.target.value })}
          placeholder="Wer seid ihr, was bietet ihr an, was ist das Ziel der Mail?"
          rows={10}
        />
      </div>

      {/* Beispiel-Mail */}
      <div className="wiz-section">
        <div className="wiz-section-head">
          <div className="left">
            <h3>Beispiel ansehen</h3>
            <p>So liest sich dein Briefing mit echten Lead-Daten.</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={generatePreview}
            disabled={!canPreview || previewLoading}
            title={!canPreview ? "Bitte zuerst das Briefing schreiben" : undefined}
          >
            {previewLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {previewResult ? "Neu generieren" : "Beispiel-Mail generieren"}
          </Button>
        </div>
        {(previewError || previewLoading || previewResult) && (
          <div className="wiz-section-body">
            {previewError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-[12.5px] text-destructive">
                {previewError}
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
              <div className="overflow-hidden rounded-xl border bg-card">
                <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5 text-[12px]">
                  <span className="font-medium text-foreground">An:</span>
                  <span className="text-muted-foreground">
                    {previewResult.lead?.ceo_name || previewResult.lead?.company || "Empfänger:in"}
                    {previewResult.lead?.company && previewResult.lead?.ceo_name ? ` · ${previewResult.lead.company}` : ""}
                  </span>
                  <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                    Beispiel
                  </span>
                </div>
                <div className="border-b px-4 py-3">
                  <div className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">Betreff</div>
                  <div className="mt-0.5 text-[14px] font-semibold text-foreground">{previewResult.subject}</div>
                </div>
                <div className="whitespace-pre-line px-4 py-4 text-[13.5px] leading-relaxed text-foreground">
                  {previewResult.body}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mail-Anzahl + Wartezeiten */}
      <div className="wiz-section">
        <div className="wiz-section-head">
          <div className="left">
            <h3>Abfolge</h3>
            <p>Erstkontakt plus optionale Follow-ups. Antworten stoppen die Abfolge automatisch.</p>
          </div>
        </div>
        <div className="wiz-section-body">
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

          {followUps > 0 && (
            <div className="mt-3 grid gap-2">
              {Array.from({ length: followUps }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border bg-muted/20 px-4 py-2.5 text-[13px]">
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
    </>
  );
}
