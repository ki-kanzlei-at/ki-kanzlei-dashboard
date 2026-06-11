"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ScheduleState } from "./types";

interface StepScheduleProps {
  state: ScheduleState;
  onChange: (next: ScheduleState) => void;
}

const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function SchedulePreview({ state }: { state: ScheduleState }) {
  const hours = [6, 8, 10, 12, 14, 16, 18, 20];
  const fromH = parseInt(state.timeFrom.split(":")[0] ?? "9", 10);
  const toH = parseInt(state.timeTo.split(":")[0] ?? "17", 10);
  return (
    <div className="mt-4 rounded-md border border-border bg-background px-4 py-3">
      <div className="mb-2 text-[11.5px] font-medium text-muted-foreground">
        Vorschau · Sendefenster
      </div>
      <div className="schedule-viz">
        <div className="label" />
        {DAYS.map((d) => <div key={d} className="day-header">{d}</div>)}
        {hours.map((h) => (
          <RowCells key={h} h={h} fromH={fromH} toH={toH} days={state.days} />
        ))}
      </div>
    </div>
  );
}

function RowCells({ h, fromH, toH, days }: { h: number; fromH: number; toH: number; days: boolean[] }) {
  return (
    <>
      <div className="label">{String(h).padStart(2, "0")}</div>
      {DAYS.map((d, di) => {
        const isDayOn = days[di];
        const isHourOn = h >= fromH && h < toH;
        const cls = isDayOn && isHourOn ? (h >= 9 && h < 12 ? "is-hot" : "is-on") : "";
        return <div key={`${h}-${di}`} className={cn("cell", cls)} />;
      })}
    </>
  );
}

export function StepSchedule({ state, onChange }: StepScheduleProps) {
  function toggleDay(idx: number) {
    const next = [...state.days];
    next[idx] = !next[idx];
    onChange({ ...state, days: next });
  }

  return (
    <>
      <div className="step-head">
        <div className="step-eyebrow">Schritt 4 von 4</div>
        <h1 className="step-heading">Wann und wie viel?</h1>
        <p className="step-desc">
          Empfohlen: werktags zwischen 09:00 und 17:00, mit moderaten Limits für hohe Zustellbarkeit.
          Tracking und Versand-Pausen sind sinnvoll voreingestellt.
        </p>
      </div>

      {/* Sendefenster */}
      <div className="wiz-section">
        <div className="wiz-section-head">
          <div className="left">
            <h3>Sendefenster</h3>
            <p>Tage und Uhrzeiten, an denen E-Mails versendet werden dürfen.</p>
          </div>
        </div>
        <div className="wiz-section-body">
          <Label className="text-[12px] font-medium text-foreground">Wochentage</Label>
          <div className="day-picker mt-2 mb-4">
            {DAYS.map((d, idx) => (
              <button
                key={d}
                type="button"
                className={cn("day-pill", state.days[idx] && "is-on")}
                onClick={() => toggleDay(idx)}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="wiz-fields-row">
            <div className="space-y-2">
              <Label htmlFor="time-from" className="text-[12px] font-medium text-foreground">
                Uhrzeit von
              </Label>
              <Input
                id="time-from"
                type="time"
                value={state.timeFrom}
                onChange={(e) => onChange({ ...state, timeFrom: e.target.value })}
                className="input-bright h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time-to" className="text-[12px] font-medium text-foreground">
                Uhrzeit bis
              </Label>
              <Input
                id="time-to"
                type="time"
                value={state.timeTo}
                onChange={(e) => onChange({ ...state, timeTo: e.target.value })}
                className="input-bright h-10"
              />
            </div>
          </div>

          <SchedulePreview state={state} />
        </div>
      </div>

      {/* Limit */}
      <div className="wiz-section">
        <div className="wiz-section-head">
          <div className="left">
            <h3>Tageslimit</h3>
            <p>Maximale Anzahl E-Mails pro Tag über diese Kampagne.</p>
          </div>
        </div>
        <div className="wiz-section-body">
          <div className="slider-row">
            <input
              type="range"
              min={10} max={500} step={10}
              value={state.daily}
              onChange={(e) => onChange({ ...state, daily: Number(e.target.value) })}
              className="slider"
            />
            <span className="slider-val">
              {state.daily}<span className="unit">/ Tag</span>
            </span>
          </div>
        </div>
      </div>

    </>
  );
}
