"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus, Loader2, CheckCircle2, XCircle, Mail,
  EyeIcon, EyeOffIcon, Flame, Shield, ShieldCheck,
  ShieldAlert, ArrowRight, ArrowLeft, Settings2, Globe, MoreHorizontal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MailboxSetupGuide, type SetupKind } from "./MailboxSetupGuide";

/* ── Types ── */
interface EmailAccount {
  id: string;
  label: string;
  provider: "smtp" | "microsoft_graph" | "microsoft_oauth" | "google_oauth";
  sender_email: string;
  sender_name: string | null;
  reply_to: string | null;
  send_as_email: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  smtp_password: string | null;
  smtp_encryption: "tls" | "ssl" | "none" | null;
  ms_tenant_id: string | null;
  ms_client_id: string | null;
  ms_client_secret: string | null;
  daily_limit: number;
  is_active: boolean;
  priority: number;
  warmup_enabled: boolean;
  warmup_day: number;
  warmup_start: number;
  warmup_increment: number;
  health_status: "good" | "warning" | "bad" | "unknown";
  last_error: string | null;
  sent_today: number;
  total_sent: number;
}

interface DnsResult {
  domain: string;
  mx: { ok: boolean; records: string[]; error?: string };
  spf: { ok: boolean; record?: string; error?: string };
  dmarc: { ok: boolean; record?: string; error?: string };
  overall: "good" | "warning" | "bad";
}

type WizardStep = "provider" | "guide" | "credentials" | "dns" | "limits";

type FormData = {
  label: string;
  provider: "smtp" | "microsoft_graph" | "microsoft_oauth" | "google_oauth";
  sender_email: string;
  sender_name: string;
  reply_to: string;
  send_as_email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  smtp_encryption: "tls" | "ssl" | "none";
  ms_tenant_id: string;
  ms_client_id: string;
  ms_client_secret: string;
  daily_limit: number;
  is_active: boolean;
  warmup_enabled: boolean;
  warmup_start: number;
  warmup_increment: number;
};

const EMPTY_FORM: FormData = {
  label: "", provider: "smtp", sender_email: "", sender_name: "", reply_to: "", send_as_email: "",
  smtp_host: "", smtp_port: 587, smtp_username: "", smtp_password: "", smtp_encryption: "tls",
  ms_tenant_id: "", ms_client_id: "", ms_client_secret: "",
  daily_limit: 50, is_active: true, warmup_enabled: true, warmup_start: 10, warmup_increment: 5,
};

const healthColor: Record<string, string> = { good: "bg-green-500", warning: "bg-amber-500", bad: "bg-red-500", unknown: "bg-gray-400" };
const healthLabel: Record<string, string> = { good: "Verbunden", warning: "Warnung", bad: "Fehler", unknown: "Nicht getestet" };

/* ── Provider Icons (inline SVGs statt Image für Zuverlässigkeit) ── */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-8" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.02 10.02 0 0 0 2 12c0 1.61.39 3.14 1.08 4.49l3.76-2.4z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-8" fill="none">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
      <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

/* Provider-Logo-Kachel für die Konto-Liste (echte Logos, dezent). */
function MailboxLogo({ provider }: { provider: EmailAccount["provider"] }) {
  const tile = "flex size-9 shrink-0 items-center justify-center rounded-lg border [&_svg]:size-5";
  if (provider === "google_oauth") return <span className={`${tile} bg-white`}><GoogleIcon /></span>;
  if (provider === "microsoft_oauth" || provider === "microsoft_graph") return <span className={`${tile} bg-white`}><MicrosoftIcon /></span>;
  return <span className={`${tile} bg-muted text-muted-foreground`}><Mail /></span>;
}

