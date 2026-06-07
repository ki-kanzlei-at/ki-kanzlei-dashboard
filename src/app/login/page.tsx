"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff,
  Loader2,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { AuthBrandPanel } from "@/components/auth/AuthBrandPanel";
import { AuthOAuthRow } from "@/components/auth/AuthOAuthRow";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";

type ViewState = "login" | "request-reset" | "set-password";

function mapAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid_credentials"))
    return "E-Mail oder Passwort ist falsch.";
  if (m.includes("email not confirmed"))
    return "E-Mail-Adresse noch nicht bestätigt. Prüfe dein Postfach.";
  if (m.includes("too many requests") || m.includes("rate limit"))
    return "Zu viele Anmeldeversuche. Bitte warte kurz.";
  if (m.includes("user not found"))
    return "Kein Konto mit dieser E-Mail gefunden.";
  return `Anmeldung fehlgeschlagen: ${message}`;
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

/* ── Login form ─────────────────────────────────────────────────── */
function LoginForm({ onForgot }: { onForgot: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !pwd) {
      setError("Bitte E-Mail und Passwort eingeben.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pwd,
      });
      if (authError) { setError(mapAuthError(authError.message)); return; }
      if (!data.session) { setError("Keine Session erhalten. Bitte erneut versuchen."); return; }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Verbindung fehlgeschlagen. Bitte prüfe deine Internetverbindung.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="w-full max-w-[380px]" onSubmit={submit} noValidate>
      <div className="mb-7">
        <h1 className="m-0 mb-2 text-[26px] font-semibold tracking-[-0.025em] leading-[1.15]">
          Willkommen zurück
        </h1>
        <p className="m-0 text-[13.5px] text-muted-foreground">
          Melde dich an, um auf deine Outreach Plattform zuzugreifen.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <AuthOAuthRow mode="login" />

      <AuthDivider>oder mit E-Mail</AuthDivider>

      <div className="space-y-2 mb-3.5">
        <Label htmlFor="login-email" className="text-[12.5px] font-medium">
          E-Mail-Adresse
        </Label>
        <Input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@firma.at"
          autoComplete="email"
          autoFocus
          className="h-10"
        />
      </div>

      <div className="space-y-2 mb-3.5">
        <Label htmlFor="login-pwd" className="text-[12.5px] font-medium">
          Passwort
        </Label>
        <div className="relative">
          <Input
            id="login-pwd"
            type={show ? "text" : "password"}
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="••••••••••••"
            autoComplete="current-password"
            className="h-10 pr-10"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            tabIndex={-1}
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Passwort verbergen" : "Passwort anzeigen"}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between -mt-1 mb-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id="remember"
            checked={remember}
            onCheckedChange={(v) => setRemember(v === true)}
          />
          <Label htmlFor="remember" className="text-[12.5px] font-normal cursor-pointer">
            Angemeldet bleiben
          </Label>
        </div>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-[12.5px] font-medium text-primary"
          onClick={onForgot}
        >
          Passwort vergessen?
        </Button>
      </div>

      <Button type="submit" className="w-full h-10 gap-2" disabled={loading}>
        {loading ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Anmelden …</>
        ) : (
          <>Anmelden <ArrowRight className="h-3.5 w-3.5" /></>
        )}
      </Button>
    </form>
  );
}

