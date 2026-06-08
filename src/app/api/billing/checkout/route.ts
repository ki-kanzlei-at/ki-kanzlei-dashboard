/* ── POST /api/billing/checkout ──
 *
 * Body: { plan: 'solo'|'growth'|'scale' } oder { pack: 'small'|'medium'|'large' }
 * Returns: { url } — Stripe Checkout Session URL für Redirect.
 *
 * Plans = Subscription. Packs = One-Time Top-Up.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe, getAppBaseUrl } from "@/lib/billing/stripe";
import {
  PLANS, CREDIT_PACKS, getStripePriceId,
  type PlanKey, type CreditPackKey,
} from "@/lib/billing/plans";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user || !user.email) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const planKey = body.plan as PlanKey | undefined;
    const packKey = body.pack as CreditPackKey | undefined;

    const stripe = getStripe();
    const baseUrl = getAppBaseUrl();

    /* Stripe-Customer holen oder anlegen — pro User genau einer */
    const admin = getSupabaseAdmin();
    const { data: existingSub } = await admin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = existingSub?.stripe_customer_id as string | null | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: (user.user_metadata?.display_name as string | undefined) ?? undefined,
        metadata: {
          supabase_user_id: user.id,
          company_name: (user.user_metadata?.company_name as string | undefined) ?? "",
        },
      });
      customerId = customer.id;
    }

    /* Subscription-Checkout (Plan) */
    if (planKey) {
      const plan = PLANS[planKey as Exclude<PlanKey, "enterprise">];
      if (!plan) {
        return NextResponse.json({ error: "Unbekannter Plan" }, { status: 400 });
      }
      const priceId = getStripePriceId(plan.stripePriceEnv);
      if (!priceId) {
        return NextResponse.json(
          { error: `Stripe Price-ID fehlt (${plan.stripePriceEnv})` },
          { status: 500 },
        );
      }

      const session = await stripe.checkout.sessions.create({
        mode:                "subscription",
        customer:            customerId,
        client_reference_id: user.id,
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        billing_address_collection: "required",
        automatic_tax: { enabled: true },
        customer_update: { name: "auto", address: "auto" },
        subscription_data: {
          metadata: {
            supabase_user_id: user.id,
            plan: plan.key,
          },
        },
        success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:  `${baseUrl}/billing/cancel`,
      });

      return NextResponse.json({ url: session.url });
    }

    /* Top-Up-Checkout (Credit Pack) */
    if (packKey) {
      const pack = CREDIT_PACKS[packKey];
      if (!pack) {
        return NextResponse.json({ error: "Unbekanntes Pack" }, { status: 400 });
      }
      const priceId = getStripePriceId(pack.stripePriceEnv);
      if (!priceId) {
        return NextResponse.json(
          { error: `Stripe Price-ID fehlt (${pack.stripePriceEnv})` },
          { status: 500 },
        );
      }

      const session = await stripe.checkout.sessions.create({
        mode:                "payment",
        customer:            customerId,
        client_reference_id: user.id,
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        billing_address_collection: "required",
        automatic_tax: { enabled: true },
        customer_update: { name: "auto", address: "auto" },
        payment_intent_data: {
          metadata: {
            supabase_user_id: user.id,
            pack: pack.key,
            credits: String(pack.credits),
          },
        },
        success_url: `${baseUrl}/dashboard/settings?topup=success`,
        cancel_url:  `${baseUrl}/dashboard/settings?topup=canceled`,
      });

      return NextResponse.json({ url: session.url });
    }

    return NextResponse.json(
      { error: "plan oder pack im Body erforderlich" },
      { status: 400 },
    );
  } catch (err) {
    console.error("[POST /api/billing/checkout]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interner Fehler" },
      { status: 500 },
    );
  }
}
