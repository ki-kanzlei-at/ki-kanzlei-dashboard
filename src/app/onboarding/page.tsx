"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Info, Loader2, Mail } from "lucide-react";

import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";

import { PLANS as PRICING_PLANS } from "@/lib/billing/plans";

/* ── Step model ─────────────────────────────────────────────────── */
const STEPS = [
  { k: "profile", label: "Profil" },
  { k: "goal",    label: "Ziel" },
  { k: "target",  label: "Zielgruppe" },
  { k: "mailbox", label: "Mailbox" },
  { k: "plan",    label: "Plan" },
  { k: "done",    label: "Fertig" },
] as const;

/* ── Static data (cleaner, ohne Emojis) ─────────────────────────── */
const ROLES = [
  { v: "founder",   label: "Founder / Co-Founder" },
  { v: "marketing", label: "Marketing / Growth" },
  { v: "sales",     label: "Sales / BD" },
  { v: "ops",       label: "Operations" },
  { v: "other",     label: "Andere" },
];

const BUSINESS_TYPES = [
  { v: "agentur",   title: "Agentur",            desc: "Marketing, Design, PR" },
  { v: "beratung",  title: "Beratung",           desc: "Strategie, IT, Unternehmensberatung" },
  { v: "saas",      title: "SaaS / Software",    desc: "B2B-Software, Tech-Startup" },
  { v: "coaching",  title: "Coaching / Trainer", desc: "Business-, Sales-, Life-Coaching" },
  { v: "freelance", title: "Freelance",          desc: "Solo-selbstständig, Freiberufler:in" },
  { v: "service",   title: "Sonstiges B2B",      desc: "Andere Dienstleistung" },
];

const TEAM_SIZES = [
  { v: "1",     label: "Solo"     },
  { v: "2-5",   label: "2 – 5"    },
  { v: "6-15",  label: "6 – 15"   },
  { v: "16+",   label: "16+"      },
];

const GOALS = [
  { v: "demos",     title: "Mehr qualifizierte Demos buchen" },
  { v: "pipeline",  title: "Pipeline fürs nächste Quartal aufbauen" },
  { v: "customers", title: "Neukunden für eine Service-Linie" },
  { v: "investors", title: "Investor:innen oder Partner finden" },
  { v: "talent",    title: "Talent oder Recruiting-Ziele" },
];

const VOLUMES = [
  { v: "lt500",       label: "Unter 500",       sub: "Solo-Range" },
  { v: "500-2500",    label: "500 – 2.500",     sub: "Growth-Range" },
  { v: "2500-10000",  label: "2.500 – 10.000",  sub: "Scale-Range" },
  { v: "gt10000",     label: "Über 10.000",     sub: "Enterprise" },
];

const COUNTRIES = [
  { v: "AT", label: "Österreich"  },
  { v: "DE", label: "Deutschland" },
  { v: "CH", label: "Schweiz"     },
];

const TARGET_INDUSTRIES = [
  "Agenturen", "SaaS / Software", "E-Commerce", "Unternehmensberatung",
  "Coaching / Training", "B2B-Dienstleister", "Handel & Retail",
  "Industrie & Produktion", "Immobilien", "Bauwesen", "Gastronomie & Hotellerie",
  "Gesundheit",
];

/* Realistic lead-count estimates: Anzahl B2B-Firmen pro Industrie pro Land
   (gerundet auf glaubwürdige Größenordnungen für die Lead-Datenbank). */
const LEADS_PER_INDUSTRY_PER_COUNTRY: Record<string, number> = {
  AT:  3_200,
  DE: 17_000,
  CH:  2_700,
};

function GoogleLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.55 6.55 0 0 1 5.5 12c0-.73.13-1.43.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.83Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}
function MicrosoftLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="2"    y="2"    width="9.5" height="9.5" fill="#F35325" />
      <rect x="12.5" y="2"    width="9.5" height="9.5" fill="#81BC06" />
      <rect x="2"    y="12.5" width="9.5" height="9.5" fill="#05A6F0" />
      <rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#FFBA08" />
    </svg>
  );
}
function SmtpLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

const PROVIDERS = [
  { v: "google",    name: "Google Workspace", desc: "Gmail · OAuth-Verbindung",              Logo: GoogleLogo    },
  { v: "microsoft", name: "Microsoft 365",    desc: "Outlook, Exchange · Microsoft Graph",   Logo: MicrosoftLogo },
  { v: "smtp",      name: "SMTP / IMAP",      desc: "Eigene Server-Daten eintragen",         Logo: SmtpLogo      },
];

