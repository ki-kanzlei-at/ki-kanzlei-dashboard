"use client";

import { useState, useMemo, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Search, Check, Upload, Mail, Users, Linkedin, Package, CreditCard,
  Lock, Shield, Key, Copy, RefreshCw, EyeIcon, EyeOffIcon, GitBranch,
  Globe, Clock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import EmailAccountsManager from "@/components/settings/EmailAccountsManager";
import {
  type SendWindow, DEFAULT_SEND_WINDOW, normalizeSendWindow,
} from "@/lib/campaigns/send-window";
import { renderSignatureHtml } from "@/lib/email/signature";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { createClient } from "@/lib/supabase/client";
import { INTEGRATIONS, type IntegrationProvider } from "@/lib/integrations/providers";
import { cn } from "@/lib/utils";

/* ───────────────────────────── Navigation ───────────────────────────── */
type SectionKey = "profile" | "offering" | "leads" | "mailbox" | "social" | "crm" | "billing";

const SECTIONS: { group: string; items: { k: SectionKey; label: string; icon: React.ComponentType<{ className?: string }> }[] }[] = [
  {
    group: "Konto",
    items: [
      { k: "profile",  label: "Mein Profil", icon: Users },
      { k: "offering", label: "Angebot",     icon: Package },
    ],
  },
  {
    group: "Daten & Leads",
    items: [
      { k: "leads", label: "Leads & Suche", icon: Search },
    ],
  },
  {
    group: "Kanäle",
    items: [
      { k: "mailbox", label: "E-Mail-Konten", icon: Mail },
      { k: "social",  label: "LinkedIn",      icon: Linkedin },
    ],
  },
  {
    group: "Integrationen",
    items: [
      { k: "crm", label: "CRM-Integrationen", icon: GitBranch },
    ],
  },
  {
    group: "Plan",
    items: [
      { k: "billing", label: "Abrechnung & Credits", icon: CreditCard },
    ],
  },
];
const SECTION_KEYS = SECTIONS.flatMap(g => g.items.map(i => i.k as string));
const SECTION_LABEL: Record<string, string> = Object.fromEntries(
  SECTIONS.flatMap(g => g.items.map(i => [i.k, i.label] as const))
);

/* ───────────────────────── Helpers ───────────────────────── */
function avatarColor(s: string) {
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `oklch(0.62 0.13 ${h})`;
}

function initials(name: string) {
  return name.split(" ").map(s => s[0]).join("").slice(0, 2);
}

/* ─── Lemlist-Stil: Reihe (Label/Beschreibung links · Control rechts) ─── */
function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight tracking-tight">{title}</h1>
        {sub && <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-muted-foreground">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}

/* Weißer Container pro Abschnitt (Design „card"): Header (Titel/Beschreibung) + Body */
function SectionCard({ title, desc, action, children, bodyClassName }: {
  title?: string; desc?: string; action?: React.ReactNode; children: React.ReactNode; bodyClassName?: string;
}) {
  return (
    <div className="mb-4 rounded-[10px] border bg-card shadow-sm">
      {(title || action) && (
        <div className="flex items-end justify-between gap-4 border-b px-5 pt-4 pb-3.5">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>}
            {desc && <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{desc}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn("px-5 py-3", bodyClassName)}>{children}</div>
    </div>
  );
}

function SettingRow({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-2 border-t py-4 first:border-t-0 sm:grid-cols-[1fr_minmax(0,440px)] sm:items-center sm:gap-8">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug text-foreground">{title}</p>
        {desc && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>}
      </div>
      <div className="min-w-0 sm:w-full">{children}</div>
    </div>
  );
}

function IntegrationRow({ icon, title, subtitle, action }: {
  icon: React.ReactNode; title: React.ReactNode; subtitle: React.ReactNode; action: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3.5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function RowToggle({ title, desc, checked, onCheckedChange }: { title: string; desc?: string; checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-6 border-t py-4 first:border-t-0">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug">{title}</p>
        {desc && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/* ───────────────────────────── Rail ───────────────────────────── */
function SettingsRail({ current, onChange }: { current: SectionKey; onChange: (k: SectionKey) => void }) {
  const [query, setQuery] = useState("");
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS
      .map(g => ({ ...g, items: g.items.filter(it => it.label.toLowerCase().includes(q)) }))
      .filter(g => g.items.length > 0);
  }, [query]);

  return (
    <aside className="w-full shrink-0 border-b bg-card lg:h-full lg:w-72 lg:overflow-y-auto lg:border-b-0 lg:border-r">
      <div className="px-5 pt-6 pb-3">
        <h2 className="text-base font-semibold tracking-tight">Einstellungen</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Konto, Kanäle, Plan</p>
      </div>
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Einstellungen durchsuchen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>
      <nav className="flex flex-col gap-0.5 px-3 pb-6">
        {filteredGroups.map((g) => (
          <div key={g.group} className="flex flex-col">
            <div className="px-2.5 pt-3 pb-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
              {g.group}
            </div>
            {g.items.map((it) => {
              const Icon = it.icon;
              const active = current === it.k;
              return (
                <button
                  key={it.k}
                  type="button"
                  onClick={() => onChange(it.k)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                    active
                      ? "bg-accent text-primary font-medium"
                      : "text-foreground/80 hover:bg-accent/60 hover:text-foreground"
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                  <span className="truncate">{it.label}</span>
                </button>
              );
            })}
          </div>
        ))}
        {filteredGroups.length === 0 && (
          <p className="px-2.5 py-2 text-xs text-muted-foreground">Keine Treffer.</p>
        )}
      </nav>
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SECTIONS — einheitlicher Lemlist-Stil
   ═══════════════════════════════════════════════════════════════════════ */

/* ─── Mein Profil (Lemlist „Account settings", echt: brand_settings + notification_settings) ─── */
function ProfileSection() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<"admin" | "user" | null>(null);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [brand, setBrand] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Login-E-Mail + Rolle aus Session/user_profiles
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (cancelled) return;
      if (data.user?.email) setLoginEmail(data.user.email);
      if (uid) {
        const { data: prof } = await supabase.from("user_profiles").select("role").eq("id", uid).single();
        if (!cancelled && (prof?.role === "admin" || prof?.role === "user")) setRole(prof.role);
      }
    })().catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, []);

  // Gespeicherte Werte (Name, Avatar) laden
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.data) return;
        const str = (v: unknown) => (typeof v === "string" ? v : "");
        const b = (j.data.brand_settings ?? {}) as Record<string, unknown>;
        setBrand(b);
        setFirstName(str(b.first_name));
        setLastName(str(b.last_name));
        if (typeof b.avatar_url === "string") setAvatarUrl(b.avatar_url);
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const fullName = `${firstName} ${lastName}`.trim() || (loginEmail ? loginEmail.split("@")[0] : "—");

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_settings: {
            ...brand,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            avatar_url: avatarUrl,
          },
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        toast.error(json?.error || "Speichern fehlgeschlagen");
        return;
      }
      // Anzeigename in user_profiles (Sidebar + Begrüßung nutzen display_name)
      const displayName = `${firstName} ${lastName}`.trim();
      if (displayName) {
        const supabase = createClient();
        const { data: u } = await supabase.auth.getUser();
        if (u.user?.id) {
          await supabase.from("user_profiles").update({ display_name: displayName }).eq("id", u.user.id);
        }
      }
      toast.success("Profil gespeichert");
      // Server-Layout neu rendern → Sidebar übernimmt Avatar & Name sofort (sonst erst nach Full-Reload)
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Netzwerkfehler");
    } finally {
      setSaving(false);
    }
  }, [brand, firstName, lastName, avatarUrl, router]);

  async function handleAvatarUpload(file: File) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { toast.error("Nur PNG, JPG oder WebP"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Datei zu groß (max. 2 MB)"); return; }
    setUploadingAvatar(true);
    try {
      const supabase = createClient();
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Nicht angemeldet");
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${uid}/avatar.${ext}`;
      const { error } = await supabase.storage.from("brand-assets").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("brand-assets").getPublicUrl(path);
      setAvatarUrl(`${pub.publicUrl}?t=${Date.now()}`);
      toast.success("Bild hochgeladen — zum Übernehmen „Speichern“");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setUploadingAvatar(false);
    }
  }

  const themeOptions = [
    { key: "light",  label: "Hell",   cls: "bg-white text-neutral-700" },
    { key: "dark",   label: "Dunkel", cls: "bg-neutral-900 text-neutral-100" },
    { key: "system", label: "System", cls: "bg-gradient-to-r from-white to-neutral-900 text-neutral-500" },
  ] as const;

  return (
    <>
      <PageHead title="Mein Profil" sub="Deine persönlichen Daten, Login-Methoden und Darstellung." />

      <SectionCard title="Persönliche Informationen" desc="Name, Login-E-Mail und Rolle — der Name erscheint in Sidebar und Begrüßung.">
        <div className="flex items-center gap-4 pb-4">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="Profilbild" className="size-14 rounded-full object-cover" />
          ) : (
            <div
              className="flex size-14 items-center justify-center rounded-full text-lg font-medium text-white"
              style={{ background: avatarColor(fullName) }}
            >
              {initials(fullName) || "·"}
            </div>
          )}
          <label className={cn(
            "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium shadow-xs transition-colors hover:bg-accent",
            uploadingAvatar && "pointer-events-none opacity-60",
          )}>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={uploadingAvatar}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f); e.target.value = ""; }}
            />
            {uploadingAvatar ? <RefreshCw className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {uploadingAvatar ? "Lädt…" : "Bild hochladen"}
          </label>
        </div>

        <SettingRow title="Vorname" desc="Der Name, den dein Team von dir sieht.">
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={loading} placeholder="Vorname" />
        </SettingRow>
        <SettingRow title="Nachname" desc="Der Name, den dein Team von dir sieht.">
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={loading} placeholder="Nachname" />
        </SettingRow>
        <SettingRow title="Login-E-Mail" desc="Deine Konto-E-Mail für Anmeldung, Infos & Benachrichtigungen.">
          <Input value={loginEmail} type="email" disabled />
        </SettingRow>
        <SettingRow title="Rolle" desc="Deine Berechtigungsstufe in diesem Workspace.">
          <span className="inline-flex items-center rounded-full border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
            {role === "admin" ? "Administrator" : role === "user" ? "Benutzer" : "—"}
          </span>
        </SettingRow>
      </SectionCard>

      <SectionCard title="Sicherheit" desc="Login-Methoden, Passwort und Zwei-Faktor-Authentifizierung.">
        <ProfileSecurity loginEmail={loginEmail} />
      </SectionCard>

      <SectionCard title="Darstellung" desc="Erscheinungsbild von KI Kanzlei.">
        <SettingRow title="Theme" desc="Hell, Dunkel oder System.">
          <div className="flex gap-3">
            {themeOptions.map((opt) => (
              <button key={opt.key} type="button" onClick={() => setTheme(opt.key)} className="flex flex-col items-center gap-1.5">
                <span className={cn(
                  "relative flex h-12 w-16 items-center justify-center overflow-hidden rounded-md border text-[11px] font-medium transition-all",
                  opt.cls,
                  mounted && theme === opt.key ? "ring-2 ring-primary ring-offset-2" : "opacity-80 hover:opacity-100",
                )}>
                  Aa
                  {mounted && theme === opt.key && (
                    <span className="absolute right-1 top-1 inline-flex size-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-2.5" />
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{opt.label}</span>
              </button>
            ))}
          </div>
        </SettingRow>
      </SectionCard>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || loading}>
          {saving ? "Speichert…" : "Alle Änderungen speichern"}
        </Button>
      </div>
    </>
  );
}

/* ─── Sicherheit: Login-Methoden + Passwort + 2FA (echt gegen Supabase Auth) ─── */
function ProfileSecurity({ loginEmail }: { loginEmail: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [providers, setProviders] = useState<string[]>([]);
  const [verifiedTotpId, setVerifiedTotpId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Passwort-Formular
  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);

  // 2FA-Enroll-Dialog
  const [mfaOpen, setMfaOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");

  const reload = useCallback(async () => {
    const [{ data: idData }, { data: facData }] = await Promise.all([
      supabase.auth.getUserIdentities(),
      supabase.auth.mfa.listFactors(),
    ]);
    setProviders((idData?.identities ?? []).map((i) => i.provider));
    const verified = (facData?.totp ?? []).find((f) => f.status === "verified");
    setVerifiedTotpId(verified?.id ?? null);
  }, [supabase]);

  useEffect(() => { reload().catch(() => { /* silent */ }); }, [reload]);

  const googleLinked = providers.includes("google");

  async function linkGoogle() {
    setBusy("google");
    try {
      const { error } = await supabase.auth.linkIdentity({ provider: "google" });
      if (error) throw error;
      // Bei Erfolg redirectet Supabase zum OAuth-Flow.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verknüpfen fehlgeschlagen");
      setBusy(null);
    }
  }

  async function unlinkGoogle() {
    setBusy("google");
    try {
      const { data } = await supabase.auth.getUserIdentities();
      const all = data?.identities ?? [];
      if (all.length < 2) { toast.error("Mindestens eine Login-Methode muss bleiben."); return; }
      const ident = all.find((i) => i.provider === "google");
      if (!ident) throw new Error("Google-Identität nicht gefunden");
      const { error } = await supabase.auth.unlinkIdentity(ident);
      if (error) throw error;
      toast.success("Google getrennt");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Trennen fehlgeschlagen");
    } finally { setBusy(null); }
  }

  async function savePassword() {
    if (newPw.length < 8) { toast.error("Mindestens 8 Zeichen"); return; }
    if (newPw !== confirmPw) { toast.error("Passwörter stimmen nicht überein"); return; }
    setBusy("pw");
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      toast.success("Passwort gespeichert");
      setPwOpen(false); setNewPw(""); setConfirmPw("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehlgeschlagen");
    } finally { setBusy(null); }
  }

  async function startMfa() {
    setBusy("mfa");
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      setCode("");
      setMfaOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "2FA-Start fehlgeschlagen");
    } finally { setBusy(null); }
  }

  async function verifyMfa() {
    setBusy("mfa");
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr) throw chErr;
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: code.trim() });
      if (vErr) throw vErr;
      toast.success("Zwei-Faktor-Authentifizierung aktiviert");
      setMfaOpen(false);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Code ungültig");
    } finally { setBusy(null); }
  }

  async function disableMfa() {
    if (!verifiedTotpId) return;
    setBusy("mfa");
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: verifiedTotpId });
      if (error) throw error;
      toast.success("Zwei-Faktor-Authentifizierung deaktiviert");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehlgeschlagen");
    } finally { setBusy(null); }
  }

  return (
    <>
      <p className="pb-3 text-sm font-medium text-foreground">Anmeldemethoden</p>
      <div className="grid gap-2.5">
        {/* Google */}
        <IntegrationRow
          icon={
            // eslint-disable-next-line @next/next/no-img-element
            <img src="https://cdn.simpleicons.org/google/737373" alt="Google" className="size-4" />
          }
          title="Mit Google anmelden"
          subtitle={googleLinked
            ? <>Verknüpft{loginEmail ? <> mit <b className="font-semibold text-foreground">{loginEmail}</b></> : null} — 1-Klick-Login aktiv.</>
            : "Verknüpfe dein Google-Konto für 1-Klick-Login."}
          action={googleLinked
            ? <Button variant="outline" size="sm" disabled={busy === "google"} onClick={unlinkGoogle}>Trennen</Button>
            : <Button variant="outline" size="sm" disabled={busy === "google"} onClick={linkGoogle}>Verbinden</Button>}
        />

        {/* Passwort */}
        <div className="rounded-lg border p-3.5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Lock className="size-4" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Mit Passwort anmelden</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Setze oder ändere dein Passwort.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setPwOpen((v) => !v)}>{pwOpen ? "Abbrechen" : "Passwort ändern"}</Button>
          </div>
          {pwOpen && (
            <div className="mt-3 grid gap-3 border-t pt-3">
              <div className="relative max-w-sm">
                <Input type={showPw ? "text" : "password"} placeholder="Neues Passwort (min. 8 Zeichen)" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="pr-9" autoComplete="new-password" />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 size-6 inline-grid place-items-center rounded text-muted-foreground hover:bg-muted">
                  {showPw ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                </button>
              </div>
              <Input type={showPw ? "text" : "password"} placeholder="Passwort wiederholen" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="max-w-sm" autoComplete="new-password" />
              <div>
                <Button size="sm" disabled={busy === "pw"} onClick={savePassword}>{busy === "pw" ? "Speichert…" : "Passwort speichern"}</Button>
              </div>
            </div>
          )}
        </div>

        {/* 2FA */}
        <IntegrationRow
          icon={<Shield className="size-4" />}
          title="Zwei-Faktor-Authentifizierung"
          subtitle={verifiedTotpId ? "Aktiv — per Authenticator-App." : "Zusätzliche Verifizierung per Authenticator-App (TOTP)."}
          action={verifiedTotpId
            ? <Button variant="outline" size="sm" disabled={busy === "mfa"} onClick={disableMfa}>Deaktivieren</Button>
            : <Button variant="outline" size="sm" disabled={busy === "mfa"} onClick={startMfa}>Aktivieren</Button>}
        />
      </div>

      {/* 2FA-Enroll-Dialog */}
      <Dialog open={mfaOpen} onOpenChange={(o) => { if (!o) setMfaOpen(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>Zwei-Faktor-Authentifizierung</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Scanne den QR-Code mit deiner Authenticator-App (Google Authenticator, Authy, 1Password) und gib den 6-stelligen Code ein.
          </p>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="2FA QR-Code" className="mx-auto size-44 rounded-md bg-white p-2" />
          )}
          {secret && (
            <p className="text-center text-[11px] text-muted-foreground">
              Manuell: <span className="select-all font-mono">{secret}</span>
            </p>
          )}
          <Input
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="text-center text-lg tracking-[0.4em]"
          />
          <Button disabled={busy === "mfa" || code.length !== 6} onClick={verifyMfa}>
            {busy === "mfa" ? "Prüft…" : "Aktivieren"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Angebot & Positionierung (echt, persistiert in brand_settings) ─── */
function OfferingSection() {
  const [offering, setOffering] = useState("");
  const [valueProp, setValueProp] = useState("");
  const [target, setTarget] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [tagline, setTagline] = useState("");
  const [brand, setBrand] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.data) return;
        const b = (j.data.brand_settings ?? {}) as Record<string, unknown>;
        setBrand(b);
        if (typeof b.offering === "string") setOffering(b.offering);
        if (typeof b.value_prop === "string") setValueProp(b.value_prop);
        if (typeof b.target_customer === "string") setTarget(b.target_customer);
        if (typeof b.company_name === "string") setCompanyName(b.company_name);
        if (typeof b.website === "string") setWebsite(b.website);
        if (typeof b.tagline === "string") setTagline(b.tagline);
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_settings: {
            ...brand,
            offering: offering.trim(),
            value_prop: valueProp.trim(),
            target_customer: target.trim(),
            company_name: companyName.trim(),
            website: website.trim(),
            tagline: tagline.trim(),
          },
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        toast.error(json?.error || "Speichern fehlgeschlagen");
        return;
      }
      toast.success("Angebot gespeichert");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Netzwerkfehler");
    } finally {
      setSaving(false);
    }
  }, [brand, offering, valueProp, target, companyName, website, tagline]);

  return (
    <>
      <PageHead title="Angebot & Positionierung" sub="Beschreibe dein Unternehmen und Angebot — die Basis, mit der die KI jeden Outreach personalisiert." />

      <SectionCard title="Unternehmen" desc="Name, Website und Slogan deines Unternehmens.">
        <SettingRow title="Firmenname" desc="Erscheint in Mails & PDFs und als Kampagnen-Variable.">
          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={loading} placeholder="z. B. KI Kanzlei GmbH" />
        </SettingRow>
        <SettingRow title="Website" desc="Deine Haupt-Website.">
          <Input value={website} onChange={(e) => setWebsite(e.target.value)} disabled={loading} placeholder="https://ki-kanzlei.at" />
        </SettingRow>
        <SettingRow title="Slogan / Tagline" desc="Kurzer Claim — optional im Outreach nutzbar.">
          <Input value={tagline} onChange={(e) => setTagline(e.target.value)} disabled={loading} placeholder="z. B. KI für Kanzleien" />
        </SettingRow>
      </SectionCard>

      <SectionCard title="Dein Angebot" desc="Je konkreter, desto treffsicherer die KI-Empfehlungen — genutzt vom AI Researcher und für LinkedIn-Kampagnen.">
        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="off-products">Produkte &amp; Dienstleistungen</Label>
            <Textarea
              id="off-products"
              rows={4}
              value={offering}
              disabled={loading}
              placeholder="z. B. KI-gestützte Software für Kanzleien: automatische Mandatsvorbereitung, Dokumentenanalyse, Fristenmanagement, KI-Assistent für Schriftsätze …"
              onChange={(e) => setOffering(e.target.value)}
              className="resize-y"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="off-vp">Nutzenversprechen / USP</Label>
            <Textarea
              id="off-vp"
              rows={3}
              value={valueProp}
              disabled={loading}
              placeholder="z. B. Spart Kanzleien bis zu 30 % Zeit bei der Mandatsvorbereitung — DSGVO-konform, in Österreich gehostet."
              onChange={(e) => setValueProp(e.target.value)}
              className="resize-y"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="off-target">Zielkunden</Label>
            <Input
              id="off-target"
              value={target}
              disabled={loading}
              placeholder="z. B. Steuerberater & Rechtsanwälte in AT, 5–50 Mitarbeiter"
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || loading}>
          {saving ? "Speichert…" : "Angebot speichern"}
        </Button>
      </div>
    </>
  );
}

/* ─── E-Mail-Konten (echte Verwaltung + globale Versand-Einstellungen) ─── */
function MailboxSection() {
  return (
    <>
      <PageHead title="E-Mail-Konten" sub="Postfächer für den Versand verbinden. Limits, Warmup und Tracking pro Postfach – Versand-Voreinstellungen darunter." />
      <SectionCard>
        <EmailAccountsManager />
      </SectionCard>
      <MailboxSendingSettings />
    </>
  );
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/* Globale Versand-Defaults → campaign_settings (echt, /api/settings) */
function MailboxSendingSettings() {
  const [cs, setCs] = useState<Record<string, unknown>>({});
  const [delayMinutes, setDelayMinutes] = useState(5);
  const [jitter, setJitter] = useState(20);
  const [totalDailyLimit, setTotalDailyLimit] = useState(0);
  const [sendWindow, setSendWindow] = useState<SendWindow>(DEFAULT_SEND_WINDOW);
  const [bounceAction, setBounceAction] = useState("pause");
  const [bounceThreshold, setBounceThreshold] = useState(5);
  const [trackOpens, setTrackOpens] = useState(true);
  const [trackClicks, setTrackClicks] = useState(true);
  const [unsubLink, setUnsubLink] = useState(true);
  const [signature, setSignature] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Aktive Postfächer (für die Kapazitäts-Anzeige)
  const [accounts, setAccounts] = useState<{ is_active: boolean; daily_limit: number }[]>([]);

  useEffect(() => {
    fetch("/api/email-accounts")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (Array.isArray(j?.data)) setAccounts(j.data); })
      .catch(() => { /* silent */ });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.data) return;
        const c = (j.data.campaign_settings ?? {}) as Record<string, unknown>;
        setCs(c);
        if (typeof c.delay_minutes === "number") setDelayMinutes(c.delay_minutes);
        if (typeof c.send_jitter === "number") setJitter(c.send_jitter);
        if (typeof c.total_daily_limit === "number") setTotalDailyLimit(c.total_daily_limit);
        // send_window: Legacy-String ODER neues Objekt → immer normalisieren
        setSendWindow(normalizeSendWindow(c.send_window as SendWindow | string | undefined));
        if (typeof c.bounce_action === "string") setBounceAction(c.bounce_action);
        if (typeof c.bounce_threshold === "number") setBounceThreshold(c.bounce_threshold);
        if (typeof c.track_opens === "boolean") setTrackOpens(c.track_opens);
        if (typeof c.track_clicks === "boolean") setTrackClicks(c.track_clicks);
        if (typeof c.unsub_link === "boolean") setUnsubLink(c.unsub_link);
        // Signatur als HTML in den Rich-Text-Editor (Alt-Plaintext → HTML normalisiert)
        if (typeof c.signature === "string") setSignature(renderSignatureHtml(c.signature));
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function toggleDay(idx: number) {
    setSendWindow((w) => {
      const days = [...w.days];
      days[idx] = !days[idx];
      return { ...w, days };
    });
  }

  const noDaySelected = !sendWindow.days.some(Boolean);

  // ── Kapazität: was lässt das aktuelle Setup pro Tag zu? ──
  const activeAccounts = accounts.filter((a) => a.is_active);
  const mailboxCapacity = activeAccounts.reduce((s, a) => s + (Number(a.daily_limit) || 0), 0);
  const effectiveCapacity = totalDailyLimit > 0 ? Math.min(mailboxCapacity, totalDailyLimit) : mailboxCapacity;
  const activeDayLabels = WEEKDAYS.filter((_, i) => sendWindow.days[i]);
  const windowMinutes = (() => {
    const [fh, fm] = sendWindow.time_from.split(":").map(Number);
    const [th, tm] = sendWindow.time_to.split(":").map(Number);
    return Math.max(0, (th * 60 + (tm || 0)) - (fh * 60 + (fm || 0)));
  })();
  const windowHours = Math.round((windowMinutes / 60) * 10) / 10;

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_settings: {
            ...cs,
            delay_minutes: delayMinutes,
            send_jitter: jitter,
            total_daily_limit: totalDailyLimit,
            send_window: sendWindow,
            bounce_action: bounceAction,
            bounce_threshold: bounceThreshold,
            track_opens: trackOpens,
            track_clicks: trackClicks,
            unsub_link: unsubLink,
            signature: signature.trim(),
          },
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        toast.error(json?.error || "Speichern fehlgeschlagen");
        return;
      }
      toast.success("Versand-Einstellungen gespeichert");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Netzwerkfehler");
    } finally {
      setSaving(false);
    }
  }, [cs, delayMinutes, jitter, totalDailyLimit, sendWindow, bounceAction, bounceThreshold, trackOpens, trackClicks, unsubLink, signature]);

  return (
    <>
      {/* ── Versandfenster (eigener Block: Picker braucht volle Breite) ── */}
      <SectionCard
        title="Versandfenster"
        desc="Tage und Uhrzeiten, an denen E-Mails rausgehen dürfen. Gilt als Standard für neue Kampagnen und als Sicherheitsgrenze für Kampagnen ohne eigenes Fenster."
      >
        <div className="py-2">
          {/* Kapazität des aktuellen Setups */}
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border bg-muted/30 px-3.5 py-3">
            <Mail className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="text-[13px] leading-relaxed">
              {activeAccounts.length === 0 ? (
                <span className="text-muted-foreground">
                  Noch kein aktives Postfach verbunden – aktuell kann <span className="font-medium text-foreground">nichts</span> versendet werden. Verbinde oben ein Postfach.
                </span>
              ) : (
                <>
                  <span className="font-medium text-foreground">
                    Bis zu {effectiveCapacity.toLocaleString("de-DE")} Mails / Tag
                  </span>{" "}
                  <span className="text-muted-foreground">
                    mit {activeAccounts.length} aktiven Postfächern
                    {totalDailyLimit > 0 && mailboxCapacity > totalDailyLimit && ` (durch Gesamtlimit auf ${totalDailyLimit.toLocaleString("de-DE")} gedeckelt)`}.
                  </span>
                  <div className="mt-0.5 text-[12px] text-muted-foreground">
                    Versand{" "}
                    {activeDayLabels.length === 7 ? "täglich" : activeDayLabels.length ? activeDayLabels.join(" · ") : "an keinem Tag"}
                    {windowMinutes > 0
                      ? `, ${sendWindow.time_from}–${sendWindow.time_to} (${windowHours} h) · ${sendWindow.timezone}`
                      : " · ungültiges Zeitfenster"}
                  </div>
                </>
              )}
            </div>
          </div>

          <Label className="text-[13px] font-medium">Wochentage</Label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d, idx) => (
              <button
                key={d}
                type="button"
                disabled={loading}
                onClick={() => toggleDay(idx)}
                className={cn(
                  "h-9 w-11 rounded-md border text-[13px] font-medium transition-colors",
                  sendWindow.days[idx]
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                {d}
              </button>
            ))}
          </div>
          {noDaySelected && (
            <p className="mt-2 text-[11px] text-destructive">Mindestens einen Tag auswählen — sonst wird nie gesendet.</p>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="sw-from" className="text-[13px] font-medium">Uhrzeit von</Label>
              <div className="relative">
                <Clock className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="sw-from" type="time" value={sendWindow.time_from} disabled={loading} className="pl-8"
                  onChange={(e) => setSendWindow((w) => ({ ...w, time_from: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sw-to" className="text-[13px] font-medium">Uhrzeit bis</Label>
              <div className="relative">
                <Clock className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="sw-to" type="time" value={sendWindow.time_to} disabled={loading} className="pl-8"
                  onChange={(e) => setSendWindow((w) => ({ ...w, time_to: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sw-tz" className="text-[13px] font-medium">Zeitzone</Label>
              <Select value={sendWindow.timezone} onValueChange={(v) => setSendWindow((w) => ({ ...w, timezone: v }))}>
                <SelectTrigger id="sw-tz" className="w-full"><Globe className="size-4 text-muted-foreground" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Europe/Vienna">Europe/Vienna</SelectItem>
                  <SelectItem value="Europe/Berlin">Europe/Berlin</SelectItem>
                  <SelectItem value="Europe/Zurich">Europe/Zurich</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Schnellauswahl */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-muted-foreground">Schnellauswahl:</span>
            {([
              { label: "Geschäftszeiten", days: [true, true, true, true, true, false, false], from: "09:00", to: "17:00" },
              { label: "Erweitert", days: [true, true, true, true, true, false, false], from: "08:00", to: "20:00" },
              { label: "Rund um die Uhr", days: [true, true, true, true, true, true, true], from: "00:00", to: "23:59" },
            ] as const).map((p) => {
              const active = p.from === sendWindow.time_from && p.to === sendWindow.time_to
                && p.days.every((d, i) => d === sendWindow.days[i]);
              return (
                <button
                  key={p.label}
                  type="button"
                  disabled={loading}
                  onClick={() => setSendWindow((w) => ({ ...w, days: [...p.days], time_from: p.from, time_to: p.to }))}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                    active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Versand-Einstellungen" desc="Voreinstellungen für neue Kampagnen. Absender, Antwortadresse und Tageslimit legst du oben je Postfach fest.">
      <SettingRow title="Mindestpause zwischen E-Mails" desc="Kürzester Abstand in Minuten zwischen zwei Sendungen. Schützt die Zustellbarkeit – mindestens 1 Minute.">
        <div className="flex items-center gap-2">
          <Input type="number" min={1} max={120} value={delayMinutes} disabled={loading}
            onChange={(e) => setDelayMinutes(Math.max(1, Math.min(120, Number(e.target.value) || 1)))} />
          <span className="whitespace-nowrap text-sm text-muted-foreground">Min.</span>
        </div>
      </SettingRow>
      <SettingRow title="Zufalls-Variation" desc="Streut Pause und Follow-up-Zeitpunkt zufällig (±), damit der Versand nicht maschinell wirkt. Empfohlen: 20 %.">
        <div className="flex items-center gap-2">
          <Input type="number" min={0} max={50} value={jitter} disabled={loading}
            onChange={(e) => setJitter(Math.max(0, Math.min(50, Number(e.target.value) || 0)))} />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      </SettingRow>
      <SettingRow title="Tages-Gesamtlimit" desc="Obergrenze über alle aktiven Postfächer zusammen. 0 = aus (nur die Limits je Postfach gelten).">
        <div className="flex items-center gap-2">
          <Input type="number" min={0} max={5000} step={10} value={totalDailyLimit} disabled={loading}
            onChange={(e) => setTotalDailyLimit(Math.max(0, Math.min(5000, Number(e.target.value) || 0)))} />
          <span className="whitespace-nowrap text-sm text-muted-foreground">/ Tag</span>
        </div>
      </SettingRow>
      <SettingRow title="Bounce-Aktion" desc="Was passiert, wenn ein Postfach zu viele unzustellbare Mails sammelt.">
        <Select value={bounceAction} onValueChange={setBounceAction}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pause">Postfach pausieren</SelectItem>
            <SelectItem value="deactivate">Postfach deaktivieren</SelectItem>
            <SelectItem value="ignore">Nur warnen</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      {bounceAction !== "ignore" && (
        <SettingRow title="Bounce-Schwelle" desc="Anzahl unzustellbarer Mails (rollierend 7 Tage), ab der die Aktion greift.">
          <div className="flex items-center gap-2">
            <Input type="number" min={1} max={100} value={bounceThreshold} disabled={loading}
              onChange={(e) => setBounceThreshold(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} />
            <span className="whitespace-nowrap text-sm text-muted-foreground">Bounces</span>
          </div>
        </SettingRow>
      )}
      <RowToggle title="Öffnungen tracken" desc="Erfasst Öffnungen per unsichtbarem Pixel. Kann die Zustellbarkeit senken." checked={trackOpens} onCheckedChange={setTrackOpens} />
      <RowToggle title="Klicks tracken" desc="Zählt Klicks auf deine Links (Links werden dafür umgeschrieben)." checked={trackClicks} onCheckedChange={setTrackClicks} />
      <RowToggle title="Abmeldelink anhängen" desc="Hängt jeder Mail einen Abmeldelink an – Pflicht nach DSGVO." checked={unsubLink} onCheckedChange={setUnsubLink} />

      <div className="grid gap-2 border-t pt-4">
        <Label htmlFor="mb-signature">Signatur</Label>
        <RichTextEditor
          value={signature}
          onChange={setSignature}
          disabled={loading}
          placeholder={"—\nMarkus Wallner\nKI Kanzlei GmbH"}
        />
        <p className="text-[11px] text-muted-foreground">Wird unter jede Kampagnen- und Test-Mail gesetzt. Fett, Kursiv, Listen &amp; Links werden im Versand übernommen.</p>
      </div>
      </SectionCard>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || loading}>
          {saving ? "Speichert…" : "Versand-Einstellungen speichern"}
        </Button>
      </div>
    </>
  );
}

/* ─── LinkedIn / ConnectSafely (echt) ─── */
interface LinkedInConnectionStatus {
  ok: boolean;
  accountId?: string;
  accountName?: string;
  plan?: string;
  error?: string;
}

function SocialSection() {
  const [apiKey, setApiKey] = useState("");
  const [accountId, setAccountId] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);

  const [dailyLimit, setDailyLimit] = useState(15);
  const [followUpDays, setFollowUpDays] = useState(3);
  const [autoOutreach, setAutoOutreach] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connection, setConnection] = useState<LinkedInConnectionStatus | null>(null);

  const [senderName, setSenderName] = useState("");
  const [senderPosition, setSenderPosition] = useState("");
  const [senderCompany, setSenderCompany] = useState("");
  const [senderSpecialization, setSenderSpecialization] = useState("");
  const [senderTone, setSenderTone] = useState("");
  const [outreachTemplate, setOutreachTemplate] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.data) return;
        const s = j.data;
        if (s.connectsafely_api_key)       setApiKey(s.connectsafely_api_key);
        if (s.connectsafely_account_id)    setAccountId(s.connectsafely_account_id);
        if (s.connectsafely_webhook_secret) setWebhookSecret(s.connectsafely_webhook_secret);
        if (typeof s.linkedin_daily_limit === "number")  setDailyLimit(s.linkedin_daily_limit);
        if (typeof s.linkedin_follow_up_days === "number") setFollowUpDays(s.linkedin_follow_up_days);
        if (typeof s.linkedin_auto_outreach === "boolean") setAutoOutreach(s.linkedin_auto_outreach);
        if (s.connectsafely_api_key && s.connectsafely_account_id) {
          setConnection({ ok: true, accountId: s.connectsafely_account_id });
        }
        const sp = s.linkedin_sender_profile;
        if (sp && typeof sp === "object" && !Array.isArray(sp)) {
          if (typeof sp.name === "string") setSenderName(sp.name);
          if (typeof sp.position === "string") setSenderPosition(sp.position);
          if (typeof sp.company === "string") setSenderCompany(sp.company);
          if (typeof sp.specialization === "string") setSenderSpecialization(sp.specialization);
          if (typeof sp.tone === "string") setSenderTone(sp.tone);
        }
        if (typeof s.linkedin_outreach_template === "string") setOutreachTemplate(s.linkedin_outreach_template);
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleTest = useCallback(async () => {
    if (!apiKey.trim()) {
      toast.error("Bitte API-Key eingeben");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("/api/settings/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "connectsafely",
          credentials: { connectsafely_api_key: apiKey.trim() },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.data?.ok) {
        const err = json.data?.error || json.error || "Verbindung fehlgeschlagen";
        setConnection({ ok: false, error: err });
        toast.error(err);
        return;
      }
      const data = json.data as LinkedInConnectionStatus;
      setConnection({ ok: true, accountId: data.accountId, accountName: data.accountName, plan: data.plan });
      if (data.accountId && !accountId) setAccountId(data.accountId);
      toast.success(`Verbunden${data.accountName ? ` als ${data.accountName}` : ""}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Netzwerkfehler";
      setConnection({ ok: false, error: msg });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  }, [apiKey, accountId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectsafely_api_key: apiKey.trim() || undefined,
          connectsafely_account_id: accountId.trim() || undefined,
          connectsafely_webhook_secret: webhookSecret.trim() || undefined,
          linkedin_daily_limit: dailyLimit,
          linkedin_follow_up_days: followUpDays,
          linkedin_auto_outreach: autoOutreach,
          linkedin_sender_profile: {
            name: senderName.trim() || undefined,
            position: senderPosition.trim() || undefined,
            company: senderCompany.trim() || undefined,
            specialization: senderSpecialization.trim() || undefined,
            tone: senderTone.trim() || undefined,
          },
          linkedin_outreach_template: outreachTemplate.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        toast.error(json?.error || "Speichern fehlgeschlagen");
        return;
      }
      toast.success("LinkedIn-Einstellungen gespeichert");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Netzwerkfehler");
    } finally {
      setSaving(false);
    }
  }, [apiKey, accountId, webhookSecret, dailyLimit, followUpDays, autoOutreach, senderName, senderPosition, senderCompany, senderSpecialization, senderTone, outreachTemplate]);

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/linkedin/webhook`
    : "/api/linkedin/webhook";

  return (
    <>
      <PageHead title="LinkedIn" sub="Verbindung, Outreach-Limits, Absender-Profil und Webhook für deine LinkedIn-Automation." />

      <SectionCard title="LinkedIn-Verbindung" desc="API-Key und Konto deiner ConnectSafely-Integration.">
        <SettingRow title="API-Key" desc="Dein ConnectSafely API-Key für automatisierten Outreach.">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/40" />
              <Input
                id="li-api-key"
                type={showApiKey ? "text" : "password"}
                placeholder={loading ? "Lade…" : "sk_…"}
                className="pl-9 pr-9 text-[13px]"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 size-6 inline-grid place-items-center rounded text-muted-foreground hover:bg-muted"
                aria-label={showApiKey ? "Verstecken" : "Anzeigen"}
              >
                {showApiKey ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
              </button>
            </div>
            <Button variant="outline" onClick={handleTest} disabled={testing || loading || !apiKey.trim()} className="gap-1.5">
              {testing ? <RefreshCw className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Testen
            </Button>
          </div>
          {connection?.ok === false && <p className="mt-1.5 text-[12px] text-destructive">{connection.error}</p>}
          {connection?.ok && (
            <p className="mt-1.5 text-[12px] text-emerald-600">
              Verbunden{connection.accountName ? ` als ${connection.accountName}` : ""}
              {connection.plan ? ` · ${formatPlan(connection.plan)}` : ""}
            </p>
          )}
        </SettingRow>

        <SettingRow title="Konto-ID" desc="Identifiziert dein verknüpftes LinkedIn-Profil. Wird beim Test automatisch ermittelt.">
          <Input
            id="li-account-id"
            placeholder="Wird beim Test automatisch ermittelt"
            className="text-[13px]"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            disabled={loading}
          />
        </SettingRow>
      </SectionCard>

      <SectionCard title="Outreach-Limits" desc="Sicherheits-Limits und Automatik für Einladungen & Follow-ups.">
        {/* Auslastung des aktuellen Setups — Pendant zur Mailbox-Kapazität */}
        <div className="mb-1 flex items-start gap-2.5 rounded-lg border bg-muted/30 px-3.5 py-3">
          <Linkedin className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="text-[13px] leading-relaxed">
            {connection?.ok ? (
              <>
                <span className="font-medium text-foreground">≈ {(dailyLimit * 7).toLocaleString("de-DE")} Einladungen / Woche</span>{" "}
                <span className="text-muted-foreground">
                  bei {dailyLimit}/Tag{connection.accountName ? ` · verbunden als ${connection.accountName}` : ""}.
                </span>
                <div className={cn("mt-0.5 text-[12px]", dailyLimit * 7 > 90 ? "text-amber-600" : "text-muted-foreground")}>
                  {dailyLimit * 7 > 90
                    ? "Über dem sicheren LinkedIn-Wochenwert (~90) — erhöht das Sperr-Risiko. Eher 10–13/Tag."
                    : "Im sicheren Bereich (LinkedIn-Limit ~90/Woche)."}
                </div>
              </>
            ) : (
              <span className="text-muted-foreground">
                Noch nicht mit LinkedIn verbunden — oben den API-Key testen, dann laufen Einladungen &amp; Follow-ups.
              </span>
            )}
          </div>
        </div>

        <SettingRow title="Einladungen pro Tag" desc="Empfohlen: 10–13. LinkedIn drosselt ab ~90 Einladungen/Woche pro Konto.">
          <Input
            id="li-daily-limit"
            type="number"
            min={1}
            max={20}
            value={dailyLimit}
            onChange={(e) => setDailyLimit(Math.max(1, Math.min(20, Number(e.target.value) || 0)))}
          />
        </SettingRow>
        <SettingRow title="Follow-up nach Tagen" desc="Wartezeit nach angenommener Vernetzung bis zur ersten Nachricht.">
          <Input
            id="li-followup-days"
            type="number"
            min={1}
            max={30}
            value={followUpDays}
            onChange={(e) => setFollowUpDays(Math.max(1, Math.min(30, Number(e.target.value) || 0)))}
          />
        </SettingRow>
        <RowToggle
          title="Automatischer Outreach"
          desc="Versendet Einladungen & Follow-ups automatisch per Tages-Job."
          checked={autoOutreach}
          onCheckedChange={setAutoOutreach}
        />
        {/* Ehrliche Info statt Fake-Toggle: Antworten werden immer gespiegelt (Webhook) */}
        <div className="flex items-start justify-between gap-6 border-t py-4">
          <div className="min-w-0">
            <p className="text-sm font-medium leading-snug">Antworten in der Inbox</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              LinkedIn-Antworten landen automatisch in deiner CRM-Inbox und stoppen die Sequenz.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600">
            Automatisch
          </span>
        </div>
      </SectionCard>

      <SectionCard title="Absender-Profil" desc="Wird vom KI-Texter für personalisierte Einladungen & Nachrichten verwendet.">
        <SettingRow title="Name" desc="Dein Name, wie er in Nachrichten erscheint.">
          <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} disabled={loading} placeholder="z. B. Markus Wallner" />
        </SettingRow>
        <SettingRow title="Position" desc="Deine Rolle / dein Titel.">
          <Input value={senderPosition} onChange={(e) => setSenderPosition(e.target.value)} disabled={loading} placeholder="z. B. Geschäftsführer" />
        </SettingRow>
        <SettingRow title="Unternehmen" desc="Dein Firmenname.">
          <Input value={senderCompany} onChange={(e) => setSenderCompany(e.target.value)} disabled={loading} placeholder="z. B. KI Kanzlei GmbH" />
        </SettingRow>
        <SettingRow title="Spezialisierung" desc="Worauf du dich fokussierst — schärft die KI-Ansprache.">
          <Input value={senderSpecialization} onChange={(e) => setSenderSpecialization(e.target.value)} disabled={loading} placeholder="z. B. KI-Automatisierung für Kanzleien" />
        </SettingRow>
        <SettingRow title="Tonalität" desc="Stil der generierten Nachrichten.">
          <Select value={senderTone} onValueChange={setSenderTone}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Tonalität wählen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="professionell">Professionell</SelectItem>
              <SelectItem value="locker">Locker</SelectItem>
              <SelectItem value="direkt">Direkt</SelectItem>
              <SelectItem value="freundlich">Freundlich</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </SectionCard>

      <SectionCard title="Erstnachricht-Vorlage" desc="Vorlage für die erste Nachricht. Platzhalter werden automatisch ersetzt.">
        <div className="grid gap-2">
          <Textarea
            id="li-template"
            rows={4}
            value={outreachTemplate}
            disabled={loading}
            onChange={(e) => setOutreachTemplate(e.target.value)}
            placeholder="Hallo {{firstName}}, ich habe gesehen, dass …"
            className="resize-y"
          />
          <p className="text-[11px] text-muted-foreground">Platzhalter wie {`{{firstName}}`} oder {`{{company}}`} werden automatisch ersetzt.</p>
        </div>
      </SectionCard>

      <SectionCard title="Webhook für eingehende Nachrichten" desc="Hinterlege diese URL bei deinem LinkedIn-Anbieter für Antworten in Echtzeit.">
        <SettingRow title="Webhook-URL" desc="Diese URL beim Anbieter eintragen.">
          <div className="flex gap-2">
            <Input value={webhookUrl} readOnly className="text-[13px]" />
            <Button
              variant="outline"
              onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("URL kopiert"); }}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
        </SettingRow>
        <SettingRow title="Webhook Signing Secret" desc="Für die HMAC-SHA256-Signatur-Verifizierung. Bei Verlust einfach neu generieren.">
          <div className="relative">
            <Input
              id="li-webhook-secret"
              type={showWebhookSecret ? "text" : "password"}
              placeholder="whsec_…"
              className="pr-9 text-[13px]"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowWebhookSecret((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 size-6 inline-grid place-items-center rounded text-muted-foreground hover:bg-muted"
            >
              {showWebhookSecret ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
            </button>
          </div>
        </SettingRow>
      </SectionCard>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || loading}>
          {saving ? <RefreshCw className="mr-1.5 size-3.5 animate-spin" /> : <Check className="mr-1.5 size-3.5" />}
          Alle LinkedIn-Einstellungen speichern
        </Button>
      </div>
    </>
  );
}

function formatPlan(plan: string): string {
  switch (plan) {
    case "SALES_NAVIGATOR": return "Sales Navigator";
    case "RECRUITER":       return "Recruiter";
    case "BUSINESS_PREMIUM": return "Premium";
    case "NON_PREMIUM":     return "Basic";
    default: return plan;
  }
}

/* ─── Generischer Hook für JSONB-Gruppen (lead_settings, seo_settings) ─── */
function useGroupSettings<T extends Record<string, unknown>>(groupKey: string, defaults: T) {
  const [values, setValues] = useState<T>(defaults);
  const [raw, setRaw] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.data) return;
        const g = (j.data[groupKey] ?? {}) as Record<string, unknown>;
        setRaw(g);
        setValues((prev) => {
          const next: Record<string, unknown> = { ...prev };
          for (const k of Object.keys(prev)) if (g[k] !== undefined) next[k] = g[k];
          return next as T;
        });
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [groupKey]);

  function set<K extends keyof T>(k: K, v: T[K]) { setValues((s) => ({ ...s, [k]: v })); }

  async function save(successMsg: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [groupKey]: { ...raw, ...values } }),
      });
      if (!res.ok) { const j = await res.json().catch(() => null); toast.error(j?.error || "Speichern fehlgeschlagen"); return; }
      toast.success(successMsg);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Netzwerkfehler"); }
    finally { setSaving(false); }
  }

  return { values, set, save, loading, saving };
}

/* ─── Leads & Suche (echt → lead_settings) ─── */
function LeadsSection() {
  const { values, set, save, loading, saving } = useGroupSettings("lead_settings", {
    default_country: "AT", default_status: "new", page_size: 100,
    require_email: true, require_ceo: false, auto_score: true, score_threshold: 80,
  });
  return (
    <>
      <PageHead title="Leads & Suche" sub="Standard-Filter und Qualitätsregeln für jede neue Lead-Suche." />

      <SectionCard title="Such-Defaults" desc="Diese Werte sind bei jeder neuen Suche vorausgewählt.">
        <SettingRow title="Standard-Land" desc="Land, das bei neuen Suchen vorausgewählt ist.">
          <Select value={String(values.default_country)} onValueChange={(v) => set("default_country", v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="AT">Österreich</SelectItem>
              <SelectItem value="DE">Deutschland</SelectItem>
              <SelectItem value="CH">Schweiz</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow title="Standard-Status" desc="Status für neu gefundene Leads.">
          <Select value={String(values.default_status)} onValueChange={(v) => set("default_status", v)}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="new">Neu</SelectItem>
              <SelectItem value="interested">Interessiert</SelectItem>
              <SelectItem value="contacted">Kontaktiert</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow title="Ergebnisse pro Seite" desc="Wie viele Leads pro Seite geladen werden.">
          <Select value={String(values.page_size)} onValueChange={(v) => set("page_size", Number(v))}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="200">200</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </SectionCard>

      <SectionCard title="Qualitätsregeln" desc="Mindestanforderungen und automatisches Scoring neuer Leads.">
        <RowToggle title="E-Mail-Adresse erforderlich" desc="Leads ohne E-Mail werden verworfen." checked={!!values.require_email} onCheckedChange={(v) => set("require_email", v)} />
        <RowToggle title="Geschäftsführer:in erforderlich" desc="Nur Leads mit bekannter Geschäftsführung speichern." checked={!!values.require_ceo} onCheckedChange={(v) => set("require_ceo", v)} />
        <RowToggle title="Automatisches Lead-Scoring" desc="Neue Leads werden automatisch bewertet." checked={!!values.auto_score} onCheckedChange={(v) => set("auto_score", v)} />
        <SettingRow title="Hot-Lead-Schwelle" desc="Ab diesem Score (0–100) gilt ein Lead als heiß.">
          <Input type="number" min={0} max={100} value={Number(values.score_threshold)} disabled={loading}
            onChange={(e) => set("score_threshold", Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
        </SettingRow>
      </SectionCard>

      <div className="flex justify-end">
        <Button onClick={() => save("Lead-Einstellungen gespeichert")} disabled={saving || loading}>
          {saving ? "Speichert…" : "Speichern"}
        </Button>
      </div>
    </>
  );
}

/* ─── Integrationen: Logo-Karten + OAuth-Connect (CRM) / Link (Automatisierung) ─── */
function IntegrationLogo({ slug, color, name }: { slug: string; color: string; name: string }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`https://cdn.simpleicons.org/${slug}/${color}`} alt={name} className="size-5" loading="lazy" />
    </span>
  );
}

