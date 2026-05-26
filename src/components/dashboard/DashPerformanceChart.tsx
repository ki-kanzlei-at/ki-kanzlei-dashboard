"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

interface DayPoint {
  date: string;       // ISO yyyy-MM-dd
  sent: number;
  opened: number;
  replied: number;
}

interface DashPerformanceChartProps {
  /** Daily series, must contain at least 7 days (newest last) */
  data: DayPoint[];
}

const RANGES = [
  { value: "7d",  label: "7T",  days: 7 },
  { value: "14d", label: "14T", days: 14 },
  { value: "30d", label: "30T", days: 30 },
] as const;
type RangeValue = (typeof RANGES)[number]["value"];

export function DashPerformanceChart({ data }: DashPerformanceChartProps) {
  const [range, setRange] = useState<RangeValue>("14d");

  const sliced = useMemo(() => {
    const cfg = RANGES.find((r) => r.value === range)!;
    return data.slice(-cfg.days);
  }, [data, range]);

  const w = 800, h = 240, padL = 40, padR = 16, padT = 16, padB = 30;
  const xMax = Math.max(1, sliced.length - 1);
  const yMaxRaw = Math.max(1, ...sliced.map((d) => d.sent));
  const yMax = yMaxRaw * 1.15;

  const xScale = (i: number) => padL + (i / xMax) * (w - padL - padR);
  const yScale = (v: number) => h - padB - (v / yMax) * (h - padT - padB);

  function linePath(arr: number[]) {
    if (arr.length === 0) return "";
    return arr.map((v, i) => `${i === 0 ? "M" : "L"} ${xScale(i)} ${yScale(v)}`).join(" ");
  }
  function areaPath(arr: number[]) {
    if (arr.length === 0) return "";
    const top = arr.map((v, i) => `${i === 0 ? "M" : "L"} ${xScale(i)} ${yScale(v)}`).join(" ");
    return `${top} L ${xScale(xMax)} ${h - padB} L ${padL} ${h - padB} Z`;
  }

  const sentArr   = sliced.map((d) => d.sent);
  const openedArr = sliced.map((d) => d.opened);
  const repliedArr= sliced.map((d) => d.replied);

  const gridYs = [0, 0.25, 0.5, 0.75, 1];

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="seg-mini">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              className={cn(r.value === range && "is-active")}
              onClick={() => setRange(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="chart-legend">
          <span className="item">
            <span className="swatch" style={{ background: "var(--muted-foreground)", opacity: 0.5 }} />
            Versendet
          </span>
          <span className="item">
            <span className="swatch" style={{ background: "var(--primary)" }} />
            Geöffnet
          </span>
          <span className="item">
            <span className="swatch" style={{ background: "oklch(0.62 0.18 150)" }} />
            Geantwortet
          </span>
        </div>
      </div>

      {sliced.length === 0 ? (
        <div className="py-16 text-center text-[12.5px] text-muted-foreground">
          Noch keine Kampagnen-Daten vorhanden.
        </div>
      ) : (
        <svg className="chart-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <g className="grid">
            {gridYs.map((t) => {
              const y = h - padB - t * (h - padT - padB);
              return <line key={t} x1={padL} x2={w - padR} y1={y} y2={y} />;
            })}
          </g>
          <g className="axis">
            {gridYs.map((t) => {
              const y = h - padB - t * (h - padT - padB) + 4;
              return (
                <text key={t} x={padL - 8} y={y} textAnchor="end">
                  {Math.round(yMax * t)}
                </text>
              );
            })}
          </g>

          {sentArr.length > 1 && <path className="area-primary" d={areaPath(openedArr)} />}
          {sentArr.length > 1 && <path className="line-muted"   d={linePath(sentArr)}    />}
          {sentArr.length > 1 && <path className="line-primary" d={linePath(openedArr)}  />}
          {sentArr.length > 1 && <path className="line-success" d={linePath(repliedArr)} />}

          {[0, Math.floor(xMax / 2), xMax].filter((v, i, arr) => arr.indexOf(v) === i).map((i) => (
            <text key={i} className="axis-label" x={xScale(i)} y={h - padB + 16} textAnchor="middle">
              {sliced.length - i}T
            </text>
          ))}
        </svg>
      )}
    </>
  );
}
