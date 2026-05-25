"use client";

import { useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Search, Plus, Trash2, Check, MoreHorizontal,
  Mail, Shield, BarChart3, Users, Contact, GitBranch,
  Linkedin, Layers, Sparkles, FileText,
  Settings as SettingsIcon, Info, RefreshCw, Key, Webhook, Copy,
  CreditCard, Upload, Bell, Lock, EyeIcon, EyeOffIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/* ───────────────────────────── Navigation ───────────────────────────── */
type SectionKey =
  | "general" | "profile" | "team" | "notifications"
  | "mailbox" | "tracking" | "social"
  | "crm" | "automation" | "api"
  | "enrichment" | "scoring" | "search"
  | "billing" | "security" | "data";

const SECTIONS: { group: string; items: { k: SectionKey; label: string; icon: React.ComponentType<{ className?: string }> }[] }[] = [
  {
    group: "Konto",
    items: [
      { k: "general",       label: "Allgemein",          icon: SettingsIcon },
      { k: "profile",       label: "Mein Profil",        icon: Users },
      { k: "team",          label: "Team & Rollen",      icon: Contact },
      { k: "notifications", label: "Benachrichtigungen", icon: Bell },
    ],
  },
  {
    group: "Kommunikation",
    items: [
      { k: "mailbox",  label: "E-Mail-Konten",      icon: Mail },
      { k: "tracking", label: "Tracking & Domains", icon: Shield },
      { k: "social",   label: "Social Accounts",    icon: Linkedin },
    ],
  },
  {
    group: "Integrationen",
    items: [
      { k: "crm",        label: "CRM-Integrationen",   icon: GitBranch },
      { k: "automation", label: "Automatisierungen",   icon: Sparkles },
      { k: "api",        label: "API & Webhooks",      icon: Webhook },
    ],
  },
  {
    group: "Daten & Leads",
    items: [
      { k: "enrichment", label: "Lead-Anreicherung", icon: Users },
      { k: "scoring",    label: "Lead-Scoring",      icon: BarChart3 },
      { k: "search",     label: "Such-Defaults",     icon: Search },
    ],
  },
  {
    group: "Sonstiges",
    items: [
      { k: "billing",  label: "Abrechnung",        icon: CreditCard },
      { k: "security", label: "Sicherheit",        icon: Lock },
      { k: "data",     label: "Daten exportieren", icon: Upload },
    ],
  },
];
const SECTION_KEYS = SECTIONS.flatMap(g => g.items.map(i => i.k as string));

/* ───────────────────────── Demo data (from mockup) ───────────────────── */
const CRM_PROVIDERS = [
  { id: "hubspot",    name: "HubSpot",    desc: "Sync Leads, Companies & Deals beidseitig.",          color: "#FF7A59", connected: true,  syncedRecords: 1248, lastSync: "vor 4 Min." },
  { id: "pipedrive",  name: "Pipedrive",  desc: "Leads pushen, Aktivitäten in der Pipeline tracken.", color: "#111111", connected: false, syncedRecords: 0, lastSync: null },
  { id: "salesforce", name: "Salesforce", desc: "Sync Leads & Opportunities mit Sales Cloud.",        color: "#00A1E0", connected: false, syncedRecords: 0, lastSync: null },
  { id: "zoho",       name: "Zoho CRM",   desc: "Leads & Kontakte bidirektional synchronisieren.",     color: "#DC0E1B", connected: false, syncedRecords: 0, lastSync: null },
];

const AUTOMATION_PROVIDERS = [
  { id: "zapier", name: "Zapier",    desc: "6000+ Apps automatisieren mit Triggern und Actions.", color: "#FF4F00", connected: true,  workflows: 3 },
  { id: "make",   name: "Make.com",  desc: "Visuelle Workflows für komplexe Automatisierungen.",   color: "#6D00CC", connected: false, workflows: 0 },
  { id: "n8n",    name: "n8n",       desc: "Self-hosted automation. Webhook-Trigger inkl.",        color: "#EA4B71", connected: false, workflows: 0 },
];

const SOCIAL_ACCOUNTS = [
  { id: "li1", platform: "linkedin",  name: "Maria Bauer",  handle: "maria-bauer-kanzlei",  connected: true,  bg: "#0A66C2" },
  { id: "li2", platform: "linkedin",  name: "KI Kanzlei",   handle: "company/ki-kanzlei",   connected: true,  bg: "#0A66C2" },
  { id: "fb",  platform: "facebook",  name: "KI Kanzlei",   handle: "ki.kanzlei.at",         connected: true,  bg: "#1877F2" },
  { id: "ig",  platform: "instagram", name: "@kikanzlei",   handle: "kikanzlei",             connected: false, bg: "#E4405F" },
] as const;

const TEAM_MEMBERS = [
  { name: "Maria Bauer",   email: "maria@ki-kanzlei.at",    role: "Owner",  joined: "vor 14 Monaten", isYou: true },
  { name: "Thomas Wagner", email: "t.wagner@ki-kanzlei.at", role: "Admin",  joined: "vor 8 Monaten" },
  { name: "Sarah Brunner", email: "s.brunner@ki-kanzlei.at", role: "Member", joined: "vor 3 Monaten" },
  { name: "Jonas Hofer",   email: "j.hofer@ki-kanzlei.at",  role: "Viewer", joined: "vor 5 Wochen" },
];

function avatarColor(s: string) {
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `oklch(0.62 0.13 ${h})`;
}

function initials(name: string) {
  return name.split(" ").map(s => s[0]).join("").slice(0, 2);
}

/* ───────────────────────── Shared components ───────────────────────── */
function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="text-sm text-muted-foreground mt-1">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

function RowToggle({ title, desc, checked, onCheckedChange }: { title: string; desc?: string; checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-t first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug">{title}</p>
        {desc && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function Callout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-md border bg-muted/40 p-3">
      <Info className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="text-xs leading-relaxed">
        <div className="font-medium text-foreground">{title}</div>
        <div className="text-muted-foreground mt-0.5">{children}</div>
      </div>
    </div>
  );
}

function StatusDot({ tone }: { tone: "success" | "warning" | "destructive" | "muted" }) {
  const cls = {
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    destructive: "bg-destructive",
    muted: "bg-muted-foreground",
  }[tone];
  return <span className={cn("size-1.5 rounded-full inline-block", cls)} />;
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    Owner:  "bg-primary/10 text-primary border-primary/20",
    Admin:  "bg-violet-50 text-violet-700 border-violet-200",
    Member: "bg-muted text-foreground border-border",
    Viewer: "bg-muted text-muted-foreground border-border",
  };
  return (
    <Badge variant="outline" className={cn("rounded-full text-[11px] font-medium px-2.5 py-0.5", map[role] ?? map.Member)}>
      {role}
    </Badge>
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
    <aside className="w-full shrink-0 border-b bg-card lg:sticky lg:top-0 lg:h-[calc(100vh-3.5rem)] lg:w-64 lg:overflow-y-auto lg:border-b-0 lg:border-r">
      <div className="px-5 pt-6 pb-3">
        <h2 className="text-base font-semibold tracking-tight">Einstellungen</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Konto, Integrationen, Daten</p>
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
   SECTIONS — exakt nach Mockup
   ═══════════════════════════════════════════════════════════════════════ */

/* ─── Allgemein ─── */
function GeneralSection() {
  const [name, setName] = useState("KI Kanzlei GmbH");
  const [domain, setDomain] = useState("ki-kanzlei.at");
  const [cookieBanner, setCookieBanner] = useState(true);
  const [unsubLink, setUnsubLink] = useState(true);
  const [euDataOnly, setEuDataOnly] = useState(true);

  return (
    <>
      <PageHead title="Allgemeine Einstellungen" sub="Organisations-Daten und globale Präferenzen für deinen Workspace." />

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>Organisation</CardTitle>
          <CardDescription>Diese Informationen erscheinen in Mails, PDFs und Berichten.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="org-name">Firmenname</Label>
              <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-domain">Haupt-Domain</Label>
              <Input id="org-domain" value={domain} onChange={(e) => setDomain(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Land</Label>
              <Select defaultValue="AT">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AT">Österreich</SelectItem>
                  <SelectItem value="DE">Deutschland</SelectItem>
                  <SelectItem value="CH">Schweiz</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Zeitzone</Label>
              <Select defaultValue="vienna">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vienna">Europe/Vienna (UTC+1)</SelectItem>
                  <SelectItem value="berlin">Europe/Berlin (UTC+1)</SelectItem>
                  <SelectItem value="zurich">Europe/Zurich (UTC+1)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Sprache</Label>
              <Select defaultValue="de-AT">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="de-AT">Deutsch (Österreich)</SelectItem>
                  <SelectItem value="de-DE">Deutsch (Deutschland)</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Währung</Label>
              <Select defaultValue="EUR">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR · Euro</SelectItem>
                  <SelectItem value="CHF">CHF · Schweizer Franken</SelectItem>
                  <SelectItem value="USD">USD · US-Dollar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Logo und Farben für CRM, E-Mails und PDFs.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex size-28 flex-col items-center justify-center gap-1 rounded-xl border border-dashed bg-muted/30 text-muted-foreground">
              <Upload className="size-5" />
              <span className="text-[11px]">Logo hochladen</span>
            </div>
            <div className="flex-1 grid gap-4">
              <div className="grid gap-2">
                <Label>Markenfarbe (Primary)</Label>
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-md border" style={{ background: "oklch(0.546 0.244 263)" }} />
                  <Input defaultValue="#2563EB" className="w-40 font-mono text-xs" />
                  <span className="text-xs text-muted-foreground">Wird in Mails, Buttons und Badges verwendet.</span>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="footer-text">Footer-Text für E-Mails</Label>
                <Textarea
                  id="footer-text"
                  rows={3}
                  defaultValue="KI Kanzlei GmbH · Wollzeile 14, 1010 Wien · FN 543210x · Datenschutz: ki-kanzlei.at/datenschutz"
                  className="resize-y"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>DSGVO & Datenschutz</CardTitle>
        </CardHeader>
        <CardContent className="py-2">
          <RowToggle title="Cookie-Banner für Tracking-Links" desc="Empfänger müssen vor Tracking zustimmen (für EU-Empfänger empfohlen)." checked={cookieBanner} onCheckedChange={setCookieBanner} />
          <RowToggle title="Unsubscribe-Link automatisch anhängen" desc="Ein-Klick-Abmeldung wird allen Outbound-Mails hinzugefügt (DSGVO-konform)." checked={unsubLink} onCheckedChange={setUnsubLink} />
          <RowToggle title="Daten in EU speichern" desc="Server-Standort: Frankfurt (Hetzner). Keine Datenübertragung außerhalb der EU." checked={euDataOnly} onCheckedChange={setEuDataOnly} />
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-xs border-destructive/20">
        <CardHeader>
          <CardTitle className="text-destructive">Gefährliche Aktionen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Workspace löschen</p>
              <p className="text-xs text-muted-foreground mt-0.5">Alle Leads, Kampagnen und Daten werden unwiderruflich gelöscht.</p>
            </div>
            <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive">
              Workspace löschen
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/* ─── Mein Profil ─── */
function ProfileSection() {
  const [pwVisible, setPwVisible] = useState(false);
  return (
    <>
      <PageHead title="Mein Profil" sub="Persönliche Daten, Signatur und Login-Optionen." />

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>Persönliche Daten</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="flex items-center gap-4">
            <div className="flex size-16 items-center justify-center rounded-full text-white font-medium text-xl" style={{ background: avatarColor("Maria Bauer") }}>
              MB
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Upload className="size-3.5" /> Foto hochladen
              </Button>
              <Button variant="ghost" size="sm">Entfernen</Button>
            </div>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Vorname</Label><Input defaultValue="Maria" /></div>
            <div className="grid gap-2"><Label>Nachname</Label><Input defaultValue="Bauer" /></div>
          </div>
          <div className="grid gap-2"><Label>E-Mail (Login)</Label><Input type="email" defaultValue="maria@ki-kanzlei.at" /></div>
          <div className="grid gap-2"><Label>Telefon</Label><Input defaultValue="+43 1 512 33 80" /></div>
          <div className="grid gap-2"><Label>Position / Titel</Label><Input defaultValue="Mag. · Inhaberin & Geschäftsführerin" /></div>
        </CardContent>
        <CardFooter>
          <Button onClick={() => toast.success("Profil gespeichert")}>Speichern</Button>
        </CardFooter>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>Passwort ändern</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <Label>Aktuelles Passwort</Label>
            <div className="relative">
              <Input type={pwVisible ? "text" : "password"} className="pr-9" />
              <Button type="button" variant="ghost" size="icon" onClick={() => setPwVisible(v => !v)}
                className="text-muted-foreground absolute inset-y-0 right-0 rounded-l-none hover:bg-transparent">
                {pwVisible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </Button>
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Neues Passwort</Label><Input type="password" /></div>
            <div className="grid gap-2"><Label>Wiederholen</Label><Input type="password" /></div>
          </div>
        </CardContent>
        <CardFooter>
          <Button>Passwort ändern</Button>
        </CardFooter>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>Zwei-Faktor-Authentifizierung</CardTitle>
          <CardDescription>Schütze dein Konto zusätzlich mit einer App (Google Authenticator, Authy, 1Password).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="inline-flex items-center gap-1 text-emerald-600 text-[11px] font-semibold">
                  <Check className="size-3" /> AKTIV
                </span>
                Authenticator-App
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Verbunden seit März 2025</p>
            </div>
            <Button variant="outline" size="sm">Neu einrichten</Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/* ─── Team & Rollen ─── */
function TeamSection() {
  const matrix: [string, boolean, boolean, boolean, boolean][] = [
    ["Leads ansehen",              true, true, true, true],
    ["Leads bearbeiten & löschen", true, true, true, false],
    ["Kampagnen erstellen",        true, true, true, false],
    ["E-Mail-Konten verwalten",    true, true, false, false],
    ["Integrationen verbinden",    true, true, false, false],
    ["Team verwalten",             true, true, false, false],
    ["Abrechnung verwalten",       true, false, false, false],
    ["Workspace löschen",          true, false, false, false],
  ];

  return (
    <>
      <PageHead
        title="Team & Rollen"
        sub="Lade Kolleg:innen ein und verwalte deren Zugriffsrechte."
        actions={<Button size="sm"><Plus className="mr-1.5 size-3.5" /> Mitglied einladen</Button>}
      />

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>{TEAM_MEMBERS.length} Mitglieder</CardTitle>
          <CardDescription>{TEAM_MEMBERS.length} von 10 Sitzen verwendet — im aktuellen Plan.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {TEAM_MEMBERS.map((m, i) => (
            <div key={m.email} className={cn("flex items-center gap-3 px-5 py-3.5", i > 0 && "border-t")}>
              <div className="flex size-9 items-center justify-center rounded-full text-white text-xs font-medium" style={{ background: avatarColor(m.name) }}>
                {initials(m.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {m.name}
                  {m.isYou && <Badge variant="secondary" className="rounded text-[9.5px] font-semibold uppercase tracking-wider">Du</Badge>}
                </div>
                <div className="text-xs text-muted-foreground truncate">{m.email}</div>
              </div>
              <div className="hidden md:block text-xs text-muted-foreground">Beigetreten {m.joined}</div>
              <RoleBadge role={m.role} />
              <Button variant="ghost" size="icon" className="size-7"><MoreHorizontal className="size-4" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>Rollen-Berechtigungen</CardTitle>
          <CardDescription>Was darf jede Rolle in deinem Workspace?</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-hidden rounded-b-xl">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-[40%]">Funktion</TableHead>
                  <TableHead className="text-center">Owner</TableHead>
                  <TableHead className="text-center">Admin</TableHead>
                  <TableHead className="text-center">Member</TableHead>
                  <TableHead className="text-center">Viewer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrix.map(([fn, ...vals]) => (
                  <TableRow key={fn as string}>
                    <TableCell className="text-sm">{fn}</TableCell>
                    {vals.map((v, j) => (
                      <TableCell key={j} className="text-center">
                        {v ? <Check className="mx-auto size-4 text-emerald-600" /> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/* ─── Benachrichtigungen ─── */
function NotificationsSection() {
  const [email, setEmail] = useState({ reply: true, daily: true, weekly: false, bounce: true, rep: true });
  const [browser, setBrowser] = useState({ reply: true, task: true, mention: false });

  return (
    <>
      <PageHead title="Benachrichtigungen" sub="Wann und wo wir dich über Lead-Aktivität informieren." />

      <Card className="mb-4 shadow-xs">
        <CardHeader><CardTitle>E-Mail-Benachrichtigungen</CardTitle></CardHeader>
        <CardContent className="py-2">
          <RowToggle title="Neue Antwort auf Kampagne" desc="Sofortige E-Mail wenn ein Lead antwortet." checked={email.reply} onCheckedChange={(v) => setEmail(s => ({ ...s, reply: v }))} />
          <RowToggle title="Tagesreport um 17:00 Uhr" desc="Zusammenfassung aller Kampagnen-Aktivitäten des Tages." checked={email.daily} onCheckedChange={(v) => setEmail(s => ({ ...s, daily: v }))} />
          <RowToggle title="Wöchentlicher Performance-Report" desc="Jeden Montag um 09:00 — Top-Performer, Trends." checked={email.weekly} onCheckedChange={(v) => setEmail(s => ({ ...s, weekly: v }))} />
          <RowToggle title="Bounce-Warnung" desc="Hinweis wenn eine Mailbox eine erhöhte Bounce-Rate zeigt." checked={email.bounce} onCheckedChange={(v) => setEmail(s => ({ ...s, bounce: v }))} />
          <RowToggle title="Reputation-Alarm" desc="Bei Reputation < 70 sofortige Warnung." checked={email.rep} onCheckedChange={(v) => setEmail(s => ({ ...s, rep: v }))} />
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>Browser-Benachrichtigungen</CardTitle>
          <CardDescription>Push-Benachrichtigungen im Browser, auch wenn die App nicht offen ist.</CardDescription>
        </CardHeader>
        <CardContent className="py-2">
          <RowToggle title="Neue Antwort" checked={browser.reply} onCheckedChange={(v) => setBrowser(s => ({ ...s, reply: v }))} />
          <RowToggle title="Aufgabe fällig" checked={browser.task} onCheckedChange={(v) => setBrowser(s => ({ ...s, task: v }))} />
          <RowToggle title="Erwähnung im Team-Chat" checked={browser.mention} onCheckedChange={(v) => setBrowser(s => ({ ...s, mention: v }))} />
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>Slack-Integration</CardTitle>
          <CardDescription>Benachrichtigungen direkt in deinen Slack-Channel.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Nicht verbunden</p>
              <p className="text-xs text-muted-foreground mt-0.5">Verbinde Slack, um Notifications in einem Channel zu erhalten.</p>
            </div>
            <Button variant="outline" size="sm">Slack verbinden</Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/* ─── Mailbox ─── */
function MailboxSection() {
  const mailboxes = [
    { email: "m.bauer@ki-kanzlei.at",  provider: "Google Workspace", status: "healthy" as const, sent: "18/50",  rep: 96 },
    { email: "office@ki-kanzlei.at",   provider: "Microsoft 365",     status: "healthy" as const, sent: "34/100", rep: 92 },
    { email: "t.wagner@ki-kanzlei.at", provider: "Microsoft 365",     status: "warming" as const, sent: "8/30",   rep: 84 },
  ];
  return (
    <>
      <PageHead
        title="E-Mail-Konten"
        sub="Verbundene Mailboxen für deine Kampagnen."
        actions={<Button variant="outline" size="sm" className="gap-1.5"><RefreshCw className="size-3.5" /> Alle aktualisieren</Button>}
      />

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>Verbundene Mailboxen</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {mailboxes.map((mb) => (
            <div key={mb.email} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex size-9 items-center justify-center rounded-md border bg-card">
                <Mail className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{mb.email}</p>
                <p className="text-xs text-muted-foreground">
                  {mb.provider} · {mb.sent} heute · Reputation {mb.rep}
                </p>
              </div>
              <Button variant="outline" size="sm">Verwalten</Button>
            </div>
          ))}
          <Button className="mt-2 self-start" size="sm">
            Komplette Mailbox-Verwaltung öffnen
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

/* ─── Tracking & Domains ─── */
function TrackingSection() {
  const [pix, setPix] = useState(true);
  const [clicks, setClicks] = useState(true);
  const [utm, setUtm] = useState(true);
  return (
    <>
      <PageHead title="Tracking & Domains" sub="Custom Domains für Klick-Tracking und Authentifizierung." />

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>Custom Tracking-Domain</CardTitle>
          <CardDescription>Statt unserer Default-Domain — erhöht die Zustellbarkeit deutlich.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-emerald-200/60 bg-emerald-50/60 p-3">
            <div>
              <p className="text-sm font-medium">klick.ki-kanzlei.at</p>
              <p className="text-xs text-muted-foreground">Verifiziert · Wird für 3 Mailboxen verwendet</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
              <Check className="size-3.5" /> Aktiv
            </span>
          </div>
          <Button variant="outline" size="sm" className="self-start gap-1.5"><Plus className="size-3.5" /> Weitere Domain hinzufügen</Button>
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader><CardTitle>Tracking-Pixel & Klicks</CardTitle></CardHeader>
        <CardContent className="py-2">
          <RowToggle title="Öffnungen tracken (Pixel)" desc="1×1 transparentes Pixel in jeder Mail. Schaltbar pro Kampagne." checked={pix} onCheckedChange={setPix} />
          <RowToggle title="Klicks tracken" desc="Links in Mails werden durch Tracking-Links ersetzt." checked={clicks} onCheckedChange={setClicks} />
          <RowToggle title="UTM-Parameter automatisch anhängen" desc="utm_source=ki-kanzlei&utm_campaign=<name> an alle Links." checked={utm} onCheckedChange={setUtm} />
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>Bounce-Server</CardTitle>
          <CardDescription>Eigener Mail-Server für Bounce-Erkennung.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>Bounce-Adresse</Label>
            <Input defaultValue="bounce@ki-kanzlei.at" />
          </div>
          <Callout title="Empfohlen für hohes Sendevolumen">
            Bei mehr als 500 Mails/Tag empfehlen wir eine eigene Bounce-Adresse, um Reputation deiner Haupt-Mailbox zu schützen.
          </Callout>
        </CardContent>
      </Card>
    </>
  );
}

/* ─── Social Accounts ─── */
function SocialSection() {
  const platformIcon = (p: string) => p === "linkedin" ? Linkedin : p === "facebook" ? Users : Layers;
  const platformLabel = (p: string) => p === "linkedin" ? "LinkedIn" : p === "facebook" ? "Facebook" : "Instagram";
  const [autoConnect, setAutoConnect] = useState(true);
  const [mirror, setMirror] = useState(true);

  return (
    <>
      <PageHead
        title="Social-Media-Konten"
        sub="LinkedIn, Facebook & Instagram für Outreach und Social Selling."
        actions={<Button size="sm"><Plus className="mr-1.5 size-3.5" /> Konto verbinden</Button>}
      />

      <Card className="mb-4 shadow-xs">
        <CardHeader><CardTitle>Verbundene Konten</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          {SOCIAL_ACCOUNTS.map((a) => {
            const Ic = platformIcon(a.platform);
            return (
              <div key={a.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex size-9 items-center justify-center rounded-lg text-white" style={{ background: a.bg }}>
                  <Ic className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{platformLabel(a.platform)} · {a.handle}</p>
                </div>
                {a.connected ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                    <Check className="size-3.5" /> Verbunden
                  </span>
                ) : (
                  <Button variant="outline" size="sm">Verbinden</Button>
                )}
                <Button variant="ghost" size="icon" className="size-7"><MoreHorizontal className="size-4" /></Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>LinkedIn-Outreach</CardTitle>
          <CardDescription>Einstellungen für LinkedIn-Nachrichten und Connection-Requests.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="py-1">
            <RowToggle title="Auto-Connect mit personalisierter Nachricht" desc="KI schreibt für jeden Empfänger eine kurze Connection-Nachricht." checked={autoConnect} onCheckedChange={setAutoConnect} />
            <RowToggle title="Antworten in Inbox spiegeln" desc="LinkedIn-Nachrichten erscheinen in deiner CRM-Inbox." checked={mirror} onCheckedChange={setMirror} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Max. Connections / Tag</Label><Input defaultValue="20" /></div>
            <div className="grid gap-2"><Label>Max. Nachrichten / Tag</Label><Input defaultValue="50" /></div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/* ─── CRM-Integrationen ─── */
function CrmSection() {
  const [importLeads, setImportLeads] = useState(true);
  const [pushStatus, setPushStatus] = useState(true);
  const [logActivities, setLogActivities] = useState(false);
  return (
    <>
      <PageHead title="CRM-Integrationen" sub="Synchronisiere Leads, Kontakte und Deals mit deinem bestehenden CRM." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mb-4">
        {CRM_PROVIDERS.map((p) => (
          <Card key={p.id} className="shadow-xs">
            <CardContent className="p-5">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg text-white font-semibold text-sm" style={{ background: p.color }}>
                  {p.name[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-none">{p.name}</p>
                  <p className="mt-1 text-[11px]">
                    {p.connected ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-medium"><Check className="size-3" /> Verbunden</span>
                    ) : (
                      <span className="text-muted-foreground">Nicht verbunden</span>
                    )}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3 line-clamp-2">{p.desc}</p>
              {p.connected ? (
                <>
                  <div className="mb-3 flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-[11px]">
                    <span><b className="font-semibold text-foreground">{p.syncedRecords.toLocaleString("de-DE")}</b> <span className="text-muted-foreground">Datensätze</span></span>
                    <span className="text-muted-foreground">Letzte Sync: {p.lastSync}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1">Konfigurieren</Button>
                    <Button variant="outline" size="sm" className="flex-1">Jetzt sync</Button>
                  </div>
                </>
              ) : (
                <Button size="sm" className="w-full">{p.name} verbinden</Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>Sync-Konfiguration</CardTitle>
          <CardDescription>Verhalten der HubSpot-Integration.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="py-1">
            <RowToggle title="Leads aus dem CRM importieren" desc="HubSpot-Kontakte erscheinen automatisch in deiner Lead-Liste." checked={importLeads} onCheckedChange={setImportLeads} />
            <RowToggle title="Status-Updates rückwärts pushen" desc="Wenn ein Lead in KI Kanzlei konvertiert, wird HubSpot aktualisiert." checked={pushStatus} onCheckedChange={setPushStatus} />
            <RowToggle title="Aktivitäten loggen" desc="E-Mail-Sendungen, Öffnungen und Antworten werden als HubSpot-Activities gespeichert." checked={logActivities} onCheckedChange={setLogActivities} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Standard-Pipeline</Label>
              <Select defaultValue="sales">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="sales">Sales Pipeline (Default)</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Lead-Quelle in HubSpot</Label><Input defaultValue="KI Kanzlei – Outbound" /></div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/* ─── Automatisierungen ─── */
function AutomationSection() {
  const workflows = [
    { name: "Neuer Lead → Slack #sales",       trigger: "Lead created",       runs: "vor 3 Min." },
    { name: "Antwort → Asana-Task erstellen",  trigger: "Reply received",     runs: "vor 14 Min." },
    { name: "Konvertiert → Stripe Invoice",     trigger: "Status: converted",  runs: "vor 2 Std." },
  ];
  return (
    <>
      <PageHead title="Automatisierungen" sub="Verbinde KI Kanzlei mit Zapier, Make oder n8n für unbegrenzte Workflows." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-4">
        {AUTOMATION_PROVIDERS.map((p) => (
          <Card key={p.id} className="shadow-xs">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-lg text-white font-semibold text-xs" style={{ background: p.color }}>
                  {p.name[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-none">{p.name}</p>
                  <p className="mt-1 text-[11px]">
                    {p.connected ? <span className="text-emerald-600 font-medium">✓ {p.workflows} Workflows</span> : <span className="text-muted-foreground">Nicht verbunden</span>}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3 line-clamp-2">{p.desc}</p>
              <Button variant={p.connected ? "outline" : "default"} size="sm" className="w-full">
                {p.connected ? "Workflows verwalten" : "Verbinden"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>Aktive Workflows</CardTitle>
          <CardDescription>Zapier-Workflows die KI Kanzlei verwenden.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {workflows.map((w) => (
            <div key={w.name} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{w.name}</p>
                <p className="text-xs text-muted-foreground">Trigger: {w.trigger} · Letzte Ausführung: {w.runs}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <StatusDot tone="success" /> Aktiv
              </span>
              <Button variant="ghost" size="icon" className="size-7"><MoreHorizontal className="size-4" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

/* ─── API & Webhooks ─── */
function ApiSection() {
  const [showProd, setShowProd] = useState(false);
  const webhooks = [
    { url: "https://api.kanzlei.at/webhooks/leads",                   events: ["lead.created", "lead.updated"], status: "active"  as const, last: "vor 47 Sek." },
    { url: "https://api.kanzlei.at/webhooks/replies",                 events: ["reply.received"],                status: "active"  as const, last: "vor 4 Min." },
    { url: "https://hooks.zapier.com/hooks/catch/12345/abcdef",       events: ["campaign.completed"],            status: "failing" as const, last: "vor 3 Std., 4 Fehler" },
  ];
  const limits = [
    { lbl: "Anfragen / Min.", val: "60",      sub: "Standard-Plan" },
    { lbl: "Diesen Monat",    val: "12 400",  sub: "von 100 000" },
    { lbl: "Erfolgsrate",     val: "99,8 %",  sub: "24 Fehler / 12 400" },
  ];

  return (
    <>
      <PageHead title="API & Webhooks" sub="Direkter Zugriff auf KI Kanzlei via REST API und Echtzeit-Webhooks." />

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>API-Schlüssel</CardTitle>
          <CardDescription>Authentifiziere API-Aufrufe mit deinem persönlichen Schlüssel.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <Label>Production Key</Label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                type={showProd ? "text" : "password"}
                readOnly
                value="kkz_live_8f3a2b1c9e7d4f6a5b8c2e1d9f7a3b6c"
                className="font-mono text-xs pl-9 pr-16"
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex">
                <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => setShowProd(v => !v)}>
                  {showProd ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-7"><Copy className="size-3.5" /></Button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Erstellt vor 4 Monaten · Letzter Aufruf vor 2 Min. · 12 400 Anfragen diesen Monat</p>
          </div>
          <div className="grid gap-2">
            <Label>Sandbox Key (Test)</Label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                type="password"
                readOnly
                value="kkz_test_2a4f8e1d3b6c9a7e5d2f1b8c4a7e9d3f"
                className="font-mono text-xs pl-9 pr-9"
              />
              <Button type="button" variant="ghost" size="icon" className="size-7 absolute right-1 top-1/2 -translate-y-1/2">
                <Copy className="size-3.5" />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5"><Plus className="size-3.5" /> Neuer Key</Button>
            <Button variant="outline" size="sm" className="gap-1.5"><FileText className="size-3.5" /> API-Dokumentation</Button>
            <span className="flex-1" />
            <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive">Key rotieren</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>Webhooks</CardTitle>
          <CardDescription>Erhalte Echtzeit-Events an deinen Endpoint.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {webhooks.map((w, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Webhook className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-mono truncate">{w.url}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{w.events.join(", ")} · {w.last}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px]">
                <StatusDot tone={w.status === "active" ? "success" : "destructive"} />
                {w.status === "active" ? "Aktiv" : "Fehler"}
              </span>
              <Button variant="ghost" size="icon" className="size-7"><MoreHorizontal className="size-4" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="self-start gap-1.5 mt-1"><Plus className="size-3.5" /> Webhook hinzufügen</Button>
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>Rate-Limits</CardTitle>
          <CardDescription>API-Nutzung im aktuellen Plan.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {limits.map((s) => (
            <div key={s.lbl} className="rounded-lg border p-3">
              <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">{s.lbl}</p>
              <p className="mt-1.5 text-xl font-semibold tracking-tight">{s.val}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{s.sub}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

/* ─── Lead-Anreicherung ─── */
function EnrichmentSection() {
  const [src, setSrc] = useState({ fb: true, web: true, li: true, maps: false, verify: true });
  const factors = [
    { label: "Verifizierte E-Mail vorhanden",      weight: 25 },
    { label: "Geschäftsführer:in bekannt",          weight: 20 },
    { label: "Telefonnummer verifiziert",           weight: 15 },
    { label: "Website aktuell (< 6 Monate)",        weight: 12 },
    { label: "LinkedIn-Aktivität (30 Tage)",        weight: 10 },
    { label: "Branchen-Match",                       weight: 10 },
    { label: "Mitarbeiter-Anzahl im Zielbereich",   weight: 8 },
  ];
  return (
    <>
      <PageHead title="Lead-Anreicherung" sub="Welche Quellen die KI für die Lead-Daten heranzieht." />

      <Card className="mb-4 shadow-xs">
        <CardHeader><CardTitle>Datenquellen</CardTitle></CardHeader>
        <CardContent className="py-2">
          <RowToggle title="Firmenbuch & Handelsregister" desc="Gründungsjahr, Rechtsform, Beteiligungen, Geschäftsführer:in." checked={src.fb} onCheckedChange={(v) => setSrc(s => ({ ...s, fb: v }))} />
          <RowToggle title="Website-Crawl" desc="Spezialgebiete, Team, News, Branche aus der eigenen Website." checked={src.web} onCheckedChange={(v) => setSrc(s => ({ ...s, web: v }))} />
          <RowToggle title="LinkedIn (öffentliche Daten)" desc="Beruflicher Werdegang, Position, Beiträge." checked={src.li} onCheckedChange={(v) => setSrc(s => ({ ...s, li: v }))} />
          <RowToggle title="Google Maps & Reviews" desc="Standort, Öffnungszeiten, Rezensionen." checked={src.maps} onCheckedChange={(v) => setSrc(s => ({ ...s, maps: v }))} />
          <RowToggle title="E-Mail-Verifizierung" desc="Prüft Zustellbarkeit jeder gefundenen E-Mail-Adresse." checked={src.verify} onCheckedChange={(v) => setSrc(s => ({ ...s, verify: v }))} />
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>Lead-Score-Faktoren</CardTitle>
          <CardDescription>Welche Datenpunkte fließen mit welcher Gewichtung in den Score?</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {factors.map((f) => (
            <div key={f.label} className="grid grid-cols-[1fr_120px_44px] items-center gap-3">
              <span className="text-sm">{f.label}</span>
              <Progress value={f.weight * 4} className="h-1.5" />
              <span className="text-sm font-semibold text-right tabular-nums">{f.weight}%</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

/* ─── Lead-Scoring ─── */
function ScoringSection() {
  const rules = [
    { what: "E-Mail geöffnet",                 pts: "+3",  neg: false },
    { what: "E-Mail mehrfach geöffnet (≥ 3×)", pts: "+5",  neg: false },
    { what: "Link in Mail geklickt",            pts: "+8",  neg: false },
    { what: "Auf Website mehr als 60 Sek.",     pts: "+10", neg: false },
    { what: "Antwort gesendet",                 pts: "+25", neg: false },
    { what: "Demo-Termin gebucht",              pts: "+40", neg: false },
    { what: "Bounce (Hard)",                    pts: "−30", neg: true },
    { what: "Spam-Beschwerde",                  pts: "−50", neg: true },
  ];
  const [auto, setAuto] = useState({ interest: true, optout: true, contacted: false });
  return (
    <>
      <PageHead title="Lead-Scoring" sub="Schwellwerte und automatische Status-Wechsel basierend auf Lead-Verhalten." />

      <Card className="mb-4 shadow-xs">
        <CardHeader><CardTitle>Score-Schwellwerte</CardTitle></CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2"><Label>Hot Lead ab Score</Label><Input defaultValue="80" /></div>
          <div className="grid gap-2"><Label>Cold Lead unter Score</Label><Input defaultValue="40" /></div>
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>Verhaltensbasierte Score-Änderungen</CardTitle>
          <CardDescription>Automatische Score-Anpassungen wenn Empfänger:innen agieren.</CardDescription>
        </CardHeader>
        <CardContent className="py-2">
          {rules.map((r, i) => (
            <div key={r.what} className={cn("flex items-center justify-between py-2.5", i > 0 && "border-t")}>
              <span className="text-sm">{r.what}</span>
              <span className={cn("text-sm font-semibold tabular-nums", r.neg ? "text-destructive" : "text-emerald-600")}>{r.pts}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader><CardTitle>Automatische Status-Wechsel</CardTitle></CardHeader>
        <CardContent className="py-2">
          <RowToggle title={`Lead → „Interessiert" bei Antwort`} desc="Sobald ein Lead antwortet, wird Status automatisch gesetzt." checked={auto.interest} onCheckedChange={(v) => setAuto(s => ({ ...s, interest: v }))} />
          <RowToggle title={`Lead → „Kein Interesse" bei Opt-Out`} desc="Klick auf Unsubscribe-Link setzt Status." checked={auto.optout} onCheckedChange={(v) => setAuto(s => ({ ...s, optout: v }))} />
          <RowToggle title={`Lead → „Kontaktiert" nach Erstmail`} desc="Direkt nach erstem Versand." checked={auto.contacted} onCheckedChange={(v) => setAuto(s => ({ ...s, contacted: v }))} />
        </CardContent>
      </Card>
    </>
  );
}

/* ─── Such-Defaults ─── */
function SearchSection() {
  const [req, setReq] = useState({ ceo: false, email: true, phone: false, web: false });
  return (
    <>
      <PageHead title="Such-Defaults" sub="Standard-Einstellungen für neue Lead-Suchen." />

      <Card className="mb-4 shadow-xs">
        <CardHeader><CardTitle>Standard-Filter</CardTitle></CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Standard-Land</Label>
              <Select defaultValue="AT">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AT">Österreich</SelectItem>
                  <SelectItem value="DE">Deutschland</SelectItem>
                  <SelectItem value="CH">Schweiz</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Standard-Status für neue Leads</Label>
              <Select defaultValue="new">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Neu</SelectItem>
                  <SelectItem value="interested">Interessiert</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Ergebnisse pro Seite</Label>
              <Select defaultValue="100">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Max. parallele Suchaufträge</Label><Input defaultValue="5" /></div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader><CardTitle>Pflicht-Felder bei neuen Leads</CardTitle></CardHeader>
        <CardContent className="py-2">
          <RowToggle title="Geschäftsführer:in erforderlich" desc="Nur Leads mit bekannter Geschäftsführung speichern." checked={req.ceo} onCheckedChange={(v) => setReq(s => ({ ...s, ceo: v }))} />
          <RowToggle title="E-Mail-Adresse erforderlich" desc="Leads ohne E-Mail werden verworfen." checked={req.email} onCheckedChange={(v) => setReq(s => ({ ...s, email: v }))} />
          <RowToggle title="Telefonnummer erforderlich" checked={req.phone} onCheckedChange={(v) => setReq(s => ({ ...s, phone: v }))} />
          <RowToggle title="Website erforderlich" checked={req.web} onCheckedChange={(v) => setReq(s => ({ ...s, web: v }))} />
        </CardContent>
      </Card>
    </>
  );
}

/* ─── Abrechnung ─── */
function BillingSection() {
  const usage = [
    { lbl: "Lead-Credits",   used: 2410, max: 5000,  unit: "Leads" },
    { lbl: "E-Mail-Volumen", used: 1248, max: 5000,  unit: "Mails" },
    { lbl: "Team-Sitze",     used: 4,    max: 10,    unit: "Sitze" },
  ];
  const invoices = [
    { nr: "INV-2026-005", date: "12. Mai 2026",    amount: "€ 249,00" },
    { nr: "INV-2026-004", date: "12. April 2026",  amount: "€ 249,00" },
    { nr: "INV-2026-003", date: "12. März 2026",   amount: "€ 249,00" },
    { nr: "INV-2026-002", date: "12. Februar 2026", amount: "€ 249,00" },
  ];
  return (
    <>
      <PageHead title="Abrechnung" sub="Aktueller Plan, Verbrauch und Zahlungsmethoden." />

      <Card className="mb-4 shadow-xs border-primary/20 bg-gradient-to-br from-primary/5 to-card">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary mb-1.5">Aktueller Plan</p>
              <p className="text-3xl font-semibold tracking-tight">Professional</p>
              <p className="text-sm text-muted-foreground mt-1">
                <b className="text-foreground font-semibold">€ 249</b> / Monat · jährlich abgerechnet · nächste Rechnung am 12. Juni 2026
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline">Plan ändern</Button>
              <Button>Auf Enterprise upgraden</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader><CardTitle>Verbrauch diesen Monat</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {usage.map((s) => (
            <div key={s.lbl} className="rounded-lg border p-4">
              <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground mb-2">{s.lbl}</p>
              <p className="text-2xl font-semibold tracking-tight">
                {s.used.toLocaleString("de-DE")} <span className="text-sm font-normal text-muted-foreground">/ {s.max.toLocaleString("de-DE")} {s.unit}</span>
              </p>
              <Progress value={(s.used / s.max) * 100} className="h-1.5 mt-3" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader><CardTitle>Zahlungsmethode</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <div className="flex h-7 w-11 items-center justify-center rounded text-[10px] font-bold text-white tracking-wider" style={{ background: "linear-gradient(135deg, #1a1f71 0%, #4d6ef5 100%)" }}>
              VISA
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">•••• •••• •••• 4242</p>
              <p className="text-xs text-muted-foreground">Maria Bauer · läuft ab 09/2028</p>
            </div>
            <Button variant="outline" size="sm">Ändern</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader><CardTitle>Rechnungs-Historie</CardTitle></CardHeader>
        <CardContent className="p-0">
          {invoices.map((inv, i) => (
            <div key={inv.nr} className={cn("grid grid-cols-[140px_1fr_110px_110px_40px] items-center gap-3 px-5 py-3", i > 0 && "border-t")}>
              <span className="text-xs font-mono">{inv.nr}</span>
              <span className="text-sm text-muted-foreground">{inv.date}</span>
              <span className="text-sm font-semibold">{inv.amount}</span>
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <Check className="size-3" /> Bezahlt
              </span>
              <Button variant="ghost" size="icon" className="size-7" title="PDF">
                <Upload className="size-3.5 rotate-180" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

/* ─── Sicherheit ─── */
function SecuritySection() {
  const sessions = [
    { device: "MacBook Pro · Safari",  loc: "Wien, AT",     ip: "193.154.x.x", when: "Aktuell",      isYou: true },
    { device: "iPhone 15 · Safari",    loc: "Wien, AT",     ip: "193.154.x.x", when: "vor 3 Std.",    isYou: false },
    { device: "Chrome · Windows",      loc: "Salzburg, AT", ip: "212.51.x.x",  when: "vor 2 Tagen",   isYou: false },
  ];
  const audit = [
    { who: "Maria Bauer",   what: "Hat Mitglied Sarah Brunner eingeladen",          when: "vor 3 Tagen" },
    { who: "Maria Bauer",   what: "Hat HubSpot-Integration verbunden",                when: "vor 1 Woche" },
    { who: "Thomas Wagner", what: "Hat Mailbox t.wagner@ki-kanzlei.at hinzugefügt", when: "vor 1 Woche" },
    { who: "Maria Bauer",   what: "Hat API-Key kkz_live_... rotiert",                 when: "vor 2 Wochen" },
  ];
  return (
    <>
      <PageHead title="Sicherheit" sub="Aktive Sessions, Audit-Log und Sicherheits-Features." />

      <Card className="mb-4 shadow-xs">
        <CardHeader><CardTitle>Aktive Sessions</CardTitle></CardHeader>
        <CardContent>
          {sessions.map((s, i) => (
            <div key={i} className={cn("flex items-center gap-3 py-3", i > 0 && "border-t")}>
              <div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Shield className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {s.device}
                  {s.isYou && <Badge variant="outline" className="rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border-emerald-200">Dieses Gerät</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{s.loc} · {s.ip} · {s.when}</p>
              </div>
              {!s.isYou && <Button variant="outline" size="sm">Abmelden</Button>}
            </div>
          ))}
          <Button variant="outline" className="mt-4 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive">
            Alle anderen Sessions beenden
          </Button>
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader><CardTitle>Single Sign-On (SSO)</CardTitle></CardHeader>
        <CardContent>
          <Callout title="SSO ist Teil des Enterprise-Plans">
            Verbinde KI Kanzlei mit Google Workspace SSO, Microsoft Entra ID oder Okta. Verwalte Zugriff zentral über deinen Identity Provider.
          </Callout>
          <Button className="mt-4" size="sm">Enterprise-Plan ansehen</Button>
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>Audit-Log</CardTitle>
          <CardDescription>Alle administrativen Aktionen der letzten 30 Tage.</CardDescription>
        </CardHeader>
        <CardContent>
          {audit.map((e, i) => (
            <div key={i} className={cn("grid grid-cols-[24px_1fr_auto] items-center gap-3 py-2.5", i > 0 && "border-t")}>
              <div className="flex size-6 items-center justify-center rounded-full text-white text-[9px] font-medium" style={{ background: avatarColor(e.who) }}>
                {initials(e.who)}
              </div>
              <div className="text-sm">
                <b className="font-semibold">{e.who}</b> {e.what}
              </div>
              <span className="text-xs text-muted-foreground">{e.when}</span>
            </div>
          ))}
          <a href="#" className="mt-3 inline-block text-xs font-medium text-primary">Komplettes Audit-Log anzeigen ↗</a>
        </CardContent>
      </Card>
    </>
  );
}

/* ─── Daten exportieren ─── */
function DataSection() {
  const [autoBackup, setAutoBackup] = useState(true);
  return (
    <>
      <PageHead title="Daten exportieren & löschen" sub="DSGVO-konformer Datenexport und Lösch-Anfragen." />

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>Workspace exportieren</CardTitle>
          <CardDescription>Alle Daten (Leads, Kampagnen, Statistiken) als ZIP-Datei.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5"><Upload className="size-3.5 rotate-180" /> CSV-Export anfordern</Button>
            <Button variant="outline" size="sm">JSON-Export</Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Exporte werden per E-Mail an dich gesendet, sobald sie bereit sind. Üblicherweise innerhalb von 5 Minuten.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>Backups</CardTitle>
          <CardDescription>Automatische Backups deines Workspaces.</CardDescription>
        </CardHeader>
        <CardContent className="py-2">
          <RowToggle title="Tägliches Auto-Backup" desc="Snapshot um 03:00 Uhr · Aufbewahrung 30 Tage." checked={autoBackup} onCheckedChange={setAutoBackup} />
          <p className="mt-4 text-xs text-muted-foreground">
            Letztes Backup: <b className="text-foreground">vor 14 Std.</b> · 4,2 MB · <a href="#" className="text-primary">Wiederherstellen</a>
          </p>
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-xs">
        <CardHeader>
          <CardTitle>Daten löschen</CardTitle>
          <CardDescription>Lösche einzelne Datentypen oder einen ganzen Zeitraum.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Datentyp</Label>
              <Select defaultValue="bounced">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bounced">Gebounce-te Leads</SelectItem>
                  <SelectItem value="unsubscribed">Abgemeldete Leads</SelectItem>
                  <SelectItem value="not_interested">{`„Kein Interesse" Leads`}</SelectItem>
                  <SelectItem value="campaigns_old">Kampagnen älter als 1 Jahr</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Älter als</Label>
              <Select defaultValue="6m">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1m">1 Monat</SelectItem>
                  <SelectItem value="3m">3 Monate</SelectItem>
                  <SelectItem value="6m">6 Monate</SelectItem>
                  <SelectItem value="1y">1 Jahr</SelectItem>
                  <SelectItem value="all">Komplett</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button variant="outline" className="self-start text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive gap-1.5">
            <Trash2 className="size-3.5" /> Daten löschen (unwiderruflich)
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   App
   ═══════════════════════════════════════════════════════════════════════ */

const SECTION_MAP: Record<SectionKey, React.ComponentType> = {
  general:       GeneralSection,
  profile:       ProfileSection,
  team:          TeamSection,
  notifications: NotificationsSection,
  mailbox:       MailboxSection,
  tracking:      TrackingSection,
  social:        SocialSection,
  crm:           CrmSection,
  automation:    AutomationSection,
  api:           ApiSection,
  enrichment:    EnrichmentSection,
  scoring:       ScoringSection,
  search:        SearchSection,
  billing:       BillingSection,
  security:      SecuritySection,
  data:          DataSection,
};

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const paramTab = searchParams.get("tab") ?? "";
  const initialTab: SectionKey = (SECTION_KEYS.includes(paramTab) ? paramTab : "general") as SectionKey;
  const [activeTab, setActiveTab] = useState<SectionKey>(initialTab);

  function handleTabChange(tab: SectionKey) {
    setActiveTab(tab);
    router.replace(tab === "general" ? "/dashboard/settings" : `/dashboard/settings?tab=${tab}`, { scroll: false });
  }

  const Comp = SECTION_MAP[activeTab] ?? GeneralSection;

  return (
    <div className="flex min-h-full flex-col lg:flex-row lg:items-stretch">
      <SettingsRail current={activeTab} onChange={handleTabChange} />
      <div className="flex-1 min-w-0 px-4 py-6 lg:px-10 lg:py-8">
        <main className="min-w-0 max-w-3xl">
          <Comp />
        </main>
      </div>
    </div>
  );
}
