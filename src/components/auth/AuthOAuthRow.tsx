"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Provider } from "@supabase/supabase-js";

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={cn("ico", className)} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.55 6.55 0 0 1 5.5 12c0-.73.13-1.43.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.83Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

function MicrosoftLogo({ className }: { className?: string }) {
  return (
    <svg className={cn("ico", className)} viewBox="0 0 24 24" aria-hidden>
      <rect x="2"    y="2"    width="9.5" height="9.5" fill="#F35325" />
      <rect x="12.5" y="2"    width="9.5" height="9.5" fill="#81BC06" />
      <rect x="2"    y="12.5" width="9.5" height="9.5" fill="#05A6F0" />
      <rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#FFBA08" />
    </svg>
  );
}

interface AuthOAuthRowProps {
  mode: "login" | "register";
  redirectTo?: string;
}

export function AuthOAuthRow({ mode, redirectTo }: AuthOAuthRowProps) {
  const [loading, setLoading] = useState<Provider | null>(null);

  async function signIn(provider: Provider) {
    setLoading(provider);
    try {
      const supabase = createClient();
      const target = redirectTo
        ?? (mode === "register" ? "/onboarding" : "/dashboard");

      // Provider-spezifische Scopes — sonst gibt z.B. Azure nur openid zurück
      // und Supabase kann keinen User anlegen ("Error getting user email").
      const scopes =
        provider === "azure"  ? "openid profile email offline_access" :
        provider === "google" ? "openid profile email" :
        undefined;

      await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`,
          scopes,
        },
      });
    } catch {
      setLoading(null);
    }
  }

  const verb = mode === "register" ? "registrieren" : "fortfahren";

  return (
    <div className="oauth-buttons">
      <button
        type="button"
        className="oauth-btn"
        onClick={() => signIn("google")}
        disabled={loading !== null}
      >
        {loading === "google" ? (
          <Loader2 className="ico h-4 w-4 animate-spin" strokeWidth={1.75} />
        ) : (
          <GoogleLogo />
        )}
        Mit Google {verb}
      </button>
      <button
        type="button"
        className="oauth-btn"
        onClick={() => signIn("azure")}
        disabled={loading !== null}
      >
        {loading === "azure" ? (
          <Loader2 className="ico h-4 w-4 animate-spin" strokeWidth={1.75} />
        ) : (
          <MicrosoftLogo />
        )}
        Mit Microsoft {verb}
      </button>
    </div>
  );
}
