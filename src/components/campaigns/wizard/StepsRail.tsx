"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STEPS } from "./types";

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
    </aside>
  );
}
