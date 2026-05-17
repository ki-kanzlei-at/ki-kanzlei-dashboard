"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Provider } from "@supabase/supabase-js";

function GoogleIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" fill="#34A853" />
            <path d="M5.84 14.09A6.97 6.97 0 0 1 5.47 12c0-.72.13-1.43.37-2.09V7.07H2.18A11.96 11.96 0 0 0 .96 12c0 1.94.46 3.77 1.22 5.33l3.66-2.84Z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" fill="#EA4335" />
        </svg>
    );
}

function MicrosoftIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 21 21" fill="none">
            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
        </svg>
    );
}

export function OAuthButtons() {
    const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);

    async function signInWithOAuth(provider: Provider) {
        setLoadingProvider(provider);
        try {
            const supabase = createClient();
            await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                },
            });
        } catch {
            setLoadingProvider(null);
        }
    }

    return (
        <div className="space-y-3">
            <Button
                type="button"
                variant="outline"
                className="w-full h-11 font-medium bg-white/60 border-border/60 hover:bg-white transition-colors"
                onClick={() => signInWithOAuth("google")}
                disabled={loadingProvider !== null}
            >
                {loadingProvider === "google" ? (
                    <Spinner className="h-4 w-4 mr-2" />
                ) : (
                    <GoogleIcon className="h-5 w-5 mr-2" />
                )}
                Mit Google fortfahren
            </Button>

            <Button
                type="button"
                variant="outline"
                className="w-full h-11 font-medium bg-white/60 border-border/60 hover:bg-white transition-colors"
                onClick={() => signInWithOAuth("azure")}
                disabled={loadingProvider !== null}
            >
                {loadingProvider === "azure" ? (
                    <Spinner className="h-4 w-4 mr-2" />
                ) : (
                    <MicrosoftIcon className="h-5 w-5 mr-2" />
                )}
                Mit Microsoft fortfahren
            </Button>
        </div>
    );
}
