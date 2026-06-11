"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { StepsRail } from "./StepsRail";
import { StepMailbox } from "./StepMailbox";
import { StepAudience } from "./StepAudience";
import { StepSequence } from "./StepSequence";
import { StepSchedule } from "./StepSchedule";
import { StepReview } from "./StepReview";
import {
  STEPS,
  buildAutoSteps,
  buildDefaultPrompt,
  type BrandInfo,
  type WizardState,
} from "./types";

const TOTAL_STEPS = STEPS.length;  // 4
const REVIEW_INDEX = TOTAL_STEPS;  // 4 (one past last)

/* Step-Indizes (lesbarer als magische Zahlen) */
const STEP_MAILBOX  = 0;
const STEP_AUDIENCE = 1;
const STEP_SEQUENCE = 2;
const STEP_SCHEDULE = 3;

const INITIAL_STATE: WizardState = {
  mailbox: {
    mailboxIds: [],
    emails: [],
    senderName: "",
  },
  basics: {
    name: "",
    language: "de-AT",
  },
  audience: {
    selectedLeadIds: new Set<string>(),
  },
  sequence: {
    systemPrompt: "",
    mailCount: 2,
    delayDays: [3],
    autoStopOnReply: true,
  },
  schedule: {
    days: [true, true, true, true, true, false, false],
    timeFrom: "09:00",
    timeTo: "17:00",
    timezone: "Europe/Vienna",
    daily: 50,
    gap: 180,
    trackOpens: true,
    trackClicks: true,
    trackReplies: true,
  },
};

