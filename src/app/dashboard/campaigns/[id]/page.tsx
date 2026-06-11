"use client";

import { Fragment, useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  CornerUpLeft,
  Flame,
  Loader2,
  Mail,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FilterTriggerPopover } from "@/components/shared/FilterTriggerPopover";
import { EmptyCards } from "@/components/shared/EmptyCards";
import { cn } from "@/lib/utils";

import type {
  Campaign,
  CampaignLead,
  CampaignLeadStatus,
  CampaignStatus,
} from "@/types/campaigns";
import { MAX_SEQUENCE_STEPS } from "@/types/campaigns";

/* ── Kampagnen-Status (badge-status, Brand-Palette) ── */
const STATUS_CONFIG: Record<CampaignStatus, { label: string; className: string }> = {
  active:    { label: "Aktiv",         className: "status-active" },
  paused:    { label: "Pausiert",      className: "status-paused" },
  draft:     { label: "Entwurf",       className: "status-draft" },
  completed: { label: "Abgeschlossen", className: "status-completed" },
  archived:  { label: "Archiviert",    className: "status-archived" },
};

/* ── Empfänger-Status (badge-status, gleiche Farbwelt wie Leads) ── */
const LEAD_STATUS_CONFIG: Record<CampaignLeadStatus, { label: string; className: string }> = {
  pending:   { label: "Ausstehend",    className: "status-draft" },
  sent:      { label: "Gesendet",      className: "status-contacted" },
  opened:    { label: "Geöffnet",      className: "status-new" },
  replied:   { label: "Antwort",       className: "status-interested" },
  completed: { label: "Abgeschlossen", className: "status-converted" },
  bounced:   { label: "Bounce",        className: "status-bounced" },
  failed:    { label: "Fehler",        className: "status-bounced" },
};

const LEAD_STATUS_OPTIONS = [
  { value: "pending",   label: "Ausstehend" },
  { value: "sent",      label: "Gesendet" },
  { value: "opened",    label: "Geöffnet" },
  { value: "replied",   label: "Antwort" },
  { value: "completed", label: "Abgeschlossen" },
  { value: "bounced",   label: "Bounce" },
  { value: "failed",    label: "Fehler" },
];

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const PAGE_SIZE = 25;

/* ── E-Mail-Konto (Mailbox-Auswahl + Warmup-Hinweis) ── */
interface EmailAccountSummary {
  id: string;
  label: string;
  sender_email: string;
  is_active: boolean;
  warmup_enabled: boolean;
  warmup_day: number;
  warmup_start: number;
  warmup_increment: number;
  daily_limit: number;
  health_status: string;
}

/* ── Edit-Formular ── */
interface EditStep {
  id: string;
  intent: string;
  desc: string;
}

interface EditForm {
  name: string;
  mailbox_ids: string[];
  daily_limit: string;
  time_from: string;
  time_to: string;
  days: boolean[];
  steps: EditStep[];
  /** Wartezeit in Tagen vor Schritt i+1 (Länge = steps.length − 1) */
  delays: string[];
  auto_stop_on_reply: boolean;
  track_opens: boolean;
  track_clicks: boolean;
  track_replies: boolean;
}

const MAX_STEPS = MAX_SEQUENCE_STEPS;

