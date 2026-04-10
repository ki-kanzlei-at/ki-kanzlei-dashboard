"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import type { SortingState, VisibilityState } from "@tanstack/react-table";
import { useReactTable, getCoreRowModel } from "@tanstack/react-table";
import {
  Search, Loader2, X, Linkedin, Rocket,
  AlertCircle, Settings,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Pagination, PaginationContent, PaginationEllipsis,
  PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { IndustryCombobox } from "@/components/leads/IndustryCombobox";

import { LinkedInSearchForm } from "@/components/linkedin/LinkedInSearchForm";
import { LinkedInLeadsTable } from "@/components/linkedin/LinkedInLeadsTable";
import { LinkedInViewOptions } from "@/components/linkedin/LinkedInViewOptions";

import type { LinkedInLead, LinkedInLeadStatus, LinkedInLeadStats } from "@/types/linkedin";

const PAGE_SIZE = 25;

const EMPTY_STATS: LinkedInLeadStats = {
  total: 0, new: 0, analyzed: 0, queued: 0,
  invited: 0, accepted: 0, messaged: 0, replied: 0,
  declined: 0, error: 0,
};

/* ── Status filter options ── */
const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all",       label: "Alle Status" },
  { value: "new",       label: "Neu" },
  { value: "analyzed",  label: "Analysiert" },
  { value: "queued",    label: "Warteschlange" },
  { value: "invited",   label: "Eingeladen" },
  { value: "accepted",  label: "Akzeptiert" },
  { value: "messaged",  label: "Nachricht" },
  { value: "replied",   label: "Antwort" },
  { value: "declined",  label: "Kein Interesse" },
  { value: "error",     label: "Fehler" },
];

/* ── Pagination helpers ── */
function buildPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}

interface AccountInfo {
  name: string;
  type: "classic" | "premium" | "sales_navigator";
  profilePictureUrl?: string | null;
  headline?: string | null;
  status?: string;
}

