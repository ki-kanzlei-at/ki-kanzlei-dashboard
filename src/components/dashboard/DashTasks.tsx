"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DashTask {
  id: string;
  text: string;
  due: string;
  urgent?: boolean;
}

export function DashTasks({ items }: { items: DashTask[] }) {
  const [done, setDone] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (items.length === 0) {
    return (
      <div className="py-6 text-center text-[12.5px] text-muted-foreground">
        Keine offenen Aufgaben.
      </div>
    );
  }

  return (
    <div className="tasks-list">
      {items.map((t) => {
        const isDone = done.has(t.id);
        return (
          <div key={t.id} className="task-row">
            <button
              type="button"
              className={cn("task-checkbox", isDone && "is-done")}
              onClick={() => toggle(t.id)}
              aria-label={isDone ? `${t.text} als offen markieren` : `${t.text} als erledigt markieren`}
            >
              {isDone && <Check className="h-3 w-3" strokeWidth={3} />}
            </button>
            <span className={cn("task-text", isDone && "is-done")}>{t.text}</span>
            <span className={cn("task-meta", t.urgent && "task-due-soon")}>{t.due}</span>
          </div>
        );
      })}
    </div>
  );
}
