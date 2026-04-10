"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus, Trash2, TestTube, Loader2, CheckCircle2, XCircle, Mail,
  EyeIcon, EyeOffIcon, Power, PowerOff, Flame, Shield, ShieldCheck,
  ShieldAlert, ArrowRight, ArrowLeft, Settings2, Pencil, Globe,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

/* ── Types ── */
interface EmailAccount {
  id: string;
  label: string;
  provider: "smtp" | "microsoft_graph";
  sender_email: string;
  sender_name: string | null;
  reply_to: string | null;
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

type WizardStep = "provider" | "credentials" | "dns" | "limits";

type FormData = {
  label: string;
  provider: "smtp" | "microsoft_graph";
  sender_email: string;
  sender_name: string;
  reply_to: string;
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
  label: "", provider: "smtp", sender_email: "", sender_name: "", reply_to: "",
  smtp_host: "", smtp_port: 587, smtp_username: "", smtp_password: "", smtp_encryption: "tls",
  ms_tenant_id: "", ms_client_id: "", ms_client_secret: "",
  daily_limit: 50, is_active: true, warmup_enabled: true, warmup_start: 10, warmup_increment: 5,
};

const healthColor: Record<string, string> = { good: "bg-green-500", warning: "bg-amber-500", bad: "bg-red-500", unknown: "bg-gray-400" };
const healthLabel: Record<string, string> = { good: "Aktiv", warning: "Warnung", bad: "Fehler", unknown: "Nicht getestet" };

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

export default function EmailAccountsManager() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  // Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>("provider");
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [detectedProvider, setDetectedProvider] = useState<string | null>(null);
  const [showAdvancedSmtp, setShowAdvancedSmtp] = useState(false);
  const [dnsResult, setDnsResult] = useState<DnsResult | null>(null);
  const [dnsLoading, setDnsLoading] = useState(false);
  const [connTestResult, setConnTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [connTesting, setConnTesting] = useState(false);

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

  function openEdit(acc: EmailAccount) {
    setForm({
      label: acc.label, provider: acc.provider,
      sender_email: acc.sender_email, sender_name: acc.sender_name ?? "",
      reply_to: acc.reply_to ?? "",
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
    setWizardStep("credentials");
    setShowAdvancedSmtp(true);
    setDnsResult(null);
    setConnTestResult(null);
    setDialogOpen(true);
  }

  function selectProvider(provider: "smtp" | "microsoft_graph") {
    setForm((f) => ({ ...f, provider }));
    setWizardStep("credentials");
    setShowAdvancedSmtp(false);
    setConnTestResult(null);
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
      toast.success(editId ? "Konto aktualisiert" : "Konto erstellt");
      setDialogOpen(false);
      loadAccounts();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Fehler"); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("E-Mail-Konto wirklich löschen?")) return;
    try {
      const res = await fetch(`/api/email-accounts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Konto gelöscht");
      loadAccounts();
    } catch { toast.error("Fehler beim Löschen"); }
  }

  async function handleTest(id: string) {
    setTesting(id);
    try {
      const res = await fetch(`/api/email-accounts/${id}/test`, { method: "POST" });
      const { data } = await res.json();
      if (data?.ok) toast.success("Verbindung erfolgreich");
      else toast.error(data?.error ?? "Verbindung fehlgeschlagen");
      loadAccounts();
    } catch { toast.error("Testfehler"); }
    finally { setTesting(null); }
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    try {
      await fetch(`/api/email-accounts/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !isActive }),
      });
      loadAccounts();
    } catch { toast.error("Fehler"); }
  }

  const toggleSecret = (key: string) => setShowSecrets((s) => ({ ...s, [key]: !s[key] }));

  const totalDailyCapacity = accounts.filter((a) => a.is_active).reduce((sum, a) => sum + a.daily_limit, 0);
  const totalSentToday = accounts.reduce((sum, a) => sum + a.sent_today, 0);

  const stepIndex = { provider: 0, credentials: 1, dns: 2, limits: 3 };
  const stepProgress = ((stepIndex[wizardStep] + 1) / 4) * 100;

  if (loading) return null;

