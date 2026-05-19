"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CompanyFaviconProps {
  website: string | null;
  /** Tailwind-Größe für die Box (h-X w-X). Default: 7. */
  size?: 7 | 8 | 9 | 10;
  className?: string;
}

/**
 * Favicon der Firma via Google's Favicon-Service.
 * Fällt auf Building2-Icon zurück wenn:
 *   - keine Website
 *   - ungültige URL
 *   - Favicon-Image lädt nicht
 *
 * Verwendet kein DB-Field — domain wird aus `website` extrahiert.
 */
export function CompanyFavicon({ website, size = 7, className }: CompanyFaviconProps) {
  const [failed, setFailed] = useState(false);

  let domain: string | null = null;
  if (website) {
    try {
      const url = website.startsWith("http") ? new URL(website) : new URL("https://" + website);
      domain = url.hostname.replace(/^www\./, "");
      /* Plausibilitäts-Check: mind. ein Punkt im Host, sonst noch nicht fertig getippt
       * (verhindert Favicon-Requests für "wien", "neu", "https://test"). */
      if (!domain.includes(".") || domain.length < 4) domain = null;
    } catch { /* ungültige URL */ }
  }

  /* Wenn der User die URL ändert, einen ggf. zuvor fehlgeschlagenen Favicon-Load
   * neu versuchen — sonst bliebe das Fallback-Icon kleben. */
  useEffect(() => {
    setFailed(false);
  }, [domain]);

  // Tailwind macht keine dynamischen Klassen-Strings → wir mappen explizit
  const sizeMap: Record<number, { box: string; iconSize: string; imgSize: number }> = {
    7: { box: "h-7 w-7", iconSize: "h-3.5 w-3.5", imgSize: 20 },
    8: { box: "h-8 w-8", iconSize: "h-4 w-4", imgSize: 22 },
    9: { box: "h-9 w-9", iconSize: "h-4.5 w-4.5", imgSize: 26 },
    10: { box: "h-10 w-10", iconSize: "h-5 w-5", imgSize: 28 },
  };
  const cfg = sizeMap[size];

  if (!domain || failed) {
    return (
      <div className={cn(cfg.box, "rounded-md bg-primary/10 flex items-center justify-center shrink-0", className)}>
        <Building2 className={cn(cfg.iconSize, "text-primary")} />
      </div>
    );
  }

  return (
    <div className={cn(cfg.box, "rounded-md bg-white border border-border/60 flex items-center justify-center shrink-0 overflow-hidden", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
        alt=""
        width={cfg.imgSize}
        height={cfg.imgSize}
        className="object-contain"
        onError={() => setFailed(true)}
        loading="lazy"
      />
    </div>
  );
}