/* ── Reset request ─────────────────────────────────────────────── */
function ResetForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) { setError("Bitte E-Mail eingeben."); return; }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?recovery=true`,
      });
      if (resetError) { setError("Fehler beim Senden. Bitte erneut versuchen."); return; }
      setSent(true);
    } catch {
      setError("Verbindung fehlgeschlagen. Bitte prüfe deine Internetverbindung.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="w-full max-w-[380px]">
        <div className="mb-7">
          <h1 className="m-0 mb-2 text-[26px] font-semibold tracking-[-0.025em] leading-[1.15]">
            E-Mail gesendet
          </h1>
          <p className="m-0 text-[13.5px] text-muted-foreground">
            Wir haben einen Link an <b className="text-foreground">{email}</b> gesendet. Prüfe dein Postfach.
          </p>
        </div>
        <Button type="button" variant="outline" className="w-full h-10 gap-2" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" /> Zurück zur Anmeldung
        </Button>
      </div>
    );
  }

  return (
    <form className="w-full max-w-[380px]" onSubmit={submit} noValidate>
      <div className="mb-7">
        <h1 className="m-0 mb-2 text-[26px] font-semibold tracking-[-0.025em] leading-[1.15]">
          Passwort zurücksetzen
        </h1>
        <p className="m-0 text-[13.5px] text-muted-foreground">
          Gib deine E-Mail ein, um einen Reset-Link zu erhalten.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2 mb-4">
        <Label htmlFor="reset-email" className="text-[12.5px] font-medium">
          E-Mail-Adresse
        </Label>
        <Input
          id="reset-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@firma.at"
          autoComplete="email"
          autoFocus
          className="h-10"
        />
      </div>

      <Button type="submit" className="w-full h-10 gap-2" disabled={loading}>
        {loading ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Wird gesendet …</>
        ) : "Link senden"}
      </Button>

      <div className="mt-3 text-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-[12.5px] text-muted-foreground hover:text-foreground gap-1.5"
          onClick={onBack}
        >
          <ArrowLeft className="h-3 w-3" /> Zurück zur Anmeldung
        </Button>
      </div>
    </form>
  );
}

/* ── Set new password ──────────────────────────────────────────── */
function SetPasswordForm() {
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pwd.length < 6) { setError("Mindestens 6 Zeichen."); return; }
    if (pwd !== confirm) { setError("Die Passwörter stimmen nicht überein."); return; }
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password: pwd });
      if (updateError) { setError(updateError.message); return; }
      setDone(true);
      setTimeout(() => { window.location.href = "/dashboard"; }, 1500);
    } catch {
      setError("Verbindung fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="w-full max-w-[380px]">
        <div className="mb-7">
          <h1 className="m-0 mb-2 text-[26px] font-semibold tracking-[-0.025em] leading-[1.15]">
            Passwort geändert
          </h1>
          <p className="m-0 text-[13.5px] text-muted-foreground">
            Du wirst zum Dashboard weitergeleitet.
          </p>
        </div>
        <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800 [&>svg]:text-emerald-600">
          <CheckCircle2 />
          <AlertDescription>Erfolg! Einen Moment …</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <form className="w-full max-w-[380px]" onSubmit={submit} noValidate>
      <div className="mb-7">
        <h1 className="m-0 mb-2 text-[26px] font-semibold tracking-[-0.025em] leading-[1.15]">
          Neues Passwort wählen
        </h1>
        <p className="m-0 text-[13.5px] text-muted-foreground">
          Wähle ein neues, sicheres Passwort für dein Konto.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2 mb-3.5">
        <Label htmlFor="new-pwd" className="text-[12.5px] font-medium">
          Neues Passwort
        </Label>
        <div className="relative">
          <Input
            id="new-pwd"
            type={show ? "text" : "password"}
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="Mindestens 6 Zeichen"
            autoComplete="new-password"
            autoFocus
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
      </div>

      <div className="space-y-2 mb-4">
        <Label htmlFor="confirm-pwd" className="text-[12.5px] font-medium">
          Passwort bestätigen
        </Label>
        <Input
          id="confirm-pwd"
          type={show ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Passwort wiederholen"
          autoComplete="new-password"
          className="h-10"
        />
      </div>

      <Button type="submit" className="w-full h-10 gap-2" disabled={loading}>
        {loading ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Wird gespeichert …</>
        ) : "Passwort speichern"}
      </Button>
    </form>
  );
}

/* ── Page wrapper ─────────────────────────────────────────────── */
function LoginContent() {
  const searchParams = useSearchParams();
  const isRecovery = searchParams.get("recovery") === "true";
  const urlError = searchParams.get("error");
  const [view, setView] = useState<ViewState>(isRecovery ? "set-password" : "login");

  return (
    <div className="auth-shell">
      <AuthBrandPanel />

      <div className="auth-form-panel">
        <div className="auth-form-top">
          {view === "login" ? (
            <span>
              Noch keinen Account?
              <Link href="/register">Jetzt kostenlos starten</Link>
            </span>
          ) : (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-[13px] gap-1.5"
              onClick={() => setView("login")}
            >
              <ArrowLeft className="h-3 w-3" /> Zurück zur Anmeldung
            </Button>
          )}
        </div>

        <div className="auth-form-wrap">
          {urlError && view === "login" ? (
            <div className="w-full max-w-[380px]">
              <Alert variant="destructive" className="mb-4">
                <AlertCircle />
                <AlertDescription>
                  Anmeldung fehlgeschlagen — bitte erneut versuchen.
                </AlertDescription>
              </Alert>
              <LoginForm onForgot={() => setView("request-reset")} />
            </div>
          ) : (
            <>
              {view === "login" && <LoginForm onForgot={() => setView("request-reset")} />}
              {view === "request-reset" && <ResetForm onBack={() => setView("login")} />}
              {view === "set-password" && <SetPasswordForm />}
            </>
          )}
        </div>

        <div className="auth-form-footer">
          <a href="https://www.ki-kanzlei.at/datenschutz" target="_blank" rel="noopener noreferrer">Datenschutz</a>
          <span className="sep">·</span>
          <a href="https://www.ki-kanzlei.at/agb" target="_blank" rel="noopener noreferrer">AGB</a>
          <span className="sep">·</span>
          <a href="https://www.ki-kanzlei.at/impressum" target="_blank" rel="noopener noreferrer">Impressum</a>
          <span className="sep">·</span>
          <span>© {new Date().getFullYear()} KI Kanzlei · ki-kanzlei.at</span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-shell">
          <AuthBrandPanel />
          <div className="auth-form-panel">
            <div className="auth-form-wrap">
              <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
            </div>
          </div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