/* ── State ───────────────────────────────────────────────────────── */
interface OnboardingState {
  role: string | null;
  businessType: string | null;
  teamSize: string | null;
  primaryGoal: string | null;
  monthlyVolume: string | null;
  countries: string[];
  industries: string[];
  mailboxProvider: string | null;
  planIntent: string | null;
}

const INITIAL: OnboardingState = {
  role: null,
  businessType: null,
  teamSize: null,
  primaryGoal: null,
  monthlyVolume: null,
  countries: ["AT"],
  industries: [],
  mailboxProvider: null,
  planIntent: null,
};

/* ══════════════════════════════════════════════════════════════
   Shared step-head + section helpers
   ══════════════════════════════════════════════════════════════ */

function StepHead({
  step, title, description,
}: { step: number; title: string; description?: string; }) {
  return (
    <div className="text-center mb-8">
      <div className="inline-block text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground mb-3 tabular-nums">
        Schritt {step} / 5
      </div>
      <h1 className="m-0 mb-2 text-[26px] font-semibold tracking-[-0.025em] leading-[1.2]">
        {title}
      </h1>
      {description && (
        <p className="m-0 mx-auto max-w-[440px] text-[13.5px] text-muted-foreground leading-[1.55]">
          {description}
        </p>
      )}
    </div>
  );
}

