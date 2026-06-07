"use client";

import { Calendar, Globe, ShieldCheck, BarChart3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
        <div className="step-eyebrow">
          <Calendar className="h-3 w-3" strokeWidth={1.75} />
          Schritt 5 von 5
        </div>
        <h1 className="step-heading">Wann und wie viel?</h1>
        <p className="step-desc">
          Empfohlen: Werktags zwischen 09:00 und 17:00, mit moderaten Limits für hohe Zustellbarkeit.
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
                className="h-10"
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
                className="h-10"
              />
            </div>
          </div>

          <div className="space-y-2 mt-4">
            <Label htmlFor="timezone" className="text-[12px] font-medium text-foreground">
              Zeitzone
            </Label>
            <Select
              value={state.timezone}
              onValueChange={(v) => onChange({ ...state, timezone: v })}
            >
              <SelectTrigger id="timezone" className="h-10 w-full">
                <Globe className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Europe/Vienna">Europe/Vienna (UTC+1, Sommerzeit)</SelectItem>
                <SelectItem value="Europe/Berlin">Europe/Berlin</SelectItem>
                <SelectItem value="Europe/Zurich">Europe/Zurich</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <SchedulePreview state={state} />
        </div>
      </div>

      {/* Limits */}
      <div className="wiz-section">
        <div className="wiz-section-head">
          <div className="left">
            <h3>Sende-Limits</h3>
            <p>Begrenze die Anzahl pro Tag und den Abstand zwischen E-Mails.</p>
          </div>
        </div>
        <div className="wiz-section-body">
          <div className="mb-4">
            <Label className="text-[12px] font-medium text-foreground">Max. E-Mails pro Tag</Label>
            <div className="slider-row mt-2">
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
          <div>
            <Label className="text-[12px] font-medium text-foreground">
              Abstand zwischen E-Mails (random)
            </Label>
            <div className="slider-row mt-2">
              <input
                type="range"
                min={30} max={600} step={30}
                value={state.gap}
                onChange={(e) => onChange({ ...state, gap: Number(e.target.value) })}
                className="slider"
              />
              <span className="slider-val">
                {state.gap}<span className="unit">Sek. ± 20 %</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tracking */}
      <div className="wiz-section">
        <div className="wiz-section-head">
          <div className="left">
            <h3>
              <BarChart3 className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
              Tracking
            </h3>
            <p>Welche Events wir messen sollen.</p>
          </div>
        </div>
        <div className="wiz-section-body">
          <div className="row-toggle">
            <div className="label-block">
              <div className="t">Öffnungen tracken</div>
              <div className="s">Wir setzen ein 1×1 Pixel — schaltbar pro Empfänger.</div>
            </div>
            <Switch
              checked={state.trackOpens}
              onCheckedChange={(v) => onChange({ ...state, trackOpens: v })}
            />
          </div>
          <div className="row-toggle">
            <div className="label-block">
              <div className="t">Klicks tracken</div>
              <div className="s">Links in der E-Mail werden durch Tracking-Links ersetzt.</div>
            </div>
            <Switch
              checked={state.trackClicks}
              onCheckedChange={(v) => onChange({ ...state, trackClicks: v })}
            />
          </div>
          <div className="row-toggle">
            <div className="label-block">
              <div className="t">Antworten erkennen</div>
              <div className="s">Antworten landen direkt in der Inbox und stoppen die Sequenz automatisch.</div>
            </div>
            <Switch
              checked={state.trackReplies}
              onCheckedChange={(v) => onChange({ ...state, trackReplies: v })}
            />
          </div>
        </div>
      </div>

      <div className="wiz-callout">
        <ShieldCheck className="ico h-4 w-4" strokeWidth={1.75} />
        <div>
          <div className="t">Bereit zum Start</div>
          <div className="b">
            Du kannst die Kampagne als Entwurf speichern oder direkt starten.
            Der erste Versand erfolgt erst, wenn dein Sendefenster offen ist.
          </div>
        </div>
      </div>
    </>
  );
}
