"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { z } from "zod";
import {
    Eye, EyeOff, AlertCircle, CheckCircle2,
    Search, Sparkles, BarChart3, Shield, UserPlus,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { OAuthButtons } from "@/components/auth/OAuthButtons";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

const schema = z.object({
    name: z.string().min(1, "Name ist erforderlich"),
    email: z.string().min(1, "E-Mail ist erforderlich").email("Keine gültige E-Mail"),
    password: z.string().min(6, "Mindestens 6 Zeichen erforderlich"),
    confirmPassword: z.string().min(1, "Bitte Passwort bestätigen"),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Die Passwörter stimmen nicht überein",
    path: ["confirmPassword"],
});

const features = [
    { icon: Search, label: "Leads automatisch finden" },
    { icon: Sparkles, label: "KI-gestützte Datenanreicherung" },
    { icon: BarChart3, label: "Pipeline & Statusverfolgung" },
    { icon: Shield, label: "DSGVO-konform & sicher" },
];

export default function RegisterPage() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [success, setSuccess] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setFieldErrors({});

        const result = schema.safeParse({ name, email, password, confirmPassword });
        if (!result.success) {
            const errs: Record<string, string> = {};
            for (const issue of result.error.issues) {
                const key = String(issue.path[0]);
                if (!errs[key]) errs[key] = issue.message;
            }
            setFieldErrors(errs);
            return;
        }

        setIsLoading(true);
        try {
            const supabase = createClient();
            const { error: authError } = await supabase.auth.signUp({
                email: result.data.email,
                password: result.data.password,
                options: {
                    data: { display_name: result.data.name },
                },
            });

            if (authError) {
                setIsLoading(false);
                if (authError.message.toLowerCase().includes("already registered")) {
                    setError("Diese E-Mail ist bereits registriert. Bitte melde dich an.");
                } else {
                    setError(`Registrierung fehlgeschlagen: ${authError.message}`);
                }
                return;
            }

            setSuccess(true);
        } catch {
            setError("Verbindung fehlgeschlagen. Bitte prüfe deine Internetverbindung.");
        } finally {
            setIsLoading(false);
        }
    }

    function clearErrors() {
        setFieldErrors({});
        setError(null);
    }

    return (
        <div className="min-h-screen w-full flex relative">

            {/* Left: Brand panel */}
            <div
                className="hidden lg:flex lg:w-[46%] xl:w-[50%] flex-col justify-between p-12 xl:p-14 relative overflow-hidden"
                style={{
                    background: "linear-gradient(150deg, oklch(0.32 0.16 263) 0%, oklch(0.44 0.22 263) 40%, oklch(0.50 0.24 258) 100%)",
                }}
            >
                <div className="pointer-events-none absolute top-0 right-0 w-[600px] h-[600px] opacity-25 rounded-full"
                    style={{ background: "radial-gradient(circle, oklch(0.65 0.20 263) 0%, transparent 60%)", transform: "translate(25%,-25%)" }} />
                <div className="pointer-events-none absolute bottom-0 left-0 w-[450px] h-[450px] opacity-15 rounded-full"
                    style={{ background: "radial-gradient(circle, oklch(0.50 0.22 280) 0%, transparent 65%)", transform: "translate(-30%,30%)" }} />

                <div className="relative z-10 flex items-center gap-3">
                    <Image
                        src="/images/KI-Kanzlei_Logo_2026.png"
                        alt="KI Kanzlei"
                        width={176}
                        height={176}
                        quality={100}
                        className="h-11 w-11 rounded-lg shadow-lg shadow-black/20"
                        priority
                    />
                    <span className="text-lg font-bold text-white tracking-tight">KI Kanzlei</span>
                </div>

                <div className="relative z-10 space-y-8">
                    <h1 className="text-3xl xl:text-4xl font-bold text-white leading-tight tracking-tight">
                        Dein Vertrieb.<br />
                        <span className="text-white/40">Voll automatisiert.</span>
                    </h1>

                    <div className="space-y-3">
                        {features.map(({ icon: Icon, label }) => (
                            <div key={label} className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0">
                                    <Icon className="h-4 w-4 text-white/70" />
                                </div>
                                <span className="text-sm text-white/60 font-medium">{label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <p className="relative z-10 text-white/20 text-xs">
                    &copy; {new Date().getFullYear()} KI Kanzlei. Alle Rechte vorbehalten.
                </p>
            </div>

            {/* Right: Form */}
            <div className="flex-1 flex flex-col items-center justify-center p-6 bg-background relative overflow-hidden">
                <div className="pointer-events-none absolute inset-0">
                    <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-20"
                        style={{ background: "radial-gradient(circle, oklch(0.546 0.244 263 / 0.2) 0%, transparent 70%)" }} />
                </div>

                <div className="lg:hidden mb-8 flex items-center gap-2.5">
                    <Image
                        src="/images/KI-Kanzlei_Logo_2026.png"
                        alt="KI Kanzlei"
                        width={72}
                        height={72}
                        quality={100}
                        className="h-9 w-9 rounded-lg shadow-md"
                        priority
                    />
                    <span className="text-lg font-bold text-foreground tracking-tight">KI Kanzlei</span>
                </div>

                <div className="relative z-10 w-full max-w-sm">
                    <Card className="glass-panel border-white/60 shadow-2xl shadow-black/8 overflow-hidden">
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

                        <CardHeader className="pt-8 pb-5 px-7">
                            <CardTitle className="text-xl font-bold text-foreground">
                                Konto erstellen
                            </CardTitle>
                            <CardDescription>
                                Registriere dich, um loszulegen
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="px-7 pb-5">
                            {success ? (
                                <div className="space-y-5 text-center py-4">
                                    <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
                                        <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <p className="text-sm font-semibold text-foreground">Bestätigungsmail gesendet</p>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            Wir haben eine Bestätigungsmail an{" "}
                                            <span className="font-medium text-foreground">{email}</span> gesendet.
                                            Bitte prüfe dein Postfach.
                                        </p>
                                    </div>
                                    <Link href="/login">
                                        <Button variant="outline" className="w-full h-10 mt-2">
                                            Zur Anmeldung
                                        </Button>
                                    </Link>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    <OAuthButtons />

                                    <div className="flex items-center gap-3">
                                        <Separator className="flex-1" />
                                        <span className="text-xs text-muted-foreground/60 font-medium">oder</span>
                                        <Separator className="flex-1" />
                                    </div>

                                    <form onSubmit={handleSubmit} className="space-y-4">
                                        {error && (
                                            <Alert variant="destructive">
                                                <AlertCircle className="h-4 w-4" />
                                                <AlertDescription>{error}</AlertDescription>
                                            </Alert>
                                        )}

                                        <div className="space-y-2">
                                            <Label htmlFor="name">Name</Label>
                                            <Input
                                                id="name"
                                                type="text"
                                                placeholder="Max Mustermann"
                                                autoComplete="name"
                                                value={name}
                                                onChange={(e) => { setName(e.target.value); clearErrors(); }}
                                                className={`h-11 bg-white/60 border-border/60 focus:bg-white transition-colors ${fieldErrors.name ? "border-destructive focus-visible:ring-destructive" : ""}`}
                                                disabled={isLoading}
                                            />
                                            {fieldErrors.name && (
                                                <p className="text-xs text-destructive">{fieldErrors.name}</p>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="email">E-Mail Adresse</Label>
                                            <Input
                                                id="email"
                                                type="email"
                                                placeholder="max@mustermann.at"
                                                autoComplete="email"
                                                value={email}
                                                onChange={(e) => { setEmail(e.target.value); clearErrors(); }}
                                                className={`h-11 bg-white/60 border-border/60 focus:bg-white transition-colors ${fieldErrors.email ? "border-destructive focus-visible:ring-destructive" : ""}`}
                                                disabled={isLoading}
                                            />
                                            {fieldErrors.email && (
                                                <p className="text-xs text-destructive">{fieldErrors.email}</p>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="password">Passwort</Label>
                                            <div className="relative">
                                                <Input
                                                    id="password"
                                                    type={showPw ? "text" : "password"}
                                                    placeholder="Mindestens 6 Zeichen"
                                                    autoComplete="new-password"
                                                    value={password}
                                                    onChange={(e) => { setPassword(e.target.value); clearErrors(); }}
                                                    className={`h-11 pr-10 bg-white/60 border-border/60 focus:bg-white transition-colors ${fieldErrors.password ? "border-destructive focus-visible:ring-destructive" : ""}`}
                                                    disabled={isLoading}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    tabIndex={-1}
                                                    onClick={() => setShowPw((v) => !v)}
                                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
                                                >
                                                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                </Button>
                                            </div>
                                            {fieldErrors.password && (
                                                <p className="text-xs text-destructive">{fieldErrors.password}</p>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="confirm-password">Passwort bestätigen</Label>
                                            <Input
                                                id="confirm-password"
                                                type={showPw ? "text" : "password"}
                                                placeholder="Passwort wiederholen"
                                                autoComplete="new-password"
                                                value={confirmPassword}
                                                onChange={(e) => { setConfirmPassword(e.target.value); clearErrors(); }}
                                                className={`h-11 bg-white/60 border-border/60 focus:bg-white transition-colors ${fieldErrors.confirmPassword ? "border-destructive focus-visible:ring-destructive" : ""}`}
                                                disabled={isLoading}
                                            />
                                            {fieldErrors.confirmPassword && (
                                                <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>
                                            )}
                                        </div>

                                        <Button
                                            type="submit"
                                            className="w-full h-11 font-semibold tracking-wide shadow-md shadow-primary/20 hover:shadow-primary/35 transition-shadow"
                                            disabled={isLoading}
                                        >
                                            {isLoading ? (
                                                <span className="flex items-center gap-2">
                                                    <Spinner className="h-4 w-4" />
                                                    Wird registriert…
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-2">
                                                    <UserPlus className="h-4 w-4" />
                                                    Konto erstellen
                                                </span>
                                            )}
                                        </Button>
                                    </form>
                                </div>
                            )}
                        </CardContent>

                        <CardFooter className="flex flex-col gap-4 px-7 pb-7 pt-0">
                            {!success && (
                                <p className="text-center text-sm text-muted-foreground">
                                    Bereits ein Konto?{" "}
                                    <Link href="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
                                        Anmelden
                                    </Link>
                                </p>
                            )}
                            <div className="flex items-center gap-3 w-full">
                                <Separator className="flex-1" />
                                <span className="text-xs text-muted-foreground/50 font-medium">Verschlüsselte Verbindung</span>
                                <Separator className="flex-1" />
                            </div>
                        </CardFooter>
                    </Card>
                </div>
            </div>
        </div>
    );
}
