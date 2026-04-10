"use client";

import Image from "next/image";
import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Eye, EyeOff, AlertCircle, ArrowLeft, CheckCircle2,
  KeyRound, Search, Sparkles, BarChart3, Shield, Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card, CardContent, CardDescription,
  CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Form, FormControl, FormField, FormItem,
  FormLabel, FormMessage,
} from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";

/* ── Schemas ── */
const loginSchema = z.object({
  email: z.string().min(1, "E-Mail ist erforderlich").email("Keine gültige E-Mail"),
  password: z.string().min(1, "Passwort ist erforderlich"),
});

const resetSchema = z.object({
  email: z.string().min(1, "E-Mail ist erforderlich").email("Keine gültige E-Mail"),
});

const newPasswordSchema = z
  .object({
    password: z.string().min(6, "Mindestens 6 Zeichen"),
    confirm: z.string().min(1, "Bitte Passwort bestätigen"),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Die Passwörter stimmen nicht überein",
    path: ["confirm"],
  });

type LoginValues = z.infer<typeof loginSchema>;
type ResetValues = z.infer<typeof resetSchema>;
type NewPasswordValues = z.infer<typeof newPasswordSchema>;

/* ── Features ── */
const features = [
  { icon: Search,    label: "Leads automatisch finden" },
  { icon: Sparkles,  label: "KI-gestützte Datenanreicherung" },
  { icon: BarChart3, label: "Pipeline & Statusverfolgung" },
  { icon: Shield,    label: "DSGVO-konform & sicher" },
];

/* ── Error mapper ── */
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

/* ══════════════════════════════════════════════
   Set New Password Form
   ══════════════════════════════════════════════ */
function SetNewPasswordForm() {
  const [showPw, setShowPw] = useState(false);
  const [done, setDone]     = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const form = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });

  async function onSubmit(values: NewPasswordValues) {
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password: values.password });
      if (updateError) { setError(updateError.message); return; }
      setDone(true);
      setTimeout(() => { window.location.href = "/dashboard"; }, 2000);
    } catch {
      setError("Verbindung fehlgeschlagen. Bitte versuche es erneut.");
    }
  }

  if (done) {
    return (
      <div className="space-y-5 text-center py-4">
        <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-foreground">Passwort geändert</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Du wirst zum Dashboard weitergeleitet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Neues Passwort</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showPw ? "text" : "password"}
                    placeholder="Mindestens 6 Zeichen"
                    autoComplete="new-password"
                    autoFocus
                    className="pr-10"
                    {...field}
                  />
                  <Button
                    type="button" variant="ghost" size="icon" tabIndex={-1}
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Passwort bestätigen</FormLabel>
              <FormControl>
                <Input
                  type={showPw ? "text" : "password"}
                  placeholder="Passwort wiederholen"
                  autoComplete="new-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wird gespeichert…</>
          ) : (
            <><KeyRound className="h-4 w-4 mr-2" />Passwort speichern</>
          )}
        </Button>
      </form>
    </Form>
  );
}

/* ══════════════════════════════════════════════
   Password Reset Form
   ══════════════════════════════════════════════ */
function PasswordResetForm({ onBack }: { onBack: () => void }) {
  const [sent,  setSent]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ResetValues) {
    setError(null);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(values.email, {
        redirectTo: `${window.location.origin}/auth/callback?recovery=true`,
      });
      if (resetError) { setError("Fehler beim Senden. Bitte versuche es erneut."); return; }
      setSent(true);
    } catch {
      setError("Verbindung fehlgeschlagen. Bitte prüfe deine Internetverbindung.");
    }
  }

  if (sent) {
    return (
      <div className="space-y-5 text-center py-4">
        <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-foreground">E-Mail gesendet</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Wir haben einen Link an{" "}
            <span className="font-medium text-foreground">{form.getValues("email")}</span> gesendet.
          </p>
        </div>
        <Button variant="outline" className="w-full" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />Zurück zur Anmeldung
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-Mail Adresse</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="max@mustermann.at"
                  autoComplete="email"
                  autoFocus
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wird gesendet…</>
          ) : "Link senden"}
        </Button>

        <Button
          type="button" variant="ghost"
          className="w-full text-xs text-muted-foreground"
          onClick={onBack}
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Zurück zur Anmeldung
        </Button>
      </form>
    </Form>
  );
}