/* ── Helpers ── */
function pctLabel(count: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((count / total) * 100)} %`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-AT", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("de-AT", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

/** "Mo–Fr", "Täglich" oder Aufzählung — kompakte Wochentags-Anzeige. */
function daysLabel(days: boolean[] | undefined): string {
  if (!Array.isArray(days) || days.length !== 7) return "—";
  const idx = days.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
  if (idx.length === 0) return "—";
  if (idx.length === 7) return "Täglich";
  const contiguous = idx.every((v, k) => k === 0 || v === idx[k - 1] + 1);
  if (contiguous && idx.length > 2) {
    return `${WEEKDAYS[idx[0]]}–${WEEKDAYS[idx[idx.length - 1]]}`;
  }
  return idx.map((i) => WEEKDAYS[i]).join(", ");
}

function buildPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}

/* ── Status-Badge ── */
function StatusBadge({ status }: { status: CampaignStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`badge-status ${cfg.className}`}>
      <span className="dot" />
      {cfg.label}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════
   Detailseite
   ══════════════════════════════════════════════════════════════ */
export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<EmailAccountSummary[]>([]);
  const [leads, setLeads] = useState<CampaignLead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadsCount, setLeadsCount] = useState(0);
  const [leadsPage, setLeadsPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchCampaign = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${id}`);
      if (res.status === 404) {
        toast.error("Kampagne nicht gefunden");
        router.push("/dashboard/campaigns");
        return;
      }
      if (!res.ok) throw new Error();
      const json = await res.json();
      setCampaign(json.data);
    } catch {
      // Transienter Fehler (Netz, 500) → nicht wegnavigieren, nur melden
      toast.error("Kampagne konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  /* E-Mail-Konten (Mailbox-Anzeige, Warmup-Hinweis, Edit-Auswahl) */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/email-accounts");
        if (!res.ok) return;
        const { data } = await res.json();
        setAccounts(data ?? []);
      } catch { /* silent */ }
    })();
  }, []);

  /* silent=true beim Hintergrund-Poll: kein Skeleton-Flackern */
  const fetchLeads = useCallback(async (page = 1, silent = false) => {
    if (!silent) setLeadsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (searchFilter) params.set("search", searchFilter);

      const res = await fetch(`/api/campaigns/${id}/leads?${params.toString()}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setLeads(json.data ?? []);
      setLeadsCount(json.count ?? 0);
    } catch {
      if (!silent) toast.error("Fehler beim Laden der Empfänger");
    } finally {
      if (!silent) setLeadsLoading(false);
    }
  }, [id, statusFilter, searchFilter]);

  useEffect(() => { fetchCampaign(); }, [fetchCampaign]);

  /* Filter-/Suchwechsel → debounced neu laden, zurück auf Seite 1 */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { fetchLeads(1); setLeadsPage(1); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchLeads]);

  // Auto-Refresh bei aktiver Kampagne (silent — kein Lade-Flackern)
  useEffect(() => {
    if (campaign?.status !== "active") return;
    const interval = setInterval(() => {
      fetchCampaign();
      fetchLeads(leadsPage, true);
    }, 15000);
    return () => clearInterval(interval);
  }, [campaign?.status, fetchCampaign, fetchLeads, leadsPage]);

  async function handleStatusChange(status: CampaignStatus) {
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data?.error as string | undefined) || "Statuswechsel fehlgeschlagen");
      }
      toast.success(
        status === "active"
          ? "Kampagne gestartet"
          : `Status auf „${STATUS_CONFIG[status].label}" geändert`,
      );
      fetchCampaign();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Kampagne gelöscht");
      router.push("/dashboard/campaigns");
    } catch {
      toast.error("Fehler beim Löschen");
    } finally {
      setDeleteOpen(false);
    }
  }

  async function handleDuplicate() {
    try {
      const res = await fetch(`/api/campaigns/${id}/duplicate`, { method: "POST" });
      if (!res.ok) throw new Error();
      const json = await res.json();
      toast.success("Kampagne als Entwurf dupliziert");
      if (json.data?.id) router.push(`/dashboard/campaigns/${json.data.id}`);
    } catch {
      toast.error("Duplizieren fehlgeschlagen");
    }
  }

  /* ── Bearbeiten ── */
  function openEdit() {
    if (!campaign) return;
    const steps: EditStep[] = campaign.sequence_steps.length > 0
      ? campaign.sequence_steps.map((s) => ({ id: s.id, intent: s.intent, desc: s.desc ?? "" }))
      : [{ id: "s1", intent: "Erstkontakt", desc: "" }];
    setEditForm({
      name: campaign.name,
      mailbox_ids: campaign.mailbox_ids?.length
        ? [...campaign.mailbox_ids]
        : campaign.mailbox_id ? [campaign.mailbox_id] : [],
      daily_limit: String(campaign.daily_limit ?? 50),
      time_from: campaign.schedule?.time_from ?? "09:00",
      time_to: campaign.schedule?.time_to ?? "17:00",
      days: Array.isArray(campaign.schedule?.days) && campaign.schedule.days.length === 7
        ? [...campaign.schedule.days]
        : [true, true, true, true, true, false, false],
      steps,
      delays: Array.from({ length: Math.max(0, steps.length - 1) }, (_, i) =>
        String(campaign.sequence_delays[i]?.value ?? 3),
      ),
      auto_stop_on_reply: campaign.auto_stop_on_reply !== false,
      track_opens:   campaign.tracking?.opens   !== false,
      track_clicks:  campaign.tracking?.clicks  !== false,
      track_replies: campaign.tracking?.replies !== false,
    });
    setEditOpen(true);
  }

  async function handleSave() {
    if (!editForm || !campaign) return;
    if (!editForm.name.trim()) {
      toast.error("Name darf nicht leer sein");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          mailbox_ids: editForm.mailbox_ids,
          daily_limit: Number(editForm.daily_limit) || campaign.daily_limit,
          schedule: {
            ...campaign.schedule,
            days: editForm.days,
            time_from: editForm.time_from,
            time_to: editForm.time_to,
          },
          sequence_steps: editForm.steps.map((s, i) => ({
            id: s.id,
            intent: s.intent.trim() || `Schritt ${i + 1}`,
            desc: s.desc.trim(),
          })),
          sequence_delays: editForm.delays
            .slice(0, Math.max(0, editForm.steps.length - 1))
            .map((v) => ({
              value: Math.min(60, Math.max(1, Math.round(Number(v)) || 3)),
              unit: "day",
            })),
          auto_stop_on_reply: editForm.auto_stop_on_reply,
          tracking: {
            opens:   editForm.track_opens,
            clicks:  editForm.track_clicks,
            replies: editForm.track_replies,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data?.error as string | undefined) || "Speichern fehlgeschlagen");
      }
      toast.success("Kampagne aktualisiert");
      setEditOpen(false);
      fetchCampaign();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="leads-v3 flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-[140px] rounded-[10px]" />
        <Skeleton className="h-[480px] rounded-[10px]" />
      </div>
    );
  }

  if (!campaign) return null;

  const sent = campaign.sent_count || 0;
  const totalLeadPages = Math.max(1, Math.ceil(leadsCount / PAGE_SIZE));
  const pageNumbers = buildPageNumbers(leadsPage, totalLeadPages);
  const hasFilters = !!searchFilter || statusFilter !== "all";
  const stepsTotal = campaign.steps_total || campaign.sequence_steps.length || 1;

  /* Mailboxen der Kampagne: mehrere = automatische Rotation */
  const rotationIds = campaign.mailbox_ids?.length
    ? campaign.mailbox_ids
    : campaign.mailbox_id ? [campaign.mailbox_id] : [];
  const campaignMailboxes = accounts.filter((a) => rotationIds.includes(a.id));
  const mailbox = campaignMailboxes[0] ?? null;
  const isRotation = campaignMailboxes.length > 1;

  /* Warmup-Hinweis: effektives Limit heute */
  const effectiveLimit = (a: EmailAccountSummary) =>
    a.warmup_enabled
      ? Math.min(a.daily_limit, a.warmup_start + a.warmup_increment * a.warmup_day)
      : a.daily_limit;
  const warmingBoxes = campaignMailboxes.filter(
    (a) => a.warmup_enabled && effectiveLimit(a) < a.daily_limit,
  );
  const warmupEffective = mailbox ? effectiveLimit(mailbox) : null;
  const warmupActive = !isRotation && mailbox != null
    && mailbox.warmup_enabled && warmupEffective !== null
    && warmupEffective < mailbox.daily_limit;

  const stats = [
    { label: "Versendet",    value: sent.toLocaleString("de-DE"), meta: `von ${campaign.total_count.toLocaleString("de-DE")}` },
    { label: "Öffnungsrate", value: pctLabel(campaign.open_count, sent),  meta: `${campaign.open_count.toLocaleString("de-DE")} geöffnet` },
    { label: "Klickrate",    value: pctLabel(campaign.click_count, sent), meta: `${campaign.click_count.toLocaleString("de-DE")} geklickt` },
    { label: "Antwortrate",  value: pctLabel(campaign.reply_count, sent), meta: `${campaign.reply_count.toLocaleString("de-DE")} Antworten` },
    { label: "Bounces",      value: campaign.bounce_count.toLocaleString("de-DE"), meta: sent > 0 ? `${pctLabel(campaign.bounce_count, sent)} der Sendungen` : "noch kein Versand" },
  ];

  /* Versandtag je Sequenz-Schritt (Tag 1, dann kumulierte Wartezeiten) */
  const stepDays: number[] = [];
  {
    let day = 1;
    campaign.sequence_steps.forEach((_, i) => {
      if (i > 0) day += campaign.sequence_delays[i - 1]?.value ?? 3;
      stepDays.push(day);
    });
  }

  /* Mailbox-Anzeige ohne Doppelung von Label und Adresse */
  const mailboxLabel =
    mailbox?.label && mailbox.label !== mailbox.sender_email
      ? mailbox.label
      : mailbox?.sender_email
        ?? campaign.sender_name
        ?? (rotationIds.length === 0 ? "Automatisch (alle aktiven Konten)" : "—");

  return (
    <div className="leads-v3 flex flex-col gap-4 py-4 md:gap-6 md:py-6">

      {/* ── Header ── */}
      <div className="px-4 lg:px-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-2 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => router.push("/dashboard/campaigns")}
              aria-label="Zurück zu Kampagnen"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
            </Button>
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-[24px] font-semibold tracking-tight leading-tight truncate">
                  {campaign.name}
                </h1>
                <StatusBadge status={campaign.status} />
              </div>
              <p className="text-[13.5px] text-muted-foreground">
                Erstellt am {formatDate(campaign.created_at)}
                {campaign.started_at && <> · Gestartet am {formatDate(campaign.started_at)}</>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs font-medium"
              onClick={openEdit}
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
              Bearbeiten
            </Button>
            {(campaign.status === "draft" || campaign.status === "paused") && (
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs font-medium"
                onClick={() => handleStatusChange("active")}
              >
                <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
                Starten
              </Button>
            )}
            {campaign.status === "active" && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs font-medium"
                onClick={() => handleStatusChange("paused")}
              >
                <Pause className="h-3.5 w-3.5" strokeWidth={1.75} />
                Pausieren
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
                  <span className="sr-only">Aktionen</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {campaign.status === "active" && (
                  <DropdownMenuItem
                    className="text-xs gap-2 cursor-pointer"
                    onClick={() => handleStatusChange("completed")}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Abschließen
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="text-xs gap-2 cursor-pointer" onClick={handleDuplicate}>
                  <Copy className="h-3.5 w-3.5" />
                  Duplizieren
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  className="text-xs gap-2 cursor-pointer"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Löschen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* ── Fehler-Banner ── */}
      {campaign.error_message && (
        <div className="px-4 lg:px-6">
          <div className="rounded-[10px] border border-destructive/25 bg-destructive/5 px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" strokeWidth={1.75} />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-destructive">
                Versand pausiert — es ist ein Fehler aufgetreten
              </p>
              <p className="text-[12.5px] text-muted-foreground mt-0.5">
                {campaign.error_message} — nach Behebung kannst du die Kampagne erneut starten.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Übersichts-Karte: Performance + Setup ── */}
      <div className="px-4 lg:px-6">
        <div className="rounded-[10px] border border-border bg-card overflow-hidden">

          {/* Performance-Zeile */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x divide-border">
            {stats.map((s) => (
              <div key={s.label} className="px-5 py-4">
                <div className="text-[12px] font-medium text-muted-foreground">{s.label}</div>
                <div className="text-[22px] font-semibold tracking-tight leading-tight mt-1.5">
                  {s.value}
                </div>
                <div className="text-[11.5px] text-muted-foreground mt-0.5">{s.meta}</div>
              </div>
            ))}
          </div>

          <Separator />

          {/* Sequenz-Flow (Schritt-Karten mit Wartezeiten, klick = bearbeiten) */}
          <div className="px-5 py-4 flex items-center overflow-x-auto">
            {campaign.sequence_steps.length === 0 ? (
              <button
                type="button"
                className="setup-chip"
                onClick={openEdit}
              >
                <Plus />
                Sequenz erstellen
              </button>
            ) : (
              campaign.sequence_steps.map((step, i) => {
                const delay = i > 0 ? campaign.sequence_delays[i - 1]?.value ?? 3 : 0;
                return (
                  <Fragment key={step.id}>
                    {i > 0 && (
                      <div className="flow-connector">
                        <span>+{delay} {delay === 1 ? "Tag" : "Tage"}</span>
                      </div>
                    )}
                    <button type="button" className="flow-step" onClick={openEdit}>
                      <span className="num">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="title">{step.intent}</span>
                        <span className="sub">Tag {stepDays[i]}</span>
                      </span>
                    </button>
                  </Fragment>
                );
              })
            )}
          </div>

          <Separator />

          {/* Setup-Chips */}
          <div className="px-5 py-3 flex items-center gap-2 flex-wrap bg-muted/30">
            {isRotation ? (
              <button
                type="button"
                className="setup-chip"
                onClick={openEdit}
                title={campaignMailboxes.map((a) => a.sender_email).join(", ")}
              >
                <RefreshCw strokeWidth={1.75} />
                {campaignMailboxes.length} Mailboxen
                <span className="mut">· Rotation</span>
              </button>
            ) : (
              <button type="button" className="setup-chip" onClick={openEdit}>
                <Mail strokeWidth={1.75} />
                {mailboxLabel}
              </button>
            )}
            <button type="button" className="setup-chip" onClick={openEdit}>
              <Clock strokeWidth={1.75} />
              {campaign.schedule?.time_from ?? "09:00"} – {campaign.schedule?.time_to ?? "17:00"}
              <span className="mut">· {daysLabel(campaign.schedule?.days)}</span>
            </button>
            <button type="button" className="setup-chip" onClick={openEdit}>
              <Zap strokeWidth={1.75} />
              {campaign.daily_limit}
              <span className="mut">/ Tag</span>
            </button>
            {campaign.auto_stop_on_reply && (
              <button type="button" className="setup-chip" onClick={openEdit}>
                <CornerUpLeft strokeWidth={1.75} />
                Auto-Stopp bei Antwort
              </button>
            )}
            {warmupActive && mailbox && (
              <span className="setup-chip is-accent !cursor-default">
                <Flame strokeWidth={1.75} />
                Warmup
                <span className="mut">{warmupEffective}/{mailbox.daily_limit} pro Tag</span>
              </span>
            )}
            {isRotation && warmingBoxes.length > 0 && (
              <span
                className="setup-chip is-accent !cursor-default"
                title={warmingBoxes.map((a) => a.sender_email).join(", ")}
              >
                <Flame strokeWidth={1.75} />
                Warmup
                <span className="mut">
                  auf {warmingBoxes.length} von {campaignMailboxes.length} Konten
                </span>
              </span>
            )}

            <button
              type="button"
              onClick={openEdit}
              aria-label="Kampagne bearbeiten"
              className="ml-auto inline-grid place-items-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Empfänger ── */}
      <div className="px-4 lg:px-6">
        <div className="rounded-[var(--radius)] border border-border bg-card overflow-hidden">

          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-2.5 flex-wrap bg-card">
            <h2 className="text-[13.5px] font-semibold mr-1.5">Empfänger</h2>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" strokeWidth={1.75} />
              <Input
                placeholder="Firma oder E-Mail suchen …"
                className="input-bright pl-9 h-8 text-[13px]"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
              />
              {searchFilter && (
                <button
                  onClick={() => setSearchFilter("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-grid place-items-center h-5 w-5 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Suche löschen"
                >
                  <X className="h-3 w-3" strokeWidth={1.75} />
                </button>
              )}
            </div>

            <FilterTriggerPopover
              label="Status"
              value={
                statusFilter !== "all"
                  ? (LEAD_STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? statusFilter)
                  : null
              }
              onClear={() => setStatusFilter("all")}
              selectValue={statusFilter}
              onSelectChange={setStatusFilter}
              options={LEAD_STATUS_OPTIONS}
            />
            {hasFilters && (
              <button
                onClick={() => { setSearchFilter(""); setStatusFilter("all"); }}
                className="inline-flex items-center gap-1 h-8 px-2 text-[12px] text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
              >
                <X className="h-3 w-3" strokeWidth={1.75} />
                Zurücksetzen
              </button>
            )}

            <div className="ml-auto flex items-center gap-3">
              <span className="text-[12.5px] text-muted-foreground">
                <b className="text-foreground font-semibold">
                  {leadsCount.toLocaleString("de-DE")}
                </b>{" "}
                Empfänger
              </span>
            </div>
          </div>

          {/* Tabelle / Leerzustand / Loading */}
          {leadsLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-md" />
              ))}
            </div>
          ) : leads.length === 0 ? (
            hasFilters ? (
              <EmptyCards
                variant="search"
                title="Keine Empfänger gefunden"
                description="Passe die Filter an oder setze sie zurück."
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-medium"
                  onClick={() => { setSearchFilter(""); setStatusFilter("all"); }}
                >
                  Filter zurücksetzen
                </Button>
              </EmptyCards>
            ) : (
              <EmptyCards
                variant="mail"
                title="Keine Empfänger"
                description="Dieser Kampagne sind noch keine Empfänger zugeordnet."
              />
            )
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b bg-card">
                      <TableHead className="h-[42px] px-3.5 text-[11.5px] font-medium text-muted-foreground tracking-wide whitespace-nowrap">Firma</TableHead>
                      <TableHead className="h-[42px] px-3.5 text-[11.5px] font-medium text-muted-foreground tracking-wide whitespace-nowrap w-32">Status</TableHead>
                      <TableHead className="h-[42px] px-3.5 text-[11.5px] font-medium text-muted-foreground tracking-wide whitespace-nowrap w-20">Schritt</TableHead>
                      <TableHead className="h-[42px] px-3.5 text-[11.5px] font-medium text-muted-foreground tracking-wide whitespace-nowrap w-28">Geöffnet</TableHead>
                      <TableHead className="h-[42px] px-3.5 text-[11.5px] font-medium text-muted-foreground tracking-wide whitespace-nowrap w-64">Antwort</TableHead>
                      <TableHead className="h-[42px] px-3.5 text-[11.5px] font-medium text-muted-foreground tracking-wide whitespace-nowrap w-32">Gesendet</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((cl) => {
                      const lsCfg = LEAD_STATUS_CONFIG[cl.status];
                      return (
                        <TableRow
                          key={cl.id}
                          className="transition-colors border-b last:border-b-0 hover:bg-muted/40"
                        >
                          <TableCell className="py-3 px-3.5 align-middle text-[13px]">
                            <div className="min-w-0">
                              <p className="text-[13px] font-medium leading-tight text-foreground truncate">
                                {cl.lead?.company ?? "—"}
                              </p>
                              {cl.lead?.email && (
                                <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                                  {cl.lead.email}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-3 px-3.5 align-middle text-[13px]">
                            <span className={`badge-status ${lsCfg.className}`}>
                              <span className="dot" />
                              {lsCfg.label}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 px-3.5 align-middle text-[13px]">
                            {cl.sent_at ? (
                              <span className="text-[12.5px] tabular-nums">
                                {Math.min(cl.step_index + 1, stepsTotal)}
                                <span className="text-muted-foreground"> / {stepsTotal}</span>
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-3 px-3.5 align-middle text-[13px]">
                            {cl.open_count > 0 ? (
                              <span className="text-[12.5px] font-medium tabular-nums">
                                {cl.open_count}×
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-3 px-3.5 align-middle text-[13px]">
                            {cl.replied_at ? (
                              <div className="min-w-0">
                                <p className="text-[12.5px] font-medium tabular-nums leading-tight">
                                  {formatDateTime(cl.replied_at)}
                                </p>
                                {cl.reply_preview && (
                                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 line-clamp-1">
                                    {cl.reply_preview}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-3 px-3.5 align-middle text-[13px]">
                            {cl.sent_at ? (
                              <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                                {formatDateTime(cl.sent_at)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <Separator />
              <div className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                <p className="text-sm text-muted-foreground whitespace-nowrap">
                  <span className="font-medium text-foreground">
                    {leadsCount === 0
                      ? 0
                      : ((leadsPage - 1) * PAGE_SIZE + 1).toLocaleString("de-DE")}
                    –
                    {Math.min(leadsPage * PAGE_SIZE, leadsCount).toLocaleString("de-DE")}
                  </span>{" "}
                  von{" "}
                  <span className="font-medium text-foreground">
                    {leadsCount.toLocaleString("de-DE")}
                  </span>
                </p>

                {totalLeadPages > 1 && (
                  <Pagination className="mx-0 w-auto justify-end">
                    <PaginationContent className="gap-1">
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            if (leadsPage > 1) { const p = leadsPage - 1; setLeadsPage(p); fetchLeads(p); }
                          }}
                          className={leadsPage <= 1 ? "pointer-events-none opacity-40" : ""}
                        />
                      </PaginationItem>
                      {pageNumbers.map((p, i) =>
                        p === "…" ? (
                          <PaginationItem key={`ellipsis-${i}`}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        ) : (
                          <PaginationItem key={p}>
                            <PaginationLink
                              href="#"
                              isActive={p === leadsPage}
                              onClick={(e) => {
                                e.preventDefault();
                                setLeadsPage(p as number);
                                fetchLeads(p as number);
                              }}
                            >
                              {p}
                            </PaginationLink>
                          </PaginationItem>
                        ),
                      )}
                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            if (leadsPage < totalLeadPages) { const p = leadsPage + 1; setLeadsPage(p); fetchLeads(p); }
                          }}
                          className={leadsPage >= totalLeadPages ? "pointer-events-none opacity-40" : ""}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Bearbeiten-Sheet ── */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="right" className="leads-v3 w-full sm:max-w-[480px] flex flex-col p-0 gap-0 bg-white">
          <SheetHeader className="px-5 pt-4 pb-4 border-b border-border shrink-0">
            <SheetTitle className="text-[17px] font-medium tracking-tight leading-tight">
              Kampagne bearbeiten
            </SheetTitle>
            <SheetDescription className="text-[12.5px]">
              Name, Mailbox und Versand-Einstellungen anpassen.
            </SheetDescription>
          </SheetHeader>

          {editForm && (
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-name" className="text-[12.5px]">Name</Label>
                <Input
                  id="edit-name"
                  className="input-bright h-9 text-[13px]"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>

              {/* Sequenz */}
              <div className="space-y-2">
                <Label className="text-[12.5px]">Sequenz</Label>
                {editForm.steps.map((step, i) => (
                  <Fragment key={step.id}>
                    {i > 0 && (
                      <div className="flex items-center gap-2 py-1 pl-4 text-[12px] text-muted-foreground">
                        <span>wartet</span>
                        <Input
                          type="number"
                          min={1}
                          max={60}
                          className="input-bright h-7 w-16 text-[12.5px] text-center"
                          value={editForm.delays[i - 1] ?? "3"}
                          onChange={(e) => {
                            const delays = [...editForm.delays];
                            delays[i - 1] = e.target.value;
                            setEditForm({ ...editForm, delays });
                          }}
                        />
                        <span>Tage</span>
                      </div>
                    )}
                    <div className="rounded-[10px] border border-border bg-card p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11.5px] font-medium text-muted-foreground">
                          Schritt {i + 1}{i === 0 && " · sofort nach Start"}
                        </span>
                        {editForm.steps.length > 1 && (
                          <button
                            type="button"
                            aria-label={`Schritt ${i + 1} entfernen`}
                            className="inline-grid place-items-center h-6 w-6 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            onClick={() => {
                              const steps = editForm.steps.filter((_, k) => k !== i);
                              const delays = [...editForm.delays];
                              delays.splice(Math.max(0, i - 1), 1);
                              setEditForm({
                                ...editForm,
                                steps,
                                delays: delays.slice(0, Math.max(0, steps.length - 1)),
                              });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </button>
                        )}
                      </div>
                      <Input
                        className="input-bright h-9 text-[13px]"
                        placeholder="Ziel der E-Mail, z.B. Erstkontakt"
                        value={step.intent}
                        onChange={(e) => {
                          const steps = editForm.steps.map((s, k) =>
                            k === i ? { ...s, intent: e.target.value } : s,
                          );
                          setEditForm({ ...editForm, steps });
                        }}
                      />
                      <Textarea
                        className="input-bright text-[13px] min-h-[60px] resize-none"
                        placeholder="Worauf soll diese E-Mail eingehen? (optional)"
                        rows={2}
                        value={step.desc}
                        onChange={(e) => {
                          const steps = editForm.steps.map((s, k) =>
                            k === i ? { ...s, desc: e.target.value } : s,
                          );
                          setEditForm({ ...editForm, steps });
                        }}
                      />
                    </div>
                  </Fragment>
                ))}
                {editForm.steps.length < MAX_STEPS && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-full gap-1.5 text-xs font-medium border-dashed"
                    onClick={() => {
                      const id = `s-${Math.random().toString(36).slice(2, 9)}`;
                      setEditForm({
                        ...editForm,
                        steps: [...editForm.steps, { id, intent: "", desc: "" }],
                        delays: [...editForm.delays, "3"],
                      });
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Schritt hinzufügen
                  </Button>
                )}
              </div>

              {/* Mailboxen (Mehrfachauswahl = automatische Rotation) */}
              <div className="space-y-1.5">
                <Label className="text-[12.5px]">
                  {editForm.mailbox_ids.length > 1 ? "Mailboxen" : "Mailbox"}
                </Label>
                {accounts.filter((a) => a.is_active).length === 0 ? (
                  <p className="text-[11.5px] text-muted-foreground">
                    Keine aktive Mailbox — verbinde zuerst ein E-Mail-Konto in den Einstellungen.
                  </p>
                ) : (
                  <>
                    <div className="rounded-[10px] border border-border divide-y divide-border overflow-hidden">
                      {accounts.filter((a) => a.is_active).map((a) => {
                        const checked = editForm.mailbox_ids.includes(a.id);
                        return (
                          <label
                            key={a.id}
                            className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer bg-white hover:bg-muted/40 transition-colors"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => {
                                const ids = checked
                                  ? editForm.mailbox_ids.filter((id) => id !== a.id)
                                  : [...editForm.mailbox_ids, a.id];
                                setEditForm({ ...editForm, mailbox_ids: ids });
                              }}
                            />
                            <span className="min-w-0">
                              <span className="block text-[13px] font-medium truncate">
                                {a.label && a.label !== a.sender_email ? a.label : a.sender_email}
                              </span>
                              {a.label && a.label !== a.sender_email && (
                                <span className="block text-[11.5px] text-muted-foreground truncate">
                                  {a.sender_email}
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    {editForm.mailbox_ids.length > 1 && (
                      <p className="text-[11.5px] text-muted-foreground">
                        Automatische Rotation — der Versand verteilt sich auf{" "}
                        {editForm.mailbox_ids.length} Mailboxen.
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Tageslimit */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-limit" className="text-[12.5px]">Tageslimit</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="edit-limit"
                    type="number"
                    min={1}
                    max={1000}
                    className="input-bright h-9 w-28 text-[13px]"
                    value={editForm.daily_limit}
                    onChange={(e) => setEditForm({ ...editForm, daily_limit: e.target.value })}
                  />
                  <span className="text-[12.5px] text-muted-foreground">E-Mails / Tag</span>
                </div>
              </div>

              {/* Sendefenster */}
              <div className="space-y-1.5">
                <Label className="text-[12.5px]">Sendefenster</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    className="input-bright h-9 w-28 text-[13px]"
                    value={editForm.time_from}
                    onChange={(e) => setEditForm({ ...editForm, time_from: e.target.value })}
                  />
                  <span className="text-[12.5px] text-muted-foreground">bis</span>
                  <Input
                    type="time"
                    className="input-bright h-9 w-28 text-[13px]"
                    value={editForm.time_to}
                    onChange={(e) => setEditForm({ ...editForm, time_to: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-1.5 pt-1.5 flex-wrap">
                  {WEEKDAYS.map((day, i) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        const days = [...editForm.days];
                        days[i] = !days[i];
                        setEditForm({ ...editForm, days });
                      }}
                      className={cn(
                        "h-8 w-10 rounded-md border text-[12px] font-medium transition-colors",
                        editForm.days[i]
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-border hover:border-muted-foreground hover:text-foreground",
                      )}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto-Stopp */}
              <div className="flex items-center justify-between gap-4 rounded-[10px] border border-border px-4 py-3">
                <div>
                  <p className="text-[13px] font-medium">Auto-Stopp bei Antwort</p>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5">
                    Folge-E-Mails stoppen, sobald ein Empfänger antwortet.
                  </p>
                </div>
                <Switch
                  checked={editForm.auto_stop_on_reply}
                  onCheckedChange={(v) => setEditForm({ ...editForm, auto_stop_on_reply: v })}
                />
              </div>

              {/* Tracking */}
              <div className="rounded-[10px] border border-border divide-y divide-border">
                {([
                  ["track_opens",   "Öffnungen tracken"],
                  ["track_clicks",  "Klicks tracken"],
                  ["track_replies", "Antworten erkennen"],
                ] as const).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <p className="text-[13px]">{label}</p>
                    <Switch
                      checked={editForm[key]}
                      onCheckedChange={(v) => setEditForm({ ...editForm, [key]: v })}
                    />
                  </div>
                ))}
              </div>

            </div>
          )}

          <SheetFooter className="px-5 py-4 border-t bg-white flex-row gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-9 flex-1 text-xs font-medium"
              onClick={() => setEditOpen(false)}
              disabled={saving}
            >
              Abbrechen
            </Button>
            <Button
              size="sm"
              className="h-9 flex-1 gap-1.5 text-xs font-medium"
              onClick={handleSave}
              disabled={saving}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Speichern
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ── Lösch-Bestätigung ── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kampagne „{campaign.name}“ löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle zugehörigen Versand-Daten und Statistiken werden dauerhaft entfernt.
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