export function CampaignWizard() {
  const router = useRouter();
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [current, setCurrent] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const promptTouched = useRef(false);

  /* Firmenprofil laden → KI-Briefing vorbefüllen, solange der/die User:in
   * noch nichts eigenes geschrieben hat. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) return;
        const json = await res.json();
        const b = (json.data?.brand_settings ?? {}) as Record<string, string | undefined>;
        const info: BrandInfo = {
          companyName:    b.company_name?.trim() || null,
          offering:       b.offering?.trim() || null,
          valueProp:      b.value_prop?.trim() || null,
          targetCustomer: b.target_customer?.trim() || null,
        };
        if (cancelled) return;
        setState((s) => {
          if (promptTouched.current || s.sequence.systemPrompt.trim()) return s;
          return { ...s, sequence: { ...s.sequence, systemPrompt: buildDefaultPrompt(info) } };
        });
      } catch { /* silent — Default-Prompt bleibt leer */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const isReview = current === REVIEW_INDEX;
  const progressPct = ((current + (isReview ? 1 : 0)) / TOTAL_STEPS) * 100;

  /* Step validation gates */
  const canProceed = useMemo(() => {
    switch (current) {
      case STEP_MAILBOX:  return state.mailbox.mailboxIds.length > 0;
      case STEP_AUDIENCE: return state.audience.selectedLeadIds.size > 0;
      case STEP_SEQUENCE:
        return state.basics.name.trim().length > 0
          && state.sequence.systemPrompt.trim().length >= 50
          && state.sequence.mailCount > 0;
      case STEP_SCHEDULE: return state.schedule.days.some(Boolean) && state.schedule.daily > 0;
      default: return true;
    }
  }, [current, state]);

  function next() {
    if (!canProceed) return;
    setCompleted((prev) => {
      const n = new Set(prev);
      n.add(current);
      return n;
    });
    setCurrent((c) => Math.min(c + 1, REVIEW_INDEX));
  }
  function prev() {
    setCurrent((c) => Math.max(c - 1, 0));
  }
  function jump(idx: number) {
    // only allow jumping to completed steps or current
    if (idx <= current || completed.has(idx)) {
      setCurrent(idx);
    }
  }

  async function saveDraft() {
    if (!state.basics.name.trim()) {
      toast.error("Bitte zuerst einen Kampagnennamen eingeben (Schritt Briefing)");
      setCurrent(STEP_SEQUENCE);
      return;
    }
    setSubmitting(true);
    try {
      await submitCampaign({ asDraft: true });
      toast.success("Als Entwurf gespeichert");
      router.push("/dashboard/campaigns");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSubmitting(false);
    }
  }

  async function launch() {
    if (state.audience.selectedLeadIds.size === 0) {
      toast.error("Bitte mindestens eine:n Empfänger:in auswählen");
      setCurrent(STEP_AUDIENCE);
      return;
    }
    setSubmitting(true);
    try {
      await submitCampaign({ asDraft: false });
      toast.success("Kampagne gestartet");
      router.push("/dashboard/campaigns");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Start fehlgeschlagen");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCampaign(opts: { asDraft: boolean }) {
    const payload = {
      name: state.basics.name.trim(),
      daily_limit: state.schedule.daily,
      delay_minutes: Math.max(1, Math.round(state.schedule.gap / 60)),
      lead_ids: Array.from(state.audience.selectedLeadIds),
      /* Mehrere Mailboxen = automatische Rotation. reply_to bleibt leer —
       * der Server leitet sie bei genau einer Mailbox vom Konto ab, bei
       * Rotation antwortet jedes Konto mit der eigenen Adresse. */
      mailbox_ids: state.mailbox.mailboxIds,
      sender_name: state.mailbox.senderName,
      language: state.basics.language,
      tone: "professional",
      system_prompt: state.sequence.systemPrompt,
      // Steps werden automatisch aus der Mail-Anzahl abgeleitet (kein Micro-Tuning).
      sequence_steps: buildAutoSteps(state.sequence.mailCount),
      sequence_delays: state.sequence.delayDays
        .slice(0, Math.max(0, state.sequence.mailCount - 1))
        .map((value) => ({ value, unit: "day" as const })),
      auto_stop_on_reply: state.sequence.autoStopOnReply,
      schedule: {
        days: state.schedule.days,
        time_from: state.schedule.timeFrom,
        time_to: state.schedule.timeTo,
        timezone: state.schedule.timezone,
        gap_seconds: state.schedule.gap,
      },
      tracking: {
        opens: state.schedule.trackOpens,
        clicks: state.schedule.trackClicks,
        replies: state.schedule.trackReplies,
      },
      status: opts.asDraft ? "draft" : "active",
    };

    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error ?? `Fehler beim Erstellen (HTTP ${res.status})`);
    }
    /* Doppelkontakt-Schutz: bereits kontaktierte Leads wurden serverseitig
     * aussortiert — transparent machen. */
    const skipped = data?.skipped_already_contacted as number | undefined;
    if (skipped && skipped > 0) {
      toast.info(
        `${skipped} ${skipped === 1 ? "Lead war" : "Leads waren"} bereits in einer Kampagne und ${skipped === 1 ? "wurde" : "wurden"} übersprungen`,
      );
    }
  }

  return (
    <div className="wiz-shell">
      {/* Top-Bar: Stepper mittig, Aktionen rechts (Titel steht im Breadcrumb) */}
      <header className="wiz-top">
        <div className="wiz-top-spacer" aria-hidden />
        <StepsRail
          current={current}
          completed={completed}
          onJump={jump}
        />
        <div className="wiz-top-actions">
          {/* Entwurf erst sinnvoll, sobald es einen Namen geben kann */}
          {current >= STEP_SEQUENCE && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={saveDraft}
              disabled={submitting}
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Als Entwurf speichern
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push("/dashboard/campaigns")}
            aria-label="Abbrechen"
            disabled={submitting}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="wiz-main">
        {/* Step body — Mailbox-Step vertikal zentriert (wenig Inhalt),
            Empfänger-Step breiter (Tabelle) */}
        <div className={cn(
          "wiz-body",
          current === STEP_MAILBOX && "wiz-body--center",
          current === STEP_AUDIENCE && "wiz-body--wide",
        )}>
          {current === STEP_MAILBOX && (
            <StepMailbox
              state={state.mailbox}
              onChange={(m) => setState((s) => ({ ...s, mailbox: m }))}
            />
          )}
          {current === STEP_AUDIENCE && (
            <StepAudience
              state={state.audience}
              onChange={(a) => setState((s) => ({ ...s, audience: a }))}
            />
          )}
          {current === STEP_SEQUENCE && (
            <StepSequence
              state={state.sequence}
              basics={state.basics}
              onBasicsChange={(b) => setState((s) => ({ ...s, basics: b }))}
              onChange={(q) => {
                if (q.systemPrompt !== state.sequence.systemPrompt) promptTouched.current = true;
                setState((s) => ({ ...s, sequence: q }));
              }}
              preview={{
                leadId: Array.from(state.audience.selectedLeadIds)[0] ?? null,
                language: state.basics.language,
                senderName: state.mailbox.senderName,
              }}
            />
          )}
          {current === STEP_SCHEDULE && (
            <StepSchedule state={state.schedule} onChange={(sc) => setState((s) => ({ ...s, schedule: sc }))} />
          )}
          {isReview && <StepReview state={state} onJump={jump} />}
        </div>

        {/* Sticky footer */}
        <footer className={cn("wiz-foot")}>
          <div className="wiz-foot-progress">
            <span>
              <b>{Math.min(current + 1, TOTAL_STEPS)}</b> von <b>{TOTAL_STEPS}</b>
              {isReview && " · Prüfung"}
            </span>
            <div className="wiz-foot-bar">
              <div className="wiz-foot-bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
          <div className="ml-auto" />
          <Button
            variant="outline"
            onClick={prev}
            disabled={current === 0 || submitting}
            className="h-9 gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
            Zurück
          </Button>
          {!isReview && (
            <Button
              onClick={next}
              disabled={!canProceed || submitting}
              className="h-9 gap-1.5"
            >
              Weiter
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
            </Button>
          )}
          {isReview && (
            <Button
              onClick={launch}
              disabled={submitting}
              className="h-9 gap-1.5"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Kampagne starten
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
