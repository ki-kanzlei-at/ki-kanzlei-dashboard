"use client";

import React, { useState } from "react";
import { scoreClass, industryToInd } from "@/lib/research/format";
import type { ResearchSource } from "@/types/research";
import type { LeadStatus } from "@/types/leads";

/* ── Deterministische Avatar-Farbe ── */
export function avatarColor(s: string): string {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `oklch(0.62 0.13 ${h})`;
}

/* ── Favicon mit Fallback-Kette (DuckDuckGo → Google → farbiger Buchstabe) ── */
export function Favicon({
  web,
  company,
  className,
}: {
  web?: string | null;
  company: string;
  className?: string;
}) {
  const domain = (web || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const sources = domain
    ? [
        `https://icons.duckduckgo.com/ip3/${domain}.ico`,
        `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
      ]
    : [];
  const [idx, setIdx] = useState(0);
  // Fallback-Index zurücksetzen, wenn sich die Domain ändert (Render-Zeit-Pattern statt Effekt)
  const [prevDomain, setPrevDomain] = useState(domain);
  if (domain !== prevDomain) { setPrevDomain(domain); setIdx(0); }
  const failed = idx >= sources.length;

  return (
    <div className={`favicon ${failed ? "is-fallback" : ""} ${className || ""}`}>
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sources[idx]} alt="" onError={() => setIdx((i) => i + 1)} loading="lazy" />
      )}
      <span className="favicon-letter" style={{ background: avatarColor(company) }}>
        {company.charAt(0)}
      </span>
    </div>
  );
}

/* ── Inline-Render: **fett** + [[n]]-Zitate + [Text](url)-Links + nackte URLs ──
   Mit `sources` werden Zitate zu klickbaren Links auf die Quelle. */
function prettyUrl(u: string): string {
  return u.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}
export function renderInline(text: string, sources?: ResearchSource[]): React.ReactNode[] {
  // Reihenfolge: Markdown-Link vor nackter URL vor Zitat (greift sonst ineinander)
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)]+\)|https?:\/\/[^\s)]+|\[\[\d+\]\])/g).filter(Boolean);
  return parts.map((seg, i) => {
    const cm = seg.match(/^\[\[(\d+)\]\]$/);
    if (cm) {
      const n = Number(cm[1]);
      const src = sources?.find((s) => s.n === n);
      if (src?.url) {
        return <a key={i} className="cite cite-link" href={src.url} target="_blank" rel="noreferrer" title={src.title}>{cm[1]}</a>;
      }
      return <span key={i} className="cite" title={src?.title || `Quelle ${cm[1]}`}>{cm[1]}</span>;
    }
    const lm = seg.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (lm) {
      return <a key={i} className="air-inline-link" href={lm[2]} target="_blank" rel="noreferrer">{lm[1]}</a>;
    }
    if (/^https?:\/\/\S+$/.test(seg)) {
      return <a key={i} className="air-inline-link" href={seg} target="_blank" rel="noreferrer">{prettyUrl(seg)}</a>;
    }
    const bm = seg.match(/^\*\*([^*]+)\*\*$/);
    if (bm) return <strong key={i}>{bm[1]}</strong>;
    return <React.Fragment key={i}>{seg}</React.Fragment>;
  });
}

/* ── Score-Balken ── */
export function Score({ value }: { value: number | null | undefined }) {
  if (value == null) return null;
  return (
    <span className={`score ${scoreClass(value)}`}>
      <span className="score-track"><span className="score-fill" style={{ width: `${value}%` }} /></span>
      <span className="score-val">{value}</span>
    </span>
  );
}

/* ── Status-Badge ── */
const STATUS_LABELS: Record<string, string> = {
  new: "Neu",
  interested: "Interessiert",
  contacted: "Kontaktiert",
  converted: "Mandant",
  not_interested: "Kein Interesse",
};
export function StatusBadge({ status }: { status: LeadStatus | string | null | undefined }) {
  if (!status) return null;
  return (
    <span className={`badge-status status-${status}`}>
      <span className="dot" />{STATUS_LABELS[status] ?? "Neu"}
    </span>
  );
}

/* ── Branchen-Tag (farbcodiert) ── */
export function IndustryTag({ industry }: { industry: string | null | undefined }) {
  const ind = industryToInd(industry);
  return (
    <span className={`ind-tag ind-${ind}`}>
      <span className="ind-dot" />{industry || "Kanzlei"}
    </span>
  );
}

/* ── Quellen-Badge (farbcodiert nach Art) ── */
export function SourceBadge({ source }: { source: ResearchSource }) {
  const inner = (
    <>
      <span className="src-dot" />
      <span className="air-src-n">{source.n}</span>
      <span className="air-src-title">{source.title}</span>
    </>
  );
  const cls = `badge badge-outline air-src src-${source.kind}`;
  if (source.url) {
    return (
      <a className={cls} href={source.url} target="_blank" rel="noreferrer" title={source.sub || source.title}>
        {inner}
      </a>
    );
  }
  return <span className={cls} title={source.sub || source.title}>{inner}</span>;
}