/* ══════════════════════════════════════════════
   Login Form
   ══════════════════════════════════════════════ */
function LoginForm({ onForgotPassword }: { onForgotPassword: () => void }) {
  const [showPw,    setShowPw]    = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    setAuthError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (error)        { setAuthError(mapAuthError(error.message)); return; }
      if (!data.session) { setAuthError("Keine Session erhalten. Bitte versuche es erneut."); return; }
      window.location.href = "/dashboard";
    } catch {
      setAuthError("Verbindung fehlgeschlagen. Bitte prüfe deine Internetverbindung.");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {authError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{authError}</AlertDescription>
          </Alert>
        )}

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-Mail Adresse</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="max@mustermann.at"
                  autoComplete="email"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Passwort</FormLabel>
                <button
                  type="button"
                  onClick={onForgotPassword}
                  className="text-[11px] text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  Passwort vergessen?
                </button>
              </div>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showPw ? "text" : "password"}
                    placeholder="Dein Passwort"
                    autoComplete="current-password"
                    className="pr-10"
                    {...field}
                  />
                  <Button
                    type="button" variant="ghost" size="icon" tabIndex={-1}
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Anmeldung läuft…</>
          ) : "Zum Dashboard"}
        </Button>
      </form>
    </Form>
  );
}

/* ══════════════════════════════════════════════
   Page
   ══════════════════════════════════════════════ */
type ViewState = "login" | "request-reset" | "set-password";

function getTitle(view: ViewState): string {
  switch (view) {
    case "login":         return "Willkommen zurück";
    case "request-reset": return "Passwort zurücksetzen";
    case "set-password":  return "Neues Passwort wählen";
  }
}

function getDescription(view: ViewState): string {
  switch (view) {
    case "login":         return "Melde dich an, um fortzufahren";
    case "request-reset": return "Gib deine E-Mail ein, um einen Reset-Link zu erhalten";
    case "set-password":  return "Wähle ein neues, sicheres Passwort für dein Konto";
  }
}

function LoginContent() {
  const searchParams = useSearchParams();
  const isRecovery   = searchParams.get("recovery") === "true";
  const [view, setView] = useState<ViewState>(isRecovery ? "set-password" : "login");

  useEffect(() => {
    if (window.location.hash.includes("type=recovery")) setView("set-password");
  }, []);

  return (
    <div className="min-h-screen w-full flex">

      {/* ── Left: Brand panel ── */}
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
            width={176} height={176} quality={100}
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

      {/* ── Right: Form panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-background relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-20"
            style={{ background: "radial-gradient(circle, oklch(0.546 0.244 263 / 0.2) 0%, transparent 70%)" }} />
        </div>

        {/* Mobile logo */}
        <div className="lg:hidden mb-8 flex items-center gap-2.5">
          <Image
            src="/images/KI-Kanzlei_Logo_2026.png"
            alt="KI Kanzlei"
            width={72} height={72} quality={100}
            className="h-9 w-9 rounded-lg shadow-md"
            priority
          />
          <span className="text-lg font-bold text-foreground tracking-tight">KI Kanzlei</span>
        </div>

        <div className="relative z-10 w-full max-w-sm">
          <Card className="border-border/50 shadow-xl shadow-black/5 overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

            <CardHeader className="pt-8 pb-5 px-7">
              <CardTitle className="text-xl font-bold text-foreground">
                {getTitle(view)}
              </CardTitle>
              <CardDescription>
                {getDescription(view)}
              </CardDescription>
            </CardHeader>

            <CardContent className="px-7 pb-5">
              {view === "login"         && <LoginForm onForgotPassword={() => setView("request-reset")} />}
              {view === "request-reset" && <PasswordResetForm onBack={() => setView("login")} />}
              {view === "set-password"  && <SetNewPasswordForm />}
            </CardContent>

            <CardFooter className="flex flex-col gap-4 px-7 pb-7 pt-0">
              <div className="flex items-center gap-3 w-full">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground/50 font-medium">Verschlüsselte Verbindung</span>
                <Separator className="flex-1" />
              </div>
              <p className="text-center text-[11px] text-muted-foreground/45 leading-relaxed">
                Zugang nur für autorisierte Nutzer.<br />
                Probleme? Kontaktiere deinen Administrator.
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
