import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Mail, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * /billing/cancel
 *
 * Stripe leitet hierher wenn der User die Checkout-Session abbricht.
 * subscription_status bleibt 'pending_checkout' → Middleware blockt Dashboard.
 * Hier zeigen wir klar: Sub nicht abgeschlossen, drei Optionen zur Wahl.
 */
export default function BillingCancel() {
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
          <div className="mx-auto mb-7 grid h-[88px] w-[88px] place-items-center rounded-full bg-amber-50 text-amber-600">
            <XCircle className="h-9 w-9" strokeWidth={2} />
          </div>

          <h1 className="text-[28px] font-semibold tracking-[-0.025em] mb-3">
            Subscription noch nicht abgeschlossen
          </h1>
          <p className="text-[14.5px] text-muted-foreground mb-6 leading-[1.55]">
            Du hast den Checkout abgebrochen. Solange deine Subscription nicht aktiv ist,
            hast du noch keinen Zugang zum Dashboard.
          </p>

          <Alert className="mb-6 text-left border-amber-200 bg-amber-50 text-amber-900 [&>svg]:text-amber-600">
            <AlertDescription>
              Es wurde noch keine Zahlung durchgeführt. Du kannst jederzeit erneut starten —
              dein Onboarding-Status bleibt gespeichert.
            </AlertDescription>
          </Alert>

          <Card className="mb-6 text-left">
            <CardContent className="py-5 px-5 space-y-2.5 text-[13px]">
              <p className="font-medium mb-1">Was du jetzt tun kannst:</p>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Plan erneut wählen und Zahlung abschließen</li>
                <li>• Einen anderen Plan probieren</li>
                <li>• Bei Fragen unser Sales-Team kontaktieren</li>
              </ul>
            </CardContent>
          </Card>

          <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
            <Button asChild className="rounded-lg gap-2">
              <Link href="/onboarding">
                <ArrowLeft className="h-3.5 w-3.5" />
                Zurück zur Plan-Auswahl
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-lg gap-2">
              <Link href="mailto:info@ki-kanzlei.at?subject=Onboarding%20Hilfe">
                <Mail className="h-3.5 w-3.5" />
                Support kontaktieren
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
