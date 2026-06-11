"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  X,
  Play,
  Pause,
  Copy,
  Pencil,
  MoreHorizontal,
  Trash2,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Checkbox } from "@/components/ui/checkbox";
import { FilterTriggerPopover } from "@/components/shared/FilterTriggerPopover";
import { EmptyCards } from "@/components/shared/EmptyCards";

import type { Campaign, CampaignStatus } from "@/types/campaigns";
import { cn } from "@/lib/utils";

/* ── Status-Labels ── */
const STATUS_LABEL: Record<CampaignStatus, string> = {
  active:    "Aktiv",
  paused:    "Pausiert",
  draft:     "Entwurf",
  completed: "Abgeschlossen",
  archived:  "Archiviert",
};

const STATUS_TABS: { value: "all" | CampaignStatus; label: string }[] = [
  { value: "all",       label: "Alle" },
  { value: "active",    label: "Aktiv" },
  { value: "paused",    label: "Pausiert" },
  { value: "draft",     label: "Entwurf" },
  { value: "completed", label: "Abgeschlossen" },
];

const PAGE_SIZE = 25;

const RANGE_OPTIONS = [
  { value: "7d",   label: "Letzte 7 Tage" },
  { value: "30d",  label: "Letzte 30 Tage" },
  { value: "90d",  label: "Letzte 90 Tage" },
  { value: "ytd",  label: "Dieses Jahr" },
];

/* ── Helpers ── */
function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}
function rateClass(p: number): string {
  if (p >= 30) return "rate-hi";
  if (p >= 18) return "rate-mid";
  if (p >= 8) return "rate-low";
  return "rate-vlo";
}
function relativeDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60_000);
  const hrs = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  if (hrs < 24) return `vor ${hrs} Std.`;
  if (days === 1) return "vor 1 Tag";
  if (days < 14) return `vor ${days} Tagen`;
  if (days < 60) return `vor ${Math.floor(days / 7)} Wochen`;
  return `vor ${Math.floor(days / 30)} Monaten`;
}

/** Liest die Fehlermeldung aus einer API-Antwort (Fallback auf Standardtext). */
async function apiError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  return (data?.error as string | undefined) || fallback;
}

/* ── Rate-Cell ── */
function RateCell({ value }: { value: number }) {
  return (
    <span className={`rate ${rateClass(value)}`}>
      <span className="pct">{value}%</span>
    </span>
  );
}

/* ── Letzte Aktivität ── */
function LastActivityCell({
  when,
  kind,
}: {
  when: string;
  kind: Campaign["last_activity_kind"] | undefined;
}) {
  const label =
    kind === "reply"     ? "Antwort eingegangen"  :
    kind === "open"      ? "Mail geöffnet"        :
    kind === "click"     ? "Link geklickt"        :
    kind === "send"      ? "Versendet"            :
    kind === "start"     ? "Gestartet"            :
    kind === "pause"     ? "Pausiert"             :
    kind === "completed" ? "Abgeschlossen"        :
    kind === "archived"  ? "Archiviert"           :
    kind === "draft"     ? "Entwurf gespeichert"  : "—";
  const isHot = kind === "reply";
  return (
    <div className="activity">
      <span className={cn("activity-when", !isHot && "is-stale")}>{when}</span>
      <span className="activity-what">{label}</span>
    </div>
  );
}

/* ── Status-Badge ── */
function StatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span className={`badge-status status-${status}`}>
      <span className="dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}

/* ── Pagination-Helper (gleich wie Leads) ── */
function buildPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}

/* ══════════════════════════════════════════════════════════════
   Hauptkomponente
   ══════════════════════════════════════════════════════════════ */
