"use client";

import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Phone, Mail, ChevronDown, ExternalLink, Sparkles, Loader2, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CompanyFavicon } from "./CompanyFavicon";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import type { Lead, LeadStatus } from "@/types/leads";
import { COUNTRY_OPTIONS, countryLabel } from "@/types/leads";
import { IndustryCombobox } from "@/components/leads/IndustryCombobox";

/* ── Konstanten ── */
const STATE_LABELS: Record<string, string> = {
  W: "Wien", N: "Niederösterreich", O: "Oberösterreich", S: "Salzburg",
  T: "Tirol", V: "Vorarlberg", St: "Steiermark", K: "Kärnten", B: "Burgenland",
};
const STATUS_BADGE_CLASS: Record<string, string> = {
  new: "status-new", interested: "status-interested", contacted: "status-contacted",
  converted: "status-converted", not_interested: "status-not_interested",
};
const STATUS_OPTIONS: { value: LeadStatus; label: string; dot: string }[] = [
  { value: "new",            label: "Neu",            dot: "bg-sky-500" },
  { value: "contacted",      label: "Kontaktiert",    dot: "bg-blue-500" },
  { value: "interested",     label: "Interessiert",   dot: "bg-primary" },
  { value: "not_interested", label: "Kein Interesse", dot: "bg-muted-foreground/50" },
  { value: "converted",      label: "Konvertiert",    dot: "bg-indigo-600" },
];
const GENDER_OPTIONS = [
  { value: "herr", label: "Herr" }, { value: "frau", label: "Frau" },
  { value: "divers", label: "Divers" }, { value: "unbekannt", label: "Unbekannt" },
];
const SOCIAL_FIELDS = [
  { name: "social_linkedin",  label: "LinkedIn",    placeholder: "https://linkedin.com/company/..." },
  { name: "social_facebook",  label: "Facebook",    placeholder: "https://facebook.com/..." },
  { name: "social_instagram", label: "Instagram",   placeholder: "https://instagram.com/..." },
  { name: "social_twitter",   label: "Twitter / X", placeholder: "https://x.com/..." },
  { name: "social_youtube",   label: "YouTube",     placeholder: "https://youtube.com/@..." },
  { name: "social_tiktok",    label: "TikTok",      placeholder: "https://tiktok.com/@..." },
] as const;

const editSchema = z.object({
  company:        z.string().min(1, "Firma ist erforderlich"),
  legal_form:     z.string().optional(),
  industry:       z.string().optional(),
  status:         z.string(),
  notes:          z.string().optional(),
  employee_count: z.string().optional(),
  revenue:        z.string().optional(),
  ceo_gender:     z.string().optional(),
  ceo_title:      z.string().optional(),
  ceo_first_name: z.string().optional(),
  ceo_last_name:  z.string().optional(),
  ceo_name:       z.string().optional(),
  phone:          z.string().optional(),
  email:          z.string().email("Ungültige E-Mail").optional().or(z.literal("")),
  website:        z.string().optional(),
  street:         z.string().optional(),
  postal_code:    z.string().optional(),
  city:           z.string().optional(),
  country:        z.string().optional(),
  social_linkedin:  z.string().optional(),
  social_facebook:  z.string().optional(),
  social_instagram: z.string().optional(),
  social_twitter:   z.string().optional(),
  social_youtube:   z.string().optional(),
  social_tiktok:    z.string().optional(),
  contacts:         z.array(z.object({
    gender: z.string().optional(), title: z.string().optional(),
    first_name: z.string().optional(), last_name: z.string().optional(),
    role: z.string().optional(), email: z.string().optional(), phone: z.string().optional(),
  })).optional(),
});
type EditFormValues = z.infer<typeof editSchema>;

const EMPTY: EditFormValues = {
  company: "", legal_form: "", industry: "", status: "new", notes: "",
  employee_count: "", revenue: "",
  ceo_gender: "", ceo_title: "", ceo_first_name: "", ceo_last_name: "", ceo_name: "",
  phone: "", email: "", website: "", street: "", postal_code: "", city: "", country: "",
  social_linkedin: "", social_facebook: "", social_instagram: "",
  social_twitter: "", social_youtube: "", social_tiktok: "",
  contacts: [],
};

