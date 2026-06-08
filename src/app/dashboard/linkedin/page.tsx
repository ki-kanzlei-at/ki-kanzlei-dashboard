"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import type { SortingState, VisibilityState } from "@tanstack/react-table";
import { useReactTable, getCoreRowModel } from "@tanstack/react-table";
import {
  Search, Loader2, X, Linkedin, Rocket, RefreshCw, ExternalLink,
  AlertCircle, Settings, Plus, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Pagination, PaginationContent, PaginationEllipsis,
  PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command";

import { LinkedInSearchForm } from "@/components/linkedin/LinkedInSearchForm";
import { LinkedInLeadsTable } from "@/components/linkedin/LinkedInLeadsTable";
import { LinkedInViewOptions } from "@/components/linkedin/LinkedInViewOptions";

import type { LinkedInLeadStats } from "@/types/linkedin";

const PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

const EMPTY_STATS: LinkedInLeadStats = {
  total: 0, new: 0, analyzed: 0, queued: 0,
  invited: 0, accepted: 0, messaged: 0, replied: 0,
  declined: 0, error: 0,
};

/* ── Status-Tabs (gruppiert für Tab-Counts, Filterung sucht exakten Status) ── */
type StatusTabValue =
  | "all" | "new" | "queued" | "invited" | "accepted"
  | "messaged" | "replied" | "declined";

const STATUS_TABS: { value: StatusTabValue; label: string }[] = [
  { value: "all",      label: "Alle" },
  { value: "new",      label: "Neu" },
  { value: "queued",   label: "Warteschlange" },
  { value: "invited",  label: "Eingeladen" },
  { value: "accepted", label: "Verbunden" },
  { value: "messaged", label: "Nachricht" },
  { value: "replied",  label: "Antwort" },
  { value: "declined", label: "Kein Interesse" },
];

/* ── Pagination helper (identisch zu Leads v3) ── */
function buildPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}

/* ── Filter-Trigger (dashed border wenn leer, solid bei Wert) ── */
type FilterTriggerPopoverProps =
  | {
      label: string;
      value: string | null;
      onClear: () => void;
      multi: true;
      selectValue: string[];
      onSelectChange: (value: string[]) => void;
      options: { value: string; label: string }[];
      searchPlaceholder: string;
      emptyText: string;
    }
  | {
      label: string;
      value: string | null;
      onClear: () => void;
      multi?: false;
      selectValue: string;
      onSelectChange: (value: string) => void;
      options: { value: string; label: string }[];
      searchPlaceholder: string;
      emptyText: string;
    };

