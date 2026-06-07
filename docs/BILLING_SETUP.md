# Billing + Credits Setup (Stripe Production)

## 1. Migration anwenden

```bash
# Supabase Dashboard → SQL Editor
# Inhalt von supabase/migrations/20260528_billing_credits.sql ausführen
```

Anlegt: `subscriptions`, `credit_balance`, `credit_ledger` Tabellen + RPCs `consume_credits`, `grant_credits`.

## 2. Stripe Dashboard Setup

### Products erstellen
Stripe Dashboard → Products → Add Product. **Pro Plan ein Product, pro Product ein Recurring-Price + (optional) später Top-Up-Prices:**

| Product | Recurring Price | Stripe Price-ID |
|---|---|---|
| KI Kanzlei — Solo | €199 / Monat | (kopieren) |
| KI Kanzlei — Growth | €499 / Monat | (kopieren) |
| KI Kanzlei — Scale | €1.199 / Monat | (kopieren) |
| Credit Pack Small | €149 (One-Time) | (kopieren) |
| Credit Pack Medium | €599 (One-Time) | (kopieren) |
| Credit Pack Large | €1.499 (One-Time) | (kopieren) |

→ Wichtig: Bei Recurring Subscriptions auf **"Recurring"** stellen, bei Packs auf **"One-Time"**.
→ Bei jedem Price → "Show advanced options" → "Tax behavior" = "Exclusive" (Brutto wird oben drauf gerechnet), oder "Inclusive" wenn Bruttopreise angezeigt werden sollen. **Konsistent halten!**

### Webhook konfigurieren
Stripe Dashboard → Developers → Webhooks → Add endpoint:
- **URL:** `https://<deine-prod-domain>/api/billing/webhook`
- **Listen to events:**
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
- → **Signing secret** kopieren (whsec_…)

### Customer Portal aktivieren
Stripe Dashboard → Settings → Billing → Customer portal → Activate:
- Allow customers to update billing details: ✓
- Allow customers to switch plans: ✓ (mit allen drei Plänen)
- Allow customers to cancel subscriptions: ✓ (recommend: at period end)
- Return URL: `https://<deine-prod-domain>/dashboard/settings`

### Tax automatisch berechnen (empfohlen)
Stripe Dashboard → Settings → Tax → Tax Calculations aktivieren.
- Registrierungen für AT/DE/CH eintragen.
- Im Checkout `automatic_tax: { enabled: true }` ist bereits gesetzt.

## 3. Environment Variables

Trage in `.env.local` (lokal) UND in Production-Env (Railway/Vercel) ein:

```bash
# Stripe Server (geheim)
STRIPE_SECRET_KEY=sk_live_xxx                  # oder sk_test_xxx für Test-Mode
STRIPE_WEBHOOK_SECRET=whsec_xxx                # aus Webhook-Config

# Stripe Publishable (kann öffentlich sein)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx

# Plan-Price-IDs (aus den Products oben)
STRIPE_PRICE_SOLO=price_xxx
STRIPE_PRICE_GROWTH=price_xxx
STRIPE_PRICE_SCALE=price_xxx

# Top-Up-Packs
STRIPE_PRICE_PACK_SMALL=price_xxx
STRIPE_PRICE_PACK_MEDIUM=price_xxx
STRIPE_PRICE_PACK_LARGE=price_xxx

# App-URL (für Callbacks)
NEXT_PUBLIC_APP_URL=https://dashboard.ki-kanzlei.at
```

## 4. Lokales Testen

### Stripe CLI installieren
```bash
# Mac
brew install stripe/stripe-cli/stripe
# Windows (Scoop)
scoop install stripe
```

### Webhook-Forwarding starten
```bash
stripe login
stripe listen --forward-to localhost:3000/api/billing/webhook
# → kopier das whsec_xxx ausgegebene Secret in .env.local STRIPE_WEBHOOK_SECRET
```

### Test-Karte verwenden
- **Erfolg:** `4242 4242 4242 4242`, beliebiges Datum, beliebiger CVC
- **3DS-Required:** `4000 0027 6000 3184`
- **Decline:** `4000 0000 0000 9995`

Stripe Testing Doku: https://stripe.com/docs/testing

### End-to-End Flow durchlaufen
1. `/register` → Account erstellen
2. Onboarding-Funnel komplett ausfüllen
3. Plan wählen → klick auf "Bezahlen"
4. Stripe Checkout → Test-Karte → Submit
5. Redirect zu `/billing/success` → Webhook setzt `subscription_status = active`, gutschreibt Credits
6. Klick "Zum Dashboard" → durchgelassen, weil status aktiv

### Cancel-Flow testen
1. Wie oben bis Stripe Checkout
2. Auf der Stripe-Seite "Zurück" / Cancel
3. Redirect zu `/billing/cancel` → `subscription_status` bleibt `pending_checkout`
4. Versuch `/dashboard` aufzurufen → Middleware redirected zurück nach `/billing/checkout`
5. → Gate funktioniert ✓

## 5. Credit-Verbrauch in Features einbauen

In jeder Server-Route / Server-Action die Geld kostet:

```ts
import { consumeCredits } from "@/lib/credits";

const result = await consumeCredits(user.id, "lead_enrich", { ref: leadId });
if (!result.ok) {
  return NextResponse.json(
    { error: "Nicht genug Credits. Bitte Top-Up kaufen." },
    { status: 402 },
  );
}
// → action ausführen
```

Aktionen siehe `CREDIT_COSTS` in `src/lib/billing/plans.ts`.

## 6. Monatsreset

Passiert automatisch via Stripe Webhook bei `invoice.payment_succeeded` mit
`billing_reason = subscription_cycle`. Kein Cron nötig.

## 7. Subscription-Sicherheit (Bypass-Schutz)

Die Middleware (`src/middleware.ts`) prüft bei JEDEM Request:
- User auf `/dashboard/*` ohne `subscription_status in ('active','trialing')` → redirect zu `/billing/checkout`
- User auf `/onboarding` mit aktiver Sub → redirect zu `/dashboard`

Webhook ist die **alleinige Quelle** für Status-Updates — Frontend kann das nicht
manipulieren. `/api/billing/webhook` ist als Pfad vom Middleware-Matcher ausgenommen
(Stripe sendet keine User-Cookies).

## 8. Stripe-Webhook-Signature im Testen umgehen?
**Nein, nie**. Wenn `stripe listen --forward-to ...` läuft, generiert es ein
eigenes Test-`whsec_xxx` das passt. Niemals `STRIPE_WEBHOOK_SECRET` raus
nehmen — sonst kann jeder Webhook-Events forgen und Credits gutschreiben.