export default function LinkedInPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<LinkedInLeadStats>(EMPTY_STATS);
  const [leads, setLeads] = useState<LinkedInLead[]>([]);
  const [totalLeads, setTotalLeads] = useState(0);
  const [page, setPage] = useState(1);

  // Filters
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterIndustry, setFilterIndustry] = useState<string[]>([]);
  const [filterLocation, setFilterLocation] = useState<string[]>([]);

  // Sorting & Column Visibility (driven by tanstack table)
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  // Dynamic filter options
  const [industryOptions, setIndustryOptions] = useState<{ value: string; label: string }[]>([]);
  const [locationOptions, setLocationOptions] = useState<{ value: string; label: string }[]>([]);

  // Unipile config state
  const [unipileConfigured, setUnipileConfigured] = useState<boolean | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);

  // Outreach state
  const [sendingOutreach, setSendingOutreach] = useState(false);
  const [sendingFollowUps, setSendingFollowUps] = useState(false);

  const totalPages = Math.max(1, Math.ceil(totalLeads / PAGE_SIZE));
  const pageNumbers = buildPageNumbers(page, totalPages);

  const hasActiveFilters = filterSearch || filterStatus !== "all" || filterIndustry.length > 0 || filterLocation.length > 0 || sorting.length > 0;

  function resetFilters() {
    setFilterSearch("");
    setFilterStatus("all");
    setFilterIndustry([]);
    setFilterLocation([]);
    setSorting([]);
    setPage(1);
  }

  // Map tanstack column IDs to DB column names
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

  // Derive sort params from tanstack sorting state
  const sortBy = sorting.length > 0 ? (SORT_COLUMN_MAP[sorting[0].id] ?? sorting[0].id) : undefined;
  const sortDir = sorting.length > 0 ? (sorting[0].desc ? "desc" : "asc") : undefined;

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/linkedin/stats");
      if (res.ok) {
        const json = await res.json();
        setStats(json.data ?? EMPTY_STATS);
      }
    } catch {
      // silently fail
    }
  }, []);

  const loadLeads = useCallback(async (p?: number) => {
    const currentPage = p ?? page;
    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("pageSize", String(PAGE_SIZE));
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
    } catch {
      // silently fail
    }
  }, [page, filterStatus, filterSearch, filterIndustry, filterLocation, sortBy, sortDir]);

  const loadFilters = useCallback(async () => {
    try {
      const res = await fetch("/api/linkedin/filters");
      if (res.ok) {
        const json = await res.json();
        const { industries, locations } = json.data ?? {};
        if (industries) {
          setIndustryOptions(industries.map((v: string) => ({ value: v, label: v })));
        }
        if (locations) {
          setLocationOptions(locations.map((v: string) => ({ value: v, label: v })));
        }
      }
    } catch {
      // silently fail
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadStats(), loadLeads(), loadFilters()]);
    setLoading(false);
  }, [loadStats, loadLeads, loadFilters]);

  // Check if Unipile is configured + get account info (fast, then profile pic in bg)
  useEffect(() => {
    async function checkConfig() {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const json = await res.json();
          const d = json.data ?? {};
          const configured = !!(d.unipile_dsn?.trim() && d.unipile_api_key?.trim() && d.unipile_account_id?.trim());
          setUnipileConfigured(configured);

          if (configured) {
            try {
              const accRes = await fetch("/api/linkedin/accounts");
              if (accRes.ok) {
                const accJson = await accRes.json();
                const accounts = accJson.data ?? [];
                const match = d.unipile_account_id
                  ? accounts.find((a: { id: string }) => a.id === d.unipile_account_id)
                  : accounts[0];
                if (match) {
                  // Show account info immediately (no profile picture yet)
                  setAccountInfo({
                    name: match.name,
                    type: match.type,
                    profilePictureUrl: null,
                    headline: null,
                    status: match.status,
                  });
                  setAccountLoading(false);

                  // Fetch profile picture in background
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
                  return;
                }
              }
            } catch { /* silent */ }
          }
        }
      } catch {
        setUnipileConfigured(false);
      }
      setAccountLoading(false);
    }
    checkConfig();
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Re-fetch when dropdown filters or sorting change (reset to page 1)
  useEffect(() => {
    if (!loading) {
      setPage(1);
      loadLeads(1);
      loadFilters();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterIndustry, filterLocation, sorting]);

  // Debounced text search (500ms, min 2 chars or empty)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (filterSearch.length === 1) return;

    debounceRef.current = setTimeout(() => {
      setPage(1);
      loadLeads(1);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSearch]);

  function handlePageChange(newPage: number) {
    setPage(newPage);
    loadLeads(newPage);
  }

  async function handleSendOutreach() {
    setSendingOutreach(true);
    try {
      const res = await fetch("/api/linkedin/send-invitations", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Outreach fehlgeschlagen");
        return;
      }
      const { sent, errors } = json.data;
      if (sent > 0) {
        toast.success(`${sent} Einladung(en) gesendet`);
      } else {
        toast.info("Keine Leads in der Warteschlange");
      }
      if (errors?.length > 0) {
        toast.warning(`${errors.length} Fehler aufgetreten`);
      }
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
      if (!res.ok) {
        toast.error(json.error || "Follow-Ups fehlgeschlagen");
        return;
      }
      const { sent } = json.data;
      if (sent > 0) {
        toast.success(`${sent} Follow-Up(s) gesendet`);
      } else {
        toast.info("Keine Follow-Ups fällig");
      }
      loadAll();
    } catch {
      toast.error("Netzwerkfehler");
    } finally {
      setSendingFollowUps(false);
    }
  }

  /* ── Dummy table instance for toolbar (column visibility toggle) ── */
  const dummyColumns = useMemo(() => {
    // Minimal column defs just for visibility toggling
    return [
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
    ] as any[];
  }, []);

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
    getRowId: (row: any) => row.id,
  });

  const accountTypeLabel = accountInfo?.type === "sales_navigator" ? "Sales Navigator"
    : accountInfo?.type === "premium" ? "Premium" : "Classic";

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">

      {/* ── Page Header ── */}
      <div className="px-4 lg:px-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight">
              LinkedIn Outreach
            </h1>
            <p className="text-sm text-muted-foreground">
              Suche LinkedIn-Profile, analysiere sie mit KI und starte automatisiertes Outreach.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Action buttons */}
            {stats.queued > 0 && (
              <Button
                onClick={handleSendOutreach}
                disabled={sendingOutreach}
                className="h-10 gap-2"
              >
                {sendingOutreach ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4" />
                )}
                Outreach starten
                <Badge variant="secondary" className="ml-1 text-[10px]">
                  {stats.queued}
                </Badge>
              </Button>
            )}
            {stats.accepted > 0 && (
              <Button
                variant="outline"
                onClick={handleSendFollowUps}
                disabled={sendingFollowUps}
                className="h-10 gap-2"
              >
                {sendingFollowUps ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Linkedin className="h-4 w-4" />
                )}
                Follow-Ups
              </Button>
            )}

            {/* Profile Avatar */}
            {accountLoading ? (
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ) : accountInfo ? (
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Avatar className="h-10 w-10 shadow-md ring-2 ring-background">
                    {accountInfo.profilePictureUrl && (
                      <AvatarImage src={accountInfo.profilePictureUrl} alt={accountInfo.name} />
                    )}
                    <AvatarFallback className="text-xs font-semibold bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
                      {accountInfo.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-background" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight truncate">{accountInfo.name}</p>
                  <span className="text-[11px] text-muted-foreground">{accountTypeLabel}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Unipile Warning ── */}
      {unipileConfigured === false && (
        <div className="px-4 lg:px-6">
          <Alert className="bg-amber-50 border-amber-200">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-sm text-amber-700 flex items-center justify-between">
              <span>
                Unipile ist nicht konfiguriert. Bitte richte die LinkedIn-Integration in den{" "}
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
        </div>
      )}

      {/* ── Search Section ── */}
      {unipileConfigured && (
        <div className="px-4 lg:px-6">
          <LinkedInSearchForm onImported={loadAll} />
        </div>
      )}

      {/* ── Leads Table ── */}
      <div className="px-4 lg:px-6">
        <div className="rounded-lg border bg-card overflow-hidden">

          {/* Toolbar */}
          <div className="px-4 py-3 border-b bg-muted/20">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Text search */}
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                <input
                  type="text"
                  placeholder="Suche (Name, Firma, Ort)"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                />
              </div>

              {/* Status */}
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-9 w-44 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Industry */}
              <div className="w-52">
                <IndustryCombobox
                  value={filterIndustry}
                  onChange={setFilterIndustry}
                  placeholder="Branche filtern"
                  options={industryOptions.length > 0 ? industryOptions : undefined}
                />
              </div>

              {/* Location */}
              {locationOptions.length > 0 && (
                <div className="w-52">
                  <IndustryCombobox
                    value={filterLocation}
                    onChange={setFilterLocation}
                    placeholder="Standort filtern"
                    options={locationOptions}
                  />
                </div>
              )}

              {/* Column Visibility */}
              <LinkedInViewOptions table={toolbarTable} />

              {/* Reset */}
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  onClick={resetFilters}
                >
                  <X className="h-4 w-4" />
                  Zurücksetzen
                </Button>
              )}
            </div>
          </div>

          {/* Count bar */}
          <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {totalLeads.toLocaleString("de-DE")} Einträge gesamt
              {hasActiveFilters && (
                <span className="ml-1 text-primary">(gefiltert)</span>
              )}
            </p>
          </div>

          {/* Table */}
          <LinkedInLeadsTable
            leads={leads}
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
              <div className="px-4 py-3 flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground whitespace-nowrap">
                  Seite {page} von {totalPages} ({totalLeads} Leads)
                </p>
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