function IntegrationCard({ p, connected, loading, onConnect, onManage }: {
  p: IntegrationProvider; connected: boolean; loading: boolean; onConnect: () => void; onManage: () => void;
}) {
  return (
    <div className="flex flex-col rounded-[10px] border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <IntegrationLogo slug={p.slug} color={p.color} name={p.name} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-none">{p.name}</p>
          <p className="mt-1 text-[11px]">
            {p.kind === "crm"
              ? (connected
                  ? <span className="inline-flex items-center gap-1 font-medium text-emerald-600"><Check className="size-3" /> Verbunden</span>
                  : <span className="text-muted-foreground">Nicht verbunden · OAuth</span>)
              : <span className="text-muted-foreground">Automatisierung</span>}
          </p>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{p.desc}</p>
      {p.kind === "crm" && connected
        ? <Button variant="outline" size="sm" className="mt-3 w-full" onClick={onManage}>Verwalten</Button>
        : <Button variant={p.kind === "crm" ? "default" : "outline"} size="sm" className="mt-3 w-full" onClick={onConnect} disabled={p.kind === "crm" && loading}>
            {p.auth === "link" ? "Öffnen" : "Verbinden"}
          </Button>}
    </div>
  );
}

function CrmSection() {
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [manageId, setManageId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadConnected = useCallback(async () => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      const map: Record<string, boolean> = {};
      for (const p of INTEGRATIONS) {
        if (p.kind === "crm" && p.connectedKey) {
          const v = j?.data?.[p.connectedKey];
          map[p.id] = typeof v === "string" && v.trim().length > 0;
        }
      }
      setConnected(map);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadConnected().finally(() => setLoading(false)); }, [loadConnected]);

  // OAuth-Rücksprung (?connected=… / ?oauth_error=…) auswerten
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const ok = sp.get("connected");
    const err = sp.get("oauth_error");
    if (!ok && !err) return;
    if (ok) { toast.success(`${INTEGRATIONS.find((p) => p.id === ok)?.name ?? ok} verbunden`); loadConnected(); }
    if (err) toast.error(err);
    sp.delete("connected"); sp.delete("oauth_error");
    const q = sp.toString();
    window.history.replaceState(null, "", window.location.pathname + (q ? `?${q}` : ""));
  }, [loadConnected]);

  function connect(p: IntegrationProvider) {
    if (p.auth === "link" && p.externalUrl) { window.open(p.externalUrl, "_blank", "noopener"); return; }
    window.location.href = `/api/integrations/${p.id}/start`;
  }

  async function disconnect(p: IntegrationProvider) {
    if (!p.storeColumn) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const { data: u } = await supabase.auth.getUser();
      if (!u.user?.id) throw new Error("Nicht angemeldet");
      const { error } = await supabase.from("user_settings").update({ [p.storeColumn]: null }).eq("user_id", u.user.id);
      if (error) throw error;
      toast.success(`${p.name} getrennt`);
      setManageId(null);
      await loadConnected();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Trennen fehlgeschlagen"); }
    finally { setBusy(false); }
  }

  const crm = INTEGRATIONS.filter((p) => p.kind === "crm");
  const automation = INTEGRATIONS.filter((p) => p.kind === "automation");
  const manageProvider = INTEGRATIONS.find((p) => p.id === manageId) ?? null;

  return (
    <>
      <PageHead title="Integrationen" sub="CRM per Klick verbinden (OAuth — kein Token nötig) und mit Zapier, Make oder n8n automatisieren." />

      <SectionCard title="CRM" desc="Mit einem Klick verbinden — die Autorisierung läuft über OAuth beim Anbieter.">
        <div className="grid gap-3 pt-1 sm:grid-cols-2">
          {crm.map((p) => (
            <IntegrationCard key={p.id} p={p} connected={!!connected[p.id]} loading={loading}
              onConnect={() => connect(p)} onManage={() => setManageId(p.id)} />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Automatisierung" desc="Verbinde KI Kanzlei mit tausenden Apps — ganz ohne Token.">
        <div className="grid gap-3 pt-1 sm:grid-cols-3">
          {automation.map((p) => (
            <IntegrationCard key={p.id} p={p} connected={false} loading={loading}
              onConnect={() => connect(p)} onManage={() => { /* automation: kein Manage */ }} />
          ))}
        </div>
      </SectionCard>

      {/* Sub-Fenster für verbundenes CRM */}
      <Dialog open={!!manageProvider} onOpenChange={(o) => { if (!o) setManageId(null); }}>
        <DialogContent className="sm:max-w-md">
          {manageProvider && (
            <>
              <div className="flex items-center gap-3">
                <IntegrationLogo slug={manageProvider.slug} color={manageProvider.color} name={manageProvider.name} />
                <div className="min-w-0">
                  <DialogTitle>{manageProvider.name}</DialogTitle>
                  <p className="text-xs font-medium text-emerald-600">Verbunden</p>
                </div>
              </div>
              <p className="pt-1 text-sm leading-relaxed text-muted-foreground">{manageProvider.desc}</p>
              <div className="flex items-center justify-between gap-2 pt-2">
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => disconnect(manageProvider)} disabled={busy}>
                  {busy ? "Trennt…" : "Verbindung trennen"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setManageId(null)}>Schließen</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Abrechnung (echte Daten aus /api/credits/balance + Stripe Portal) ─── */
function BillingSection() {
  return (
    <>
      <PageHead title="Abrechnung & Credits" sub="Aktueller Plan, Credit-Verbrauch und Top-Ups." />
      <BillingPlanCard />
      <BillingCreditsCard />
      <BillingTopUpsCard />
      <BillingLedgerCard />
    </>
  );
}

interface BalanceState {
  balance: number;
  subscription: {
    plan: string;
    status: string;
    monthly_credits: number;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  } | null;
}

function useBilling() {
  const [data, setData] = useState<BalanceState | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/credits/balance", { cache: "no-store" });
        if (res.ok) setData(await res.json());
      } finally { setLoading(false); }
    })();
  }, []);
  return { data, loading };
}

