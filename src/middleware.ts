import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Session auffrischen — wichtig, nie weglassen
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, searchParams } = request.nextUrl;

  /* ── Onboarding- + Subscription-Status ableiten ──
   * onboarded_at:        gesetzt sobald User Funnel abgeschlossen hat
   * subscription_status: 'pending_checkout' | 'active' | 'trialing' | 'past_due' | 'canceled'
   *
   * Routing-Regeln:
   *   !onboarded                  → /onboarding
   *   onboarded + pending_checkout → /onboarding (Plan-Step gateet via Middleware,
   *                                   User kommt im selben Funnel zur Bezahlung)
   *   onboarded + active/trialing  → /dashboard
   *   onboarded + canceled/past_due → /onboarding (Abo erneuern via Plan-Step)
   */
  const onboardedAt = user?.user_metadata?.onboarded_at as string | undefined;
  const isOnboarded = Boolean(onboardedAt);
  const subscriptionStatus = (user?.user_metadata?.subscription_status as string | undefined) ?? null;
  const hasActiveAccess = ["active", "trialing"].includes(subscriptionStatus ?? "");
  const needsCheckout = isOnboarded && !hasActiveAccess;

  // Nicht eingeloggt → zum Login
  if (!user && pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (!user && pathname.startsWith("/onboarding")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", "/onboarding");
    return NextResponse.redirect(url);
  }
  if (!user && pathname.startsWith("/billing")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Eingeloggt + auf Login/Register-Seite → richtiges Ziel
  const isRecovery = searchParams.get("recovery") === "true";
  function destinationForUser(): string {
    if (!hasActiveAccess) return "/onboarding";
    return "/dashboard";
  }
  if (user && pathname === "/login" && !isRecovery) {
    const url = request.nextUrl.clone();
    url.pathname = destinationForUser();
    return NextResponse.redirect(url);
  }
  if (user && pathname === "/register") {
    const url = request.nextUrl.clone();
    url.pathname = destinationForUser();
    return NextResponse.redirect(url);
  }

  // Eingeloggt + auf /dashboard, aber Onboarding noch nicht durch ODER kein aktives Abo → ins Funnel
  if (user && !hasActiveAccess && pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/onboarding";
    return NextResponse.redirect(url);
  }

  // Eingeloggt + bereits onboarded + Zugang aktiv + auf /onboarding → ins Dashboard
  if (user && isOnboarded && hasActiveAccess && pathname.startsWith("/onboarding")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  // suppress unused-var lint (kept for clarity in routing-rules)
  void needsCheckout;

  // Security Headers
  supabaseResponse.headers.set("X-Frame-Options", "DENY");
  supabaseResponse.headers.set("X-Content-Type-Options", "nosniff");
  supabaseResponse.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  supabaseResponse.headers.set("X-XSS-Protection", "1; mode=block");
  supabaseResponse.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  supabaseResponse.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://api.fontshare.com https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://cdn.fontshare.com https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co; frame-ancestors 'none';",
  );
  supabaseResponse.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  return supabaseResponse;
}

export const config = {
  matcher: [
    // /api/billing/webhook MUSS ohne Auth-Middleware durchgereicht werden
    // (Stripe → Server, kein User-Cookie). Signature-Check passiert in der Route.
    "/((?!_next/static|_next/image|favicon.ico|images|api/billing/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