export default function EmailAccountsManager() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  // Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>("provider");
  const [setupKind, setSetupKind] = useState<SetupKind>("smtp");
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [detectedProvider, setDetectedProvider] = useState<string | null>(null);
  const [showAdvancedSmtp, setShowAdvancedSmtp] = useState(false);
  const [dnsResult, setDnsResult] = useState<DnsResult | null>(null);
  const [dnsLoading, setDnsLoading] = useState(false);
  const [connTestResult, setConnTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [connTesting, setConnTesting] = useState(false);

  // Setup-Guide (zum späteren Nachschlagen)
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideKind, setGuideKind] = useState<SetupKind>("smtp");

  // Test-E-Mail
  const [sendingTest, setSendingTest] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/email-accounts");
      if (!res.ok) throw new Error();
      const { data } = await res.json();
      setAccounts(data ?? []);
    } catch { toast.error("E-Mail-Konten konnten nicht geladen werden"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  // OAuth-Rücksprung ("Mit Microsoft anmelden") auswerten.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const connected = sp.get("connected");
    const oauthError = sp.get("oauth_error");
    if (!connected && !oauthError) return;
    if (connected) {
      const label = connected === "google" ? "Google" : connected === "microsoft" ? "Microsoft" : connected;
      toast.success(`${label}-Konto verbunden`);
      loadAccounts();
    }
    if (oauthError) toast.error(oauthError);
    sp.delete("connected"); sp.delete("oauth_error");
    const q = sp.toString();
    window.history.replaceState(null, "", window.location.pathname + (q ? `?${q}` : ""));
  }, [loadAccounts]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setWizardStep("provider");
    setShowAdvancedSmtp(false);
    setDnsResult(null);
    setConnTestResult(null);
    setDetectedProvider(null);
    setDialogOpen(true);
  }

  function openSettings(acc: EmailAccount) {
    setForm({
      label: acc.label, provider: acc.provider,
      sender_email: acc.sender_email, sender_name: acc.sender_name ?? "",
      reply_to: acc.reply_to ?? "", send_as_email: acc.send_as_email ?? "",
      smtp_host: acc.smtp_host ?? "", smtp_port: acc.smtp_port ?? 587,
      smtp_username: acc.smtp_username ?? "", smtp_password: acc.smtp_password ?? "",
      smtp_encryption: acc.smtp_encryption ?? "tls",
      ms_tenant_id: acc.ms_tenant_id ?? "", ms_client_id: acc.ms_client_id ?? "",
      ms_client_secret: acc.ms_client_secret ?? "",
      daily_limit: acc.daily_limit, is_active: acc.is_active,
      warmup_enabled: acc.warmup_enabled, warmup_start: acc.warmup_start,
      warmup_increment: acc.warmup_increment,
    });
    setEditId(acc.id);
    setSettingsOpen(true);
  }

  function selectProvider(provider: "smtp" | "microsoft_graph") {
    // SMTP/Custom: direkt zu den Feldern; erweiterte Einstellungen bleiben eingeklappt.
    setForm((f) => ({ ...f, provider }));
    setShowAdvancedSmtp(false);
    setConnTestResult(null);
    setWizardStep("credentials");
  }

  /* ── Auto-Detect SMTP ── */
  async function handleAutoDetect() {
    if (!form.sender_email.includes("@")) return;
    setAutoDetecting(true);
    setDetectedProvider(null);
    try {
      const res = await fetch("/api/email-accounts/auto-detect", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.sender_email }),
      });
      const { data } = await res.json();
      if (data?.config) {
        setForm((f) => ({
          ...f,
          smtp_host: data.config.host || f.smtp_host,
          smtp_port: data.config.port || f.smtp_port,
          smtp_encryption: data.config.encryption || f.smtp_encryption,
          smtp_username: f.smtp_username || f.sender_email,
        }));
        if (data.provider_name) setDetectedProvider(data.provider_name);
        toast.success(data.provider_name
          ? `${data.provider_name} erkannt — Server automatisch konfiguriert`
          : "SMTP-Server automatisch konfiguriert",
        );
      }
    } catch { /* ignore */ }
    finally { setAutoDetecting(false); }
  }

  /* ── Connection Test ── */
  async function handleConnTest() {
    setConnTesting(true);
    setConnTestResult(null);
    try {
      // Save first, then test
      const url = editId ? `/api/email-accounts/${editId}` : "/api/email-accounts";
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const j = await res.json().catch(() => null); throw new Error(j?.error ?? "Fehler"); }
      const { data: saved } = await res.json();
      const accId = editId || saved?.id;
      if (!editId && accId) setEditId(accId);

      // Now test
      const testRes = await fetch(`/api/email-accounts/${accId}/test`, { method: "POST" });
      const { data: testData } = await testRes.json();
      setConnTestResult(testData);
      if (testData?.ok) toast.success("Verbindung erfolgreich!");
      else toast.error(testData?.error ?? "Verbindung fehlgeschlagen");
      loadAccounts();
    } catch (err) {
      setConnTestResult({ ok: false, error: err instanceof Error ? err.message : "Fehler" });
    } finally { setConnTesting(false); }
  }

  /* ── DNS Check ── */
  async function handleDnsCheck() {
    if (!form.sender_email.includes("@")) return;
    setDnsLoading(true);
    setDnsResult(null);
    try {
      const res = await fetch("/api/email-accounts/dns-check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: form.sender_email }),
      });
      const { data } = await res.json();
      setDnsResult(data);
    } catch { toast.error("DNS-Check fehlgeschlagen"); }
    finally { setDnsLoading(false); }
  }

  /* ── Save (final) ── */
  async function handleSave() {
    if (!form.sender_email.trim()) { toast.error("Sender E-Mail erforderlich"); return; }
    setSaving(true);
    try {
      const url = editId ? `/api/email-accounts/${editId}` : "/api/email-accounts";
      const method = editId ? "PATCH" : "POST";
      const payload = { ...form, label: form.label || form.sender_email };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { const j = await res.json().catch(() => null); throw new Error(j?.error ?? "Fehler"); }
      const { data: saved } = await res.json();
      // Liste sofort aktualisieren (kein Reload nötig)
      if (saved?.id) {
        setAccounts((list) => editId
          ? list.map((a) => a.id === saved.id ? { ...a, ...saved } : a)
          : [...list, saved as EmailAccount]);
      }
      toast.success(editId ? "Konto aktualisiert" : "Konto erstellt");
      setDialogOpen(false);
      setSettingsOpen(false);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Fehler"); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("E-Mail-Konto wirklich löschen?")) return;
    const prev = accounts;
    setAccounts((list) => list.filter((a) => a.id !== id)); // optimistisch entfernen — Zeile verschwindet sofort, kein Toast
    try {
      const res = await fetch(`/api/email-accounts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setAccounts(prev); // rückgängig
      toast.error("Fehler beim Löschen");
    }
  }

  async function handleTest(id: string) {
    setTesting(id);
    try {
      const res = await fetch(`/api/email-accounts/${id}/test`, { method: "POST" });
      const { data } = await res.json();
      // Ergebnis sofort in die Liste schreiben (Status-Spalte aktualisiert instant)
      setAccounts((list) => list.map((a) => a.id === id ? {
        ...a,
        health_status: data?.ok ? "good" : "bad",
        last_error: data?.ok ? null : (data?.error ?? "Verbindung fehlgeschlagen"),
      } : a));
      if (data?.ok) toast.success("Verbindung erfolgreich");
      else toast.error(data?.error ?? "Verbindung fehlgeschlagen");
    } catch { toast.error("Testfehler"); }
    finally { setTesting(null); }
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    const prev = accounts;
    setAccounts((list) => list.map((a) => a.id === id ? { ...a, is_active: !isActive } : a)); // optimistisch
    try {
      const res = await fetch(`/api/email-accounts/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !isActive }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setAccounts(prev); // rückgängig
      toast.error("Status konnte nicht geändert werden");
    }
  }

  // Echte Test-E-Mail an die eigene Login-Adresse senden (beweist End-to-End-Versand).
  async function handleSendTest() {
    if (!editId) return;
    setSendingTest(true);
    try {
      const res = await fetch(`/api/email-accounts/${editId}/send-test`, { method: "POST" });
      const json = await res.json().catch(() => null);
      const result = json?.data;
      if (res.ok && result?.ok) toast.success(result.to ? `Test-E-Mail an ${result.to} gesendet` : "Test-E-Mail gesendet");
      else toast.error(result?.error || json?.error || "Test-E-Mail fehlgeschlagen");
    } catch { toast.error("Test-E-Mail fehlgeschlagen"); }
    finally { setSendingTest(false); }
  }

  const toggleSecret = (key: string) => setShowSecrets((s) => ({ ...s, [key]: !s[key] }));

  const totalDailyCapacity = accounts.filter((a) => a.is_active).reduce((sum, a) => sum + a.daily_limit, 0);
  const totalSentToday = accounts.reduce((sum, a) => sum + a.sent_today, 0);

  // Fortschritt nur im SMTP-Mehrschritt-Flow — Google/Microsoft sind 1-Klick (kein Balken).
  const smtpFlow: WizardStep[] = ["credentials", "dns", "limits"];
  const smtpPos = smtpFlow.indexOf(wizardStep);
  const stepProgress = smtpPos >= 0 ? ((smtpPos + 1) / smtpFlow.length) * 100 : 0;

  if (loading) return null;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Postfächer</h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
            Mehrere Konten &amp; Domains für automatische Rotation beim Kampagnenversand.
          </p>
        </div>
        <Button onClick={openCreate} size="sm"><Plus className="mr-1 size-4" /> Konto hinzufügen</Button>
      </div>
      {accounts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{accounts.filter((a) => a.is_active).length} aktiv von {accounts.length}</span>
          <span>Kapazität: {totalDailyCapacity} / Tag</span>
          <span>Heute: {totalSentToday}</span>
        </div>
      )}
      <div className="mt-4">
        {accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-14 text-center">
            <span className="flex size-11 items-center justify-center rounded-xl border bg-muted/40 text-muted-foreground">
              <Mail className="size-5" />
            </span>
            <p className="mt-4 text-sm font-medium text-foreground">Noch keine E-Mail-Konten</p>
            <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">Füge mindestens ein Konto hinzu, um Kampagnen zu versenden.</p>
            <Button onClick={openCreate} size="sm" className="mt-5"><Plus className="mr-1 size-4" /> Erstes Konto verbinden</Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[64px] pl-4">Aktiv</TableHead>
                  <TableHead>Postfach</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Heute</TableHead>
                  <TableHead className="w-[80px] pr-4 text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((acc) => {
                  const providerLabel = acc.provider === "smtp" ? "SMTP" : acc.provider === "google_oauth" ? "Google" : "Microsoft 365";
                  // Status spiegelt zuerst den Aktiv-Zustand: deaktiviert → „Pausiert" (nie „Verbunden").
                  const statusDot = !acc.is_active ? "bg-muted-foreground/40" : healthColor[acc.health_status];
                  const statusText = testing === acc.id ? "Teste…" : !acc.is_active ? "Pausiert" : healthLabel[acc.health_status];
                  return (
                    <TableRow key={acc.id} className={acc.is_active ? "" : "opacity-55"}>
                      {/* Aktiv-Switch — klar ersichtlich */}
                      <TableCell className="pl-4">
                        <Switch
                          checked={acc.is_active}
                          onCheckedChange={() => handleToggleActive(acc.id, acc.is_active)}
                          aria-label={acc.is_active ? "Deaktivieren" : "Aktivieren"}
                        />
                      </TableCell>

                      {/* Postfach: Logo + E-Mail + Provider */}
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <MailboxLogo provider={acc.provider} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">{acc.sender_email}</span>
                              {!acc.is_active && (
                                <Badge variant="outline" className="shrink-0 px-1.5 text-[10px] text-muted-foreground">Inaktiv</Badge>
                              )}
                              {acc.warmup_enabled && (
                                <Badge variant="secondary" className="shrink-0 gap-1 px-1.5 text-[10px]">
                                  <Flame className="size-2.5" /> Warmup
                                </Badge>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                              <span>{providerLabel}</span>
                              {acc.last_error && (
                                <>
                                  <span className="text-muted-foreground/40">·</span>
                                  <span className="max-w-40 truncate text-destructive" title={acc.last_error}>{acc.last_error}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      {/* Status — immer sichtbar; bei deaktiviert „Pausiert" */}
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                          <span className={`size-1.5 rounded-full ${statusDot}`} />
                          {statusText}
                        </span>
                      </TableCell>

                      {/* Heute / Limit */}
                      <TableCell className="hidden md:table-cell text-right tabular-nums text-[12.5px] text-muted-foreground">
                        {acc.sent_today} / {acc.daily_limit}
                      </TableCell>

                      {/* Aktionen — 3-Punkte-Menü */}
                      <TableCell className="pr-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8" title="Aktionen">
                              {testing === acc.id ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => handleTest(acc.id)} disabled={testing === acc.id}>
                              Verbindung testen
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleActive(acc.id, acc.is_active)}>
                              {acc.is_active ? "Deaktivieren" : "Aktivieren"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openSettings(acc)}>
                              Einstellungen
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleDelete(acc.id)} className="text-destructive focus:text-destructive">
                              Löschen
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Setup-Guide zum Nachschlagen */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3.5 py-2.5">
        <p className="text-[12.5px] text-muted-foreground">Brauchst du Hilfe bei der Einrichtung deines Postfachs?</p>
        <Button variant="ghost" size="sm" className="text-primary hover:text-primary" onClick={() => setGuideOpen(true)}>
          Einrichtungs-Anleitung öffnen
        </Button>
      </div>

      {/* ══════════ WIZARD DIALOG ══════════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[1040px] max-h-[90vh] overflow-y-auto p-0">
          {/* Progress */}
          <div className="px-6 pt-6 pb-2">
            <DialogHeader>
              <DialogTitle>
                {editId ? "E-Mail-Konto bearbeiten" : "E-Mail-Konto verbinden"}
              </DialogTitle>
              <DialogDescription>
                {wizardStep === "provider" && "Provider wählen."}
                {wizardStep === "guide" && "So holst du deine Zugangsdaten."}
                {wizardStep === "credentials" && "Nur das Nötigste eingeben."}
                {wizardStep === "dns" && "Domain prüfen (optional)."}
                {wizardStep === "limits" && "Sendelimit & Warmup."}
              </DialogDescription>
            </DialogHeader>
            {!editId && smtpPos >= 0 && <Progress value={stepProgress} className="mt-3 h-1" />}
          </div>

          <div className="px-6 pb-6">
            {/* ── STEP 1: Provider ── */}
            {wizardStep === "provider" && (
              <div className="grid gap-3 pt-4">
                <button
                  onClick={() => { window.location.href = "/api/email-accounts/google/start"; }}
                  className="flex items-center gap-4 rounded-lg border-2 p-4 text-left transition-colors hover:border-primary hover:bg-accent"
                >
                  <GoogleIcon />
                  <div className="flex-1">
                    <p className="font-medium">Google / Gmail</p>
                    <p className="text-sm text-muted-foreground">Mit einem Klick anmelden · Gmail, Google Workspace</p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </button>

                <button
                  onClick={() => { window.location.href = "/api/email-accounts/microsoft/start"; }}
                  className="flex items-center gap-4 rounded-lg border-2 p-4 text-left transition-colors hover:border-primary hover:bg-accent"
                >
                  <MicrosoftIcon />
                  <div className="flex-1">
                    <p className="font-medium">Microsoft / Outlook</p>
                    <p className="text-sm text-muted-foreground">Mit einem Klick anmelden · Office 365, Outlook</p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </button>

                <button
                  onClick={() => { setSetupKind("smtp"); selectProvider("smtp"); }}
                  className="flex items-center gap-4 rounded-lg border-2 p-4 text-left transition-colors hover:border-primary hover:bg-accent"
                >
                  <div className="flex items-center justify-center size-8 rounded bg-muted"><Mail className="size-5" /></div>
                  <div className="flex-1">
                    <p className="font-medium">Anderer Anbieter (SMTP)</p>
                    <p className="text-sm text-muted-foreground">IONOS, Strato, Hetzner, Zoho, GMX, etc.</p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </button>

                <p className="text-xs text-center text-muted-foreground pt-2">
                  SMTP-Einstellungen werden automatisch erkannt.
                </p>
              </div>
            )}

            {/* ── STEP: Anleitung + Video ── */}
            {wizardStep === "guide" && (
              <div className="grid gap-4 pt-4">
                <MailboxSetupGuide kind={setupKind} />
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" onClick={() => setWizardStep("provider")}>
                    <ArrowLeft className="mr-1 size-4" /> Zurück
                  </Button>
                  <div className="flex-1" />
                  <Button onClick={() => setWizardStep("credentials")}>
                    Weiter <ArrowRight className="ml-1 size-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP: Credentials (minimal) ── */}
            {wizardStep === "credentials" && (
              <div className="grid gap-4 pt-4">
                {/* E-Mail + Name */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="ea-email">E-Mail-Adresse *</Label>
                    <Input id="ea-email" type="email" placeholder="info@deine-domain.de" value={form.sender_email}
                      onChange={(e) => setForm((f) => ({ ...f, sender_email: e.target.value.slice(0, 254) }))}
                      onBlur={() => { if (form.provider === "smtp" && form.sender_email.includes("@") && !form.smtp_host) handleAutoDetect(); }}
                    />
                    {autoDetecting && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> Server wird erkannt...</p>}
                    {detectedProvider && <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="size-3" /> {detectedProvider} erkannt</p>}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ea-name">Absendername</Label>
                    <Input id="ea-name" placeholder="Max Mustermann" value={form.sender_name}
                      onChange={(e) => setForm((f) => ({ ...f, sender_name: e.target.value.slice(0, 256) }))} />
                  </div>
                </div>

                {/* SMTP fields */}
                {form.provider === "smtp" && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor="ea-user">Benutzername</Label>
                        <Input id="ea-user" placeholder={form.sender_email || "info@domain.de"} value={form.smtp_username}
                          onChange={(e) => setForm((f) => ({ ...f, smtp_username: e.target.value.slice(0, 256) }))} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="ea-pass">Passwort / App-Passwort</Label>
                        <div className="relative">
                          <Input id="ea-pass" type={showSecrets["smtp_pw"] ? "text" : "password"}
                            placeholder="••••••••" value={form.smtp_password}
                            onChange={(e) => setForm((f) => ({ ...f, smtp_password: e.target.value.slice(0, 512) }))}
                            className="pr-9" autoComplete="off" />
                          <Button type="button" variant="ghost" size="icon" onClick={() => toggleSecret("smtp_pw")}
                            className="text-muted-foreground absolute inset-y-0 right-0 rounded-l-none hover:bg-transparent">
                            {showSecrets["smtp_pw"] ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">Bei Gmail/Google: App-Passwort verwenden</p>
                      </div>
                    </div>

                    {/* Advanced toggle */}
                    <button onClick={() => setShowAdvancedSmtp((v) => !v)} className="text-xs text-primary flex items-center gap-1 hover:underline">
                      <Settings2 className="size-3" /> {showAdvancedSmtp ? "Erweiterte Einstellungen ausblenden" : "Erweiterte Einstellungen"}
                    </button>

                    {showAdvancedSmtp && (
                      <div className="grid gap-4 rounded-lg border p-4 bg-muted/30">
                        <div className="grid gap-4 sm:grid-cols-3">
                          <div className="grid gap-2 sm:col-span-2">
                            <Label htmlFor="ea-host">SMTP-Server</Label>
                            <Input id="ea-host" placeholder="smtp.provider.de" value={form.smtp_host}
                              onChange={(e) => setForm((f) => ({ ...f, smtp_host: e.target.value.slice(0, 256) }))} />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="ea-port">Port</Label>
                            <Input id="ea-port" type="number" placeholder="587" value={form.smtp_port}
                              onChange={(e) => setForm((f) => ({ ...f, smtp_port: Number(e.target.value) || 587 }))} />
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label>Verschlüsselung</Label>
                          <Select value={form.smtp_encryption} onValueChange={(v) => setForm((f) => ({ ...f, smtp_encryption: v as FormData["smtp_encryption"] }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="tls">STARTTLS (Port 587)</SelectItem>
                              <SelectItem value="ssl">SSL/TLS (Port 465)</SelectItem>
                              <SelectItem value="none">Keine (Port 25)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="ea-reply">Reply-To (optional)</Label>
                          <Input id="ea-reply" type="email" placeholder="reply@domain.de" value={form.reply_to}
                            onChange={(e) => setForm((f) => ({ ...f, reply_to: e.target.value.slice(0, 254) }))} />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="ea-label">Bezeichnung</Label>
                          <Input id="ea-label" placeholder="z.B. Outreach Domain 1" value={form.label}
                            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value.slice(0, 256) }))} />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Microsoft Graph fields */}
                {form.provider === "microsoft_graph" && (
                  <div className="grid gap-4 rounded-lg border p-4 bg-muted/30">
                    <p className="text-sm text-muted-foreground">Azure AD App-Registrierung mit <code className="text-xs bg-muted px-1 py-0.5 rounded">Mail.Send</code> Berechtigung.</p>
                    <p className="flex items-start gap-1.5 rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
                      <Mail className="mt-0.5 size-3.5 shrink-0" />
                      <span><span className="font-medium text-foreground">Shared-Postfach?</span> Trage als E-Mail-Adresse einfach die freigegebene Adresse ein (z.&nbsp;B. <code className="bg-muted px-1 rounded">office@firma.at</code>). Die App sendet direkt daraus – ein eigenes Postfach-Login oder eine Lizenz ist dafür nicht nötig.</span>
                    </p>
                    <div className="grid gap-2">
                      <Label htmlFor="ea-tenant">Tenant ID</Label>
                      <Input id="ea-tenant" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={form.ms_tenant_id}
                        onChange={(e) => setForm((f) => ({ ...f, ms_tenant_id: e.target.value.slice(0, 256) }))} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="ea-cid">Client ID</Label>
                      <Input id="ea-cid" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={form.ms_client_id}
                        onChange={(e) => setForm((f) => ({ ...f, ms_client_id: e.target.value.slice(0, 256) }))} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="ea-csec">Client Secret</Label>
                      <div className="relative">
                        <Input id="ea-csec" type={showSecrets["ms_sec"] ? "text" : "password"}
                          placeholder="xxxxxxxxxxxxxxxxxxxxxxxx" value={form.ms_client_secret}
                          onChange={(e) => setForm((f) => ({ ...f, ms_client_secret: e.target.value.slice(0, 512) }))}
                          className="pr-9" autoComplete="off" />
                        <Button type="button" variant="ghost" size="icon" onClick={() => toggleSecret("ms_sec")}
                          className="text-muted-foreground absolute inset-y-0 right-0 rounded-l-none hover:bg-transparent">
                          {showSecrets["ms_sec"] ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="ea-label2">Bezeichnung</Label>
                      <Input id="ea-label2" placeholder="z.B. Office 365 Hauptkonto" value={form.label}
                        onChange={(e) => setForm((f) => ({ ...f, label: e.target.value.slice(0, 256) }))} />
                    </div>
                  </div>
                )}

                {/* Connection test result */}
                {connTestResult && (
                  <div className={`flex items-center gap-2 text-sm rounded-lg p-3 ${connTestResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-destructive"}`}>
                    {connTestResult.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                    {connTestResult.ok ? "Verbindung erfolgreich!" : connTestResult.error}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  {!editId && (
                    <Button variant="outline" onClick={() => setWizardStep("provider")}>
                      <ArrowLeft className="mr-1 size-4" /> Zurück
                    </Button>
                  )}
                  <Button variant="outline" onClick={handleConnTest} disabled={connTesting || !form.sender_email.trim()}>
                    {connTesting && <Loader2 className="mr-1 size-4 animate-spin" />}
                    Verbindung testen
                  </Button>
                  <div className="flex-1" />
                  <Button onClick={() => {
                    if (connTestResult?.ok || editId) {
                      setWizardStep("dns");
                      if (!dnsResult && form.sender_email.includes("@")) handleDnsCheck();
                    } else {
                      toast.error("Bitte teste zuerst die Verbindung");
                    }
                  }}>
                    Weiter <ArrowRight className="ml-1 size-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP 3: DNS Health ── */}
            {wizardStep === "dns" && (
              <div className="grid gap-4 pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="size-5" />
                    <span className="font-medium">Domain: {form.sender_email.split("@")[1]}</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleDnsCheck} disabled={dnsLoading}>
                    {dnsLoading ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Shield className="mr-1 size-3" />}
                    {dnsResult ? "Erneut prüfen" : "DNS prüfen"}
                  </Button>
                </div>

                {dnsLoading && (
                  <div className="text-center py-6 text-muted-foreground">
                    <Loader2 className="mx-auto size-6 animate-spin mb-2" />
                    <p className="text-sm">DNS-Records werden geprüft...</p>
                  </div>
                )}

                {dnsResult && !dnsLoading && (
                  <div className="space-y-3">
                    {/* Overall */}
                    <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
                      dnsResult.overall === "good" ? "bg-green-50 text-green-700" :
                      dnsResult.overall === "warning" ? "bg-amber-50 text-amber-700" :
                      "bg-red-50 text-red-700"
                    }`}>
                      {dnsResult.overall === "good" ? <ShieldCheck className="size-5" /> : <ShieldAlert className="size-5" />}
                      {dnsResult.overall === "good" ? "Alle DNS-Records korrekt konfiguriert!" :
                       dnsResult.overall === "warning" ? "Teilweise konfiguriert — einige Records fehlen." :
                       "DNS-Records fehlen — Zustellbarkeit gefährdet!"}
                    </div>

                    {/* MX */}
                    <DnsRow label="MX Records" ok={dnsResult.mx.ok}
                      detail={dnsResult.mx.ok ? dnsResult.mx.records.join(", ") : (dnsResult.mx.error || "Nicht gefunden")} />
                    {/* SPF */}
                    <DnsRow label="SPF Record" ok={dnsResult.spf.ok}
                      detail={dnsResult.spf.ok ? (dnsResult.spf.record || "OK") : (dnsResult.spf.error || "Nicht gefunden")}
                      hint={!dnsResult.spf.ok ? "Füge einen TXT-Record mit \"v=spf1 ...\" hinzu" : undefined} />
                    {/* DMARC */}
                    <DnsRow label="DMARC Record" ok={dnsResult.dmarc.ok}
                      detail={dnsResult.dmarc.ok ? (dnsResult.dmarc.record || "OK") : (dnsResult.dmarc.error || "Nicht gefunden")}
                      hint={!dnsResult.dmarc.ok ? "Füge einen TXT-Record bei _dmarc.domain mit \"v=DMARC1; ...\" hinzu" : undefined} />
                  </div>
                )}

                {!dnsResult && !dnsLoading && (
                  <div className="text-center py-6 text-muted-foreground">
                    <Shield className="mx-auto size-8 mb-2 opacity-40" />
                    <p className="text-sm">Klicke auf &quot;DNS prüfen&quot; um deine Domain zu überprüfen.</p>
                    <p className="text-xs mt-1">SPF, DKIM und DMARC sind wichtig für die Zustellbarkeit.</p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => setWizardStep("credentials")}>
                    <ArrowLeft className="mr-1 size-4" /> Zurück
                  </Button>
                  <div className="flex-1" />
                  <Button onClick={() => setWizardStep("limits")}>
                    Weiter <ArrowRight className="ml-1 size-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP 4: Limits & Warmup ── */}
            {wizardStep === "limits" && (
              <div className="grid gap-5 pt-4">
                <div className="grid gap-3">
                  <div className="flex items-center justify-between">
                    <Label>Tägliches Sendelimit</Label>
                    <span className="text-sm tabular-nums font-medium">{form.daily_limit} / Tag</span>
                  </div>
                  <Slider value={[form.daily_limit]} onValueChange={([v]) => setForm((f) => ({ ...f, daily_limit: Math.min(500, Math.max(10, v)) }))}
                    min={10} max={500} step={10} />
                  <p className="text-xs text-muted-foreground">
                    Empfohlen: 30-50 für neue Konten, bis 200 für etablierte Domains.
                  </p>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-1"><Flame className="size-4 text-orange-500" /> Warmup aktivieren</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Sendelimit wird täglich automatisch erhöht, um Domain-Reputation aufzubauen.</p>
                  </div>
                  <Switch checked={form.warmup_enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, warmup_enabled: v }))} />
                </div>

                {form.warmup_enabled && (
                  <div className="rounded-lg border p-4 bg-muted/30 grid gap-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <div className="flex items-center justify-between">
                          <Label>Starten mit</Label>
                          <span className="text-xs tabular-nums text-muted-foreground">{form.warmup_start} E-Mails / Tag</span>
                        </div>
                        <Slider value={[form.warmup_start]} onValueChange={([v]) => setForm((f) => ({ ...f, warmup_start: Math.min(100, Math.max(5, v)) }))}
                          min={5} max={100} step={5} />
                      </div>
                      <div className="grid gap-2">
                        <div className="flex items-center justify-between">
                          <Label>Täglich erhöhen um</Label>
                          <span className="text-xs tabular-nums text-muted-foreground">+{form.warmup_increment} / Tag</span>
                        </div>
                        <Slider value={[form.warmup_increment]} onValueChange={([v]) => setForm((f) => ({ ...f, warmup_increment: Math.min(50, Math.max(1, v)) }))}
                          min={1} max={50} step={1} />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Beispiel: Tag 1 = {form.warmup_start}, Tag 2 = {form.warmup_start + form.warmup_increment},
                      Tag 3 = {form.warmup_start + form.warmup_increment * 2}, ...
                      bis max. {form.daily_limit} / Tag
                      ({Math.ceil((form.daily_limit - form.warmup_start) / form.warmup_increment)} Tage bis Volllast).
                    </p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => setWizardStep("dns")}>
                    <ArrowLeft className="mr-1 size-4" /> Zurück
                  </Button>
                  <div className="flex-1" />
                  <Button onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="mr-1 size-4 animate-spin" />}
                    {editId ? "Speichern" : "Konto erstellen"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════ EINSTELLUNGEN (pro Konto) ══════════ */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="truncate">{form.sender_email || "Postfach"}</span>
            </DialogTitle>
            <DialogDescription>Absender, Sendelimit, Warmup &amp; Tracking dieses Postfachs.</DialogDescription>
          </DialogHeader>

          {/* Konto-Kopf mit Test-Aktionen */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <MailboxLogo provider={form.provider} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{form.sender_email}</p>
              <p className="text-xs text-muted-foreground">
                {form.provider === "smtp" ? "SMTP" : form.provider === "google_oauth" ? "Google / Gmail" : "Microsoft 365"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline" size="sm"
                onClick={() => editId && handleTest(editId)} disabled={!editId || testing === editId}
              >
                {testing === editId && <Loader2 className="mr-1 size-4 animate-spin" />}
                Verbindung testen
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={handleSendTest} disabled={!editId || sendingTest}
                title="Echte Test-E-Mail an deine eigene Adresse senden"
              >
                {sendingTest && <Loader2 className="mr-1 size-4 animate-spin" />}
                Test-E-Mail senden
              </Button>
            </div>
          </div>

          <Accordion type="multiple" defaultValue={["sender", "limits"]} className="w-full">
            {/* Absender & Alias */}
            <AccordionItem value="sender">
              <AccordionTrigger className="text-sm">Absender &amp; Alias</AccordionTrigger>
              <AccordionContent className="grid gap-4 pt-1">
                <div className="grid gap-2">
                  <Label htmlFor="set-name">Absendername</Label>
                  <Input id="set-name" placeholder="Max Mustermann" value={form.sender_name}
                    onChange={(e) => setForm((f) => ({ ...f, sender_name: e.target.value.slice(0, 256) }))} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="set-reply">Antwort-Adresse (Reply-To)</Label>
                  <Input id="set-reply" type="email" placeholder={form.sender_email || "reply@domain.de"} value={form.reply_to}
                    onChange={(e) => setForm((f) => ({ ...f, reply_to: e.target.value.slice(0, 254) }))} />
                  <p className="text-xs text-muted-foreground">Antworten landen an dieser Adresse statt am Postfach.</p>
                </div>
                {(form.provider === "google_oauth" || form.provider === "microsoft_oauth") && (
                  <div className="grid gap-2">
                    <Label htmlFor="set-sendas">Senden als (Shared-Postfach)</Label>
                    <Input id="set-sendas" type="email" placeholder="z. B. office@firma.at" value={form.send_as_email}
                      onChange={(e) => setForm((f) => ({ ...f, send_as_email: e.target.value.slice(0, 254) }))} />
                    <p className="text-xs text-muted-foreground">
                      Optional: aus einem freigegebenen Postfach senden. Du brauchst Send-As-Recht
                      {form.provider === "microsoft_oauth" ? " (Microsoft 365: Vollzugriff bzw. Senden-als)." : " (Gmail: verifizierter Senden-als-Alias)."} Leer = aus dem verbundenen Konto.
                    </p>
                  </div>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="set-label">Bezeichnung (intern)</Label>
                  <Input id="set-label" placeholder="z.B. Outreach Domain 1" value={form.label}
                    onChange={(e) => setForm((f) => ({ ...f, label: e.target.value.slice(0, 256) }))} />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Sendelimit & Warmup */}
            <AccordionItem value="limits">
              <AccordionTrigger className="text-sm">Sendelimit &amp; Warmup</AccordionTrigger>
              <AccordionContent className="grid gap-5 pt-1">
                <div className="grid gap-3">
                  <div className="flex items-center justify-between">
                    <Label>Tägliches Sendelimit</Label>
                    <span className="text-sm tabular-nums font-medium">{form.daily_limit} / Tag</span>
                  </div>
                  <Slider value={[form.daily_limit]} onValueChange={([v]) => setForm((f) => ({ ...f, daily_limit: Math.min(500, Math.max(10, v)) }))}
                    min={10} max={500} step={10} />
                  <p className="text-xs text-muted-foreground">Empfohlen: 30–50 für neue Konten, bis 200 für etablierte Domains.</p>
                </div>

                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-1"><Flame className="size-4 text-orange-500" /> Warmup</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Limit wird täglich automatisch erhöht, um Reputation aufzubauen.</p>
                  </div>
                  <Switch checked={form.warmup_enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, warmup_enabled: v }))} />
                </div>

                {form.warmup_enabled && (
                  <div className="rounded-lg border p-4 bg-muted/30 grid gap-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <div className="flex items-center justify-between">
                          <Label>Starten mit</Label>
                          <span className="text-xs tabular-nums text-muted-foreground">{form.warmup_start} / Tag</span>
                        </div>
                        <Slider value={[form.warmup_start]} onValueChange={([v]) => setForm((f) => ({ ...f, warmup_start: Math.min(100, Math.max(5, v)) }))}
                          min={5} max={100} step={5} />
                      </div>
                      <div className="grid gap-2">
                        <div className="flex items-center justify-between">
                          <Label>Täglich erhöhen um</Label>
                          <span className="text-xs tabular-nums text-muted-foreground">+{form.warmup_increment} / Tag</span>
                        </div>
                        <Slider value={[form.warmup_increment]} onValueChange={([v]) => setForm((f) => ({ ...f, warmup_increment: Math.min(50, Math.max(1, v)) }))}
                          min={1} max={50} step={1} />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Tag 1 = {form.warmup_start}, Tag 2 = {form.warmup_start + form.warmup_increment}, …
                      bis max. {form.daily_limit} / Tag
                      ({Math.ceil((form.daily_limit - form.warmup_start) / form.warmup_increment)} Tage bis Volllast).
                    </p>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Custom Tracking-Domain */}
            <AccordionItem value="tracking">
              <AccordionTrigger className="text-sm">Custom Tracking-Domain</AccordionTrigger>
              <AccordionContent className="grid gap-3 pt-1">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Beim Versand werden Öffnungen &amp; Klicks über eine Tracking-Domain gemessen. Standardmäßig läuft das über
                  eine mit anderen Kunden <span className="font-medium text-foreground">geteilte Domain</span>. Richtest du eine
                  <span className="font-medium text-foreground"> eigene Subdomain</span> ein, laufen alle Tracking-Links unter
                  deiner eigenen Domain — das wirkt für Spamfilter vertrauenswürdiger und <span className="font-medium text-foreground">verbessert
                  die Zustellbarkeit</span> spürbar.
                </p>
                <div className="grid gap-1.5 text-xs text-muted-foreground">
                  <p><span className="font-medium text-foreground">1.</span> Öffne den DNS-Bereich deines Domain-Anbieters (z.&nbsp;B. IONOS, Strato, Cloudflare, GoDaddy).</p>
                  <p><span className="font-medium text-foreground">2.</span> Lege einen neuen <span className="font-medium text-foreground">CNAME</span>-Eintrag mit exakt diesen Werten an:</p>
                </div>
                <div className="grid gap-1 rounded-lg border bg-muted/30 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Typ</span><span className="font-mono">CNAME</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Name / Host</span><span className="font-mono">track.{form.sender_email.split("@")[1] || "deine-domain.de"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Ziel / Wert</span><span className="font-mono">track.ki-kanzlei.at</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">TTL</span><span className="font-mono">3600 (Standard)</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Hinweis: Manche Anbieter erwarten im Feld „Name/Host&quot; nur <span className="font-mono">track</span> ohne deine Domain dahinter.
                </p>
                <div className="grid gap-1.5 text-xs text-muted-foreground">
                  <p><span className="font-medium text-foreground">3.</span> Speichern und 15&nbsp;Min – 2&nbsp;Std warten (DNS-Propagation).</p>
                  <p><span className="font-medium text-foreground">4.</span> Danach hier auf „Domain verifizieren&quot; klicken — wir prüfen den CNAME automatisch.</p>
                </div>
                <p className="flex items-center gap-1.5 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
                  <Globe className="size-3.5 shrink-0" /> Optional: Ohne Custom-Domain funktioniert das Tracking weiterhin über die Standard-Domain.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Schließen</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-1 size-4 animate-spin" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════ SETUP-GUIDE (Nachschlagen) ══════════ */}
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="sm:max-w-[860px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Einrichtungs-Anleitung</DialogTitle>
            <DialogDescription>Schritt-für-Schritt je Anbieter — jederzeit zum Nachschlagen.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-1 rounded-lg border p-1">
            {(["google", "microsoft", "smtp"] as SetupKind[]).map((k) => {
              const label = k === "google" ? "Google / Gmail" : k === "microsoft" ? "Microsoft 365" : "Anderer (SMTP)";
              return (
                <button
                  key={k}
                  onClick={() => setGuideKind(k)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    guideKind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <MailboxSetupGuide kind={guideKind} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── DNS Row Component ── */
function DnsRow({ label, ok, detail, hint }: { label: string; ok: boolean; detail: string; hint?: string }) {
  return (
    <div className={`rounded-lg border p-3 ${ok ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"}`}>
      <div className="flex items-center gap-2">
        {ok ? <CheckCircle2 className="size-4 text-green-600 shrink-0" /> : <XCircle className="size-4 text-red-500 shrink-0" />}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1 font-mono break-all">{detail}</p>
      {hint && <p className="text-xs text-amber-600 mt-1">{hint}</p>}
    </div>
  );
}