export default function CampaignsPage() {
  const router = useRouter();

  const [campaigns, setCampaigns]   = useState<Campaign[]>([]);
  const [loading, setLoading]       = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CampaignStatus>("all");
  const [rangeFilter,  setRangeFilter]  = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  /* ── Fetch Kampagnen (serverseitig paginiert & gefiltert) ── */
  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (searchFilter) params.set("search", searchFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (rangeFilter !== "all")  params.set("range", rangeFilter);

      const res = await fetch(`/api/campaigns?${params.toString()}`);
      if (!res.ok) throw new Error(await apiError(res, "Kampagnen konnten nicht geladen werden"));
      const json = await res.json();
      setCampaigns(json.data ?? []);
      setTotalCount(json.count ?? 0);
      setTotalPages(Math.max(1, json.totalPages ?? 1));
      if (json.status_counts) setStatusCounts(json.status_counts);
    } catch (err) {
      setCampaigns([]);
      setTotalCount(0);
      setTotalPages(1);
      toast.error(err instanceof Error ? err.message : "Kampagnen konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [page, searchFilter, statusFilter, rangeFilter]);

  /* Debounce (Suchfeld); Filter-/Seitenwechsel laufen über dieselbe Leitung */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { fetchCampaigns(); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchCampaigns]);

  /* Filterwechsel → zurück auf Seite 1 */
  useEffect(() => { setPage(1); }, [statusFilter, rangeFilter, searchFilter]);

  const pageNumbers = buildPageNumbers(page, totalPages);
  const hasFilters = !!searchFilter || statusFilter !== "all" || rangeFilter !== "all";

  function resetFilters() {
    setSearchFilter("");
    setStatusFilter("all");
    setRangeFilter("all");
  }

  /* ── Aktionen ── */
  async function handleStatusChange(id: string, status: CampaignStatus) {
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await apiError(res, "Statuswechsel fehlgeschlagen"));
      toast.success(
        status === "active"
          ? "Kampagne gestartet"
          : `Status auf „${STATUS_LABEL[status]}" geändert`,
      );
      fetchCampaigns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function handleDuplicate(id: string) {
    try {
      const res = await fetch(`/api/campaigns/${id}/duplicate`, { method: "POST" });
      if (!res.ok) throw new Error(await apiError(res, "Duplizieren fehlgeschlagen"));
      toast.success("Kampagne als Entwurf dupliziert");
      fetchCampaigns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || pendingDelete.length === 0) return;
    setBulkBusy(true);
    let deleted = 0;
    for (const id of pendingDelete) {
      try {
        const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
        if (res.ok) deleted++;
      } catch { /* einzeln weiter */ }
    }
    setBulkBusy(false);
    setPendingDelete(null);
    setSelected(new Set());
    if (deleted > 0) {
      toast.success(deleted === 1 ? "Kampagne gelöscht" : `${deleted} Kampagnen gelöscht`);
    } else {
      toast.error("Löschen fehlgeschlagen");
    }
    fetchCampaigns();
  }

  /** Bulk: Status für alle ausgewählten Kampagnen setzen / duplizieren. */
  async function bulkAction(action: "pause" | "start" | "duplicate") {
    if (selected.size === 0) return;
    setBulkBusy(true);
    let ok = 0;
    for (const id of selected) {
      try {
        const res = action === "duplicate"
          ? await fetch(`/api/campaigns/${id}/duplicate`, { method: "POST" })
          : await fetch(`/api/campaigns/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: action === "pause" ? "paused" : "active" }),
            });
        if (res.ok) ok++;
      } catch { /* einzeln weiter */ }
    }
    setBulkBusy(false);
    setSelected(new Set());
    toast.success(
      action === "pause"     ? `${ok} Kampagnen pausiert` :
      action === "start"     ? `${ok} Kampagnen gestartet` :
      `${ok} Kampagnen dupliziert`,
    );
    fetchCampaigns();
  }

  /* ── Selection ── */
  const allVisibleSelected =
    campaigns.length > 0 &&
    campaigns.every((c) => selected.has(c.id));
  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }
  function toggleAll() {
    const next = new Set(selected);
    if (allVisibleSelected) {
      campaigns.forEach((c) => next.delete(c.id));
    } else {
      campaigns.forEach((c) => next.add(c.id));
    }
    setSelected(next);
  }

  /* ── Render ── */
  return (
    <div className="leads-v3 flex flex-col gap-4 py-4 md:gap-6 md:py-6">

      {/* ── Page Header ── */}
      <div className="px-4 lg:px-6 space-y-4">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-[24px] font-semibold tracking-tight leading-tight">Kampagnen</h1>
            <p className="text-[13.5px] text-muted-foreground max-w-xl">
              Verwalte E-Mail-Sequenzen, Zielgruppen und Performance an einem Ort.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs font-medium"
              onClick={() => router.push("/dashboard/campaigns/new")}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              Neue Kampagne
            </Button>
          </div>
        </div>
      </div>

      {/* ── Status-Tabs ── */}
      <Tabs
        value={statusFilter}
        onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
        className="space-y-0 px-4 lg:px-6"
      >
        <TabsList variant="line" className="border-b border-border w-full justify-start">
          {STATUS_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="text-[13px] gap-2"
            >
              {tab.label}
              {statusCounts[tab.value] != null && statusCounts[tab.value] > 0 && (
                <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium data-[state=active]:text-primary">
                  {statusCounts[tab.value].toLocaleString("de-DE")}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="rounded-b-[var(--radius)] border border-t-0 border-border bg-card overflow-hidden mt-0">

          {/* ── Toolbar ── */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-2.5 flex-wrap bg-card">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" strokeWidth={1.75} />
              <Input
                placeholder="Kampagne suchen …"
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

            <div className="flex items-center gap-2 flex-wrap">
              <FilterTriggerPopover
                label="Zeitraum"
                value={rangeFilter !== "all" ? (RANGE_OPTIONS.find((o) => o.value === rangeFilter)?.label ?? rangeFilter) : null}
                onClear={() => setRangeFilter("all")}
                selectValue={rangeFilter}
                onSelectChange={setRangeFilter}
                options={RANGE_OPTIONS}
              />
              {hasFilters && (
                <button
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 h-8 px-2 text-[12px] text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
                >
                  <X className="h-3 w-3" strokeWidth={1.75} />
                  Zurücksetzen
                </button>
              )}
            </div>

            <div className="ml-auto flex items-center gap-3">
              <span className="text-[12.5px] text-muted-foreground">
                <b className="text-foreground font-semibold">
                  {totalCount.toLocaleString("de-DE")}
                </b>{" "}
                Kampagnen
              </span>
            </div>
          </div>

          {/* ── Tabelle / Leerzustand / Loading ── */}
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            hasFilters ? (
              <EmptyCards
                variant="search"
                title="Keine Kampagnen gefunden"
                description="Passe die Filter an oder setze sie zurück."
              >
                <Button variant="outline" size="sm" className="h-8 text-xs font-medium" onClick={resetFilters}>
                  Filter zurücksetzen
                </Button>
              </EmptyCards>
            ) : (
              <EmptyCards
                variant="mail"
                title="Noch keine Kampagnen"
                description="Erstelle deine erste Kampagne — die KI personalisiert jede E-Mail automatisch für deine Empfänger."
              >
                <Button
                  size="sm"
                  className="h-8 gap-1.5 text-xs font-medium"
                  onClick={() => router.push("/dashboard/campaigns/new")}
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Erste Kampagne erstellen
                </Button>
              </EmptyCards>
            )
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b bg-card">
                      <TableHead className="h-[42px] px-3.5 text-[11.5px] font-medium text-muted-foreground tracking-wide whitespace-nowrap w-10">
                        <Checkbox
                          checked={allVisibleSelected}
                          onCheckedChange={toggleAll}
                          aria-label="Alle auswählen"
                        />
                      </TableHead>
                      <TableHead className="h-[42px] px-3.5 text-[11.5px] font-medium text-muted-foreground tracking-wide whitespace-nowrap">Kampagne</TableHead>
                      <TableHead className="h-[42px] px-3.5 text-[11.5px] font-medium text-muted-foreground tracking-wide whitespace-nowrap w-28">Status</TableHead>
                      <TableHead className="h-[42px] px-3.5 text-[11.5px] font-medium text-muted-foreground tracking-wide whitespace-nowrap w-44">Versendet</TableHead>
                      <TableHead className="h-[42px] px-3.5 text-[11.5px] font-medium text-muted-foreground tracking-wide whitespace-nowrap w-28">Öffnungsrate</TableHead>
                      <TableHead className="h-[42px] px-3.5 text-[11.5px] font-medium text-muted-foreground tracking-wide whitespace-nowrap w-28">Antwortrate</TableHead>
                      <TableHead className="h-[42px] px-3.5 text-[11.5px] font-medium text-muted-foreground tracking-wide whitespace-nowrap w-40">Letzte Aktivität</TableHead>
                      <TableHead className="h-[42px] px-3.5 w-28" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((c) => {
                      const audience = c.total_count || 0;
                      const sent     = c.sent_count  || 0;
                      const sentPct  = pct(sent, audience);
                      const openPct  = pct(c.open_count || 0, sent || 1);
                      const replyPct = pct(c.reply_count || 0, sent || 1);
                      const isSelected = selected.has(c.id);

                      const lastWhen = c.last_activity_at
                        ? relativeDate(c.last_activity_at)
                        : relativeDate(c.started_at ?? c.updated_at ?? c.created_at);
                      const lastKind =
                        c.last_activity_kind ??
                        (c.status === "active"    ? "send" :
                         c.status === "paused"    ? "pause" :
                         c.status === "completed" ? "completed" :
                         "draft");

                      return (
                        <TableRow
                          key={c.id}
                          className={cn(
                            "cursor-pointer transition-colors group border-b last:border-b-0",
                            isSelected ? "bg-accent hover:bg-accent/80" : "hover:bg-muted/40",
                          )}
                          onClick={() => router.push(`/dashboard/campaigns/${c.id}`)}
                        >
                          <TableCell className="py-3 px-3.5 align-middle text-[13px]" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              className="cursor-pointer"
                              checked={isSelected}
                              onCheckedChange={() => toggleOne(c.id)}
                              aria-label={`${c.name} auswählen`}
                            />
                          </TableCell>
                          <TableCell className="py-3 px-3.5 align-middle text-[13px]">
                            <div className="min-w-0">
                              <p className="text-[13px] font-medium leading-tight text-foreground truncate">
                                {c.name}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5 flex items-center gap-1.5">
                                <span>
                                  {c.steps ?? 1} {(c.steps ?? 1) === 1 ? "Schritt" : "Schritte"}
                                </span>
                                <span className="inline-block w-[3px] h-[3px] rounded-full bg-muted-foreground/50" />
                                <span>{audience.toLocaleString("de-DE")} Empfänger</span>
                                {c.error_message && (
                                  <>
                                    <span className="inline-block w-[3px] h-[3px] rounded-full bg-muted-foreground/50" />
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex items-center gap-1 text-destructive">
                                          <AlertTriangle className="h-3 w-3" strokeWidth={1.75} />
                                          Fehler
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>{c.error_message}</TooltipContent>
                                    </Tooltip>
                                  </>
                                )}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="py-3 px-3.5 align-middle text-[13px]">
                            <StatusBadge status={c.status} />
                          </TableCell>
                          <TableCell className="py-3 px-3.5 align-middle text-[13px]">
                            {sent === 0 ? (
                              <span className="text-xs text-muted-foreground/50">—</span>
                            ) : (
                              <span className="cmp-progress">
                                <span className="cmp-progress-track">
                                  <span
                                    className="cmp-progress-fill"
                                    style={{ width: `${sentPct}%` }}
                                  />
                                </span>
                                <span className="cmp-progress-val">
                                  {sent.toLocaleString("de-DE")}
                                  <span className="meta">/ {audience.toLocaleString("de-DE")}</span>
                                </span>
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-3 px-3.5 align-middle text-[13px]">
                            {sent === 0 ? <span className="text-xs text-muted-foreground/50">—</span> : <RateCell value={openPct} />}
                          </TableCell>
                          <TableCell className="py-3 px-3.5 align-middle text-[13px]">
                            {sent === 0 ? <span className="text-xs text-muted-foreground/50">—</span> : <RateCell value={replyPct} />}
                          </TableCell>
                          <TableCell className="py-3 px-3.5 align-middle text-[13px]">
                            <LastActivityCell when={lastWhen} kind={lastKind} />
                          </TableCell>
                          <TableCell className="py-3 px-3.5 align-middle text-[13px] text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 has-[[data-state=open]]:opacity-100 transition-opacity">
                              {c.status === "active" ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                      onClick={() => handleStatusChange(c.id, "paused")}
                                    >
                                      <Pause className="h-3.5 w-3.5" strokeWidth={1.75} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Pausieren</TooltipContent>
                                </Tooltip>
                              ) : c.status === "paused" || c.status === "draft" ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                      onClick={() => handleStatusChange(c.id, "active")}
                                    >
                                      <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Starten</TooltipContent>
                                </Tooltip>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                      onClick={() => handleDuplicate(c.id)}
                                    >
                                      <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Duplizieren</TooltipContent>
                                </Tooltip>
                              )}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                    onClick={() => router.push(`/dashboard/campaigns/${c.id}`)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Details öffnen</TooltipContent>
                              </Tooltip>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                  >
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                    <span className="sr-only">Aktionen</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  <DropdownMenuItem
                                    className="text-xs gap-2 cursor-pointer"
                                    onClick={() => router.push(`/dashboard/campaigns/${c.id}`)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Details öffnen
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-xs gap-2 cursor-pointer"
                                    onClick={() => handleDuplicate(c.id)}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                    Duplizieren
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    className="text-xs gap-2 cursor-pointer"
                                    onClick={() => setPendingDelete([c.id])}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Löschen
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* ── Pagination ── */}
              <Separator />
              <div className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                <p className="text-sm text-muted-foreground whitespace-nowrap">
                  <span className="font-medium text-foreground">
                    {totalCount === 0
                      ? 0
                      : ((page - 1) * PAGE_SIZE + 1).toLocaleString("de-DE")}
                    –
                    {Math.min(page * PAGE_SIZE, totalCount).toLocaleString("de-DE")}
                  </span>{" "}
                  von{" "}
                  <span className="font-medium text-foreground">
                    {totalCount.toLocaleString("de-DE")}
                  </span>
                </p>

                {totalPages > 1 && (
                  <Pagination className="mx-0 w-auto justify-end">
                    <PaginationContent className="gap-1">
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          onClick={(e) => { e.preventDefault(); if (page > 1) setPage(page - 1); }}
                          className={page <= 1 ? "pointer-events-none opacity-40" : ""}
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
                              isActive={p === page}
                              onClick={(e) => { e.preventDefault(); setPage(p as number); }}
                            >
                              {p}
                            </PaginationLink>
                          </PaginationItem>
                        ),
                      )}
                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          onClick={(e) => { e.preventDefault(); if (page < totalPages) setPage(page + 1); }}
                          className={page >= totalPages ? "pointer-events-none opacity-40" : ""}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
              </div>
            </>
          )}
        </div>
      </Tabs>

      {/* ── Selection-Bar (fixed bottom) ── */}
      {selected.size > 0 && (
        <div className="fixed left-1/2 bottom-6 -translate-x-1/2 z-50 flex items-center gap-1.5 pl-4 pr-1.5 py-1.5 bg-foreground text-background rounded-lg shadow-xl">
          <span className="text-[12.5px]">
            <b className="font-semibold">{selected.size}</b> ausgewählt
          </span>
          <span className="w-px h-4 bg-background/15 mx-1.5" />
          <Button
            variant="ghost" size="sm" disabled={bulkBusy}
            className="h-7 px-2.5 text-background/85 hover:text-background hover:bg-background/10 text-[12.5px]"
            onClick={() => bulkAction("pause")}
          >
            <Pause className="h-3 w-3 mr-1" /> Pausieren
          </Button>
          <Button
            variant="ghost" size="sm" disabled={bulkBusy}
            className="h-7 px-2.5 text-background/85 hover:text-background hover:bg-background/10 text-[12.5px]"
            onClick={() => bulkAction("start")}
          >
            <Play className="h-3 w-3 mr-1" /> Starten
          </Button>
          <Button
            variant="ghost" size="sm" disabled={bulkBusy}
            className="h-7 px-2.5 text-background/85 hover:text-background hover:bg-background/10 text-[12.5px]"
            onClick={() => bulkAction("duplicate")}
          >
            <Copy className="h-3 w-3 mr-1" /> Duplizieren
          </Button>
          <Button
            variant="ghost" size="sm" disabled={bulkBusy}
            className="h-7 px-2.5 text-red-300 hover:text-red-200 hover:bg-red-500/20 text-[12.5px]"
            onClick={() => setPendingDelete(Array.from(selected))}
            aria-label="Ausgewählte löschen"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
          <span className="w-px h-4 bg-background/15 mx-1.5" />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-background/85 hover:text-background hover:bg-background/10"
            onClick={() => setSelected(new Set())}
            aria-label="Auswahl leeren"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* ── Lösch-Bestätigung ── */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete && pendingDelete.length > 1
                ? `${pendingDelete.length} Kampagnen löschen?`
                : "Kampagne löschen?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Alle zugehörigen Versand-Daten und Statistiken werden dauerhaft entfernt.
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={bulkBusy}
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
