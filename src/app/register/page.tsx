"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle, ArrowRight, CheckCircle2,
  Eye, EyeOff, Loader2,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { AuthBrandPanel } from "@/components/auth/AuthBrandPanel";
import { AuthOAuthRow } from "@/components/auth/AuthOAuthRow";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";

interface PwdStrength {
  level: number;
  label: "weak" | "medium" | "strong";
  text: string;
}

function pwdStrength(pwd: string): PwdStrength {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++;
  if (score === 0) return { level: 0, label: "weak",   text: "" };
  if (score === 1) return { level: 1, label: "weak",   text: "Schwach — füge mehr Zeichen hinzu" };
  if (score === 2) return { level: 2, label: "medium", text: "Okay — Groß-/Kleinschreibung & Zahl helfen" };
  if (score === 3) return { level: 3, label: "medium", text: "Gut — füge ein Sonderzeichen hinzu" };
  return                     { level: 4, label: "strong", text: "Stark · sehr sicheres Passwort" };
}

function mapAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("already registered") || m.includes("user already") || m.includes("already exists"))
    return "Diese E-Mail ist bereits registriert. Bitte melde dich an.";
  if (m.includes("invalid email") || m.includes("email_invalid"))
    return "Bitte eine gültige E-Mail-Adresse eingeben.";
  if (m.includes("password") && m.includes("short"))
    return "Passwort zu kurz — mindestens 8 Zeichen.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled") || m.includes("signups disabled"))
    return "Registrierungen sind aktuell nicht freigegeben. Bitte wende dich an office@ki-kanzlei.at, um einen Zugang zu erhalten.";
  if (m.includes("rate limit") || m.includes("too many requests"))
    return "Zu viele Versuche. Bitte warte einen Moment.";
  return `Registrierung fehlgeschlagen: ${message}`;
}

function AuthDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <Separator className="flex-1" />
      <span className="text-[11.5px] uppercase tracking-[0.06em] text-muted-foreground font-medium">
        {children}
      </span>
      <Separator className="flex-1" />
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [show, setShow] = useState(false);
  const [optIn, setOptIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ email: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => pwdStrength(pwd), [pwd]);
  const canSubmit = name.trim() && company.trim() && email.trim() && pwd.length >= 8 && !loading;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !company.trim() || !email.trim()) {
      setError("Bitte alle Felder ausfüllen.");
      return;
    }
    if (pwd.length < 8) {
      setError("Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password: pwd,
        options: {
          data: {
            display_name: name.trim(),
            company_name: company.trim(),
            marketing_opt_in: optIn,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
        },
      });

      if (authError) {
        setError(mapAuthError(authError.message));
        return;
      }

      if (!data.session) {
        setSuccess({ email: email.trim() });
        return;
      }

      router.push("/onboarding");
      router.refresh();
    } catch {
      setError("Verbindung fehlgeschlagen. Bitte prüfe deine Internetverbindung.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="auth-shell">
        <AuthBrandPanel />
        <div className="auth-form-panel">
          <div className="auth-form-top">
            <span>
              Bereits einen Account?
              <Link href="/login">Anmelden</Link>
            </span>
          </div>
          <div className="auth-form-wrap">
            <div className="w-full max-w-[380px]">
              <div className="mb-7">
                <h1 className="m-0 mb-2 text-[26px] font-semibold tracking-[-0.025em] leading-[1.15]">
                  Bestätigungsmail gesendet
                </h1>
                <p className="m-0 text-[13.5px] text-muted-foreground">
                  Wir haben dir eine Bestätigungsmail an <b className="text-foreground">{success.email}</b> gesendet.
                  Klick auf den Link, um deinen Account zu aktivieren — danach starten wir dein Setup.
                </p>
              </div>
              <Alert className="mb-4 border-emerald-200 bg-emerald-50 text-emerald-800 [&>svg]:text-emerald-600">
                <CheckCircle2 />
                <AlertDescription>
                  Prüfe auch deinen Spam-Ordner — manchmal landen die Mails dort.
                </AlertDescription>
              </Alert>
              <Button asChild className="w-full h-10 gap-2">
                <Link href="/login">
                  Zur Anmeldung <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
          <FooterLinks />
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <AuthBrandPanel />

      <div className="auth-form-panel">
        <div className="auth-form-top">
          <span>
            Bereits einen Account?
            <Link href="/login">Anmelden</Link>
          </span>
        </div>

        <div className="auth-form-wrap">
          <form className="w-full max-w-[380px]" onSubmit={submit} noValidate>
            <div className="mb-7">
              <h1 className="m-0 mb-2 text-[26px] font-semibold tracking-[-0.025em] leading-[1.15]">
                Account erstellen
              </h1>
              <p className="m-0 text-[13.5px] text-muted-foreground">
                Starte deine Outreach Plattform in unter 2 Minuten.
              </p>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <AuthOAuthRow mode="register" />

            <AuthDivider>oder per E-Mail</AuthDivider>

            <div className="space-y-2 mb-3.5">
              <Label htmlFor="reg-name" className="text-[12.5px] font-medium">
                Vollständiger Name
              </Label>
              <Input
                id="reg-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Max Mustermann"
                autoComplete="name"
                autoFocus
                className="h-10"
              />
            </div>

            <div className="space-y-2 mb-3.5">
              <Label htmlFor="reg-company" className="text-[12.5px] font-medium">
                Unternehmen / Firma
              </Label>
              <Input
                id="reg-company"
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="z. B. Acme Studio GmbH"
                autoComplete="organization"
                className="h-10"
              />
            </div>

            <div className="space-y-2 mb-3.5">
              <Label htmlFor="reg-email" className="text-[12.5px] font-medium">
                Geschäftliche E-Mail
              </Label>
              <Input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@firma.at"
                autoComplete="email"
                className="h-10"
              />
            </div>

            <div className="space-y-2 mb-2">
              <Label htmlFor="reg-pwd" className="text-[12.5px] font-medium">
                Passwort
              </Label>
              <div className="relative">
                <Input
                  id="reg-pwd"
                  type={show ? "text" : "password"}
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  placeholder="Mindestens 8 Zeichen"
                  autoComplete="new-password"
                  className="h-10 pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  tabIndex={-1}
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Verbergen" : "Anzeigen"}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
              {pwd.length > 0 && (
                <>
                  <div className="flex gap-1 mt-2">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex-1 h-[3px] rounded-full transition-colors",
                          i < strength.level
                            ? strength.label === "weak"   ? "bg-destructive"
                            : strength.label === "medium" ? "bg-amber-500"
                            :                                "bg-emerald-500"
                            : "bg-muted",
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{strength.text}</p>
                </>
              )}
            </div>

            <p className="text-[11.5px] text-muted-foreground leading-[1.55] mt-3">
              Mit der Registrierung akzeptierst du unsere{" "}
              <a href="https://www.ki-kanzlei.at/agb" target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">Nutzungsbedingungen</a> und unsere{" "}
              <a href="https://www.ki-kanzlei.at/datenschutz" target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">Datenschutzerklärung</a>.
              Daten werden ausschließlich in der EU (Frankfurt) verarbeitet.
            </p>

            <div className="flex items-start gap-2 my-4">
              <Checkbox
                id="optin"
                checked={optIn}
                onCheckedChange={(v) => setOptIn(v === true)}
              />
              <Label htmlFor="optin" className="text-[12.5px] font-normal cursor-pointer leading-snug">
                Ich möchte über Produkt-Updates und Tipps informiert werden (optional)
              </Label>
            </div>

            <Button type="submit" className="w-full h-10 gap-2" disabled={!canSubmit}>
              {loading ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Account wird erstellt …</>
              ) : (
                <>Account erstellen <ArrowRight className="h-3.5 w-3.5" /></>
              )}
            </Button>
          </form>
        </div>

        <FooterLinks />
      </div>
    </div>
  );
}

function FooterLinks() {
  return (
    <div className="auth-form-footer">
      <a href="https://www.ki-kanzlei.at/datenschutz" target="_blank" rel="noopener noreferrer">Datenschutz</a>
      <span className="sep">·</span>
      <a href="https://www.ki-kanzlei.at/agb" target="_blank" rel="noopener noreferrer">AGB</a>
      <span className="sep">·</span>
      <a href="https://www.ki-kanzlei.at/impressum" target="_blank" rel="noopener noreferrer">Impressum</a>
      <span className="sep">·</span>
      <span>© {new Date().getFullYear()} KI Kanzlei · ki-kanzlei.at</span>
    </div>
  );
}
