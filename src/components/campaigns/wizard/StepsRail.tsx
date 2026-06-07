"use client";

import { Check, BookOpen, CalendarDays, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEPS } from "./types";

/* Hilfe-Links unter den Schritten — bei eigener Doku/Buchungsseite hier anpassen. */
const HELP_DOCS_URL = "https://www.ki-kanzlei.at";
const HELP_BOOKING_URL = "https://www.ki-kanzlei.at/termin";

interface StepsRailProps {
  current: number;
  completed: Set<number>;
  onJump: (idx: number) => void;
}

export function StepsRail({ current, completed, onJump }: StepsRailProps) {
  return (
    <aside className="steps-rail">
      <div className="steps-eyebrow">Setup · {STEPS.length} Schritte</div>
      <h2 className="steps-title">Neue E-Mail-Kampagne</h2>
      <div className="steps-list">
        {STEPS.map((s, idx) => {
          const isActive = idx === current;
          const isDone = completed.has(idx) && !isActive;
          return (
            <button
              key={s.key}
              type="button"
              className={cn(
                "step-item",
                isActive && "is-active",
                isDone && "is-done",
              )}
              onClick={() => onJump(idx)}
            >
              <span className="step-bubble">
                {isDone ? <Check className="h-3 w-3" strokeWidth={2.5} /> : idx + 1}
              </span>
              <div className="step-label">
                <span className="step-name">{s.name}</span>
                <span className="step-sub">{s.sub}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Hilfe unter Schritt 5 */}
      <div className="steps-footer">
        <a href={HELP_DOCS_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          <span className="flex-1">Hilfe &amp; Anleitungen</span>
          <ExternalLink className="h-3 w-3 shrink-0 opacity-60" strokeWidth={1.75} />
        </a>
        <a href={HELP_BOOKING_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          <span className="flex-1">Demo-Termin buchen</span>
          <ExternalLink className="h-3 w-3 shrink-0 opacity-60" strokeWidth={1.75} />
        </a>
      </div>
    </aside>
  );
}
