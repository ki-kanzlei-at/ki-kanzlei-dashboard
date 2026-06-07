/* ── Pricing-Pläne (Single Source of Truth) ──
 *
 * Wenn du Preise oder Credits änderst, hier UND im Stripe Dashboard anpassen.
 * STRIPE_PRICE_* Env-Vars halten die Stripe-Price-IDs (zu finden in jedem
 * Product → Pricing-Tab).
 */

export type PlanKey = "solo" | "growth" | "scale" | "enterprise";
export type CreditPackKey = "small" | "medium" | "large";

export interface PlanDef {
  key:            PlanKey;
  name:           string;
  priceEur:       number;          // brutto monatlich
  cadence:        "monthly";
  credits:        number;          // pro Monat
  seats:          number | "unlimited";
  mailboxes:      number | "unlimited";
  features:       string[];
  blurb:          string;
  recommended?:   boolean;
  ctaLabel:       string;
  stripePriceEnv: string;          // Env-Var-Name (NICHT die ID hier hardcoden)
}

export const PLANS: Record<Exclude<PlanKey, "enterprise">, PlanDef> = {
  solo: {
    key: "solo",
    name: "Solo",
    priceEur: 199,
    cadence: "monthly",
    credits: 2_000,
    seats: 1,
    mailboxes: 2,
    blurb: "Für Solo-Selbstständige & Freelancer, die jetzt ihren Outbound starten.",
    features: [
      "2.000 Credits / Monat",
      "1 Seat · 2 Mailboxen",
      "KI-personalisierte Mails",
      "Lead-Discovery (Google Places)",
      "Open- & Reply-Tracking",
      "Standard Email-Support",
    ],
    ctaLabel: "Solo wählen",
    stripePriceEnv: "STRIPE_PRICE_SOLO",
  },
  growth: {
    key: "growth",
    name: "Growth",
    priceEur: 499,
    cadence: "monthly",
    credits: 6_000,
    seats: 5,
    mailboxes: 10,
    blurb: "Für Teams, die Outreach skalieren und LinkedIn dazunehmen.",
    features: [
      "6.000 Credits / Monat",
      "5 Seats · 10 Mailboxen",
      "Alles aus Solo",
      "LinkedIn-Outreach (Unipile)",
      "A/B-Tests & Sequenzen",
      "SEO-Posts (10/Monat)",
      "Priority Support (4h)",
    ],
    recommended: true,
    ctaLabel: "Growth wählen",
    stripePriceEnv: "STRIPE_PRICE_GROWTH",
  },
  scale: {
    key: "scale",
    name: "Scale",
    priceEur: 1_199,
    cadence: "monthly",
    credits: 18_000,
    seats: "unlimited",
    mailboxes: "unlimited",
    blurb: "Für aggressive Pipeline-Builder und Agenturen mit eigenem Vertriebsteam.",
    features: [
      "18.000 Credits / Monat",
      "Unbegrenzte Seats & Mailboxen",
      "Alles aus Growth",
      "Custom Tracking-Domains",
      "Social-Media Auto-Publish",
      "API-Zugang",
      "Dedizierter Account Manager",
      "24h Response SLA",
    ],
    ctaLabel: "Scale wählen",
    stripePriceEnv: "STRIPE_PRICE_SCALE",
  },
};

/* Top-Up-Packs (One-Time-Purchase über Stripe) */
export interface CreditPackDef {
  key:            CreditPackKey;
  name:           string;
  credits:        number;
  priceEur:       number;
  stripePriceEnv: string;
}

export const CREDIT_PACKS: Record<CreditPackKey, CreditPackDef> = {
  small:  { key: "small",  name: "1.000 Credits",  credits:  1_000, priceEur:   149, stripePriceEnv: "STRIPE_PRICE_PACK_SMALL"  },
  medium: { key: "medium", name: "5.000 Credits",  credits:  5_000, priceEur:   599, stripePriceEnv: "STRIPE_PRICE_PACK_MEDIUM" },
  large:  { key: "large",  name: "15.000 Credits", credits: 15_000, priceEur: 1_499, stripePriceEnv: "STRIPE_PRICE_PACK_LARGE"  },
};

/* ── Credit-Kosten pro Action ── */
export const CREDIT_COSTS = {
  lead_discover:    1,
  lead_enrich:      2,
  lead_research:    2,    // AI-Researcher: eine Firmen-Recherche (Overview + Quellen)
  lead_chat:        2,    // AI-Researcher: jede Chat-Frage / LinkedIn-Suche (pro AI-Call)
  mail_generate:    1,
  mail_send:        0,    // nur Versand ohne neue AI-Generation — gratis
  linkedin_action:  3,
  seo_post:        15,
  seo_post_image:  20,
  social_post:      5,
} as const;
export type CreditAction = keyof typeof CREDIT_COSTS;

export function getPlanByKey(key: string): PlanDef | null {
  if (key in PLANS) return PLANS[key as keyof typeof PLANS];
  return null;
}

export function getStripePriceId(envName: string): string | null {
  return process.env[envName] ?? null;
}
