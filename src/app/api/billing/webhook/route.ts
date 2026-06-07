/* ── POST /api/billing/webhook ──
 *
 * Stripe-Webhook-Endpoint. Verarbeitet:
 *   checkout.session.completed     → Subscription/Top-Up persistieren, Credits grant'en, status→active
 *   customer.subscription.updated  → status sync
 *   customer.subscription.deleted  → status=canceled
 *   invoice.payment_succeeded      → Monatsperiode + Credits resetten
 *   invoice.payment_failed         → status=past_due
 *
 * Wichtig: Diese Route DARF NICHT durch das Auth-Middleware geleitet werden
 * (siehe middleware.ts matcher → exclude /api/billing/webhook). Signature wird
 * gegen STRIPE_WEBHOOK_SECRET verifiziert.
 */

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripe, getWebhookSecret } from "@/lib/billing/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { grantCredits, resetMonthlyCredits } from "@/lib/credits";
import { PLANS, CREDIT_PACKS, type PlanKey, type CreditPackKey } from "@/lib/billing/plans";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    const sig = request.headers.get("stripe-signature");
    if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    const body = await request.text(); // RAW body required
    event = stripe.webhooks.constructEvent(body, sig, getWebhookSecret());
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  /* ── Idempotenz-Check: schon verarbeitet? ──
   * Stripe sendet Events mit Retries. Wir dedupen über die globale event_id.
   * Atomic insert; wenn ON CONFLICT → bereits verarbeitet, sofort 200 zurück.
   */
  try {
    const admin = getSupabaseAdmin();
    const { error: dedupErr, data: inserted } = await admin
      .from("stripe_events")
      .insert({
        event_id: event.id,
        type:     event.type,
        livemode: event.livemode,
        payload:  event.data as unknown as Record<string, unknown>,
      })
      .select("event_id")
      .maybeSingle();

    if (dedupErr) {
      // Unique-Violation → duplicate event, einfach OK zurückgeben
      if (dedupErr.code === "23505") {
        return NextResponse.json({ received: true, duplicate: true });
      }
      throw dedupErr;
    }
    if (!inserted) {
      return NextResponse.json({ received: true, duplicate: true });
    }
  } catch (err) {
    console.error("[stripe-webhook] dedup insert failed:", err);
    // Wenn Dedup fehlschlägt, lieber 500 → Stripe re-tried, dann klappts hoffentlich
    return NextResponse.json({ error: "dedup failed" }, { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.created":
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await handleInvoiceFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        // unbekanntes Event: ignorieren
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`[stripe-webhook] handler error for ${event.type}:`, err);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
}

/* ─────────────────────────── Handlers ─────────────────────────── */

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id;
  if (!userId) {
    console.warn("[checkout.completed] kein client_reference_id");
    return;
  }
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;

  /* Subscription-Checkout */
  if (session.mode === "subscription" && session.subscription) {
    const stripe = getStripe();
    const sub = typeof session.subscription === "string"
      ? await stripe.subscriptions.retrieve(session.subscription)
      : session.subscription;

    const planKey = (sub.metadata?.plan as PlanKey | undefined) ?? deriveplanFromPriceId(sub);
    if (!planKey || !(planKey in PLANS)) {
      console.error("[checkout.completed] kein gültiger plan-key gefunden");
      return;
    }
    const plan = PLANS[planKey as Exclude<PlanKey, "enterprise">];

    await upsertSubscription(userId, customerId, sub, planKey, plan.credits);
    await syncSubscriptionStatusToAuth(userId, sub.status, planKey);

    // Erstgrant: monatliche Credits gutschreiben
    await grantCredits(userId, plan.credits, "plan_grant", {
      ref: sub.id,
      metadata: { plan: planKey, event: "initial_grant" },
    });
    return;
  }

  /* Top-Up-Checkout (Pack) */
  if (session.mode === "payment" && session.payment_intent) {
    const stripe = getStripe();
    const pi = typeof session.payment_intent === "string"
      ? await stripe.paymentIntents.retrieve(session.payment_intent)
      : session.payment_intent;

    const packKey = (pi.metadata?.pack as CreditPackKey | undefined);
    if (!packKey || !(packKey in CREDIT_PACKS)) {
      console.error("[checkout.completed][pack] kein gültiger pack-key");
      return;
    }
    const pack = CREDIT_PACKS[packKey];
    await grantCredits(userId, pack.credits, "topup", {
      ref: pi.id,
      metadata: { pack: packKey, eur: pack.priceEur },
    });
  }
}