function Section({
  title, hint, children,
}: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <Label className="text-[13px] font-semibold text-foreground">{title}</Label>
        {hint && <span className="text-[11.5px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/* ── Toggle styles (rounded, brand-primary when active, kein Schatten) ── */
const CARD_TOGGLE = "flex h-auto w-full min-w-0 items-center justify-start gap-3 rounded-xl border bg-card px-4 py-3.5 text-left shadow-none transition-colors data-[state=on]:border-primary data-[state=on]:bg-primary/5 data-[state=on]:text-foreground hover:border-foreground/30";
const PILL_TOGGLE = "h-9 rounded-full border bg-card px-4 text-[13px] font-medium shadow-none transition-colors data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground hover:border-foreground/30";
const COMPACT_TOGGLE = "flex h-auto w-full min-w-0 flex-col items-center justify-center rounded-xl border bg-card px-3 py-3 text-center shadow-none transition-colors data-[state=on]:border-primary data-[state=on]:bg-primary/5 hover:border-foreground/30";

/* ══════════════════════════════════════════════════════════════
   STEP 1 — Profil
   ══════════════════════════════════════════════════════════════ */
function StepProfile({ state, onChange }: { state: OnboardingState; onChange: (s: OnboardingState) => void }) {
  return (
    <>
      <StepHead
        step={1}
        title="Über dich"
        description="Drei Fragen — danach geht's weiter."
      />

      <Section title="Deine Rolle">
        <ToggleGroup
          spacing={1}
          type="single"
          value={state.role ?? ""}
          onValueChange={(v) => v && onChange({ ...state, role: v })}
          className="flex w-full flex-wrap gap-2"
        >
          {ROLES.map((r) => (
            <ToggleGroupItem
              key={r.v}
              value={r.v}
              variant="outline"
              className={PILL_TOGGLE}
            >
              {r.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Section>

      <Section title="Branche">
        <ToggleGroup
          spacing={1}
          type="single"
          value={state.businessType ?? ""}
          onValueChange={(v) => v && onChange({ ...state, businessType: v })}
          className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {BUSINESS_TYPES.map((b) => (
            <ToggleGroupItem
              key={b.v}
              value={b.v}
              variant="outline"
              className={cn(CARD_TOGGLE, "items-start")}
            >
              <span className="flex flex-1 flex-col items-start text-left leading-tight">
                <span className="text-[13.5px] font-semibold">{b.title}</span>
                <span className="mt-0.5 text-[11.5px] font-normal text-muted-foreground">{b.desc}</span>
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Section>

      <Section title="Team-Größe">
        <ToggleGroup
          spacing={1}
          type="single"
          value={state.teamSize ?? ""}
          onValueChange={(v) => v && onChange({ ...state, teamSize: v })}
          className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {TEAM_SIZES.map((t) => (
            <ToggleGroupItem
              key={t.v}
              value={t.v}
              variant="outline"
              className={cn(COMPACT_TOGGLE, "h-11")}
            >
              <span className="text-[13.5px] font-semibold">{t.label}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Section>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   STEP 2 — Ziel
   ══════════════════════════════════════════════════════════════ */
function StepGoal({ state, onChange }: { state: OnboardingState; onChange: (s: OnboardingState) => void }) {
  return (
    <>
      <StepHead
        step={2}
        title="Dein Ziel"
        description="Was willst du erreichen?"
      />

      <Section title="Worauf zielst du in den nächsten 30 Tagen?">
        <ToggleGroup
          spacing={1}
          type="single"
          value={state.primaryGoal ?? ""}
          onValueChange={(v) => v && onChange({ ...state, primaryGoal: v })}
          className="grid w-full grid-cols-1 gap-2"
        >
          {GOALS.map((g) => (
            <ToggleGroupItem
              key={g.v}
              value={g.v}
              variant="outline"
              className={CARD_TOGGLE}
            >
              <span className="flex-1 text-left text-[13.5px] font-medium">{g.title}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Section>

      <Section title="Wie viele Cold-Mails pro Monat?" hint="Bestimmt die Plan-Empfehlung">
        <ToggleGroup
          spacing={1}
          type="single"
          value={state.monthlyVolume ?? ""}
          onValueChange={(v) => v && onChange({ ...state, monthlyVolume: v })}
          className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {VOLUMES.map((vol) => (
            <ToggleGroupItem
              key={vol.v}
              value={vol.v}
              variant="outline"
              className={cn(COMPACT_TOGGLE, "h-auto py-3 gap-0.5")}
            >
              <span className="text-[13px] font-semibold">{vol.label}</span>
              <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{vol.sub}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Section>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   STEP 3 — Zielgruppe
   ══════════════════════════════════════════════════════════════ */
function StepTarget({ state, onChange }: { state: OnboardingState; onChange: (s: OnboardingState) => void }) {
  const estimate = useMemo(() => {
    if (state.countries.length === 0 || state.industries.length === 0) return 0;
    const perCountry = state.countries.reduce(
      (sum, c) => sum + (LEADS_PER_INDUSTRY_PER_COUNTRY[c] ?? 0),
      0,
    );
    return perCountry * state.industries.length;
  }, [state.countries, state.industries]);

  return (
    <>
      <StepHead
        step={3}
        title="Zielgruppe"
        description="Region und Branchen wählen."
      />

      <Section title="Länder" hint="mehrere möglich">
        <ToggleGroup
          spacing={1}
          type="multiple"
          value={state.countries}
          onValueChange={(v) => onChange({ ...state, countries: v })}
          className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3"
        >
          {COUNTRIES.map((c) => (
            <ToggleGroupItem
              key={c.v}
              value={c.v}
              variant="outline"
              className={cn(COMPACT_TOGGLE, "h-11 text-[13.5px] font-semibold")}
            >
              {c.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Section>

      <Section title="Branchen" hint={`${state.industries.length} ausgewählt`}>
        <ToggleGroup
          spacing={1}
          type="multiple"
          value={state.industries}
          onValueChange={(v) => onChange({ ...state, industries: v })}
          className="flex w-full flex-wrap gap-2"
        >
          {TARGET_INDUSTRIES.map((i) => (
            <ToggleGroupItem
              key={i}
              value={i}
              variant="outline"
              className={PILL_TOGGLE}
            >
              {i}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Section>

      {estimate > 0 && (
        <Card className="rounded-xl border-primary/30 bg-primary/[0.03] shadow-none">
          <CardContent className="flex items-baseline justify-between gap-4 px-5 py-4">
            <div>
              <div className="text-[22px] font-bold tracking-[-0.02em] leading-none text-primary tabular-nums">
                ca. {estimate.toLocaleString("de-DE")}
              </div>
              <div className="mt-1 text-[12.5px] font-medium text-foreground">
                adressierbare Firmen in deiner Zielgruppe
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Wir finden sie für dich — über Google Places, Web-Scraping und LinkedIn.
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   STEP 4 — Mailbox (Intent — final-Auth in Settings)
   ══════════════════════════════════════════════════════════════ */
function StepMailbox({ state, onChange }: { state: OnboardingState; onChange: (s: OnboardingState) => void }) {
  return (
    <>
      <StepHead
        step={4}
        title="Mailbox"
        description="Womit verschickst du?"
      />

      <ToggleGroup
        spacing={1}
        type="single"
        value={state.mailboxProvider ?? ""}
        onValueChange={(v) => onChange({ ...state, mailboxProvider: v || null })}
        className="grid w-full grid-cols-1 gap-2"
      >
        {PROVIDERS.map((p) => (
          <ToggleGroupItem
            key={p.v}
            value={p.v}
            variant="outline"
            className={cn(CARD_TOGGLE, "py-4 items-center")}
          >
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card shrink-0">
              <p.Logo size={22} />
            </span>
            <span className="flex flex-1 flex-col items-start text-left leading-tight">
              <span className="text-[14px] font-semibold">{p.name}</span>
              <span className="mt-0.5 text-[12px] font-normal text-muted-foreground">{p.desc}</span>
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <p className="mt-4 text-center text-[12px] text-muted-foreground">
        Final verbunden wird nach dem Plan-Setup — direkt in den Einstellungen.
      </p>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   STEP 5 — Plan (4 Pläne inkl. Enterprise + Tooltips pro Feature)
   ══════════════════════════════════════════════════════════════ */

interface PlanFeature { label: string; info?: string }

interface PlanCard {
  v:           string;
  name:        string;
  price:       string;
  priceSub:    string;
  blurb:       string;
  features:    PlanFeature[];
  recommended?: boolean;
  cta:         "checkout" | "contact";
}

const PLAN_CARDS: PlanCard[] = [
  {
    v:        PRICING_PLANS.solo.key,
    name:     PRICING_PLANS.solo.name,
    price:    `€ ${PRICING_PLANS.solo.priceEur}`,
    priceSub: "/ Monat",
    blurb:    "Für Solo-Selbstständige & Freelancer.",
    cta:      "checkout",
    features: [
      { label: "2.000 Credits pro Monat",
        info: "Mit Credits bezahlst du Aktionen im Dashboard:\n• 1 Firma finden = 1 Credit\n• 1 Firma anreichern (Inhaber, Webseite, E-Mail) = 2 Credits\n• 1 individuell geschriebene Mail = 1 Credit\n• 1 LinkedIn-Aktion = 3 Credits\n\nBeispiel: 2.000 Credits reichen ca. für 500 gefundene Firmen + 500 personalisierte Mails." },
      { label: "1 Nutzer",
        info: "Ein Login fürs Dashboard. Reicht wenn du alleine arbeitest." },
      { label: "2 verbundene Mail-Postfächer",
        info: "Du kannst 2 Mail-Konten anhängen (z.B. Gmail oder Outlook). Das System verteilt die Sendungen automatisch und erhöht die Sende-Menge schrittweise, damit deine Mails im Posteingang landen statt im Spam." },
      { label: "Firmen-Suche in AT, DE, CH",
        info: "Du gibst Branche, Region und Größe an — wir suchen passende Firmen über Google und das Web. Du bekommst Firmenname, Adresse, Webseite, Telefon und meist die Geschäfts-E-Mail. Wir haben keine fertige Datenbank, sondern jede Suche ist frisch und aktuell." },
      { label: "Mails werden individuell geschrieben",
        info: "Statt dass du jede Mail manuell tippst, schreibt unsere AI für jeden Empfänger eine eigene, persönliche Mail — basierend auf der Webseite und Branche des Empfängers. Klingt nicht wie Massen-Spam." },
      { label: "Du siehst wer öffnet und antwortet",
        info: "Pro Mail siehst du im Dashboard: Geöffnet (ja/nein), wann zum ersten Mal, wer geantwortet hat. Antworten landen direkt in deiner echten Inbox." },
      { label: "E-Mail-Support",
        info: "Schreib uns auf info@ki-kanzlei.at — Antwort innerhalb von 24h an Werktagen." },
    ],
  },
  {
    v:        PRICING_PLANS.growth.key,
    name:     PRICING_PLANS.growth.name,
    price:    `€ ${PRICING_PLANS.growth.priceEur}`,
    priceSub: "/ Monat",
    blurb:    "Für Teams, die regelmäßig Outreach machen.",
    recommended: true,
    cta:      "checkout",
    features: [
      { label: "6.000 Credits pro Monat",
        info: "Dreimal mehr Volumen als Solo. Reicht für ca. 1.500 gefundene Firmen + 1.500 personalisierte Mails + 250 LinkedIn-Aktionen pro Monat." },
      { label: "Bis zu 3 Nutzer im Team",
        info: "Du und 2 Kolleg:innen können gleichzeitig im selben Workspace arbeiten." },
      { label: "5 Mail-Postfächer mit Rotation",
        info: "Du kannst 5 Mail-Konten anhängen. Das System sendet automatisch über verschiedene Postfächer — verteilt das Sende-Volumen und schützt die Zustellbarkeit." },
      { label: "LinkedIn-Outreach (1 Konto)",
        info: "Du kannst dein LinkedIn-Konto anschließen und Connection-Anfragen + Nachrichten direkt aus dem Dashboard verschicken. Wie Email, nur über LinkedIn." },
      { label: "Automatische Folge-Mails",
        info: "Wenn jemand nicht auf deine erste Mail antwortet, schickt das System automatisch eine zweite, dritte und vierte (bis zu 5 Stück) — mit Pausen dazwischen. Sobald jemand antwortet, hört es sofort auf." },
      { label: "Verschiedene Mail-Versionen testen (A/B)",
        info: "Du kannst 2-3 verschiedene Betreffzeilen oder Texte parallel ausprobieren. Nach genug Sendungen siehst du, welche besser funktioniert, und das System verwendet automatisch die bessere Version." },
      { label: "Priority-Support (4h)",
        info: "Wir antworten innerhalb von 4 Stunden an Werktagen. Bei Bedarf eigener Slack-Kanal mit unserem Team." },
    ],
  },
  {
    v:        PRICING_PLANS.scale.key,
    name:     PRICING_PLANS.scale.name,
    price:    `€ ${PRICING_PLANS.scale.priceEur}`,
    priceSub: "/ Monat",
    blurb:    "Für Agenturen & Power-User.",
    cta:      "checkout",
    features: [
      { label: "18.000 Credits pro Monat",
        info: "Großes Volumen-Paket. Reicht für ca. 5.000 gefundene Firmen + 5.000 Mails + 1.000 LinkedIn-Aktionen pro Monat." },
      { label: "Beliebig viele Nutzer",
        info: "Keine Begrenzung auf Team-Größe — alle Kolleg:innen haben Zugriff auf den Workspace." },
      { label: "Beliebig viele Mail-Postfächer",
        info: "Hänge so viele Mail-Konten an wie du brauchst. Ideal für Agenturen mit mehreren Sender-Profilen." },
      { label: "LinkedIn-Outreach (3 Konten)",
        info: "Bis zu 3 LinkedIn-Accounts parallel — z.B. mehrere Personas oder verschiedene Team-Mitglieder, die parallel Outreach machen." },
      { label: "Eigene Tracking-Domain",
        info: "Normalerweise läuft das Tracking-Pixel über unsere Domain. Mit eigener Tracking-Domain (z.B. mail.deinefirma.at) wirken deine Mails seriöser und landen häufiger im Posteingang statt im Spam." },
      { label: "API-Zugang für eigene Tools",
        info: "Du kannst dein eigenes CRM, Zapier, Make oder andere Tools mit unserem System verbinden. Bei jeder Öffnung, Antwort oder einem Bounce kannst du automatisch etwas auslösen." },
      { label: "Persönlicher Ansprechpartner",
        info: "Du bekommst einen festen Account Manager bei uns — Check-ins alle 2 Wochen, hilft bei Strategie und Optimierung." },
      { label: "24h-Antwortgarantie",
        info: "Wenn du Support brauchst: maximal 24h Wartezeit auf eine erste Antwort — auch am Wochenende bei kritischen Issues." },
    ],
  },
  {
    v:        "enterprise",
    name:     "Enterprise",
    price:    "Custom",
    priceSub: "auf Anfrage",
    blurb:    "Für große Volumen und Konzerne.",
    cta:      "contact",
    features: [
      { label: "Ab 50.000 Credits pro Monat",
        info: "Individuelles Volumen-Paket. Sag uns, wie viel du brauchst — wir machen dir ein Angebot." },
      { label: "Alles ohne Limits",
        info: "Nutzer, Postfächer, LinkedIn-Konten, API-Anfragen — alles nach deinem Bedarf, keine harten Grenzen." },
      { label: "Single-Sign-On (SSO)",
        info: "Deine Mitarbeiter logen sich mit dem firmeneigenen Microsoft- oder Google-Konto ein, kein extra Passwort nötig. Standard in größeren Unternehmen." },
      { label: "White-Label",
        info: "Das Dashboard läuft unter deiner eigenen Domain, mit deinem Logo. Sieht aus als wär's deine Software." },
      { label: "Datenschutzvertrag + Compliance",
        info: "Wir unterzeichnen den Auftragsverarbeitungsvertrag (DSGVO Art. 28) und liefern Audit-Dokumente. Wichtig für rechtssichere Datenverarbeitung in größeren Firmen." },
      { label: "Eigene Verfügbarkeits-Garantie",
        info: "Individuell verhandelte Service-Level-Agreements für Uptime und Antwortzeiten." },
      { label: "Onboarding-Workshop + Quartals-Reviews",
        info: "Wir setzen dein Team gemeinsam auf, kommen alle 3 Monate für eine Strategie-Session ins Haus oder digital." },
    ],
  },
];

function FeatureRow({ label, info }: PlanFeature) {
  return (
    <li className="flex items-start gap-2 text-[12.5px] leading-snug">
      <Check className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" strokeWidth={2.5} />
      <span className="flex-1">{label}</span>
      {info && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/60 hover:text-primary transition-colors"
              aria-label={`Mehr zu: ${label}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Info className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[280px] text-[11.5px] leading-relaxed whitespace-pre-line">
            {info}
          </TooltipContent>
        </Tooltip>
      )}
    </li>
  );
}

function StepPlan({
  state, onChange,
}: { state: OnboardingState; onChange: (s: OnboardingState) => void; }) {
  return (
    <>
      <StepHead
        step={5}
        title="Plan wählen"
        description="Jederzeit kündbar. Keine Mindestlaufzeit."
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {PLAN_CARDS.map((plan) => {
          const isRecommended = plan.recommended === true;
          const isSelected = state.planIntent === plan.v;
          return (
            <Card
              key={plan.v}
              className={cn(
                "relative flex flex-col cursor-pointer rounded-xl border shadow-none transition-colors",
                "hover:border-foreground/40",
                isSelected && "border-primary hover:border-primary",
                isRecommended && !isSelected && "border-primary/50",
              )}
              onClick={() => onChange({ ...state, planIntent: plan.v })}
            >
              {isRecommended && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-primary-foreground">
                  Empfohlen
                </span>
              )}
              <CardHeader className="pb-3">
                <CardTitle className="text-[17px] font-semibold tracking-tight">
                  {plan.name}
                </CardTitle>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-[24px] font-bold tracking-[-0.02em] leading-none">{plan.price}</span>
                  <span className="text-[12px] text-muted-foreground">{plan.priceSub}</span>
                </div>
                <CardDescription className="text-[12.5px] mt-1.5">
                  {plan.blurb}
                </CardDescription>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4 pb-3">
                <ul className="space-y-1.5">
                  {plan.features.map((f) => (
                    <FeatureRow key={f.label} label={f.label} info={f.info} />
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  variant={isSelected ? "default" : "outline"}
                  className="w-full h-9 rounded-lg text-[13px] shadow-none"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange({ ...state, planIntent: plan.v });
                  }}
                >
                  {isSelected ? "Ausgewählt" : `${plan.name} wählen`}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 text-center text-[11.5px] text-muted-foreground">
        Alle Preise zzgl. MwSt · jederzeit kündbar · keine Mindestlaufzeit
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   STEP 6 — Done (Free-Tier-Fallback; bei Paid → direkt Stripe)
   ══════════════════════════════════════════════════════════════ */
function StepDone() {
  const router = useRouter();
  return (
    <div className="text-center py-8">
      <div className="relative mx-auto mb-6 grid h-[88px] w-[88px] place-items-center rounded-full bg-emerald-50 text-emerald-600">
        <Check className="h-9 w-9" strokeWidth={3} />
      </div>
      <h1 className="m-0 mb-2 text-[28px] font-semibold tracking-[-0.025em] leading-tight">
        Setup abgeschlossen
      </h1>
      <p className="m-0 mx-auto mb-6 max-w-[420px] text-[14px] text-muted-foreground leading-[1.55]">
        Dein Workspace ist eingerichtet.
      </p>
      <Button
        size="lg"
        className="rounded-lg gap-2 px-7"
        onClick={() => { router.push("/dashboard"); router.refresh(); }}
      >
        Zum Dashboard
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Page shell
   ══════════════════════════════════════════════════════════════ */

export default function OnboardingPage() {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [maxReached, setMaxReached] = useState(0); // höchster bisher erreichter Step (für Forward-Block)
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<OnboardingState>(INITIAL);

  /* Plan-Empfehlung basierend auf Volumen */
  const recommendedPlan = useMemo(() => {
    switch (state.monthlyVolume) {
      case "lt500":       return "solo";
      case "500-2500":    return "growth";
      case "2500-10000":  return "scale";
      case "gt10000":     return "enterprise";
      default:            return "growth";
    }
  }, [state.monthlyVolume]);

  /* Auto-preselect recommended plan beim Erreichen vom Plan-Step */
  useEffect(() => {
    if (current === 4 && !state.planIntent) {
      setState((s) => ({ ...s, planIntent: recommendedPlan }));
    }
  }, [current, recommendedPlan, state.planIntent]);

  const STEP_VALID: boolean[] = [
    Boolean(state.role && state.businessType && state.teamSize),
    Boolean(state.primaryGoal && state.monthlyVolume),
    state.countries.length > 0 && state.industries.length > 0,
    true, // mailbox optional
    Boolean(state.planIntent),
  ];

  const isLastStep = current === STEPS.length - 1;

  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [current]);

  async function persistAndCheckout() {
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        toast.error("Bitte melde dich erneut an.");
        router.push("/login");
        return;
      }

      const companyName = (user.user_metadata?.company_name as string | undefined) ?? "";
      const planKey = state.planIntent;
      if (!planKey) {
        toast.error("Bitte wähle einen Plan.");
        return;
      }

      const onboardingSnapshot = {
        onboarded_at:        new Date().toISOString(),
        role:                state.role,
        business_type:       state.businessType,
        team_size:           state.teamSize,
        primary_goal:        state.primaryGoal,
        monthly_volume:      state.monthlyVolume,
        countries:           state.countries,
        industries:          state.industries,
        mailbox_intent:      state.mailboxProvider,
        plan_intent:         planKey,
      };

      await supabase.auth.updateUser({
        data: {
          onboarding:          onboardingSnapshot,
          onboarded_at:        onboardingSnapshot.onboarded_at,
          subscription_status: "pending_checkout",
          plan_intent:         planKey,
        },
      });

      const defaultCountry = state.countries[0] ?? "AT";
      await supabase
        .from("user_settings")
        .upsert({
          user_id: user.id,
          lead_settings: {
            default_country:    defaultCountry,
            default_countries:  state.countries,
            default_industries: state.industries,
            default_status:     "new",
          },
          brand_settings: {
            company_name:     companyName,
            role:             state.role ?? undefined,
            business_type:    state.businessType ?? undefined,
            team_size:        state.teamSize ?? undefined,
            primary_goal:     state.primaryGoal ?? undefined,
            monthly_volume:   state.monthlyVolume ?? undefined,
            plan_intent:      planKey,
            plan_selected_at: new Date().toISOString(),
          },
        }, { onConflict: "user_id" });

      // Enterprise → kein Stripe-Checkout, stattdessen Sales-Mail mit Onboarding-Daten
      if (planKey === "enterprise") {
        const subject = encodeURIComponent("Enterprise-Plan Anfrage — Onboarding abgeschlossen");
        const lines = [
          `Hallo KI Kanzlei,`,
          ``,
          `ich habe das Onboarding abgeschlossen und interessiere mich für den Enterprise-Plan:`,
          ``,
          `- Rolle: ${state.role ?? "—"}`,
          `- Business-Typ: ${state.businessType ?? "—"}`,
          `- Team-Größe: ${state.teamSize ?? "—"}`,
          `- Ziel: ${state.primaryGoal ?? "—"}`,
          `- Volumen: ${state.monthlyVolume ?? "—"} Mails/Monat`,
          `- Länder: ${state.countries.join(", ")}`,
          `- Branchen: ${state.industries.join(", ")}`,
          `- Mailbox-Setup: ${state.mailboxProvider ?? "noch offen"}`,
          ``,
          `Bitte meldet euch zur Abstimmung von Volumen und Vertragsbedingungen.`,
          ``,
          `Beste Grüße`,
        ].join("\n");
        window.location.href = `mailto:info@ki-kanzlei.at?subject=${subject}&body=${encodeURIComponent(lines)}`;
        return;
      }

      const checkoutRes = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planKey }),
      });
      if (checkoutRes.ok) {
        const { url } = await checkoutRes.json();
        if (url) { window.location.href = url; return; }
      }
      // Checkout API hat keinen URL geliefert — auf Plan-Step bleiben und Toast zeigen
      const errJson = await checkoutRes.json().catch(() => null);
      toast.error(errJson?.error ?? "Checkout konnte nicht gestartet werden. Bitte versuche es nochmal.");
    } catch (err) {
      console.error("[onboarding] persist:", err);
      toast.error("Verbindung fehlgeschlagen. Bitte prüfe deine Internetverbindung und versuche es nochmal.");
    } finally {
      setSaving(false);
    }
  }

  function next() {
    if (current === STEPS.length - 2) {
      void persistAndCheckout();
    } else if (current < STEPS.length - 1) {
      const target = current + 1;
      setCurrent(target);
      setMaxReached((m) => Math.max(m, target));
    }
  }
  function prev() {
    if (current > 0) setCurrent(current - 1);
  }
  function jumpTo(idx: number) {
    // Nur zurück springen — niemals nach vorne (außer via "Weiter")
    if (idx <= maxReached && idx < current) setCurrent(idx);
  }
  function skip() {
    // "Überspringen" = direkt zur Plan-Auswahl springen (Schritt 5).
    // Keine extra Seite, keine Magic — User landet im selben Funnel an Step 5.
    if (current >= 4) return;
    setCurrent(4);
    setMaxReached((m) => Math.max(m, 4));
  }

  const progressPct = (current / (STEPS.length - 1)) * 100;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-4 sm:px-8">
        <div className="flex items-center gap-2.5 text-[14px] font-semibold">
          <Image
            src="/images/KI-Kanzlei_Logo_2026.png"
            alt="KI Kanzlei"
            width={64}
            height={64}
            quality={100}
            className="h-8 w-8 rounded-md object-contain"
            priority
          />
          <span>KI Kanzlei</span>
        </div>
        <div className="flex items-center gap-4 text-[12.5px] text-muted-foreground">
          <span className="hidden sm:inline">
            Fragen?{" "}
            <Link href="mailto:info@ki-kanzlei.at" className="text-primary font-medium hover:underline">
              info@ki-kanzlei.at
            </Link>
          </span>
          {!isLastStep && current < 4 && (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-muted-foreground hover:text-foreground"
              onClick={skip}
            >
              Zur Plan-Auswahl
            </Button>
          )}
        </div>
      </header>

      {/* Progress strip — klickbar nach hinten, abgeschlossen blau */}
      {!isLastStep && (
        <div className="border-b border-border bg-card px-6 py-4 sm:px-8">
          <div className="mx-auto flex max-w-[760px] items-center gap-2">
            {STEPS.slice(0, -1).map((s, idx) => {
              const isDone   = idx < current;            // ist abgeschlossen
              const isActive = idx === current;
              const canGoBack = idx < current;           // nur zurück erlaubt
              return (
                <div key={s.k} className="flex flex-1 items-center gap-2">
                  <button
                    type="button"
                    disabled={!canGoBack}
                    onClick={() => jumpTo(idx)}
                    className={cn(
                      "group grid h-7 w-7 place-items-center rounded-full border text-[11.5px] font-semibold transition-all shrink-0",
                      isActive && "bg-primary border-primary text-primary-foreground ring-4 ring-primary/15",
                      isDone   && "bg-primary border-primary text-primary-foreground cursor-pointer hover:opacity-80",
                      !isActive && !isDone && "bg-card border-border text-muted-foreground cursor-not-allowed",
                    )}
                    aria-label={`Schritt ${idx + 1}: ${s.label}`}
                  >
                    {isDone ? <Check className="h-3 w-3" strokeWidth={2.5} /> : idx + 1}
                  </button>
                  <button
                    type="button"
                    disabled={!canGoBack}
                    onClick={() => jumpTo(idx)}
                    className={cn(
                      "hidden text-[12.5px] font-medium sm:inline whitespace-nowrap transition-colors",
                      isActive && "text-foreground font-semibold",
                      isDone   && "text-primary cursor-pointer hover:underline",
                      !isActive && !isDone && "text-muted-foreground cursor-not-allowed",
                    )}
                  >
                    {s.label}
                  </button>
                  {idx < STEPS.length - 2 && (
                    <div className={cn(
                      "ml-1 h-px flex-1 rounded-full",
                      idx < current ? "bg-primary" : "bg-border",
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 items-start justify-center px-4 py-10 sm:px-8">
        <div className={cn(
          "w-full",
          current === 4 ? "max-w-[1200px]" : "max-w-[560px]",
        )}>
          {current === 0 && <StepProfile state={state} onChange={setState} />}
          {current === 1 && <StepGoal    state={state} onChange={setState} />}
          {current === 2 && <StepTarget  state={state} onChange={setState} />}
          {current === 3 && <StepMailbox state={state} onChange={setState} />}
          {current === 4 && <StepPlan    state={state} onChange={setState} />}
          {current === 5 && <StepDone />}
        </div>
      </div>

      {/* Sticky footer */}
      {!isLastStep && (
        <div className="sticky bottom-0 border-t border-border bg-card/90 backdrop-blur px-6 py-4 sm:px-8">
          <div className="mx-auto flex max-w-[760px] items-center gap-3">
            <Button
              variant="outline"
              onClick={prev}
              disabled={current === 0}
              className="rounded-lg gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Zurück
            </Button>

            <div className="ml-auto flex items-center gap-3">
              <div className="hidden items-center gap-2 sm:flex">
                <div className="w-[140px] h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="text-[12px] text-muted-foreground tabular-nums">
                  {current + 1} / {STEPS.length - 1}
                </span>
              </div>

              {current === STEPS.length - 2 ? (
                <Button
                  onClick={next}
                  disabled={!STEP_VALID[current] || saving}
                  className="rounded-lg gap-1.5"
                >
                  {saving ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Wird gespeichert …</>
                  ) : state.planIntent === "enterprise" ? (
                    <>Anfrage senden <Mail className="h-3.5 w-3.5" /></>
                  ) : (
                    <>Zur Bezahlung <ArrowRight className="h-3.5 w-3.5" /></>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={next}
                  disabled={!STEP_VALID[current]}
                  className="rounded-lg gap-1.5"
                >
                  Weiter <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
