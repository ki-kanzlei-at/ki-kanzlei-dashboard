"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Download,
  X,
  Play,
  Pause,
  Copy,
  Pencil,
  MoreHorizontal,
  Trash2,
  Send,
  Users,
  Layers,
  AlertTriangle,
  Flame,
  TrendingUp,
  Check,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";

import { CampaignCreateDialog } from "@/components/campaigns/CampaignCreateDialog";
import type { Campaign, CampaignStatus } from "@/types/campaigns";
import { cn } from "@/lib/utils";

/* ── Email Account type (für Warmup-Strip) ── */
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
  sent_today: number;
  health_status: string;
}

/* ── Status-Labels & Sort-Reihenfolge ── */
const STATUS_LABEL: Record<CampaignStatus, string> = {
  active: "Aktiv",
  paused: "Pausiert",
  draft: "Entwurf",
  completed: "Abgeschlossen",
};

const STATUS_TABS: { value: "all" | CampaignStatus; label: string }[] = [
  { value: "all",       label: "Alle" },
  { value: "active",    label: "Aktiv" },
  { value: "paused",    label: "Pausiert" },
  { value: "draft",     label: "Entwurf" },
  { value: "completed", label: "Abgeschlossen" },
];

const PAGE_SIZE = 25;

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

/* ── Filter-Trigger (gleicher Stil wie Leads v3) ── */
interface FilterTriggerProps {
  label: string;
  value: string | null;
  onClear: () => void;
  selectValue: string;
  onSelectChange: (value: string) => void;
  options: { value: string; label: string }[];
}