  return (
    <Card className="shadow-xs">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Mail className="size-5" /> E-Mail-Konten</CardTitle>
            <CardDescription className="mt-1">
              Mehrere Konten & Domains für automatische Rotation beim Kampagnenversand.
            </CardDescription>
          </div>
          <Button onClick={openCreate} size="sm"><Plus className="mr-1 size-4" /> Konto hinzufügen</Button>
        </div>
        {accounts.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm text-muted-foreground">
            <span>{accounts.filter((a) => a.is_active).length} aktiv von {accounts.length}</span>
            <span>Kapazität: {totalDailyCapacity} / Tag</span>
            <span>Heute: {totalSentToday}</span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {accounts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Mail className="mx-auto size-10 mb-3 opacity-40" />
            <p className="font-medium">Noch keine E-Mail-Konten</p>
            <p className="text-sm mt-1">Füge mindestens ein Konto hinzu, um Kampagnen zu versenden.</p>
            <Button onClick={openCreate} className="mt-4"><Plus className="mr-1 size-4" /> Erstes Konto verbinden</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((acc) => (
              <div key={acc.id} className={`flex items-center gap-4 rounded-lg border p-4 transition-colors ${acc.is_active ? "" : "opacity-50"}`}>
                <div className={`size-3 rounded-full shrink-0 ${healthColor[acc.health_status]}`} title={healthLabel[acc.health_status]} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{acc.label}</span>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {acc.provider === "smtp" ? "SMTP" : "Microsoft 365"}
                    </Badge>
                    {acc.warmup_enabled && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        <Flame className="size-3 mr-1" /> Tag {acc.warmup_day}
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground truncate mt-0.5">{acc.sender_email}</div>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                    <span>{acc.sent_today} / {acc.daily_limit} heute</span>
                    <span>{acc.total_sent} gesamt</span>
                    {acc.last_error && <span className="text-destructive truncate max-w-48" title={acc.last_error}>{acc.last_error}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => handleTest(acc.id)} disabled={testing === acc.id} title="Testen">
                    {testing === acc.id ? <Loader2 className="size-4 animate-spin" /> : <TestTube className="size-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleToggleActive(acc.id, acc.is_active)} title={acc.is_active ? "Deaktivieren" : "Aktivieren"}>
                    {acc.is_active ? <Power className="size-4 text-green-600" /> : <PowerOff className="size-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(acc)} title="Bearbeiten"><Pencil className="size-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(acc.id)} title="Löschen" className="text-destructive hover:text-destructive"><Trash2 className="size-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* ══════════ WIZARD DIALOG ══════════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
          {/* Progress */}
          <div className="px-6 pt-6 pb-2">
            <DialogHeader>
              <DialogTitle>
                {editId ? "E-Mail-Konto bearbeiten" : "E-Mail-Konto verbinden"}
              </DialogTitle>
              <DialogDescription>
                {wizardStep === "provider" && "Wähle deinen E-Mail-Provider."}
                {wizardStep === "credentials" && "Gib deine Zugangsdaten ein."}
                {wizardStep === "dns" && "Prüfe deine Domain-Konfiguration."}
                {wizardStep === "limits" && "Sendelimit & Warmup einstellen."}
              </DialogDescription>
            </DialogHeader>
            {!editId && <Progress value={stepProgress} className="mt-3 h-1" />}
          </div>

          <div className="px-6 pb-6">
            {/* ── STEP 1: Provider ── */}
            {wizardStep === "provider" && (
              <div className="grid gap-3 pt-4">
                <button
                  onClick={() => selectProvider("smtp")}
                  className="flex items-center gap-4 rounded-lg border-2 p-4 text-left transition-colors hover:border-primary hover:bg-accent"
                >
                  <GoogleIcon />
                  <div className="flex-1">
                    <p className="font-medium">Google / Gmail</p>
                    <p className="text-sm text-muted-foreground">Gmail, Google Workspace</p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </button>

                <button
                  onClick={() => selectProvider("microsoft_graph")}
                  className="flex items-center gap-4 rounded-lg border-2 p-4 text-left transition-colors hover:border-primary hover:bg-accent"
                >
                  <MicrosoftIcon />
                  <div className="flex-1">
                    <p className="font-medium">Microsoft / Outlook</p>
                    <p className="text-sm text-muted-foreground">Office 365, Outlook, Hotmail</p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </button>

                <button
                  onClick={() => selectProvider("smtp")}
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

            {/* ── STEP 2: Credentials ── */}
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
                          onChange={(e) => setForm((f) => ({ ...f, smtp_username: e.target.value.slice(0, 256) }))} className="font-mono text-xs" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="ea-pass">Passwort / App-Passwort</Label>
                        <div className="relative">
                          <Input id="ea-pass" type={showSecrets["smtp_pw"] ? "text" : "password"}
                            placeholder="••••••••" value={form.smtp_password}
                            onChange={(e) => setForm((f) => ({ ...f, smtp_password: e.target.value.slice(0, 512) }))}
                            className="font-mono text-xs pr-9" autoComplete="off" />
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
                              onChange={(e) => setForm((f) => ({ ...f, smtp_host: e.target.value.slice(0, 256) }))} className="font-mono text-xs" />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="ea-port">Port</Label>
                            <Input id="ea-port" type="number" placeholder="587" value={form.smtp_port}
                              onChange={(e) => setForm((f) => ({ ...f, smtp_port: Number(e.target.value) || 587 }))} className="font-mono text-xs" />
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
                    <div className="grid gap-2">
                      <Label htmlFor="ea-tenant">Tenant ID</Label>
                      <Input id="ea-tenant" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={form.ms_tenant_id}
                        onChange={(e) => setForm((f) => ({ ...f, ms_tenant_id: e.target.value.slice(0, 256) }))} className="font-mono text-xs" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="ea-cid">Client ID</Label>
                      <Input id="ea-cid" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={form.ms_client_id}
                        onChange={(e) => setForm((f) => ({ ...f, ms_client_id: e.target.value.slice(0, 256) }))} className="font-mono text-xs" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="ea-csec">Client Secret</Label>
                      <div className="relative">
                        <Input id="ea-csec" type={showSecrets["ms_sec"] ? "text" : "password"}
                          placeholder="xxxxxxxxxxxxxxxxxxxxxxxx" value={form.ms_client_secret}
                          onChange={(e) => setForm((f) => ({ ...f, ms_client_secret: e.target.value.slice(0, 512) }))}
                          className="font-mono text-xs pr-9" autoComplete="off" />
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
                    {connTesting ? <Loader2 className="mr-1 size-4 animate-spin" /> : <TestTube className="mr-1 size-4" />}
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
                  <Slider value={[form.daily_limit]} onValueChange={([v]) => setForm((f) => ({ ...f, daily_limit: Math.min(500, Math.max(1, v)) }))}
                    min={1} max={500} step={5} />
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
                        <Slider value={[form.warmup_start]} onValueChange={([v]) => setForm((f) => ({ ...f, warmup_start: Math.min(100, Math.max(1, v)) }))}
                          min={1} max={100} step={1} />
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
    </Card>
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
