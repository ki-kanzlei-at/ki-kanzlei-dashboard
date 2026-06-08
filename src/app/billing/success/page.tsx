import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/billing/stripe";

/**
 * /billing/success?session_id=cs_xxx
 *
 * Stripe leitet hierher nach erfolgreichem Checkout. Wir verifizieren die
 * Session als Soft-Check (Webhook hat den authoritativen Job schon gemacht
 * oder kommt gleich), zeigen Bestätigung + Button zum Dashboard.
 */
export default async function BillingSuccess({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { session_id } = await searchParams;
  let planName = "deinen neuen Plan";

  if (session_id) {
    try {
      const stripe = getStripe();
      const sess = await stripe.checkout.sessions.retrieve(session_id, {
        expand: ["subscription"],
      });
      const sub = typeof sess.subscription === "object" && sess.subscription
        ? sess.subscription
        : null;
      if (sub && typeof sub !== "string" && sub.metadata?.plan) {
        planName = String(sub.metadata.plan).toUpperCase();
      }
    } catch {
      /* nicht kritisch */
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-4 sm:px-8">
        <div className="flex items-center gap-2.5 text-[14px] font-semibold">
          <Image src="/images/KI-Kanzlei_Logo_2026.png" alt="KI Kanzlei" width={64} height={64} className="h-8 w-8 rounded-md object-contain" />
          <span>KI Kanzlei</span>
        </div>
      </header>

      <main className="flex-1 px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-[520px] text-center">
          <div className="relative mx-auto mb-7 grid h-[96px] w-[96px] place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <Check className="h-10 w-10" strokeWidth={3} />
            <span className="absolute inset-0 rounded-full border-2 border-emerald-200/70 animate-ping [animation-duration:1.8s]" />
          </div>

          <h1 className="text-[32px] font-semibold tracking-[-0.025em] mb-3">
            Zahlung erfolgreich
          </h1>
          <p className="text-[15px] text-muted-foreground mb-8 leading-[1.55]">
            Willkommen an Bord! Dein <strong className="text-foreground">{planName}</strong>-Plan
            ist aktiv und deine Credits werden gerade gutgeschrieben.
          </p>

          <Card className="mb-8 text-left">
            <CardContent className="py-5 px-5 space-y-3 text-[13px]">
              <div className="flex items-center gap-2.5">
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Plan & Subscription aktiviert</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Monats-Credits gutgeschrieben</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Rechnung wurde per E-Mail versendet</span>
              </div>
            </CardContent>
          </Card>

          <Button asChild size="lg" className="gap-2 px-7">
            <Link href="/dashboard">
              Zum Dashboard <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>

          <p className="text-[12.5px] text-muted-foreground mt-5">
            <Sparkles className="inline h-3 w-3 -mt-0.5 mr-1" />
            Tipp: Verbinde gleich deine erste Mailbox unter Einstellungen.
          </p>
        </div>
      </main>
    </div>
  );
}