function FilterTriggerPopover({
  label,
  value,
  onClear,
  selectValue,
  onSelectChange,
  options,
}: FilterTriggerProps) {
  const hasValue = !!value;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn("filter-trigger", hasValue && "has-value")}>
          {!hasValue && <Plus className="h-3 w-3" strokeWidth={1.75} />}
          <span className="lbl">{label}</span>
          {hasValue && <span className="val">{value}</span>}
          {hasValue && (
            <span
              role="button"
              tabIndex={0}
              aria-label={`${label} entfernen`}
              className="x-btn"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onClear(); }
              }}
            >
              <X className="h-2.5 w-2.5" strokeWidth={1.75} />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command>
          <CommandInput placeholder={`${label} suchen…`} className="h-9 text-[13px]" />
          <CommandList className="max-h-[260px] overflow-y-auto overscroll-contain">
            <CommandEmpty className="py-4 text-center text-[12px] text-muted-foreground">
              Kein Eintrag gefunden
            </CommandEmpty>
            {options.map((opt) => {
              const selected = selectValue === opt.value;
              return (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => onSelectChange(opt.value)}
                  className="text-[13px] cursor-pointer"
                >
                  <Check
                    className={cn("mr-2 h-3.5 w-3.5", selected ? "opacity-100" : "opacity-0")}
                  />
                  {opt.label}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
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
    kind === "send"      ? "Versendet"            :
    kind === "pause"     ? "Pausiert"             :
    kind === "completed" ? "Abgeschlossen"        :
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
  const [goalFilter,   setGoalFilter]   = useState<string>("all");
  const [senderFilter, setSenderFilter] = useState<string>("all");
  const [rangeFilter,  setRangeFilter]  = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [emailAccounts, setEmailAccounts] = useState<EmailAccountSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  /* ── Fetch E-Mail-Accounts (für Warmup-Strip) ── */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/email-accounts");
        if (!res.ok) return;
        const { data } = await res.json();
        setEmailAccounts(data ?? []);
      } catch { /* silent */ }
    })();
  }, []);

  /* ── Fetch Kampagnen ── */
  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchFilter) params.set("search", searchFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (goalFilter !== "all")   params.set("goal", goalFilter);
      if (senderFilter !== "all") params.set("sender", senderFilter);
      if (rangeFilter !== "all")  params.set("range", rangeFilter);

      const res = await fetch(`/api/campaigns?${params.toString()}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setCampaigns(json.data ?? []);
    } catch {
      // 404/Backend noch nicht fertig → leere Liste statt Fehlertoast
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [searchFilter, statusFilter, goalFilter, senderFilter, rangeFilter]);

  /* Debounce für Suchfeld (500ms), sonst sofort */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { fetchCampaigns(); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchCampaigns]);

  /* ── Filter-Optionen (clientseitig aus geladenen Daten ableiten) ── */
  const goalOptions = useMemo(() => {
    const set = new Set<string>();
    campaigns.forEach((c) => { if (c.goal) set.add(c.goal); });
    return Array.from(set).map((g) => ({ value: g, label: g }));
  }, [campaigns]);

  const senderOptions = useMemo(() => {
    const set = new Set<string>();
    campaigns.forEach((c) => {
      if (c.sender_name) set.add(c.sender_name);
      else if (c.reply_to) set.add(c.reply_to);
    });
    return Array.from(set).map((s) => ({ value: s, label: s }));
  }, [campaigns]);

  const rangeOptions = [
    { value: "7d",   label: "Letzte 7 Tage" },
    { value: "30d",  label: "Letzte 30 Tage" },
    { value: "90d",  label: "Letzte 90 Tage" },
    { value: "ytd",  label: "Dieses Jahr" },
  ];

  /* ── Status-Zählung (für Tab-Counts) ── */
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: campaigns.length };
    for (const s of ["active","paused","draft","completed"] as CampaignStatus[]) {
      counts[s] = campaigns.filter((c) => c.status === s).length;
    }
    return counts;
  }, [campaigns]);

  /* ── Status-Filter im Frontend anwenden (verhindert Round-Trip beim Tab-Wechsel) ── */
  const filteredCampaigns = useMemo(() => {
    if (statusFilter === "all") return campaigns;
    return campaigns.filter((c) => c.status === statusFilter);
  }, [campaigns, statusFilter]);

  /* ── Pagination derived ── */
  const totalPages = Math.max(1, Math.ceil(filteredCampaigns.length / PAGE_SIZE));
  const pageNumbers = buildPageNumbers(page, totalPages);
  const visibleCampaigns = useMemo(
    () => filteredCampaigns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredCampaigns, page],
  );
  useEffect(() => { setPage(1); }, [statusFilter, goalFilter, senderFilter, rangeFilter, searchFilter]);

  const hasFilters =
    !!searchFilter ||
    statusFilter !== "all" ||
    goalFilter !== "all" ||
    senderFilter !== "all" ||
    rangeFilter !== "all";

  function resetFilters() {
    setSearchFilter("");
    setStatusFilter("all");
    setGoalFilter("all");
    setSenderFilter("all");
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
      if (!res.ok) throw new Error();
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

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Kampagne gelöscht");
      fetchCampaigns();
    } catch {
      toast.error("Fehler beim Löschen");
    }
  }

  /* ── Selection ── */
  const allVisibleSelected =
    visibleCampaigns.length > 0 &&
    visibleCampaigns.every((c) => selected.has(c.id));
  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }
  function toggleAll() {
    if (allVisibleSelected) {
      const next = new Set(selected);
      visibleCampaigns.forEach((c) => next.delete(c.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      visibleCampaigns.forEach((c) => next.add(c.id));
      setSelected(next);
    }
  }

  /* ── Render ── */
  return (
    <div className="leads-v3 flex flex-col gap-4 py-4 md:gap-6 md:py-6">

      {/* ── Page Header ── */}
      <div className="px-4 lg:px-6 space-y-4">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-[24px] font-medium tracking-tight leading-tight">Kampagnen</h1>
            <p className="text-[13.5px] text-muted-foreground max-w-xl">
              Verwalte E-Mail-Sequenzen, Zielgruppen und Performance — alles an einem Ort.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs font-medium"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
              Bericht
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs font-medium"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              Neue Kampagne
            </Button>
          </div>
        </div>
      </div>

      {/* ── Warmup-Strip (vorhandene Funktion, dezent oberhalb Tabs) ── */}
      {emailAccounts.length > 0 && (
        <div className="px-4 lg:px-6">
          <div className="rounded-[var(--radius)] border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="h-3.5 w-3.5 text-orange-500" strokeWidth={1.75} />
              <span className="text-[12.5px] font-medium">E-Mail-Konten & Warmup</span>
              <span className="text-[11.5px] text-muted-foreground ml-auto">
                {emailAccounts.filter((a) => a.is_active).length} aktiv · Kapazität:{" "}
                {emailAccounts.filter((a) => a.is_active).reduce((s, a) => {
                  if (!a.warmup_enabled) return s + a.daily_limit;
                  const effective = Math.min(
                    a.daily_limit,
                    a.warmup_start + a.warmup_increment * a.warmup_day,
                  );
                  return s + effective;
                }, 0)} E-Mails/Tag
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {emailAccounts.filter((a) => a.is_active).map((acc) => {
                const effectiveLimit = acc.warmup_enabled
                  ? Math.min(acc.daily_limit, acc.warmup_start + acc.warmup_increment * acc.warmup_day)
                  : acc.daily_limit;
                const warmupProgress = acc.warmup_enabled
                  ? Math.min(100, (effectiveLimit / acc.daily_limit) * 100)
                  : 100;
                const daysLeft = acc.warmup_enabled && effectiveLimit < acc.daily_limit
                  ? Math.ceil((acc.daily_limit - effectiveLimit) / acc.warmup_increment)
                  : 0;
                return (
                  <div key={acc.id} className="flex items-center gap-3 rounded-md border border-border p-2.5">
                    <span
                      className={cn(
                        "size-2 rounded-full shrink-0",
                        acc.health_status === "good"    ? "bg-green-500" :
                        acc.health_status === "warning" ? "bg-amber-500" :
                        acc.health_status === "bad"     ? "bg-red-500"   : "bg-muted-foreground/40",
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium truncate">{acc.label || acc.sender_email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {acc.warmup_enabled ? (
                          <>
                            <Progress value={warmupProgress} className="h-1 flex-1" />
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal shrink-0">
                              {effectiveLimit}/{acc.daily_limit}
                            </Badge>
                          </>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal gap-1">
                            <TrendingUp className="size-3" /> {acc.daily_limit}/Tag
                          </Badge>
                        )}
                      </div>
                      {acc.warmup_enabled && daysLeft > 0 && (
                        <span className="inline-block text-[10px] mt-1 text-orange-600">
                          Tag {acc.warmup_day} · {daysLeft}d bis Volllast
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

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
                placeholder="Kampagne, Absender, Ziel …"
                className="pl-9 h-8 text-[13px] bg-card"
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
                label="Ziel"
                value={goalFilter !== "all" ? goalFilter : null}
                onClear={() => setGoalFilter("all")}
                selectValue={goalFilter}
                onSelectChange={setGoalFilter}
                options={goalOptions}
              />
              <FilterTriggerPopover
                label="Absender:in"
                value={senderFilter !== "all" ? senderFilter : null}
                onClear={() => setSenderFilter("all")}
                selectValue={senderFilter}
                onSelectChange={setSenderFilter}
                options={senderOptions}
              />
              <FilterTriggerPopover
                label="Zeitraum"
                value={rangeFilter !== "all" ? (rangeOptions.find((o) => o.value === rangeFilter)?.label ?? rangeFilter) : null}
                onClear={() => setRangeFilter("all")}
                selectValue={rangeFilter}
                onSelectChange={setRangeFilter}
                options={rangeOptions}
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
                  {filteredCampaigns.length.toLocaleString("de-DE")}
                </b>{" "}
                Kampagnen
              </span>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium">
                <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                Export
              </Button>
            </div>
          </div>

          {/* ── Tabelle / Leerzustand / Loading ── */}
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <Empty className="py-20 border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Send />
                </EmptyMedia>
                <EmptyTitle>
                  {hasFilters ? "Keine Kampagnen gefunden" : "Noch keine Kampagnen"}
                </EmptyTitle>
                <EmptyDescription>
                  {hasFilters
                    ? "Passe die Filter an oder setze sie zurück."
                    : "Erstelle deine erste Cold-Email-Kampagne und starte mit dem Outreach."}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {hasFilters ? (
                  <Button variant="outline" size="sm" onClick={resetFilters}>
                    Filter zurücksetzen
                  </Button>
                ) : (
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Erste Kampagne erstellen
                  </Button>
                )}
              </EmptyContent>
            </Empty>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-card">
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5 text-[11.5px] uppercase tracking-wide w-10">
                        <Checkbox
                          checked={allVisibleSelected}
                          onCheckedChange={toggleAll}
                          aria-label="Alle auswählen"
                        />
                      </th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5 text-[11.5px] uppercase tracking-wide">Kampagne</th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5 text-[11.5px] uppercase tracking-wide w-28">Status</th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5 text-[11.5px] uppercase tracking-wide w-44">Versendet</th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5 text-[11.5px] uppercase tracking-wide w-28">Öffnungsrate</th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5 text-[11.5px] uppercase tracking-wide w-28">Antwortrate</th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5 text-[11.5px] uppercase tracking-wide w-28">Konvertiert</th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5 text-[11.5px] uppercase tracking-wide w-40">Letzte Aktivität</th>
                      <th className="w-28 pr-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCampaigns.map((c) => {
                      const audience = c.total_count || 0;
                      const sent     = c.sent_count  || 0;
                      const sentPct  = pct(sent, audience);
                      const openPct  = pct(c.open_count || 0, sent || 1);
                      const replyPct = pct(c.reply_count || 0, sent || 1);
                      const conv     = c.conversion_count ?? 0;
                      const convPct  = pct(conv, sent || 1);
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
                        <tr
                          key={c.id}
                          className={cn(
                            "border-b border-border last:border-b-0 cursor-pointer transition-colors hover:bg-muted/40",
                            isSelected && "bg-accent",
                          )}
                          onClick={() => router.push(`/dashboard/campaigns/${c.id}`)}
                        >
                          <td className="px-4 py-3.5 align-middle" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleOne(c.id)}
                              aria-label={`${c.name} auswählen`}
                            />
                          </td>
                          <td className="px-4 py-3.5 align-middle">
                            <div className="flex flex-col gap-0">
                              <div className="co-name">{c.name}</div>
                              <div className="cmp-meta-row">
                                {c.goal && <><span>{c.goal}</span><span className="sep" /></>}
                                <span>
                                  <Layers className="inline-block h-3 w-3 mr-1 -mt-0.5" strokeWidth={1.75} />
                                  {c.steps ?? 1} {(c.steps ?? 1) === 1 ? "Schritt" : "Schritte"}
                                </span>
                                <span className="sep" />
                                <span>
                                  <Users className="inline-block h-3 w-3 mr-1 -mt-0.5" strokeWidth={1.75} />
                                  {audience.toLocaleString("de-DE")} Empfänger
                                </span>
                                {c.error_message && (
                                  <>
                                    <span className="sep" />
                                    <span className="inline-flex items-center gap-1 text-destructive">
                                      <AlertTriangle className="h-3 w-3" strokeWidth={1.75} />
                                      Fehler
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 align-middle">
                            <StatusBadge status={c.status} />
                          </td>
                          <td className="px-4 py-3.5 align-middle">
                            {sent === 0 ? (
                              <span className="meta">—</span>
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
                          </td>
                          <td className="px-4 py-3.5 align-middle">
                            {sent === 0 ? <span className="meta">—</span> : <RateCell value={openPct} />}
                          </td>
                          <td className="px-4 py-3.5 align-middle">
                            {sent === 0 ? <span className="meta">—</span> : <RateCell value={replyPct} />}
                          </td>
                          <td className="px-4 py-3.5 align-middle">
                            {sent === 0 ? (
                              <span className="meta">—</span>
                            ) : (
                              <span style={{ fontWeight: 500 }}>
                                {conv}
                                <span className="meta" style={{ marginLeft: 4 }}>· {convPct}%</span>
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 align-middle">
                            <LastActivityCell when={lastWhen} kind={lastKind} />
                          </td>
                          <td className="px-3 py-3.5 align-middle text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex items-center gap-0.5">
                              {c.status === "active" ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  title="Pausieren"
                                  onClick={() => handleStatusChange(c.id, "paused")}
                                >
                                  <Pause className="h-4 w-4" strokeWidth={1.75} />
                                </Button>
                              ) : c.status === "paused" || c.status === "draft" ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  title="Starten"
                                  onClick={() => handleStatusChange(c.id, "active")}
                                >
                                  <Play className="h-4 w-4" strokeWidth={1.75} />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  title="Duplizieren"
                                >
                                  <Copy className="h-4 w-4" strokeWidth={1.75} />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                title="Bearbeiten"
                                onClick={() => router.push(`/dashboard/campaigns/${c.id}`)}
                              >
                                <Pencil className="h-4 w-4" strokeWidth={1.75} />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                    <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => router.push(`/dashboard/campaigns/${c.id}`)}>
                                    Details öffnen
                                  </DropdownMenuItem>
                                  <DropdownMenuItem>
                                    <Copy className="h-4 w-4 mr-2" /> Duplizieren
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => handleDelete(c.id)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" /> Löschen
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── Pagination ── */}
              <Separator />
              <div className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                <p className="text-sm text-muted-foreground whitespace-nowrap">
                  <span className="font-medium text-foreground">
                    {filteredCampaigns.length === 0
                      ? 0
                      : ((page - 1) * PAGE_SIZE + 1).toLocaleString("de-DE")}
                    –
                    {Math.min(page * PAGE_SIZE, filteredCampaigns.length).toLocaleString("de-DE")}
                  </span>{" "}
                  von{" "}
                  <span className="font-medium text-foreground">
                    {filteredCampaigns.length.toLocaleString("de-DE")}
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
          <Button variant="ghost" size="sm" className="h-7 px-2.5 text-background/85 hover:text-background hover:bg-background/10 text-[12.5px]">
            <Pause className="h-3 w-3 mr-1" /> Pausieren
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2.5 text-background/85 hover:text-background hover:bg-background/10 text-[12.5px]">
            <Play className="h-3 w-3 mr-1" /> Starten
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2.5 text-background/85 hover:text-background hover:bg-background/10 text-[12.5px]">
            <Copy className="h-3 w-3 mr-1" /> Duplizieren
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2.5 text-red-300 hover:text-red-200 hover:bg-red-500/20 text-[12.5px]">
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

      {/* ── Create Dialog ── */}
      <CampaignCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={fetchCampaigns}
      />
    </div>
  );
}