function BillingPlanCard() {
  const { data, loading } = useBilling();
  const [portalLoading, setPortalLoading] = useState(false);

  async function openPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const json = await res.json();
      if (json.url) window.location.href = json.url;
      else toast.error(json.error ?? "Portal konnte nicht geöffnet werden");
    } catch {
      toast.error("Verbindung fehlgeschlagen");
    } finally { setPortalLoading(false); }
  }

  const sub = data?.subscription;
  const planLabel = sub ? sub.plan.toUpperCase() : "—";
  const renews = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "numeric" })
    : "—";
  const statusBadge = sub?.status === "active" ? "Aktiv"
    : sub?.status === "trialing" ? "Trial"
    : sub?.status === "past_due" ? "Zahlung überfällig"
    : sub?.status === "canceled" ? "Gekündigt"
    : sub?.status === "pending_checkout" ? "Checkout offen"
    : sub?.status ?? "—";

  return (
    <Card className="mb-4 shadow-xs border-primary/20 bg-gradient-to-br from-primary/5 to-card">
      <CardContent className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary mb-1.5">
              Aktueller Plan
            </p>
            <p className="text-3xl font-semibold tracking-tight">
              {loading ? "…" : planLabel}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Status: <b className="text-foreground font-semibold">{statusBadge}</b>
              {sub && ` · ${sub.cancel_at_period_end ? "läuft aus" : "verlängert"} am ${renews}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={openPortal} disabled={portalLoading || !sub}>
              {portalLoading ? "Wird geöffnet …" : "Subscription verwalten"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BillingCreditsCard() {
  const { data, loading } = useBilling();
  const balance = data?.balance ?? 0;
  const cap = data?.subscription?.monthly_credits ?? 0;
  const pct = cap > 0 ? Math.min(100, (balance / cap) * 100) : 0;

  return (
    <Card className="mb-4 shadow-xs">
      <CardHeader><CardTitle>Credits</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
            Verfügbar
          </p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {loading ? "…" : balance.toLocaleString("de-DE")}
          </p>
          {cap > 0 && (
            <Progress value={pct} className="h-1.5 mt-3" />
          )}
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
            Pro Monat (Plan)
          </p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {loading ? "…" : cap.toLocaleString("de-DE")}
          </p>
          <p className="text-[11.5px] text-muted-foreground mt-1.5">
            Wird beim nächsten Renewal aufgefrischt
          </p>
        </div>
        <div className="rounded-lg border border-dashed p-4 flex flex-col items-start justify-center">
          <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
            Credits aufstocken
          </p>
          <p className="text-[12px] text-muted-foreground mb-2">
            Top-Up-Packs verfallen nicht.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function BillingTopUpsCard() {
  const [loading, setLoading] = useState<string | null>(null);
  const packs: { key: "small" | "medium" | "large"; name: string; credits: number; price: string }[] = [
    { key: "small",  name: "Small",  credits:  1000, price: "€ 149"   },
    { key: "medium", name: "Medium", credits:  5000, price: "€ 599"   },
    { key: "large",  name: "Large",  credits: 15000, price: "€ 1.499" },
  ];

  async function buy(pack: "small" | "medium" | "large") {
    setLoading(pack);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack }),
      });
      const json = await res.json();
      if (json.url) window.location.href = json.url;
      else toast.error(json.error ?? "Checkout konnte nicht gestartet werden");
    } catch {
      toast.error("Verbindung fehlgeschlagen");
    } finally { setLoading(null); }
  }

  return (
    <Card className="mb-4 shadow-xs">
      <CardHeader>
        <CardTitle>Credit-Packs (Top-Up)</CardTitle>
        <CardDescription>Einmaliger Kauf · verfallen nicht · jederzeit nachkaufen</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {packs.map((p) => (
          <div key={p.key} className="rounded-lg border p-4">
            <p className="text-sm font-semibold">{p.name}</p>
            <p className="text-[18px] font-bold tracking-tight mt-1">{p.price}</p>
            <p className="text-[12px] text-muted-foreground mb-3">
              {p.credits.toLocaleString("de-DE")} Credits
            </p>
            <Button
              size="sm"
              className="w-full"
              onClick={() => buy(p.key)}
              disabled={loading !== null}
            >
              {loading === p.key ? "Wird vorbereitet …" : "Kaufen"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

interface LedgerRow {
  id: string;
  delta: number;
  balance_after: number;
  action_type: string;
  created_at: string;
}

function BillingLedgerCard() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/credits/ledger?limit=20", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          setRows(json.data ?? []);
        }
      } finally { setLoading(false); }
    })();
  }, []);

  const labelFor = (a: string): string => ({
    plan_grant:      "Plan-Credits gutgeschrieben",
    topup:           "Top-Up-Kauf",
    lead_discover:   "Lead-Discovery",
    lead_enrich:     "Lead-Enrichment",
    mail_generate:   "KI-Mail generiert",
    mail_send:       "Mail versendet",
    linkedin_action: "LinkedIn-Aktion",
    seo_post:        "SEO-Post",
    social_post:     "Social-Media-Post",
    refund:          "Refund",
    admin_adjust:    "Admin-Anpassung",
  }[a] ?? a);

  return (
    <Card className="mb-4 shadow-xs">
      <CardHeader><CardTitle>Verbrauchs-Verlauf</CardTitle></CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="px-5 py-6 text-center text-[13px] text-muted-foreground">Wird geladen …</div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-6 text-center text-[13px] text-muted-foreground">Noch keine Aktionen</div>
        ) : rows.map((r, i) => (
          <div key={r.id} className={cn("grid grid-cols-[1fr_120px_100px] items-center gap-3 px-5 py-2.5", i > 0 && "border-t")}>
            <span className="text-[13px]">{labelFor(r.action_type)}</span>
            <span className="text-[11.5px] text-muted-foreground">
              {new Date(r.created_at).toLocaleString("de-DE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className={cn(
              "text-right text-[13px] font-semibold tabular-nums",
              r.delta > 0 ? "text-emerald-600" : "text-muted-foreground",
            )}>
              {r.delta > 0 ? `+${r.delta.toLocaleString("de-DE")}` : r.delta.toLocaleString("de-DE")}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   App
   ═══════════════════════════════════════════════════════════════════════ */

const SECTION_MAP: Record<SectionKey, React.ComponentType> = {
  profile:  ProfileSection,
  offering: OfferingSection,
  leads:    LeadsSection,
  mailbox:  MailboxSection,
  social:   SocialSection,
  crm:      CrmSection,
  billing:  BillingSection,
};

/**
 * Settings als schwebendes Popup-Modal über dem Dashboard.
 * Wird sowohl von der Intercepting-Route (`@modal/(.)settings`) als auch von
 * der Fallback-Seite (`/dashboard/settings` bei Direktaufruf/Reload) gerendert.
 * `onClose` steuert das Schließverhalten: Overlay → `router.back()`,
 * Fallback → `router.push("/dashboard")`.
 */
export default function SettingsModal({ onClose }: { onClose?: () => void }) {
  return (
    <Suspense fallback={null}>
      <SettingsModalInner onClose={onClose} />
    </Suspense>
  );
}

function SettingsModalInner({ onClose }: { onClose?: () => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const paramTab = searchParams.get("tab") ?? "";
  const initialTab: SectionKey = (SECTION_KEYS.includes(paramTab) ? paramTab : "profile") as SectionKey;
  const [activeTab, setActiveTab] = useState<SectionKey>(initialTab);

  const close = onClose ?? (() => router.push("/dashboard"));

  function handleTabChange(tab: SectionKey) {
    setActiveTab(tab);
    router.replace(tab === "profile" ? "/dashboard/settings" : `/dashboard/settings?tab=${tab}`, { scroll: false });
  }

  const Comp = SECTION_MAP[activeTab] ?? ProfileSection;
  const activeLabel = SECTION_LABEL[activeTab] ?? "Einstellungen";

  // Schwebendes Popup-Modal (shadcn Dialog): rundum Abstand + Border, Dashboard
  // bleibt abgedunkelt sichtbar. Linke Sidebar (Navigation) + rechte Spalte mit
  // fixer Header-Leiste (Titel · Schließen) und scrollbarem Inhalt darunter.
  // ESC + Klick-außerhalb schließen ebenfalls.
  return (
    <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent
        showCloseButton
        className={
          "flex flex-col gap-0 overflow-hidden p-0 lg:flex-row " +
          "fixed top-3 right-3 bottom-3 left-3 sm:top-4 sm:right-4 sm:bottom-4 sm:left-4 " +
          "translate-x-0 translate-y-0 w-auto max-w-none sm:max-w-none " +
          "rounded-2xl border shadow-2xl duration-300 ease-out " +
          "data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:slide-out-to-bottom-2"
        }
      >
        <SettingsRail current={activeTab} onChange={handleTabChange} />

        {/* Rechte Spalte: nur scrollbarer Inhalt (kein Header-Balken — Titel kommt aus PageHead, Close schwebt) */}
        <div className="flex min-w-0 flex-1 flex-col">
          <DialogTitle className="sr-only">Einstellungen — {activeLabel}</DialogTitle>
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-background px-4 py-7 lg:px-10 lg:py-10">
            <main className="mx-auto min-w-0 max-w-6xl">
              <Comp />
            </main>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
