"use client";

/* ── EmptyCards — Leerzustand mit gefächerter Karten-Illustration ──
 * Gemeinsames Element für „noch keine Daten" (variant="mail") und
 * „keine Suchergebnisse" (variant="search") im Dashboard-Stil.
 */

import type { ReactNode } from "react";

export interface EmptyCardsProps {
  variant?: "mail" | "search";
  title: string;
  description?: string;
  /** Aktionen (Buttons) unterhalb des Texts */
  children?: ReactNode;
}

export function EmptyCards({
  variant = "mail",
  title,
  description,
  children,
}: EmptyCardsProps) {
  return (
    <div className="py-16 flex flex-col items-center text-center px-6">
      <div className="empty-illu" aria-hidden="true">
        <div className="illu-card back" />
        <div className="illu-card mid" />
        <div className="illu-card front">
          {variant === "mail" ? (
            <>
              <span className="avatar" />
              <span className="lines">
                <span className="line w-3/4" />
                <span className="line w-1/2" />
              </span>
              <span className="pill">Aktiv</span>
            </>
          ) : (
            <>
              <span className="lens" />
              <span className="lines">
                <span className="line w-2/3" />
                <span className="line w-2/5" />
              </span>
              <span className="pill is-muted">0 Treffer</span>
            </>
          )}
        </div>
      </div>
      <h3 className="text-[15px] font-semibold mt-6">{title}</h3>
      {description && (
        <p className="text-[13px] text-muted-foreground mt-1.5 max-w-sm">
          {description}
        </p>
      )}
      {children && (
        <div className="mt-5 flex items-center justify-center gap-2">{children}</div>
      )}
    </div>
  );
}
