/* ── POST /api/billing/portal ──
 *
 * Öffnet das Stripe Customer Portal (User kann Karte ändern, Plan wechseln,
 * Subscription kündigen).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStripe, getAppBaseUrl } from "@/lib/billing/stripe";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data: sub } = await admin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const customerId = sub?.stripe_customer_id as string | undefined;
    if (!customerId) {
      return NextResponse.json({ error: "Kein Stripe-Customer gefunden" }, { status: 404 });
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getAppBaseUrl()}/dashboard/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[POST /api/billing/portal]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Interner Fehler" },
      { status: 500 },
    );
  }
}
