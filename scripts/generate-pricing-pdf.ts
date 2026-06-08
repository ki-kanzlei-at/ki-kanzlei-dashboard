/* ── Generiert docs/pricing-overview.pdf via Playwright ──
 *
 * Run: npx tsx scripts/generate-pricing-pdf.ts
 *
 * Quellen für die Zahlen (Stand Mai 2026):
 *   - ConnectSafely: $10/Monat pro verbundenem LinkedIn-Konto (flat, unlimited API)
 *   - Google Places API Text Search Pro: $17/1.000 Calls
 *   - Gemini 2.5 Flash: $0.30/1M input, $2.50/1M output
 *   - Supabase Pro: $25/Monat + Overages
 *   - Stripe EU: ~1.5% + €0.25 pro Transaktion
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const OUT_HTML = resolve(__dirname, "../docs/pricing-overview.html");
const OUT_PDF  = resolve(__dirname, "../docs/pricing-overview.pdf");

const html = String.raw`<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>KI Kanzlei Outreach — Pricing & Kostenrechnung (MVP)</title>
<style>
  :root {
    --primary:#2563eb;
    --primary-light:#eff6ff;
    --foreground:#0f172a;
    --muted:#64748b;
    --border:#e2e8f0;
    --border-strong:#cbd5e1;
    --success:#059669;
    --bg-soft:#f8fafc;
  }
  * { box-sizing:border-box; }
  html, body { margin:0; padding:0; font-family:'Inter', -apple-system, system-ui, sans-serif; color:var(--foreground); font-size:11px; line-height:1.5; }
  @page { size: A4; margin: 18mm 14mm; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  h1 { font-size:22px; font-weight:600; letter-spacing:-0.02em; margin:0 0 4px; }
  h2 { font-size:15px; font-weight:600; letter-spacing:-0.01em; margin:18px 0 8px; color:var(--foreground); }
  h3 { font-size:12px; font-weight:600; margin:14px 0 6px; }
  p { margin:0 0 8px; color:var(--muted); }
  p.lead { font-size:12px; color:var(--foreground); }
  b, strong { color:var(--foreground); }
  small { color:var(--muted); font-size:10px; }
  .badge { display:inline-block; padding:2px 8px; border-radius:99px; font-size:9.5px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; background:var(--primary-light); color:var(--primary); }
  .cover { text-align:center; padding:80px 20px 0; }
  .cover .logo { font-size:13px; font-weight:600; letter-spacing:-0.005em; margin-bottom:80px; }
  .cover .logo .sub { color:var(--muted); font-weight:400; font-size:11px; }
  .cover h1 { font-size:32px; margin-bottom:12px; }
  .cover .lead { font-size:14px; max-width:480px; margin:0 auto 32px; color:var(--muted); }
  .cover .meta { display:flex; justify-content:center; gap:36px; margin-top:60px; font-size:10px; color:var(--muted); }
  .cover .meta b { display:block; font-size:13px; color:var(--foreground); font-weight:600; margin-bottom:2px; }

  table { width:100%; border-collapse:collapse; margin:10px 0; font-size:10.5px; }
  th, td { padding:8px 10px; text-align:left; border-bottom:1px solid var(--border); vertical-align:top; }
  th { font-size:9.5px; text-transform:uppercase; letter-spacing:0.04em; font-weight:600; color:var(--muted); background:var(--bg-soft); }
  td.num { text-align:right; font-variant-numeric:tabular-nums; }
  tr.total td { font-weight:600; border-top:2px solid var(--border-strong); border-bottom:none; padding-top:10px; }

  .grid { display:grid; gap:10px; }
  .grid-3 { grid-template-columns:repeat(3, 1fr); }
  .plan {
    border:1px solid var(--border); border-radius:8px; padding:14px 16px; background:white;
    display:flex; flex-direction:column;
  }
  .plan.is-rec { border-color:var(--primary); box-shadow:0 0 0 2px rgba(37, 99, 235, 0.08); }
  .plan h3 { margin:0 0 6px; font-size:15px; }
  .plan .price { font-size:22px; font-weight:700; letter-spacing:-0.02em; line-height:1; }
  .plan .price small { font-size:10px; font-weight:400; color:var(--muted); margin-left:2px; }
  .plan .blurb { font-size:10px; color:var(--muted); min-height:30px; margin:6px 0 10px; }
  .plan ul { list-style:none; padding:0; margin:0; font-size:10px; }
  .plan li { padding:3px 0 3px 14px; position:relative; color:var(--foreground); }
  .plan li::before { content:"✓"; color:var(--success); position:absolute; left:0; font-weight:700; }

  .callout { padding:10px 12px; border-radius:6px; background:var(--primary-light); border-left:3px solid var(--primary); margin:12px 0; font-size:10.5px; }
  .callout b { display:block; margin-bottom:2px; color:var(--foreground); }

  .footer { font-size:9px; color:var(--muted); text-align:center; margin-top:24px; padding-top:8px; border-top:1px solid var(--border); }

  .stat-row { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin:10px 0; }
  .stat { padding:10px 12px; background:var(--bg-soft); border-radius:6px; }
  .stat .v { font-size:18px; font-weight:600; letter-spacing:-0.02em; }
  .stat .l { font-size:9.5px; color:var(--muted); margin-top:2px; }
</style>
</head>
<body>

<!-- ═══════════════════ COVER ═══════════════════ -->
<section class="page cover">
  <div class="logo">KI Kanzlei <span class="sub">· Outreach Plattform</span></div>
  <span class="badge">Internal · v1 · MVP-Pricing</span>
  <h1 style="margin-top:14px">Pricing &amp; Kostenrechnung</h1>
  <p class="lead">Hochpreisige SaaS-Pricing-Struktur mit Credit-System für die KI Kanzlei Outreach Plattform — MVP-Scope: Leads, Email-Campaigns, LinkedIn (ConnectSafely).</p>
  <div class="meta">
    <div><b>3 Pläne</b> Solo · Growth · Scale</div>
    <div><b>€199 – €1.199</b> /Monat</div>
    <div><b>≥87% Marge</b> bei jedem Plan</div>
  </div>
  <div class="footer" style="position:absolute; bottom:20mm; left:0; right:0; border:none;">
    Stand: ${new Date().toLocaleDateString("de-AT", { year: "numeric", month: "long", day: "numeric" })} · Vertraulich · Nur intern
  </div>
</section>

<!-- ═══════════════════ COST RESEARCH ═══════════════════ -->
<section class="page">
  <h1>1. Kostenrecherche (variable Anbieter-Kosten)</h1>
  <p>Alle Zahlen Stand Mai 2026, verifiziert über die offiziellen Anbieter-Seiten. Beträge in USD; ~1 USD = €0.92.</p>

  <h2>Pro Aktion (variable Kosten)</h2>
  <table>
    <thead><tr><th>Kategorie</th><th>Anbieter</th><th>Aktion</th><th class="num">Kosten (USD)</th><th>Stand</th></tr></thead>
    <tbody>
      <tr><td>Lead-Discovery</td><td>Google Places API</td><td>1× Text Search (Pro SKU)</td><td class="num">$0.017</td><td>2026-05</td></tr>
      <tr><td>Lead-Enrich</td><td>Eigene Scraping-Worker (Vercel/Railway)</td><td>1× Website-Scrape</td><td class="num">$0.002</td><td>Compute</td></tr>
      <tr><td>Lead-Enrich</td><td>Gemini 2.5 Flash</td><td>1× AI-Extraktion (3k in + 500 out)</td><td class="num">$0.00215</td><td>2026-05</td></tr>
      <tr><td>Mail-Generation</td><td>Gemini 2.5 Flash</td><td>1× personalisierte Mail (1k in + 250 out)</td><td class="num">$0.00093</td><td>2026-05</td></tr>
      <tr><td>Mail-Versand</td><td>User-eigene Mailbox (SMTP / MS Graph)</td><td>1× Send</td><td class="num">$0</td><td>—</td></tr>
      <tr><td>LinkedIn</td><td>ConnectSafely.ai</td><td>1× verbundenes LinkedIn-Konto / Monat</td><td class="num">$10</td><td>Flat-Fee, unlimited API</td></tr>
      <tr><td>Email-System</td><td>Resend (System-Mails)</td><td>50.000 Mails / Monat inkl.</td><td class="num">$20</td><td>Flat</td></tr>
    </tbody>
  </table>
  <small>Quelle: developers.google.com/maps · ai.google.dev · connectsafely.ai · resend.com</small>

  <h2>Fixe Plattform-Kosten (geteilt über alle User)</h2>
  <table>
    <thead><tr><th>Komponente</th><th>Anbieter</th><th>Plan</th><th class="num">USD / Monat</th></tr></thead>
    <tbody>
      <tr><td>Datenbank (MVP)</td><td>Supabase</td><td>Pro (100 GB Storage, 250 GB Egress)</td><td class="num">$25</td></tr>
      <tr><td>Hosting (MVP)</td><td>Vercel / Railway</td><td>Pro / Hobby+</td><td class="num">$20–50</td></tr>
      <tr><td>Hosting (später)</td><td>AWS (ECS Fargate + RDS + S3 + CloudFront)</td><td>Production-Setup</td><td class="num">$80–150</td></tr>
      <tr><td>Logging</td><td>Sentry</td><td>Team</td><td class="num">$26</td></tr>
      <tr><td>System-Mails</td><td>Resend</td><td>50k Mails inkl.</td><td class="num">$20</td></tr>
      <tr><td>Domain &amp; DNS</td><td>Cloudflare</td><td>Standard, <code>dashboard.ki-kanzlei.at</code></td><td class="num">$0–5</td></tr>
      <tr class="total"><td colspan="3">Summe MVP (Vercel) bei ~50 Usern</td><td class="num">~$100/Mo</td></tr>
      <tr class="total"><td colspan="3">Summe Production (AWS) bei ~100 Usern</td><td class="num">~$200/Mo</td></tr>
    </tbody>
  </table>
  <small>Migration Vercel → AWS geplant nach Beta-Phase. Stripe und alle externen Services bleiben identisch.</small>

  <h2>Zahlungsabwicklung</h2>
  <table>
    <thead><tr><th>Anbieter</th><th>Gebühr (EU-Karte)</th><th>Gebühr (Non-EU)</th></tr></thead>
    <tbody>
      <tr><td>Stripe (Standard)</td><td>1.5% + €0.25</td><td>2.5% + €0.25</td></tr>
    </tbody>
  </table>
  <small>Gemischter Schnitt im B2B ~1.8% all-in. In Kalkulation: 2% Sicherheitsmarge.</small>
</section>

<!-- ═══════════════════ PLAN COMPARISON ═══════════════════ -->
<section class="page">
  <h1>2. Plan-Übersicht</h1>
  <p class="lead">Drei Tiers, alle mit Credit-System. Kein Free, kein Trial. Sichere Zahlung über Stripe.</p>

  <div class="grid grid-3" style="margin-top:14px">
    <div class="plan">
      <h3>Solo</h3>
      <div class="price">€199<small>/Mo</small></div>
      <p class="blurb">Solo-Selbstständige &amp; Freelancer, die jetzt mit Outbound starten.</p>
      <ul>
        <li>2.000 Credits/Monat</li>
        <li>1 Seat · 2 Mailboxen</li>
        <li>Lead-Discovery + Enrichment</li>
        <li>KI-personalisierte Mails</li>
        <li>Sequenzen + Tracking</li>
        <li>Email-Support</li>
      </ul>
    </div>
    <div class="plan is-rec">
      <h3>Growth <span class="badge" style="margin-left:6px">Empfohlen</span></h3>
      <div class="price">€499<small>/Mo</small></div>
      <p class="blurb">Teams, die Outreach skalieren und LinkedIn dazunehmen.</p>
      <ul>
        <li>6.000 Credits/Monat</li>
        <li>3 Seats · 5 Mailboxen</li>
        <li>+ 1 LinkedIn-Konto (ConnectSafely)</li>
        <li>Alles aus Solo</li>
        <li>A/B-Tests &amp; Multi-Channel-Sequenzen</li>
        <li>Priority-Support (4h)</li>
      </ul>
    </div>
    <div class="plan">
      <h3>Scale</h3>
      <div class="price">€1.199<small>/Mo</small></div>
      <p class="blurb">Aggressive Pipeline-Builder, Agenturen mit Vertriebsteam.</p>
      <ul>
        <li>18.000 Credits/Monat</li>
        <li>Unlimited Seats &amp; Mailboxen</li>
        <li>+ 3 LinkedIn-Konten</li>
        <li>Custom Tracking-Domains</li>
        <li>API-Zugang</li>
        <li>Dedizierter Account Manager · 24h SLA</li>
      </ul>
    </div>
  </div>

  <div class="callout">
    <b>Enterprise auf Anfrage</b>
    Ab 50.000 Credits/Monat, individuelle Verträge, SSO, SLA, White-Label.
    Sales-Kontakt: office@ki-kanzlei.at
  </div>

  <h2>Top-Up-Packs (One-Time, verfallen nicht)</h2>
  <table>
    <thead><tr><th>Pack</th><th class="num">Credits</th><th class="num">Preis</th><th class="num">€/Credit</th></tr></thead>
    <tbody>
      <tr><td>Small</td><td class="num">1.000</td><td class="num">€149</td><td class="num">€0.149</td></tr>
      <tr><td>Medium</td><td class="num">5.000</td><td class="num">€599</td><td class="num">€0.120</td></tr>
      <tr><td>Large</td><td class="num">15.000</td><td class="num">€1.499</td><td class="num">€0.100</td></tr>
    </tbody>
  </table>
</section>

<!-- ═══════════════════ FEATURE MATRIX ═══════════════════ -->
<section class="page">
  <h1>3. Feature-Matrix &amp; Credit-Verbrauch</h1>

  <h2>Was ist in welchem Plan?</h2>
  <table>
    <thead>
      <tr><th>Feature</th><th class="num">Solo</th><th class="num">Growth</th><th class="num">Scale</th></tr>
    </thead>
    <tbody>
      <tr><td>Credits/Monat</td><td class="num">2.000</td><td class="num">6.000</td><td class="num">18.000</td></tr>
      <tr><td>Seats</td><td class="num">1</td><td class="num">3</td><td class="num">∞</td></tr>
      <tr><td>E-Mail-Mailboxen</td><td class="num">2</td><td class="num">5</td><td class="num">∞</td></tr>
      <tr><td>Lead-Suche (Google Places)</td><td class="num">✓</td><td class="num">✓</td><td class="num">✓</td></tr>
      <tr><td>Lead-Enrichment (Scrape + AI)</td><td class="num">✓</td><td class="num">✓</td><td class="num">✓</td></tr>
      <tr><td>Email-Kampagnen mit KI-Personalisierung</td><td class="num">✓</td><td class="num">✓</td><td class="num">✓</td></tr>
      <tr><td>Open- &amp; Reply-Tracking</td><td class="num">✓</td><td class="num">✓</td><td class="num">✓</td></tr>
      <tr><td>Sequenzen / Auto-Follow-ups</td><td class="num">✓</td><td class="num">✓</td><td class="num">✓</td></tr>
      <tr><td>A/B-Tests</td><td class="num">—</td><td class="num">✓</td><td class="num">✓</td></tr>
      <tr><td>LinkedIn-Outreach (ConnectSafely)</td><td class="num">—</td><td class="num">1 Acc</td><td class="num">3 Accs</td></tr>
      <tr><td>Custom Tracking-Domains</td><td class="num">—</td><td class="num">—</td><td class="num">✓</td></tr>
      <tr><td>API-Zugang</td><td class="num">—</td><td class="num">—</td><td class="num">✓</td></tr>
      <tr><td>Dedizierter Account Manager</td><td class="num">—</td><td class="num">—</td><td class="num">✓</td></tr>
      <tr><td>Support-SLA</td><td class="num">Standard</td><td class="num">4h</td><td class="num">24h</td></tr>
    </tbody>
  </table>

  <h2>Credit-Verbrauch pro Aktion</h2>
  <table>
    <thead><tr><th>Aktion</th><th class="num">Credits</th><th class="num">Unsere Kosten</th><th>Begründung</th></tr></thead>
    <tbody>
      <tr><td>1 Lead aus Google Places gefunden</td><td class="num">1</td><td class="num">$0.017</td><td>Places Text Search Pro</td></tr>
      <tr><td>1 Lead enriched (Scrape + AI-Extract)</td><td class="num">2</td><td class="num">$0.004</td><td>Scrape + Gemini</td></tr>
      <tr><td>1 AI-Mail generiert</td><td class="num">1</td><td class="num">$0.001</td><td>Gemini 2.5 Flash</td></tr>
      <tr><td>1 Mail versendet (ohne neue AI-Gen)</td><td class="num">0</td><td class="num">$0</td><td>User-Mailbox, gratis</td></tr>
      <tr><td>1 LinkedIn-Aktion (Invite/Message)</td><td class="num">3</td><td class="num">~$0.02</td><td>$10/Mo per Account, ~500 Aktionen</td></tr>
    </tbody>
  </table>
  <small>SEO &amp; Social-Media-Posts sind im MVP-Scope nicht enthalten. Werden später als zusätzliche Aktionen aufgeschaltet.</small>
</section>

<!-- ═══════════════════ MARGINS ═══════════════════ -->
<section class="page">
  <h1>4. Margenrechnung pro Plan</h1>
  <p class="lead">Annahme: typischer Power-User schöpft 80–95 % der Credits aus. Stripe-Gebühr 2 % pauschal, Fixkosten-Anteil €3 pro User bei ~30 zahlenden Usern.</p>

  <h2>Solo @ €199/Monat (kein LinkedIn)</h2>
  <table>
    <thead><tr><th>Position</th><th class="num">Menge</th><th class="num">€-Wert</th></tr></thead>
    <tbody>
      <tr><td>Einnahmen</td><td class="num">—</td><td class="num"><b>€199.00</b></td></tr>
      <tr><td>Lead-Discovery (500× $0.017)</td><td class="num">500 Credits</td><td class="num">−€7.82</td></tr>
      <tr><td>Lead-Enrich (250× $0.004)</td><td class="num">500 Credits</td><td class="num">−€0.92</td></tr>
      <tr><td>AI-Mails (750× $0.001)</td><td class="num">750 Credits</td><td class="num">−€0.69</td></tr>
      <tr><td>Stripe-Fee (~2 % von €199)</td><td class="num">—</td><td class="num">−€3.98</td></tr>
      <tr><td>Anteil Fixkosten</td><td class="num">—</td><td class="num">−€3.00</td></tr>
      <tr class="total"><td colspan="2">Bruttomarge</td><td class="num">€182.59 (<b>91.7 %</b>)</td></tr>
    </tbody>
  </table>

  <h2>Growth @ €499/Monat (1 LinkedIn-Account)</h2>
  <table>
    <thead><tr><th>Position</th><th class="num">Menge</th><th class="num">€-Wert</th></tr></thead>
    <tbody>
      <tr><td>Einnahmen</td><td class="num">—</td><td class="num"><b>€499.00</b></td></tr>
      <tr><td>Lead-Discovery (1.500× $0.017)</td><td class="num">1.500 Credits</td><td class="num">−€23.46</td></tr>
      <tr><td>Lead-Enrich (750× $0.004)</td><td class="num">1.500 Credits</td><td class="num">−€2.76</td></tr>
      <tr><td>AI-Mails (1.500× $0.001)</td><td class="num">1.500 Credits</td><td class="num">−€1.38</td></tr>
      <tr><td>LinkedIn-Aktionen (~250)</td><td class="num">750 Credits</td><td class="num">−€0.00 (in Account-Fee enthalten)</td></tr>
      <tr><td>ConnectSafely (1 LinkedIn-Account)</td><td class="num">—</td><td class="num">−€9.20</td></tr>
      <tr><td>Stripe-Fee (~2 % von €499)</td><td class="num">—</td><td class="num">−€9.98</td></tr>
      <tr><td>Anteil Fixkosten</td><td class="num">—</td><td class="num">−€3.00</td></tr>
      <tr class="total"><td colspan="2">Bruttomarge</td><td class="num">€449.22 (<b>90.0 %</b>)</td></tr>
    </tbody>
  </table>

  <h2>Scale @ €1.199/Monat (3 LinkedIn-Accounts)</h2>
  <table>
    <thead><tr><th>Position</th><th class="num">Menge</th><th class="num">€-Wert</th></tr></thead>
    <tbody>
      <tr><td>Einnahmen</td><td class="num">—</td><td class="num"><b>€1.199.00</b></td></tr>
      <tr><td>Lead-Discovery (5.000× $0.017)</td><td class="num">5.000 Credits</td><td class="num">−€78.20</td></tr>
      <tr><td>Lead-Enrich (2.500× $0.004)</td><td class="num">5.000 Credits</td><td class="num">−€9.20</td></tr>
      <tr><td>AI-Mails (5.000× $0.001)</td><td class="num">5.000 Credits</td><td class="num">−€4.60</td></tr>
      <tr><td>LinkedIn-Aktionen (~1.000)</td><td class="num">3.000 Credits</td><td class="num">−€0.00 (in Account-Fee enthalten)</td></tr>
      <tr><td>ConnectSafely (3 LinkedIn-Accounts)</td><td class="num">—</td><td class="num">−€27.60</td></tr>
      <tr><td>Stripe-Fee (~2 % von €1.199)</td><td class="num">—</td><td class="num">−€23.98</td></tr>
      <tr><td>Anteil Fixkosten</td><td class="num">—</td><td class="num">−€3.00</td></tr>
      <tr class="total"><td colspan="2">Bruttomarge</td><td class="num">€1.052.42 (<b>87.8 %</b>)</td></tr>
    </tbody>
  </table>

  <div class="callout">
    <b>Risiko-Reserve</b>
    Sämtliche Margen oben sind Brutto vor Personalkosten, Marketing, Customer Success, Refunds und Steuern.
    Bei realistischer Skalierung (Support-Team, Office, Tooling) ergibt sich eine Ziel-Brutto-EBITDA von <b>50–60 %</b> bei 100+ aktiven Usern.
  </div>
</section>

<!-- ═══════════════════ MVP SCOPE ═══════════════════ -->
<section class="page">
  <h1>5. MVP-Scope (Empfehlung)</h1>
  <p class="lead">Was kommt mit dem Launch, was später. Fokus: Outreach-Kernfunktion sauber, statt Featuritis.</p>

  <h2>✓ Im MVP enthalten</h2>
  <div class="stat-row">
    <div class="stat"><div class="v">Leads</div><div class="l">Google Places + Scraping + AI-Enrichment</div></div>
    <div class="stat"><div class="v">Email Outreach</div><div class="l">KI-Mails, Sequenzen, Tracking, Multi-Mailbox</div></div>
    <div class="stat"><div class="v">LinkedIn</div><div class="l">ConnectSafely-Integration, Invites + Messages</div></div>
  </div>
  <ul>
    <li><b>Auth &amp; Onboarding:</b> Email + OAuth (Google, Microsoft), 5-Step-Onboarding-Funnel mit Plan-Auswahl</li>
    <li><b>Stripe-Billing:</b> Subscription-Checkout, Customer-Portal, Webhook-driven status sync, Top-Ups</li>
    <li><b>Credits-System:</b> Atomic consume/grant via Supabase-RPC, append-only Ledger, Monatsreset</li>
    <li><b>Dashboard:</b> Übersicht, Leads-Tabelle mit Filtern, Kampagnen-Liste + Detail, Settings (Mailboxen, Billing)</li>
    <li><b>Cron-Versand:</b> Active Campaigns alle 5 Min, respektiert Sendefenster + Daily-Limit</li>
  </ul>

  <h2>✗ Nicht im MVP (später)</h2>
  <ul>
    <li><b>SEO-Posts:</b> Auto-Content-Generierung für Blog/Website</li>
    <li><b>Social-Media Auto-Publish:</b> LinkedIn-Posts, Instagram, Meta-Ads</li>
    <li><b>API-Zugang:</b> Public API für Scale-Kunden — Stub vorbereiten, Auth später</li>
    <li><b>Custom Tracking-Domains:</b> Reines DNS-Setup, später</li>
    <li><b>White-Label:</b> Erst nach 10+ Enterprise-Anfragen</li>
  </ul>

  <h2>Nächste Schritte (Reihenfolge)</h2>
  <ol>
    <li>Stripe Live-Account aktivieren, Products + Prices anlegen, Webhook konfigurieren</li>
    <li>Migration <code>20260528_billing_credits.sql</code> auf Production-DB ausführen</li>
    <li><code>consumeCredits()</code> in alle teuren Endpoints einbauen (Lead-Discover, Enrich, Mail-Gen, LinkedIn-Action)</li>
    <li>Credits-Anzeige im Dashboard-Header + Settings-Page (Plan, Credits-Stand, Top-Up-Kauf, Portal-Link)</li>
    <li>Dev/Prod-Umgebungen trennen: separate Supabase-Projekte + Stripe Test/Live Keys, Branches main → Prod, dev → Dev</li>
    <li>Beta-Launch auf <code>dashboard.ki-kanzlei.at</code> mit 5–10 Pilot-Kunden zum Validieren der Preis-Akzeptanz</li>
    <li>Migration Vercel → AWS (ECS Fargate, RDS, S3, CloudFront) nach Beta-Phase</li>
    <li>Pricing-Page öffentlich auf <code>www.ki-kanzlei.at/pricing</code></li>
  </ol>

  <h2>Hosting-Topologie (Production-Ziel)</h2>
  <table>
    <thead><tr><th>Umgebung</th><th>Domain</th><th>Stripe Mode</th><th>Supabase-Projekt</th></tr></thead>
    <tbody>
      <tr><td>Production</td><td><code>dashboard.ki-kanzlei.at</code></td><td>Live</td><td>kvwjabdmmdthgbhimjqf (prod)</td></tr>
      <tr><td>Development</td><td><code>dev-dashboard.ki-kanzlei.at</code> oder localhost</td><td>Test</td><td>separates dev-Projekt empfohlen</td></tr>
    </tbody>
  </table>

  <div class="footer">
    KI Kanzlei Outreach Plattform · pricing-overview v1 · ${new Date().toISOString().slice(0, 10)} · office@ki-kanzlei.at
  </div>
</section>

</body>
</html>`;

async function main() {
  writeFileSync(OUT_HTML, html, "utf-8");
  console.log("Wrote HTML →", OUT_HTML);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: OUT_PDF,
    format: "A4",
    printBackground: true,
    margin: { top: "18mm", right: "14mm", bottom: "18mm", left: "14mm" },
  });
  await browser.close();
  console.log("Wrote PDF  →", OUT_PDF);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