function FilterTriggerPopover(props: FilterTriggerPopoverProps) {
  const { label, value, onClear, options, searchPlaceholder, emptyText } = props;
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
      <PopoverContent
        className="w-[260px] p-0"
        align="start"
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} className="h-9 text-[13px]" />
          <CommandList className="max-h-[260px] overflow-y-auto overscroll-contain">
            <CommandEmpty className="py-4 text-center text-[12px] text-muted-foreground">
              {emptyText}
            </CommandEmpty>
            {options.map((opt) => {
              const selected = props.multi
                ? props.selectValue.includes(opt.value)
                : props.selectValue === opt.value;
              return (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    if (props.multi) {
                      props.onSelectChange(
                        selected
                          ? props.selectValue.filter((v) => v !== opt.value)
                          : [...props.selectValue, opt.value],
                      );
                    } else {
                      props.onSelectChange(opt.value);
                    }
                  }}
                  className="text-[13px] cursor-pointer"
                >
                  <Check className={cn("mr-2 h-3.5 w-3.5", selected ? "opacity-100" : "opacity-0")} />
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

interface AccountInfo {
  name: string;
  type: "classic" | "premium" | "sales_navigator";
  profilePictureUrl?: string | null;
  headline?: string | null;
  status?: string;
}

/* ── Tägliche Sicherheits-Limits je Account-Typ (LinkedIn-Outreach) ──
 * Klassische Accounts: konservative Quoten, Sales Navigator höher. Wird nur
 * als Anhaltspunkt visualisiert — Limits werden serverseitig hart erzwungen. */
const DAILY_LIMITS: Record<
  AccountInfo["type"],
  { invitations: number; messages: number }
> = {
  classic:         { invitations: 20, messages: 50 },
  premium:         { invitations: 20, messages: 50 },
  sales_navigator: { invitations: 50, messages: 100 },
};

export default function LinkedInPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<LinkedInLeadStats>(EMPTY_STATS);
  const [leads, setLeads] = useState<unknown[]>([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE);

  // Filters
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<StatusTabValue>("all");
  const [filterIndustry, setFilterIndustry] = useState<string[]>([]);
  const [filterLocation, setFilterLocation] = useState<string[]>([]);

  // Sorting & Column Visibility
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  // Dynamic filter options
  const [industryOptions, setIndustryOptions] = useState<{ value: string; label: string }[]>([]);
  const [locationOptions, setLocationOptions] = useState<{ value: string; label: string }[]>([]);

  // LinkedIn integration config + Account
  const [integrationConfigured, setIntegrationConfigured] = useState<boolean | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Outreach actions
  const [sendingOutreach, setSendingOutreach] = useState(false);
  const [sendingFollowUps, setSendingFollowUps] = useState(false);

  const totalPages = Math.max(1, Math.ceil(totalLeads / pageSize));
  const pageNumbers = buildPageNumbers(page, totalPages);

  const hasActiveFilters =
    !!filterSearch ||
    filterStatus !== "all" ||
    filterIndustry.length > 0 ||
    filterLocation.length > 0 ||
    sorting.length > 0;

  function resetFilters() {
    setFilterSearch("");
    setFilterStatus("all");
    setFilterIndustry([]);
    setFilterLocation([]);
    setSorting([]);
    setPage(1);
  }

  const SORT_COLUMN_MAP: Record<string, string> = {
    name: "full_name",
    status: "status",
    company: "company",
    position: "position",
    industry: "industry",
    location: "location",
    ai_score: "ai_score",
    created_at: "created_at",
  };

  const sortBy = sorting.length > 0 ? (SORT_COLUMN_MAP[sorting[0].id] ?? sorting[0].id) : undefined;
  const sortDir = sorting.length > 0 ? (sorting[0].desc ? "desc" : "asc") : undefined;

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/linkedin/stats");
      if (res.ok) {
        const json = await res.json();
        setStats(json.data ?? EMPTY_STATS);
      }
    } catch { /* silent */ }
  }, []);

  const loadLeads = useCallback(async (p?: number) => {
    const currentPage = p ?? page;
    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("pageSize", String(pageSize));
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterSearch.trim()) params.set("search", filterSearch.trim());
      if (filterIndustry.length > 0) params.set("industry", filterIndustry.join(","));
      if (filterLocation.length > 0) params.set("location", filterLocation.join(","));
      if (sortBy) params.set("sort_by", sortBy);
      if (sortDir) params.set("sort_dir", sortDir);

      const res = await fetch(`/api/linkedin/leads?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        const result = json.data;
        setLeads(result.data ?? []);
        setTotalLeads(result.count ?? 0);
      }
    } catch { /* silent */ }
  }, [page, pageSize, filterStatus, filterSearch, filterIndustry, filterLocation, sortBy, sortDir]);

  const loadFilters = useCallback(async () => {
    try {
      const res = await fetch("/api/linkedin/filters");
      if (res.ok) {
        const json = await res.json();
        const { industries, locations } = json.data ?? {};
        if (industries) setIndustryOptions(industries.map((v: string) => ({ value: v, label: v })));
        if (locations)  setLocationOptions(locations.map((v: string) => ({ value: v, label: v })));
      }
    } catch { /* silent */ }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadStats(), loadLeads(), loadFilters()]);
    setLoading(false);
  }, [loadStats, loadLeads, loadFilters]);

  /* ── Account-Info laden (schnell, dann Profil-Pic im Hintergrund) ── */
  const loadAccount = useCallback(async () => {
    setAccountLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) { setIntegrationConfigured(false); setAccountLoading(false); return; }
      const json = await res.json();
      const d = json.data ?? {};
      const configured = !!(d.connectsafely_api_key?.trim() && d.connectsafely_account_id?.trim());
      setIntegrationConfigured(configured);
      if (!configured) { setAccountLoading(false); return; }

      const accRes = await fetch("/api/linkedin/accounts");
      if (!accRes.ok) { setAccountLoading(false); return; }
      const accJson = await accRes.json();
      const accounts = accJson.data ?? [];
      const savedAccountId = d.connectsafely_account_id ?? d.unipile_account_id;
      const match = savedAccountId
        ? accounts.find((a: { id: string }) => a.id === savedAccountId)
        : accounts[0];
      if (!match) { setAccountLoading(false); return; }

      setAccountInfo({
        name: match.name,
        type: match.type,
        profilePictureUrl: null,
        headline: null,
        status: match.status,
      });
      setAccountLoading(false);

      if (match.publicIdentifier) {
        fetch("/api/linkedin/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: match.publicIdentifier }),
        })
          .then((r) => r.ok ? r.json() : null)
          .then((j) => {
            if (j?.data) {
              setAccountInfo((prev) => prev ? {
                ...prev,
                profilePictureUrl: j.data.profile_picture_url ?? null,
                headline: j.data.headline ?? null,
              } : prev);
            }
          })
          .catch(() => { /* silent */ });
      }
    } catch {
      setIntegrationConfigured(false);
      setAccountLoading(false);
    }
  }, []);

  useEffect(() => { loadAccount(); }, [loadAccount]);
  useEffect(() => { loadAll(); }, [loadAll]);

  /* ── Re-fetch bei Filter/Sort Änderungen (auf Seite 1 zurück) ── */
  useEffect(() => {
    if (!loading) {
      setPage(1);
      loadLeads(1);
      loadFilters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterIndustry, filterLocation, sorting]);

  /* ── Debounced Text-Suche ── */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (filterSearch.length === 1) return;
    debounceRef.current = setTimeout(() => {
      setPage(1);
      loadLeads(1);
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSearch]);

  function handlePageChange(newPage: number) {
    setPage(newPage);
    loadLeads(newPage);
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await loadAccount();
      await loadStats();
      toast.success("LinkedIn-Profil synchronisiert");
    } finally {
      setSyncing(false);
    }
  }

  async function handleSendOutreach() {
    setSendingOutreach(true);
    try {
      const res = await fetch("/api/linkedin/send-invitations", { method: "POST" });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || "Outreach fehlgeschlagen"); return; }
      const { sent, errors } = json.data;
      if (sent > 0) toast.success(`${sent} Einladung(en) gesendet`);
      else toast.info("Keine Leads in der Warteschlange");
      if (errors?.length > 0) toast.warning(`${errors.length} Fehler aufgetreten`);
      loadAll();
    } catch {
      toast.error("Netzwerkfehler");
    } finally {
      setSendingOutreach(false);
    }
  }

  async function handleSendFollowUps() {
    setSendingFollowUps(true);
    try {
      const res = await fetch("/api/linkedin/send-followups", { method: "POST" });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || "Follow-Ups fehlgeschlagen"); return; }
      const { sent } = json.data;
      if (sent > 0) toast.success(`${sent} Follow-Up(s) gesendet`);
      else toast.info("Keine Follow-Ups fällig");
      loadAll();
    } catch {
      toast.error("Netzwerkfehler");
    } finally {
      setSendingFollowUps(false);
    }
  }

  /* ── Dummy Tabelle für Toolbar View-Options ── */
  const dummyColumns = useMemo(() => [
    { id: "select", enableHiding: false, header: () => null, cell: () => null, size: 40 },
    { accessorKey: "status", id: "status", header: () => "Status", cell: () => null, size: 130 },
    { accessorKey: "full_name", id: "name", header: () => "Name", cell: () => null, enableHiding: false, size: 180 },
    { accessorKey: "company", id: "company", header: () => "Firma", cell: () => null, size: 180 },
    { accessorKey: "position", id: "position", header: () => "Position", cell: () => null, size: 160 },
    { accessorKey: "industry", id: "industry", header: () => "Branche", cell: () => null, size: 130 },
    { accessorKey: "location", id: "location", header: () => "Standort", cell: () => null, size: 130 },
    { accessorKey: "ai_score", id: "ai_score", header: () => "Score", cell: () => null, size: 80 },
    { accessorKey: "created_at", id: "created_at", header: () => "Erstellt", cell: () => null, size: 110 },
    { id: "actions", enableHiding: false, header: () => null, cell: () => null, size: 48 },
  ] as unknown as Parameters<typeof useReactTable>[0]["columns"], []);

  const toolbarTable = useReactTable({
    data: leads,
    columns: dummyColumns,
    state: { sorting, columnVisibility },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      setSorting(next);
    },
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnVisibility) : updater;
      setColumnVisibility(next);
    },
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    getRowId: (row) => (row as { id: string }).id,
  });

  const accountTypeLabel = accountInfo?.type === "sales_navigator" ? "Sales Navigator"
    : accountInfo?.type === "premium" ? "Premium" : "Classic";

  /* ── Limits-Strip Werte aus Stats ableiten ── */
  const accountLimits = DAILY_LIMITS[accountInfo?.type ?? "classic"];
  const invitedTotal  = stats.invited;
  const acceptedTotal = stats.accepted;
  const messagedTotal = stats.messaged;
  const repliedTotal  = stats.replied;

  // Annäherung: pending Einladungen = eingeladen, aber noch nicht akzeptiert / abgelehnt
  const pendingInvitations = Math.max(0, invitedTotal - acceptedTotal - stats.declined);
  const invitationsPct = Math.min(100, Math.round((pendingInvitations / accountLimits.invitations) * 100));

  // Wartende Follow-Ups (akzeptiert, aber noch keine Nachricht)
  const pendingFollowUps = Math.max(0, acceptedTotal - messagedTotal);
  const messagesPct = Math.min(100, Math.round((pendingFollowUps / accountLimits.messages) * 100));

  // Response-Rate
  const responseRate = messagedTotal > 0 ? Math.round((repliedTotal / messagedTotal) * 100) : 0;

  const initialsFromName = (name?: string) =>
    name ? name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "?";

  return (
    <div className="leads-v3 flex flex-col gap-4 py-4 md:gap-6 md:py-6">

      {/* ── Page Header ───────────────────────────────────────────────── */}
      <div className="px-4 lg:px-6 space-y-4">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-[24px] font-semibold tracking-tight leading-tight">LinkedIn</h1>
            <p className="text-[13.5px] text-muted-foreground max-w-xl">
              Verbindungen, Nachrichten und Outreach für dein LinkedIn-Profil.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {stats.queued > 0 && (
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs font-medium"
                onClick={handleSendOutreach}
                disabled={sendingOutreach}
              >
                {sendingOutreach
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Rocket className="h-3.5 w-3.5" strokeWidth={1.75} />}
                Outreach starten
                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-primary-foreground/20 text-[10px] font-semibold">
                  {stats.queued}
                </span>
              </Button>
            )}
            {stats.accepted > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs font-medium"
                onClick={handleSendFollowUps}
                disabled={sendingFollowUps}
              >
                {sendingFollowUps
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Linkedin className="h-3.5 w-3.5" strokeWidth={1.75} />}
                Follow-Ups
              </Button>
            )}
          </div>
        </div>

        {/* ── Connected Profile Card ─────────────────────────────────── */}
        {accountLoading ? (
          <div className="li-profile-card">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-72" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
        ) : accountInfo ? (
          <div className="li-profile-card">
            <div className="li-profile-avatar">
              {accountInfo.profilePictureUrl
                ? <img src={accountInfo.profilePictureUrl} alt={accountInfo.name} />
                : initialsFromName(accountInfo.name)}
            </div>
            <div className="li-profile-info">
              <div className="li-profile-name">
                {accountInfo.name}
                <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[10px] font-semibold bg-[#0A66C2] text-white tracking-wide">
                  in
                </span>
              </div>
              {accountInfo.headline && (
                <div className="li-profile-headline">{accountInfo.headline}</div>
              )}
              <div className="li-profile-meta">
                <span className="item"><b>LinkedIn</b> verbunden</span>
                <span className="sep" />
                <span className="item">{accountTypeLabel}</span>
                <span className="sep" />
                <span className="item"><b>{stats.total.toLocaleString("de-DE")}</b> Leads</span>
                <span className="sep" />
                <span className="item"><b>{stats.invited.toLocaleString("de-DE")}</b> in Outreach</span>
              </div>
            </div>
            <div className="li-profile-actions">
              <span className="li-connect-badge">
                <span className="dot" />
                {accountInfo.status === "OK" || accountInfo.status === "CREDENTIALS"
                  ? "Aktiv"
                  : (accountInfo.status ?? "Aktiv")}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs font-medium"
                onClick={handleSync}
                disabled={syncing}
              >
                {syncing
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <RefreshCw className="h-3 w-3" strokeWidth={1.75} />}
                Sync
              </Button>
              <a href="https://www.linkedin.com" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium">
                  <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
                  Profil ansehen
                </Button>
              </a>
            </div>
          </div>
        ) : null}

        {/* ── Limits / Pipeline-Strip ─────────────────────────────────── */}
        {accountInfo && (
          <div className="li-limits">
            <div className="li-limit-card">
              <div className="li-limit-head">
                <div className="li-limit-title">Einladungen offen</div>
                <span className="li-limit-sub">Tageslimit {accountLimits.invitations}</span>
              </div>
              <div className="li-limit-bar">
                <div
                  className={cn(
                    "li-limit-bar-fill",
                    invitationsPct >= 80 && "is-near",
                  )}
                  style={{ width: `${Math.min(100, Math.max(2, invitationsPct))}%` }}
                />
              </div>
              <div className="li-limit-meta">
                <span><b>{pendingInvitations}</b> ausstehend</span>
                <span>{Math.max(0, accountLimits.invitations - pendingInvitations)} verfügbar</span>
              </div>
            </div>

            <div className="li-limit-card">
              <div className="li-limit-head">
                <div className="li-limit-title">Follow-Ups bereit</div>
                <span className="li-limit-sub">Tageslimit {accountLimits.messages}</span>
              </div>
              <div className="li-limit-bar">
                <div
                  className={cn(
                    "li-limit-bar-fill",
                    messagesPct >= 80 && "is-near",
                  )}
                  style={{ width: `${Math.min(100, Math.max(2, messagesPct))}%` }}
                />
              </div>
              <div className="li-limit-meta">
                <span><b>{pendingFollowUps}</b> wartend</span>
                <span>{messagedTotal} versendet</span>
              </div>
            </div>

            <div className="li-limit-card">
              <div className="li-limit-head">
                <div className="li-limit-title">Antwortrate</div>
                <span className="li-limit-sub">{repliedTotal} Antworten</span>
              </div>
              <div className="li-limit-bar">
                <div
                  className={cn(
                    "li-limit-bar-fill",
                    responseRate >= 25 && "is-success",
                  )}
                  style={{ width: `${Math.min(100, Math.max(2, responseRate))}%` }}
                />
              </div>
              <div className="li-limit-meta">
                <span><b>{responseRate}%</b> Antworten</span>
                <span>{messagedTotal} kontaktiert</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Unipile Warnung ─────────────────────────────────────────── */}
        {integrationConfigured === false && (
          <Alert className="bg-amber-50 border-amber-200">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-sm text-amber-700 flex items-center justify-between">
              <span>
                LinkedIn-Integration ist nicht konfiguriert. Bitte richte sie in den{" "}
                <a href="/dashboard/settings" className="font-medium underline">Einstellungen</a> ein.
              </span>
              <a href="/dashboard/settings">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                  <Settings className="h-3 w-3" />
                  Einstellungen
                </Button>
              </a>
            </AlertDescription>
          </Alert>
        )}

        {/* ── Suche / Import-Form ────────────────────────────────────── */}
        {integrationConfigured && (
          <LinkedInSearchForm onImported={loadAll} />
        )}
      </div>

      {/* ── Status-Tabs (line variant) ─────────────────────────────────── */}
      <Tabs
        value={filterStatus}
        onValueChange={(v) => setFilterStatus(v as StatusTabValue)}
        className="space-y-0 px-4 lg:px-6"
      >
        <TabsList variant="line" className="border-b border-border w-full justify-start">
          {STATUS_TABS.map((tab) => {
            const count = tab.value === "all"
              ? stats.total
              : (stats[tab.value as keyof LinkedInLeadStats] ?? 0);
            return (
              <TabsTrigger key={tab.value} value={tab.value} className="gap-2 text-[13px]">
                {tab.label}
                {count > 0 && (
                  <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium data-[state=active]:text-primary">
                    {count.toLocaleString("de-DE")}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* ── Card-wrapped Toolbar + Table ───────────────────────────────── */}
      <div className="px-4 lg:px-6">
        <div className="rounded-b-[var(--radius)] border border-t-0 border-border bg-card overflow-hidden">

          {/* Toolbar v3 — Single row: Search + filter triggers + view options */}
          <div className="px-4 py-3 border-b border-border flex items-center gap-2.5 flex-wrap bg-card">
            <div className="relative w-72">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none"
                strokeWidth={1.75}
              />
              <Input
                placeholder="Name, Firma, Position …"
                className="pl-9 h-8 text-[13px] bg-card"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
              />
              {filterSearch && (
                <button
                  onClick={() => setFilterSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-grid place-items-center h-5 w-5 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Suche löschen"
                >
                  <X className="h-3 w-3" strokeWidth={1.75} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {industryOptions.length > 0 && (
                <FilterTriggerPopover
                  label="Branche"
                  value={
                    filterIndustry.length > 0
                      ? filterIndustry.length === 1
                        ? filterIndustry[0]
                        : `${filterIndustry.length} ausgewählt`
                      : null
                  }
                  onClear={() => setFilterIndustry([])}
                  multi
                  selectValue={filterIndustry}
                  onSelectChange={setFilterIndustry}
                  options={industryOptions}
                  searchPlaceholder="Branche suchen…"
                  emptyText="Keine Branche gefunden"
                />
              )}

              {locationOptions.length > 0 && (
                <FilterTriggerPopover
                  label="Standort"
                  value={
                    filterLocation.length > 0
                      ? filterLocation.length === 1
                        ? filterLocation[0]
                        : `${filterLocation.length} ausgewählt`
                      : null
                  }
                  onClear={() => setFilterLocation([])}
                  multi
                  selectValue={filterLocation}
                  onSelectChange={setFilterLocation}
                  options={locationOptions}
                  searchPlaceholder="Standort suchen…"
                  emptyText="Kein Standort gefunden"
                />
              )}

              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 h-8 px-2 text-[12px] text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
                >
                  <X className="h-3 w-3" strokeWidth={1.75} />
                  Zurücksetzen
                </button>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              {!loading && (
                <span className="text-[12.5px] text-muted-foreground">
                  <b className="text-foreground font-semibold">{totalLeads.toLocaleString("de-DE")}</b> Kontakte
                </span>
              )}
              <LinkedInViewOptions table={toolbarTable} />
            </div>
          </div>

          {/* Table */}
          <LinkedInLeadsTable
            leads={leads as never}
            totalCount={totalLeads}
            loading={loading}
            onRefresh={loadAll}
            sorting={sorting}
            onSortingChange={setSorting}
            columnVisibility={columnVisibility}
            onColumnVisibilityChange={setColumnVisibility}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <>
              <Separator />
              <div className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">Pro Seite</span>
                    <Select
                      value={String(pageSize)}
                      onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
                    >
                      <SelectTrigger className="h-8 w-[78px] text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZE_OPTIONS.map((n) => (
                          <SelectItem key={n} value={String(n)} className="text-sm">{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-nowrap">
                    {((page - 1) * pageSize + 1).toLocaleString("de-DE")}
                    –
                    {Math.min(page * pageSize, totalLeads).toLocaleString("de-DE")}
                    {" "}von{" "}
                    <span className="font-medium text-foreground">{totalLeads.toLocaleString("de-DE")}</span>
                  </p>
                </div>

                <Pagination className="mx-0 w-auto justify-end">
                  <PaginationContent className="gap-1">
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => { e.preventDefault(); if (page > 1) handlePageChange(page - 1); }}
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
                            onClick={(e) => { e.preventDefault(); handlePageChange(p as number); }}
                          >
                            {p}
                          </PaginationLink>
                        </PaginationItem>
                      ),
                    )}

                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => { e.preventDefault(); if (page < totalPages) handlePageChange(page + 1); }}
                        className={page >= totalPages ? "pointer-events-none opacity-40" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
