"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface Slide {
  quote: string;
  name: string;
  role: string;
  initials: string;
  avatar: string;
}

const SLIDES: Slide[] = [
  {
    quote:
      "Ich hab Cold-Outreach immer gehasst — bis ich gemerkt hab, dass die KI besser schreibt als ich morgens um 8. Mein Kalender war innerhalb von 3 Wochen voll.",
    name: "Lukas Berger",
    role: "Founder · freelance Brand Strategist",
    initials: "LB",
    // Professional male, 30s — clean headshot
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&h=160&fit=crop&crop=faces&auto=format&q=80",
  },
  {
    quote:
      "Statt 4 Stunden pro Woche in LinkedIn-Recherche zu versenken, krieg ich jeden Morgen 20 qualifizierte Leads serviert. Mein Team hat plötzlich Zeit für die echte Arbeit.",
    name: "Theresa Wagner",
    role: "Co-Founder · Digital-Agentur, Wien",
    initials: "TW",
    // Professional female, 30s — friendly business portrait
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=160&h=160&fit=crop&crop=faces&auto=format&q=80",
  },
  {
    quote:
      "Unseren ersten Enterprise-Deal haben wir komplett über Cold-Outreach gewonnen. Ohne KI Kanzlei hätte das niemals so schnell geklappt.",
    name: "Florian Steiner",
    role: "Co-Founder · B2B-SaaS",
    initials: "FS",
    // Professional male tech-founder vibe, 30s
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=160&h=160&fit=crop&crop=faces&auto=format&q=80",
  },
];

export function AuthBrandPanel() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % SLIDES.length), 7000);
    return () => clearInterval(t);
  }, []);

  return (
    <aside className="auth-brand">
      <div className="auth-logo">
        <Image
          src="/images/KI-Kanzlei_Logo_2026.png"
          alt="KI Kanzlei"
          width={96}
          height={96}
          quality={100}
          className="auth-logo-img"
          priority
        />
        <div>
          <div>KI Kanzlei</div>
          <div className="auth-logo-sub">Outreach Plattform</div>
        </div>
      </div>

      <div className="auth-quote">
        <div className="auth-quote-mark">&ldquo;</div>
        <div className="auth-slider-track">
          {SLIDES.map((s, i) => (
            <div key={i} className={cn("auth-slide", idx === i && "is-active")}>
              <p className="auth-quote-text">{s.quote}</p>
              <div className="auth-quote-author">
                <span className="auth-quote-avatar" aria-hidden>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.avatar}
                    alt=""
                    width={40}
                    height={40}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                </span>
                <div>
                  <div className="auth-quote-name">{s.name}</div>
                  <div className="auth-quote-role">{s.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="auth-slider-dots">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              className={cn("auth-slider-dot", idx === i && "is-active")}
              onClick={() => setIdx(i)}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      </div>

      <div className="auth-trust">
        <div className="auth-trust-item">
          <div>
            <div className="auth-trust-num">180+</div>
            <div className="auth-trust-lbl">aktive Workspaces<br/>in AT, DE, CH</div>
          </div>
        </div>
        <div className="auth-trust-item">
          <div>
            <div className="auth-trust-num">31 %</div>
            <div className="auth-trust-lbl">Ø Antwortrate<br/>auf Cold-Mails</div>
          </div>
        </div>
        <div className="auth-trust-item">
          <div>
            <div className="auth-trust-num">12k</div>
            <div className="auth-trust-lbl">Mails versendet<br/>im letzten Monat</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