/* ── Kleine UI-Bausteine (icon-frei, dashboard-Stil) ── */
function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-medium text-muted-foreground">{children}</div>;
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[13.5px] font-medium text-foreground break-words">{value}</div>
    </div>
  );
}

/** Vollen Namen in Vor-/Nachname zerlegen (Titel wie „Mag." werden entfernt). */
function splitName(full: string, title?: string | null): { first: string; last: string } {
  const t = (title ?? "").toLowerCase().replace(/\./g, "").trim();
  const parts = full.trim().split(/\s+/).filter(Boolean)
    .filter((p) => p.toLowerCase().replace(/\./g, "") !== t)
    .filter((p) => !/^(mag|dr|ing|di|dipl|mba|prof|bsc|msc|llm)\.?$/i.test(p));
  return { first: parts[0] ?? "", last: parts.length > 1 ? parts.slice(1).join(" ") : "" };
}

function relativeTime(iso?: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  if (d === 1) return "gestern";
  if (d < 14) return `vor ${d} Tagen`;
  if (d < 56) return `vor ${Math.round(d / 7)} Wochen`;
  return new Date(iso).toLocaleDateString("de-AT", { day: "2-digit", month: "short", year: "numeric" });
}
function formatExact(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("de-AT", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface LeadEditSheetProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  mode?: "edit" | "create";
}

export function LeadEditSheet({ lead, open, onOpenChange, onSaved, mode = "edit" }: LeadEditSheetProps) {
  const isCreate = mode === "create" && !lead;
  const form = useForm<EditFormValues>({ resolver: zodResolver(editSchema), defaultValues: EMPTY });
  const { fields: contactFields, append: appendContact, remove: removeContact } = useFieldArray({ control: form.control, name: "contacts" });

  useEffect(() => {
    if (isCreate && open) {
      form.reset(EMPTY);
    } else if (lead && open) {
      form.reset({
        ...EMPTY,
        company:          lead.company ?? "",
        legal_form:       lead.legal_form ?? "",
        industry:         lead.industry ?? "",
        status:           lead.status,
        notes:            lead.notes ?? "",
        employee_count:   lead.employee_count != null ? String(lead.employee_count) : "",
        revenue:          lead.revenue ?? "",
        ceo_gender:       lead.ceo_gender ?? "",
        ceo_title:        lead.ceo_title ?? "",
        ceo_first_name:   lead.ceo_first_name || splitName(lead.ceo_name ?? "", lead.ceo_title).first,
        ceo_last_name:    lead.ceo_last_name || splitName(lead.ceo_name ?? "", lead.ceo_title).last,
        ceo_name:         lead.ceo_name ?? "",
        phone:            lead.phone ?? "",
        email:            lead.email ?? "",
        website:          lead.website ?? "",
        street:           lead.street ?? lead.address ?? "",
        postal_code:      lead.postal_code ?? "",
        city:             lead.city ?? "",
        country:          lead.country ?? "",
        social_linkedin:  lead.social_linkedin ?? "",
        social_facebook:  lead.social_facebook ?? "",
        social_instagram: lead.social_instagram ?? "",
        social_twitter:   lead.social_twitter ?? "",
        social_youtube:   lead.social_youtube ?? "",
        social_tiktok:    lead.social_tiktok ?? "",
        contacts:         Array.isArray((lead.raw_data as { contacts?: unknown })?.contacts)
          ? ((lead.raw_data as { contacts: Record<string, string>[] }).contacts).map((c) => ({
              gender: c.gender ?? "", title: c.title ?? "", first_name: c.first_name ?? "",
              last_name: c.last_name ?? "", role: c.role ?? "", email: c.email ?? "", phone: c.phone ?? "",
            }))
          : [],
      });
    }
  }, [lead, open, form, isCreate]);

  const ceoTitle = form.watch("ceo_title");
  const ceoFirst = form.watch("ceo_first_name");
  const ceoLast  = form.watch("ceo_last_name");
  useEffect(() => {
    const parts = [ceoTitle, ceoFirst, ceoLast].filter(Boolean);
    if (parts.length >= 2) form.setValue("ceo_name", parts.join(" "), { shouldDirty: false });
  }, [ceoTitle, ceoFirst, ceoLast, form]);

  const watchedWebsite = form.watch("website");
  const [aiFilling, setAiFilling] = useState(false);

  async function handleAiFill() {
    const url = (form.getValues("website") ?? "").trim();
    if (!url) { toast.error("Bitte erst eine Website eingeben"); return; }
    setAiFilling(true);
    try {
      const res = await fetch("/api/leads/enrich-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, company: form.getValues("company") || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(json.error ?? "AI-Auto-Fill fehlgeschlagen"); return; }
      const data = json.data as Record<string, string | null | undefined>;
      const FILLABLE = [
        "company", "industry", "legal_form", "email", "phone",
        "street", "postal_code", "city", "country",
        "ceo_gender", "ceo_title", "ceo_first_name", "ceo_last_name", "ceo_name",
        "employee_count", "revenue", "notes",
        "social_linkedin", "social_facebook", "social_instagram",
        "social_twitter", "social_youtube", "social_tiktok",
      ] as const;
      let filledCount = 0;
      for (const key of FILLABLE) {
        const next = data[key];
        if (!next) continue;
        const current = (form.getValues(key as keyof EditFormValues) ?? "").toString().trim();
        if (current.length > 0) continue; // nur ergänzen, nie überschreiben
        form.setValue(key as keyof EditFormValues, String(next), { shouldDirty: true });
        filledCount++;
      }
      const credits = json.meta?.credits_charged ?? 0;
      const suffix = credits ? ` · ${credits} Credits` : "";
      toast[filledCount === 0 ? "info" : "success"](
        filledCount === 0 ? `Keine neuen Felder gefunden${suffix}` : `${filledCount} Felder ergänzt${suffix}`,
      );
    } catch {
      toast.error("AI-Auto-Fill fehlgeschlagen");
    } finally {
      setAiFilling(false);
    }
  }

  async function onSubmit(values: EditFormValues) {
    const empNum = values.employee_count && !Number.isNaN(Number(values.employee_count))
      ? Math.max(0, Math.round(Number(values.employee_count))) : null;
    const payload = {
      company: values.company,
      legal_form: values.legal_form || null,
      industry: values.industry || null,
      status: values.status as LeadStatus,
      notes: values.notes || null,
      employee_count: empNum,
      revenue: values.revenue || null,
      ceo_gender: values.ceo_gender || null,
      ceo_title: values.ceo_title || null,
      ceo_first_name: values.ceo_first_name || null,
      ceo_last_name: values.ceo_last_name || null,
      ceo_name: values.ceo_name || null,
      phone: values.phone || null,
      email: values.email || null,
      website: values.website || null,
      street: values.street || null,
      postal_code: values.postal_code || null,
      city: values.city || null,
      country: values.country || null,
      social_linkedin: values.social_linkedin || null,
      social_facebook: values.social_facebook || null,
      social_instagram: values.social_instagram || null,
      social_twitter: values.social_twitter || null,
      social_youtube: values.social_youtube || null,
      social_tiktok: values.social_tiktok || null,
      raw_data: {
        ...(lead?.raw_data ?? {}),
        contacts: (values.contacts ?? [])
          .filter((c) => (c.first_name ?? "").trim() || (c.last_name ?? "").trim() || (c.role ?? "").trim())
          .map((c) => ({
            gender: (c.gender ?? "").trim(), title: (c.title ?? "").trim(),
            first_name: (c.first_name ?? "").trim(), last_name: (c.last_name ?? "").trim(),
            role: (c.role ?? "").trim(), email: (c.email ?? "").trim(), phone: (c.phone ?? "").trim(),
          })),
      },
    };
    try {
      const res = isCreate
        ? await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : (lead ? await fetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }) : null);
      if (!res) return;
      if (!res.ok) throw new Error();
      toast.success(isCreate ? "Lead erstellt" : "Lead aktualisiert");
      onOpenChange(false);
      onSaved();
    } catch {
      toast.error(isCreate ? "Fehler beim Erstellen" : "Fehler beim Speichern");
    }
  }

  async function handleStatusChange(newStatus: LeadStatus) {
    if (!lead) return;
    form.setValue("status", newStatus);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Status auf „${STATUS_OPTIONS.find((s) => s.value === newStatus)?.label}" geändert`);
      onSaved();
    } catch {
      toast.error("Status konnte nicht geändert werden");
    }
  }

  /* Header-Preview folgt dem Form-State */
  const currentStatus   = STATUS_OPTIONS.find((s) => s.value === form.watch("status"));
  const watchedCompany  = form.watch("company");
  const watchedIndustry = form.watch("industry");
  const watchedCity     = form.watch("city");
  const watchedCountry  = form.watch("country");
  const displayCompany  = (watchedCompany ?? "").trim() || (isCreate ? "Neuer Lead" : (lead?.company ?? "Lead bearbeiten"));
  const displayWebsite  = (watchedWebsite ?? "").trim() || lead?.website || "";
  const cleanWeb        = displayWebsite ? displayWebsite.replace(/^https?:\/\//, "").replace(/\/$/, "") : null;
  const displayIndustry = (watchedIndustry ?? "").trim() || lead?.industry || null;
  const displayCity     = (watchedCity ?? "").trim() || lead?.city || null;
  const displayCountry  = (watchedCountry ?? "").trim() || lead?.country || null;
  const stateLabel      = lead?.state ? (STATE_LABELS[lead.state] ?? lead.state) : null;

  /* KI-Recherche (read-only Anreicherung aus dem AI Researcher) */
  const ai = (lead?.raw_data?.ai_research ?? null) as {
    session_id?: string | null; score?: number | null; summary?: string | null;
    employees?: string | null; revenue?: string | null; founded_year?: string | null;
    pain_points?: string | null; our_solution?: string | null;
    sources?: { title: string; url?: string }[]; updated_at?: string;
  } | null;
  const researcherHref = ai?.session_id
    ? `/dashboard/ai-researcher?session=${ai.session_id}`
    : "/dashboard/ai-researcher";

  const employees = lead?.employee_count != null ? `${lead.employee_count}` : (ai?.employees || null);
  const revenue   = lead?.revenue || ai?.revenue || null;
  const locationText = [displayCity, stateLabel || (displayCountry ? countryLabel(displayCountry) : null)].filter(Boolean).join(", ") || null;
  const hasAnyOverview = !!(displayIndustry || lead?.legal_form || employees || revenue || lead?.email || lead?.phone || lead?.ceo_name || ai?.score != null || ai?.summary);

  /* Aktivitätsverlauf aus den vorhandenen Zeitstempeln (Ansatz wie LinkedIn) */
  const activity = (() => {
    const out: { iso: string; what: string }[] = [];
    if (ai?.updated_at) out.push({ iso: ai.updated_at, what: "KI-Recherche durchgeführt" });
    if (lead?.updated_at && lead.updated_at !== lead.created_at) out.push({ iso: lead.updated_at, what: "Zuletzt aktualisiert" });
    if (lead?.created_at) out.push({ iso: lead.created_at, what: lead.search_query ? `Aus Suche „${lead.search_query}" hinzugefügt` : "Lead erstellt" });
    return out
      .filter((v, i, a) => a.findIndex((x) => x.iso === v.iso && x.what === v.what) === i)
      .sort((a, b) => new Date(b.iso).getTime() - new Date(a.iso).getTime());
  })();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="leads-v3 w-full sm:max-w-[600px] lg:max-w-[660px] flex flex-col p-0 gap-0 bg-white">

        {/* ── Header ── */}
        <SheetHeader className="px-5 pt-4 pb-4 border-b border-border shrink-0">
          <div className="flex items-start gap-3.5">
            <CompanyFavicon website={watchedWebsite || lead?.website || null} size={10} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2 min-w-0 pr-7">
                <SheetTitle className="text-[17px] font-medium tracking-tight truncate leading-tight">
                  {displayCompany}
                </SheetTitle>
                {currentStatus && (
                  <span className={cn("badge-status shrink-0", STATUS_BADGE_CLASS[currentStatus.value])}>
                    <span className="dot" />{currentStatus.label}
                  </span>
                )}
              </div>
              <SheetDescription asChild>
                <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[12.5px] text-muted-foreground">
                  {displayIndustry && <span>{displayIndustry}</span>}
                  {cleanWeb && (
                    <a
                      href={displayWebsite.startsWith("http") ? displayWebsite : `https://${cleanWeb}`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 hover:text-primary"
                    >
                      {cleanWeb}<ExternalLink className="h-2.5 w-2.5 ml-0.5" strokeWidth={1.75} />
                    </a>
                  )}
                  {locationText && <span>{locationText}</span>}
                </div>
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* ── Quick-Actions ── */}
        <div className="px-5 py-2.5 border-b border-border flex items-center gap-2 flex-wrap bg-white">
          {lead?.email && (
            <Button asChild size="sm" className="h-8 gap-1.5 text-xs font-medium">
              <a href={`mailto:${lead.email}`}><Mail className="h-3.5 w-3.5" strokeWidth={1.75} />E-Mail senden</a>
            </Button>
          )}
          {lead?.phone && (
            <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium">
              <a href={`tel:${lead.phone}`}><Phone className="h-3.5 w-3.5" strokeWidth={1.75} />Anrufen</a>
            </Button>
          )}
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium">
                  Status ändern<ChevronDown className="h-3 w-3 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 bg-white">
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Status setzen auf…</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {STATUS_OPTIONS.map((opt) => (
                  <DropdownMenuItem key={opt.value} className="text-xs gap-2 cursor-pointer"
                    disabled={opt.value === currentStatus?.value} onClick={() => handleStatusChange(opt.value)}>
                    <span className={`h-2 w-2 rounded-full shrink-0 ${opt.dot}`} />{opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ── Form + Tabs ── */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            <Tabs defaultValue={isCreate ? "data" : "overview"} className="flex flex-col flex-1 min-h-0">
              <div className="px-5 pt-2 shrink-0 border-b">
                <TabsList variant="line" className="h-10 w-full grid grid-cols-3 mb-0">
                  <TabsTrigger value="overview" className="text-xs">Übersicht</TabsTrigger>
                  <TabsTrigger value="data" className="text-xs">Bearbeiten</TabsTrigger>
                  <TabsTrigger value="activity" className="text-xs">Aktivität</TabsTrigger>
                </TabsList>
              </div>

              <ScrollArea className="flex-1 min-h-0">

                {/* ════ ÜBERSICHT ════ */}
                <TabsContent value="overview" className="mt-0 px-5 py-6 data-[state=inactive]:hidden">
                  {hasAnyOverview ? (
                    <div className="space-y-7">
                      {/* Ansprechpartner & Kontakt — wichtigste Info zuerst */}
                      {(lead?.ceo_name || lead?.email || lead?.phone) && (
                        <div>
                          <Label>Ansprechpartner</Label>
                          {lead?.ceo_name
                            ? <p className="mt-1.5 text-[15px] font-medium text-foreground">{lead.ceo_name}</p>
                            : <p className="mt-1.5 text-[13px] text-muted-foreground">Kein Name hinterlegt</p>}
                          {(lead?.email || lead?.phone) && (
                            <div className="mt-2 space-y-1 text-[13px]">
                              {lead?.email && <a href={`mailto:${lead.email}`} className="block truncate text-primary hover:underline">{lead.email}</a>}
                              {lead?.phone && <p className="text-muted-foreground">{lead.phone}</p>}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Firmen-Eckdaten */}
                      <div className="grid grid-cols-2 gap-x-5 gap-y-5">
                        <Fact label="Branche" value={displayIndustry} />
                        <Fact label="Rechtsform" value={lead?.legal_form} />
                        <Fact label="Mitarbeiter" value={employees} />
                        <Fact label="Umsatz" value={revenue} />
                        <Fact label="Gegründet" value={ai?.founded_year} />
                        <Fact label="Standort" value={locationText} />
                        <Fact label="Fit-Score" value={ai?.score != null ? <>{ai.score}<span className="font-normal text-muted-foreground"> / 100</span></> : null} />
                      </div>

                      {/* Wie wir helfen können — auf Basis des Angebots im Profil (auch im Outreach genutzt) */}
                      {(ai?.our_solution || ai?.pain_points) && (
                        <div>
                          <Label>Wie wir helfen können</Label>
                          {ai?.our_solution && <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground">{ai.our_solution}</p>}
                          {ai?.pain_points && (
                            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                              <span className="font-medium text-foreground">Ansatzpunkt: </span>{ai.pain_points}
                            </p>
                          )}
                        </div>
                      )}

                      {/* KI-Zusammenfassung */}
                      {ai?.summary && (
                        <div>
                          <Label>Zusammenfassung</Label>
                          <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground">{ai.summary}</p>
                        </div>
                      )}

                      {ai?.session_id ? (
                        <a href={researcherHref} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                          Im AI Researcher öffnen<ExternalLink className="h-3 w-3" />
                        </a>
                      ) : lead?.id && (
                        <a href={`/dashboard/ai-researcher?leadId=${lead.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                          Diesen Lead im AI Researcher genauer recherchieren<ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="py-12 text-center">
                      <p className="text-sm text-foreground">Noch keine Daten zu diesem Lead</p>
                      <p className="mt-1 text-xs text-muted-foreground">Ergänze Felder unter „Bearbeiten“ oder recherchiere den Lead im AI Researcher.</p>
                      <Button asChild variant="outline" size="sm" className="mt-4">
                        <a href={lead?.id ? `/dashboard/ai-researcher?leadId=${lead.id}` : "/dashboard/ai-researcher"}>Im AI Researcher recherchieren</a>
                      </Button>
                    </div>
                  )}
                </TabsContent>

                {/* ════ BEARBEITEN ════ */}
                <TabsContent value="data" className="mt-0 px-5 py-5 space-y-6 data-[state=inactive]:hidden">

                  <section className="space-y-3">
                    <FormField control={form.control} name="company" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Firmenname *</FormLabel>
                        <FormControl><Input className="h-9" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="legal_form" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Rechtsform</FormLabel>
                        <FormControl><Input className="h-9" placeholder="GmbH, e.U., AG…" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="industry" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Branche</FormLabel>
                        <FormControl>
                          <IndustryCombobox className="bg-white" value={field.value ? [field.value] : []} onChange={(val) => field.onChange(val[0] ?? "")} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={form.control} name="employee_count" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">Mitarbeiter</FormLabel>
                          <FormControl><Input type="number" min={0} className="h-9" placeholder="z. B. 25" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="revenue" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">Umsatz</FormLabel>
                          <FormControl><Input className="h-9" placeholder="z. B. 1-5 Mio €" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </section>

                  <section className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={form.control} name="email" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">E-Mail</FormLabel>
                          <FormControl><Input type="email" className="h-9" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="phone" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">Telefon</FormLabel>
                          <FormControl><Input className="h-9" placeholder="+43 …" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="website" render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between gap-2">
                          <FormLabel className="text-xs text-muted-foreground">Website</FormLabel>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button type="button" variant="ghost" size="sm"
                                className="h-6 px-2 text-[11px] gap-1 text-primary hover:text-primary hover:bg-primary/5 -my-1"
                                onClick={handleAiFill} disabled={aiFilling || !((field.value ?? "").trim())}>
                                {aiFilling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" strokeWidth={1.75} />}
                                {aiFilling ? "Sucht…" : "Mit AI ausfüllen"}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-[260px]">
                              Durchsucht die Website samt Google-Recherche und ergänzt nur leere Felder (Branche, Geschäftsführung, Mitarbeiter, Umsatz u.&nbsp;a.). Kostet 2&nbsp;Credits pro Durchlauf.
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <FormControl><Input className="h-9" placeholder="https://" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </section>

                  <section className="space-y-3">
                    <FormField control={form.control} name="ceo_name" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Geschäftsführer:in</FormLabel>
                        <FormControl><Input className="h-9" placeholder="Vor- und Nachname" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={form.control} name="ceo_gender" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">Anrede</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl><SelectTrigger className="h-9"><SelectValue placeholder="–" /></SelectTrigger></FormControl>
                            <SelectContent className="bg-white">{GENDER_OPTIONS.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}</SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="ceo_title" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">Titel</FormLabel>
                          <FormControl><Input className="h-9" placeholder="Mag., Dr., DI…" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={form.control} name="ceo_first_name" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">Vorname</FormLabel>
                          <FormControl><Input className="h-9" placeholder="Vorname" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="ceo_last_name" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">Nachname</FormLabel>
                          <FormControl><Input className="h-9" placeholder="Nachname" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    {/* Weitere Ansprechpartner — manuell oder aus dem AI Researcher */}
                    <div className="pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Weitere Ansprechpartner</span>
                        <Button type="button" variant="ghost" size="sm"
                          className="h-6 px-2 text-[11px] gap-1 text-primary hover:text-primary hover:bg-primary/5 -my-1"
                          onClick={() => appendContact({ gender: "", title: "", first_name: "", last_name: "", role: "", email: "", phone: "" })}>
                          <Plus className="h-3 w-3" />Hinzufügen
                        </Button>
                      </div>
                      {contactFields.length > 0 && (
                        <div className="mt-2 space-y-3">
                          {contactFields.map((f, i) => (
                            <div key={f.id} className="rounded-lg border p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Ansprechpartner {i + 1}</span>
                                <Button type="button" variant="ghost" size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeContact(i)}><X className="h-3.5 w-3.5" /></Button>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <FormField control={form.control} name={`contacts.${i}.gender`} render={({ field }) => (
                                  <FormItem>
                                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                                      <FormControl><SelectTrigger className="h-9"><SelectValue placeholder="Anrede" /></SelectTrigger></FormControl>
                                      <SelectContent className="bg-white">{GENDER_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent>
                                    </Select>
                                  </FormItem>
                                )} />
                                <FormField control={form.control} name={`contacts.${i}.title`} render={({ field }) => (
                                  <FormItem><FormControl><Input className="h-9" placeholder="Titel" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                                )} />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <FormField control={form.control} name={`contacts.${i}.first_name`} render={({ field }) => (
                                  <FormItem><FormControl><Input className="h-9" placeholder="Vorname" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                                )} />
                                <FormField control={form.control} name={`contacts.${i}.last_name`} render={({ field }) => (
                                  <FormItem><FormControl><Input className="h-9" placeholder="Nachname" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                                )} />
                              </div>
                              <FormField control={form.control} name={`contacts.${i}.role`} render={({ field }) => (
                                <FormItem><FormControl><Input className="h-9" placeholder="Funktion (z. B. Einkauf)" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                              )} />
                              <div className="grid grid-cols-2 gap-2">
                                <FormField control={form.control} name={`contacts.${i}.email`} render={({ field }) => (
                                  <FormItem><FormControl><Input className="h-9" placeholder="E-Mail" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                                )} />
                                <FormField control={form.control} name={`contacts.${i}.phone`} render={({ field }) => (
                                  <FormItem><FormControl><Input className="h-9" placeholder="Telefon" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                                )} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <FormField control={form.control} name="street" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Straße &amp; Hausnummer</FormLabel>
                        <FormControl><Input className="h-9" placeholder="Musterstraße 1" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-3 gap-3">
                      <FormField control={form.control} name="postal_code" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">PLZ</FormLabel>
                          <FormControl><Input className="h-9" placeholder="1010" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="city" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">Ort</FormLabel>
                          <FormControl><Input className="h-9" placeholder="Wien" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="country" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">Land</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl><SelectTrigger className="h-9"><SelectValue placeholder="Land" /></SelectTrigger></FormControl>
                            <SelectContent className="bg-white">{COUNTRY_OPTIONS.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}</SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </section>

                  <section className="space-y-3">
                    {SOCIAL_FIELDS.map(({ name, label, placeholder }) => (
                      <FormField key={name} control={form.control} name={name} render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">{label}</FormLabel>
                          <FormControl><Input className="h-9" placeholder={placeholder} {...field} value={field.value ?? ""} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    ))}
                  </section>

                  <section className="space-y-3">
                    <FormField control={form.control} name="notes" render={({ field }) => (
                      <FormItem>
                        <FormControl><Textarea placeholder="Eigene Notizen zu diesem Lead…" className="min-h-24 text-sm resize-y" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </section>

                </TabsContent>

                {/* ════ AKTIVITÄT ════ */}
                <TabsContent value="activity" className="mt-0 px-5 py-5 data-[state=inactive]:hidden">
                  <div className="mb-1 text-[13px] font-medium text-foreground">Aktivitätsverlauf</div>
                  <div className="timeline">
                    {activity.map((it, i) => (
                      <div key={i} className={cn("timeline-item", i > 0 && "is-muted")}>
                        <div className="timeline-when" title={formatExact(it.iso)}>{relativeTime(it.iso)}</div>
                        <div className="timeline-what">{it.what}</div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

              </ScrollArea>
            </Tabs>

            {/* ── Footer ── */}
            <SheetFooter className="px-5 py-4 border-t bg-white flex-row gap-2 shrink-0">
              <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Abbrechen</Button>
              <Button type="submit" className="flex-1" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Spinner className="h-4 w-4 mr-2" />}
                {isCreate ? "Erstellen" : "Speichern"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
