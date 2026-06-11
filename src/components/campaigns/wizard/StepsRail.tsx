"use client";

import { Fragment } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEPS } from "./types";

interface StepsRailProps {
  current: number;
  completed: Set<number>;
  onJump: (idx: number) => void;
}

/** Horizontaler Stepper im Top-Bar des Wizards. */
export function StepsRail({ current, completed, onJump }: StepsRailProps) {
  return (
    <nav className="steps-flow" aria-label="Schritte">
      {STEPS.map((s, idx) => {
        const isActive = idx === current;
        const isDone = completed.has(idx) && !isActive;
        return (
          <Fragment key={s.key}>
            {idx > 0 && (
              <span
                className={cn("step-sep", completed.has(idx - 1) && "is-done")}
                aria-hidden
              />
            )}
            <button
              type="button"
              className={cn(
                "step-item",
                isActive && "is-active",
                isDone && "is-done",
              )}
              aria-current={isActive ? "step" : undefined}
              onClick={() => onJump(idx)}
            >
              <span className="step-bubble">
                {isDone ? <Check className="h-3 w-3" strokeWidth={2.5} /> : idx + 1}
              </span>
              <span className="step-name">{s.name}</span>
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}