async function handleSubscriptionUpdate(sub: Stripe.Subscription) {
  const userId = (sub.metadata?.supabase_user_id as string | undefined)
    ?? await resolveUserIdByCustomer(sub.customer);
  if (!userId) {
    console.warn("[subscription.updated] kein userId auflösbar");
    return;
  }

  const planKey = (sub.metadata?.plan as PlanKey | undefined) ?? deriveplanFromPriceId(sub);
  const monthlyCredits = planKey && planKey in PLANS
    ? PLANS[planKey as Exclude<PlanKey, "enterprise">].credits
    : 0;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  await upsertSubscription(userId, customerId, sub, planKey ?? "unknown", monthlyCredits);
  await syncSubscriptionStatusToAuth(userId, sub.status, planKey);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const userId = (sub.metadata?.supabase_user_id as string | undefined)
    ?? await resolveUserIdByCustomer(sub.customer);
  if (!userId) return;

  const admin = getSupabaseAdmin();
  await admin
    .from("subscriptions")
    .update({
      status:               "canceled",
      canceled_at:          new Date().toISOString(),
      cancel_at_period_end: false,
    })
    .eq("user_id", userId);

  await syncSubscriptionStatusToAuth(userId, "canceled", null);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // Nur recurring invoices triggern Monatsreset
  const subInvoice = invoice as unknown as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
  if (!subInvoice.subscription) return;
  if (invoice.billing_reason !== "subscription_cycle" && invoice.billing_reason !== "subscription_create") return;

  const stripe = getStripe();
  const subId = typeof subInvoice.subscription === "string" ? subInvoice.subscription : subInvoice.subscription.id;
  const sub = await stripe.subscriptions.retrieve(subId);

  const userId = (sub.metadata?.supabase_user_id as string | undefined)
    ?? await resolveUserIdByCustomer(sub.customer);
  if (!userId) return;

  const planKey = (sub.metadata?.plan as PlanKey | undefined) ?? deriveplanFromPriceId(sub);
  const monthlyCredits = planKey && planKey in PLANS
    ? PLANS[planKey as Exclude<PlanKey, "enterprise">].credits
    : 0;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  await upsertSubscription(userId, customerId, sub, planKey ?? "unknown", monthlyCredits);
  await syncSubscriptionStatusToAuth(userId, sub.status, planKey);

  // Bei "subscription_create" hat handleCheckoutCompleted bereits gegrantet — Doppelung vermeiden
  if (invoice.billing_reason === "subscription_cycle" && monthlyCredits > 0) {
    await resetMonthlyCredits(userId, monthlyCredits, { subscriptionId: sub.id });
  }
}

async function handleInvoiceFailed(invoice: Stripe.Invoice) {
  const subInvoice = invoice as unknown as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
  if (!subInvoice.subscription) return;
  const stripe = getStripe();
  const subId = typeof subInvoice.subscription === "string" ? subInvoice.subscription : subInvoice.subscription.id;
  const sub = await stripe.subscriptions.retrieve(subId);
  const userId = (sub.metadata?.supabase_user_id as string | undefined)
    ?? await resolveUserIdByCustomer(sub.customer);
  if (!userId) return;
  await syncSubscriptionStatusToAuth(userId, "past_due", null);

  const admin = getSupabaseAdmin();
  await admin.from("subscriptions").update({ status: "past_due" }).eq("user_id", userId);
}

/* ─────────────────────────── Helpers ─────────────────────────── */

async function upsertSubscription(
  userId: string,
  customerId: string | undefined,
  sub: Stripe.Subscription,
  planKey: string,
  monthlyCredits: number,
) {
  const admin = getSupabaseAdmin();
  // Stripe v2025 schema: period info may live on items rather than subscription root
  type SubLike = Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const s = sub as SubLike;
  const itemPeriodStart = sub.items?.data?.[0]?.current_period_start;
  const itemPeriodEnd   = sub.items?.data?.[0]?.current_period_end;
  const periodStart = s.current_period_start ?? itemPeriodStart;
  const periodEnd   = s.current_period_end ?? itemPeriodEnd;
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;

  await admin
    .from("subscriptions")
    .upsert({
      user_id:                userId,
      stripe_customer_id:     customerId,
      stripe_subscription_id: sub.id,
      stripe_price_id:        priceId,
      plan:                   planKey,
      status:                 sub.status,
      current_period_start:   periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end:     periodEnd   ? new Date(periodEnd   * 1000).toISOString() : null,
      cancel_at_period_end:   sub.cancel_at_period_end,
      canceled_at:            sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
      monthly_credits:        monthlyCredits,
      last_credit_grant_at:   new Date().toISOString(),
    }, { onConflict: "user_id" });
}

async function syncSubscriptionStatusToAuth(
  userId: string,
  status: string,
  planKey: string | null | undefined,
) {
  const admin = getSupabaseAdmin();
  const { data: { user } } = await admin.auth.admin.getUserById(userId);
  if (!user) return;
  await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...user.user_metadata,
      subscription_status: status,
      plan_intent: planKey ?? user.user_metadata?.plan_intent,
      subscription_synced_at: new Date().toISOString(),
    },
  });
}

async function resolveUserIdByCustomer(customer: string | Stripe.Customer | Stripe.DeletedCustomer): Promise<string | null> {
  const customerId = typeof customer === "string" ? customer : customer.id;
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

function deriveplanFromPriceId(sub: Stripe.Subscription): PlanKey | null {
  const priceId = sub.items?.data?.[0]?.price?.id;
  if (!priceId) return null;
  for (const key of Object.keys(PLANS) as Array<keyof typeof PLANS>) {
    const envName = PLANS[key].stripePriceEnv;
    if (process.env[envName] === priceId) return key;
  }
  return null;
}
