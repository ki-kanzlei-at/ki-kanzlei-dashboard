"use client";

import { ExternalLink, Play } from "lucide-react";

export type SetupKind = "google" | "microsoft" | "smtp";

interface Step {
  t: string;
  d: string;
  href?: string;
  link?: string;
}
interface Guide {
  title: string;
  badge: string;
  steps: Step[];
  /** Loom/YouTube-Embed-URL (z. B. https://www.loom.com/embed/<id> oder https://www.youtube.com/embed/<id>).
   *  Leer lassen → cleaner „Setup-Video folgt"-Platzhalter. */
  video?: string;
  videoTitle: string;
  note?: string;
}

const GUIDES: Record<SetupKind, Guide> = {
  google: {
    title: "Gmail / Google Workspace verbinden",
    badge: "via App-Passwort",
    steps: [
      { t: "2-Faktor-Authentifizierung aktivieren", d: "Voraussetzung für App-Passwörter in deinem Google-Konto.", href: "https://myaccount.google.com/security", link: "Google-Sicherheit öffnen" },
      { t: "App-Passwort erstellen", d: "App 'Mail' wählen, Namen vergeben (z. B. 'KI Kanzlei') → 16-stelliges Passwort kopieren.", href: "https://myaccount.google.com/apppasswords", link: "App-Passwörter öffnen" },
      { t: "Unten eintragen", d: "E-Mail-Adresse + das App-Passwort (nicht dein normales Passwort). Der Server smtp.gmail.com wird automatisch erkannt." },
    ],
    video: "https://www.youtube.com/embed/CeeimcLhAfs",
    videoTitle: "Video: 2FA + App-Passwort erstellen (3 Min.)",
    note: "Wichtig: Das normale Gmail-Passwort funktioniert nicht — nur ein App-Passwort.",
  },
  microsoft: {
    title: "Microsoft 365 / Outlook verbinden",
    badge: "via Microsoft Graph",
    steps: [
      { t: "App registrieren", d: "Azure Portal → 'App-Registrierungen' → 'Neue Registrierung'.", href: "https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade", link: "Azure App-Registrierungen" },
      { t: "Berechtigung Mail.Send", d: "API-Berechtigungen → Microsoft Graph → Anwendungsberechtigung 'Mail.Send' → Adminzustimmung erteilen." },
      { t: "Client-Secret erstellen", d: "Zertifikate & Geheimnisse → neues Client-Secret → Wert sofort kopieren." },
      { t: "Unten eintragen", d: "Tenant-ID, Client-ID, Client-Secret + Absender-E-Mail (das Postfach)." },
    ],
    video: "",
    videoTitle: "Setup-Video: Microsoft 365 verbinden",
    note: "Outlook geht alternativ auch einfacher per SMTP — wähle dann 'Anderer Anbieter (SMTP)'.",
  },
  smtp: {
    title: "Anderer Anbieter (SMTP) verbinden",
    badge: "IONOS · Strato · Hetzner · Zoho · GMX …",
    steps: [
      { t: "SMTP-Zugangsdaten holen", d: "Host, Port, Benutzer und Passwort findest du im Hosting- bzw. E-Mail-Adminbereich deines Anbieters." },
      { t: "E-Mail & Zugangsdaten eintragen", d: "E-Mail-Adresse, Benutzername und Passwort unten eingeben. Gängige Anbieter werden automatisch erkannt." },
      { t: "Bei Bedarf anpassen", d: "Unter 'Erweiterte Einstellungen' Host/Port/Verschlüsselung setzen (meist Port 587 · STARTTLS)." },
    ],
    video: "",
    videoTitle: "Setup-Video: SMTP verbinden",
    note: undefined,
  },
};

function SetupVideo({ src, title }: { src?: string; title: string }) {
  if (src) {
    return (
      <div className="rounded-xl border border-border overflow-hidden bg-black">
        <div className="aspect-video">
          <iframe
            src={src}
            title={title}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      </div>
    );
  }
  return (
    <figure className="rounded-xl border border-border bg-muted/30 overflow-hidden">
      <div className="aspect-video grid place-items-center">
        <div className="flex flex-col items-center gap-2.5 text-muted-foreground px-4 text-center">
          <span className="grid place-items-center size-12 rounded-full bg-card border border-border shadow-sm">
            <Play className="size-5 ml-0.5 text-primary" strokeWidth={1.75} />
          </span>
          <span className="text-[12.5px] font-medium text-foreground">Setup-Video folgt</span>
          <span className="text-[11px] leading-tight max-w-[220px]">Kurzes Loom-/YouTube-Video, das diesen Provider Schritt für Schritt zeigt.</span>
        </div>
      </div>
      <figcaption className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border bg-card">{title}</figcaption>
    </figure>
  );
}

export function MailboxSetupGuide({ kind }: { kind: SetupKind }) {
  const g = GUIDES[kind];
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border bg-muted/30">
        <p className="text-[14px] font-semibold">{g.title}</p>
        <span className="text-[11px] font-medium text-primary bg-accent rounded-full px-2.5 py-0.5 whitespace-nowrap">{g.badge}</span>
      </div>
      <div className="grid gap-6 p-5 lg:grid-cols-[1fr_minmax(380px,440px)]">
        <ol className="space-y-3.5">
          {g.steps.map((s, i) => (
            <li key={i} className="flex gap-3.5">
              <span className="grid place-items-center size-5 shrink-0 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold mt-0.5">{i + 1}</span>
              <div className="min-w-0">
                <p className="text-[13.5px] font-medium leading-snug">{s.t}</p>
                <p className="text-[13px] text-muted-foreground leading-snug mt-1">{s.d}</p>
                {s.href && (
                  <a href={s.href} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[12.5px] text-primary font-medium mt-1.5 hover:underline">
                    {s.link} <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            </li>
          ))}
          {g.note && <li className="text-[12.5px] text-muted-foreground pl-9 -mt-0.5">{g.note}</li>}
        </ol>
        <SetupVideo src={g.video || undefined} title={g.videoTitle} />
      </div>
    </div>
  );
}
