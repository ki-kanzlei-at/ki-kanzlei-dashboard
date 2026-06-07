"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2, Rocket, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { StepsRail } from "./StepsRail";
import { StepMailbox } from "./StepMailbox";
import { StepBasics } from "./StepBasics";
import { StepAudience } from "./StepAudience";
import { StepSequence } from "./StepSequence";
import { StepSchedule } from "./StepSchedule";
import { StepReview } from "./StepReview";
import {
  STEPS,
  buildAutoSteps,
  type WizardState,
} from "./types";

const TOTAL_STEPS = STEPS.length; // 5
const REVIEW_INDEX = TOTAL_STEPS;  // 5 (one past last)

const INITIAL_STATE: WizardState = {
  mailbox: {
    mailboxId: null,
    email: "",
    provider: null,
    senderName: "",
  },
  basics: {
    name: "",
    senderName: "",
    senderEmail: "",
    replyTo: "",
    language: "de-AT",
    tone: "professional",
  },
  audience: {
    selectedLeadIds: new Set<string>(),
    excludeContacted: true,
  },
  sequence: {
    systemPrompt: "",
    mailCount: 3,
    delayDays: [3, 5],
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

  const isReview = current === REVIEW_INDEX;
  const progressPct = ((current + (isReview ? 1 : 0)) / TOTAL_STEPS) * 100;

  /* Sync mailbox -> basics senderEmail/senderName on first mailbox pick */
  function setMailbox(next: WizardState["mailbox"]) {
    setState((s) => ({
      ...s,
      mailbox: next,
      basics: {
        ...s.basics,
        senderEmail: next.email,
        senderName: s.basics.senderName || next.senderName,
      },
    }));
  }

  /* Step validation gates */
  const canProceed = useMemo(() => {
    switch (current) {
      case 0: return !!state.mailbox.mailboxId;
      case 1: return state.basics.name.trim().length > 0 && state.basics.senderName.trim().length > 0;
      case 2: return state.audience.selectedLeadIds.size > 0;
      case 3: return state.sequence.systemPrompt.trim().length >= 50 && state.sequence.mailCount > 0;
      case 4: return state.schedule.days.some(Boolean) && state.schedule.daily > 0;
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
      toast.error("Bitte zuerst einen Kampagnennamen eingeben (Schritt 2)");
      setCurrent(1);
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
    // Map wizard state to current API contract.
    const replyTo = state.basics.replyTo.trim() || state.basics.senderEmail || state.mailbox.email;
    const dailyLimit = state.schedule.daily;
    const delayMinutes = Math.max(1, Math.round(state.schedule.gap / 60));
    const payload = {
      name: state.basics.name.trim(),
      daily_limit: dailyLimit,
      delay_minutes: delayMinutes,
      reply_to: replyTo,
      lead_ids: Array.from(state.audience.selectedLeadIds),
      // Extra fields — backend may ignore until schema is extended:
      mailbox_id: state.mailbox.mailboxId,
      sender_name: state.basics.senderName,
      language: state.basics.language,
      tone: state.basics.tone,
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
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error ?? `Fehler beim Erstellen (HTTP ${res.status})`);
    }
  }

  return (
    <div className="wiz-shell">
      <StepsRail
        current={current}
        completed={completed}
        onJump={jump}
      />

      <div className="wiz-main">
        {/* Secondary top bar — nur Draft/Abbrechen (Breadcrumb steckt schon im Header) */}
        <div className="wiz-topbar">
          <div className="ml-auto flex items-center gap-1.5">
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
        </div>

        {/* Step body */}
        <div className="wiz-body">
          {current === 0 && <StepMailbox  state={state.mailbox}  onChange={setMailbox} />}
          {current === 1 && <StepBasics   state={state.basics}   onChange={(b) => setState((s) => ({ ...s, basics: b }))} />}
          {current === 2 && <StepAudience state={state.audience} onChange={(a) => setState((s) => ({ ...s, audience: a }))} />}
          {current === 3 && (
            <StepSequence
              state={state.sequence}
              onChange={(q) => setState((s) => ({ ...s, sequence: q }))}
              preview={{
                leadId: Array.from(state.audience.selectedLeadIds)[0] ?? null,
                tone: state.basics.tone,
                language: state.basics.language,
                senderName: state.basics.senderName,
              }}
            />
          )}
          {current === 4 && <StepSchedule state={state.schedule} onChange={(sc) => setState((s) => ({ ...s, schedule: sc }))} />}
          {isReview      && <StepReview   state={state}          onJump={jump} />}
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
              style={{ background: "var(--success)" }}
            >
              {submitting
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Rocket className="h-4 w-4" strokeWidth={1.75} />}
              Kampagne starten
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
