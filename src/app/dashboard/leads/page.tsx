"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import type { SortingState, VisibilityState } from "@tanstack/react-table";
import {
  Search,
  Plus,
  Upload,
  InboxIcon,
  X,
  SlidersHorizontal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Input } from "@/components/ui/input";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";

import { LeadsTable } from "@/components/leads/LeadsTable";
import { createColumns, LEAD_STATUS_CONFIG } from "@/components/leads/columns";
import { DataTableViewOptions } from "@/components/leads/DataTableViewOptions";
import { LeadSelectionBar } from "@/components/leads/LeadSelectionBar";
import { LeadEditSheet } from "@/components/leads/LeadEditSheet";
import { LeadDeleteDialog } from "@/components/leads/LeadDeleteDialog";
import { SearchJobsList } from "@/components/leads/SearchJobsList";
import { LeadSearchForm } from "@/components/leads/LeadSearchForm";
import { LeadImportDialog } from "@/components/leads/LeadImportDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SearchFormValues, SearchSource } from "@/components/leads/LeadSearchForm";

import type { Lead, LeadStatus, SearchJob } from "@/types/leads";
import { INDUSTRY_OPTIONS, COMPANY_TYPE_OPTIONS } from "@/types/leads";
import { AT_BUNDESLAENDER } from "@/lib/bundesland";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

// We need a ref to the table instance for the DataTableViewOptions
import { useReactTable, getCoreRowModel } from "@tanstack/react-table";

const PAGE_SIZE = 100;
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 500] as const;

/* ── Persistenter Filter-State über localStorage ──
 * Speichert Filter, Tab, Page-Size pro Browser, damit beim Reload nichts verloren geht.
 * v1-Key damit zukünftige Struktur-Änderungen einen sauberen Reset zulassen. */
const PERSIST_KEY = "ki-kanzlei:leads:state:v1";

interface PersistedLeadsState {
  search?: string;
  status?: string;
  industries?: string[];
  legalForms?: string[];
  cities?: string[];
  states?: string[];
  country?: string;
  presence?: string[];
  pageSize?: number | null;
  activeTab?: string;
}

function loadPersistedLeadsState(): PersistedLeadsState {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    return raw ? (JSON.parse(raw) as PersistedLeadsState) : {};
  } catch { return {}; }
}

/* ── Filter-Trigger (Leads v3) — Dashed Border wenn leer, Solid wenn aktiv ── */
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
        <button
          type="button"
          className={cn("filter-trigger", hasValue && "has-value")}
        >
          {!hasValue && <Plus className="h-3 w-3" strokeWidth={1.75} />}
          <span className="lbl">{label}</span>
          {hasValue && <span className="val">{value}</span>}
          {hasValue && (
            <span
              role="button"
              tabIndex={0}
              aria-label={`${label} entfernen`}
              className="x-btn"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onClear();
                }
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
            <CommandEmpty className="py-4 text-center text-[12px] text-muted-foreground">{emptyText}</CommandEmpty>
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
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5",
                      selected ? "opacity-100" : "opacity-0",
                    )}
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

/* ── Presence-Filter (Daten vorhanden) ── */
const PRESENCE_OPTIONS = [
  { key: "has_email",   label: "E-Mail" },
  { key: "has_phone",   label: "Telefon" },
  { key: "has_website", label: "Website" },
  { key: "has_ceo",     label: "Geschäftsführer" },
  { key: "has_social",  label: "Social Media" },
] as const;
type PresenceKey = (typeof PRESENCE_OPTIONS)[number]["key"];

/* ── Pagination helpers ── */
function buildPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}

/* ══════════════════════════════════════════════════════════════
   Hauptkomponente
   ══════════════════════════════════════════════════════════════ */
export default function LeadScrapingPage() {
  /* ── State (alle mit statischen Defaults für SSR-Match) ── */
  const [leads, setLeads]           = useState<Lead[]>([]);
  const [leadsCount, setLeadsCount] = useState(0);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadsPage, setLeadsPage]   = useState(1);

  const [searchJobs, setSearchJobs] = useState<SearchJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchSource, setSearchSource] = useState<SearchSource | null>(null);
  const [activeTab, setActiveTab]   = useState<string>("leads");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isGlobalSelected, setIsGlobalSelected] = useState(false);

  const [editLead, setEditLead]     = useState<Lead | null>(null);
  const [editOpen, setEditOpen]     = useState(false);
  const [editMode, setEditMode]    = useState<"edit" | "create">("edit");
  const [importOpen, setImportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteIds, setDeleteIds]   = useState<string[]>([]);
  const [crmSettings, setCrmSettings] = useState<Record<string, string | null>>({});
  const [leadSettings, setLeadSettings] = useState<{ default_country?: string; default_status?: string; require_ceo?: boolean; require_email?: boolean; page_size?: number } | null>(null);
  const [pageSizeOverride, setPageSizeOverride] = useState<number>(PAGE_SIZE);
  const effectivePageSize = pageSizeOverride;

  /* ── Filter State (statische Defaults für SSR-Match, in useEffect aus localStorage hydriert) ── */
  const [filterSearch, setFilterSearch]         = useState<string>("");
  const [filterStatus, setFilterStatus]         = useState<string>("all");
  const [filterIndustries, setFilterIndustries] = useState<string[]>([]);
  const [filterLegalForms, setFilterLegalForms] = useState<string[]>([]);
  const [filterCities, setFilterCities]         = useState<string[]>([]);
  const [filterStates, setFilterStates]         = useState<string[]>([]);
  const [filterCountry, setFilterCountry]       = useState<string>("all");
  const [filterPresence, setFilterPresence]     = useState<string[]>([]);
  const [filterJobId, setFilterJobId]           = useState<string | null>(null);

  /* Hydration-sicher: localStorage ERST nach Mount lesen, sonst SSR-Mismatch.
   * URL-Param ?tab=search hat Vorrang vor persistiertem Tab (Sidebar-Link
   * "Suchverlauf"). Bewusst window.location statt useSearchParams, damit kein
   * Suspense-Boundary in der Page nötig wird. */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const p = loadPersistedLeadsState();
    if (typeof p.search === "string")           setFilterSearch(p.search);
    if (typeof p.status === "string")           setFilterStatus(p.status);
    if (Array.isArray(p.industries))            setFilterIndustries(p.industries);
    if (Array.isArray(p.legalForms))            setFilterLegalForms(p.legalForms);
    if (Array.isArray(p.cities))                setFilterCities(p.cities);
    if (Array.isArray(p.states))                setFilterStates(p.states);
    if (typeof p.country === "string")          setFilterCountry(p.country);
    if (Array.isArray(p.presence))              setFilterPresence(p.presence);
    if (typeof p.activeTab === "string")        setActiveTab(p.activeTab);
    if (typeof p.pageSize === "number" && (PAGE_SIZE_OPTIONS as readonly number[]).includes(p.pageSize)) {
      setPageSizeOverride(p.pageSize);
    }
    if (typeof window !== "undefined") {
      const tabParam = new URLSearchParams(window.location.search).get("tab");
      if (tabParam === "search" || tabParam === "leads") {
        setActiveTab(tabParam);
      }
    }
    setHydrated(true);
  }, []);

  /* Filter + Tab + Page-Size persistieren (erst nach Hydration, sonst überschreiben wir) */
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      localStorage.setItem(PERSIST_KEY, JSON.stringify({
        search: filterSearch,
        status: filterStatus,
        industries: filterIndustries,
        legalForms: filterLegalForms,
        cities: filterCities,
        states: filterStates,
        country: filterCountry,
        presence: filterPresence,
        pageSize: pageSizeOverride,
        activeTab,
      } satisfies PersistedLeadsState));
    } catch { /* QuotaExceeded etc. ignorieren */ }
  }, [hydrated, filterSearch, filterStatus, filterIndustries, filterLegalForms, filterCities, filterStates, filterCountry, filterPresence, pageSizeOverride, activeTab]);

  /* ── Sorting & Column Visibility ── */
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  /* ── Dynamic Filter Options ── */
  const [industryOptions, setIndustryOptions] = useState<{ value: string; label: string }[]>([...INDUSTRY_OPTIONS]);
  const [cityOptions, setCityOptions]     = useState<{ value: string; label: string }[]>([]);
  const [countryOptions, setCountryOptions] = useState<{ value: string; label: string }[]>([]);

  const hasActiveFilters = !!filterSearch || filterStatus !== "all" || filterIndustries.length > 0 || filterLegalForms.length > 0 || filterCities.length > 0 || filterStates.length > 0 || filterCountry !== "all" || filterPresence.length > 0 || filterJobId !== null;

  function resetFilters() {
    setFilterSearch("");
    setFilterStatus("all");
    setFilterIndustries([]);
    setFilterLegalForms([]);
    setFilterCities([]);
    setFilterStates([]);
    setFilterCountry("all");
    setFilterPresence([]);
    setFilterJobId(null);
    setLeadsPage(1);
  }

  /* ── Fetch CRM settings ── */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) return;
        const json = await res.json();
        if (json.data) {
          setCrmSettings(json.data);
          if (json.data.lead_settings) setLeadSettings(json.data.lead_settings);
        }
      } catch { /* silent */ }
    })();
  }, []);

  /* ── Fetch filter options (countries — einmalig beim Mount) ──
   * Vorher: Dep [leads] → Refetch bei jedem Tabellen-Reload. Country-Liste
   * ändert sich nur, wenn neue Leads aus einem neuen Land hinzukommen — das
   * passiert nach Suchaufträgen (Realtime-Pfad triggert ohnehin fetchLeads).
   * Statt Polling wird die Liste hier nur beim Mount geladen. */
  useEffect(() => {
    (async () => {
      try {
        const countryRes = await fetch("/api/leads/countries");
        if (countryRes.ok) {
          const json = await countryRes.json();
          const COUNTRY_LABELS: Record<string, string> = { AT: "Österreich", DE: "Deutschland", CH: "Schweiz" };
          setCountryOptions((json.data as string[]).map((v) => ({ value: v, label: COUNTRY_LABELS[v] ?? v })));
        }
      } catch { /* silent */ }
    })();
  }, []);

  /* ── Städte dynamisch nach Land neu laden ── */
  useEffect(() => {
    (async () => {
      try {
        const url = filterCountry !== "all"
          ? `/api/leads/cities?country=${filterCountry}`
          : "/api/leads/cities";
        const res = await fetch(url);
        if (!res.ok) return;
        const json = await res.json();
        const newOptions = (json.data as string[]).map((v) => ({ value: v, label: v }));
        setCityOptions(newOptions);
        // Nicht mehr vorhandene Städte aus Auswahl entfernen
        if (filterCities.length > 0) {
          const validSet = new Set(newOptions.map((o) => o.value));
          const valid = filterCities.filter((c) => validSet.has(c));
          if (valid.length !== filterCities.length) setFilterCities(valid);
        }
      } catch { /* silent */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCountry]);

  /* ── Branchen dynamisch nach Status / Land / Bundesland neu laden ── */
  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams();
        if (filterStatus !== "all") params.set("status", filterStatus);
        if (filterCountry !== "all") params.set("country", filterCountry);
        if (filterStates.length > 0) params.set("state", filterStates.join(","));
        const qs = params.toString();
        const res = await fetch(`/api/leads/industries${qs ? `?${qs}` : ""}`);
        if (!res.ok) return;
        const json = await res.json();
        const dbValues = (json.data as string[]);
        // INDUSTRY_OPTIONS als Master-Liste + eventuelle DB-Werte die noch nicht in OPTIONS sind
        const optionsSet = new Set<string>(INDUSTRY_OPTIONS.map((o) => o.value as string));
        const merged: { value: string; label: string }[] = [
          ...INDUSTRY_OPTIONS,
          ...dbValues.filter((v) => !optionsSet.has(v)).map((v) => ({ value: v, label: v })),
        ];
        setIndustryOptions(merged);
      } catch { /* silent */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterCountry, filterStates]);

  /* ── Data fetching ── */
  const fetchLeads = useCallback(async (page = 1) => {
    setLeadsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(effectivePageSize) });
      if (filterSearch) params.set("search", filterSearch);
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterIndustries.length > 0) params.set("industry", filterIndustries.join(","));
      if (filterLegalForms.length > 0) params.set("legal_form", filterLegalForms.join(","));
      if (filterCities.length > 0) params.set("city", filterCities.join(","));
      if (filterStates.length > 0) params.set("state", filterStates.join(","));
      if (filterCountry !== "all") params.set("country", filterCountry);
      if (filterPresence.includes("ceo")) params.set("has_ceo", "true");
      if (filterPresence.includes("email")) params.set("has_email", "true");
      if (filterPresence.includes("phone")) params.set("has_phone", "true");
      if (filterPresence.includes("website")) params.set("has_website", "true");
      if (filterPresence.includes("social")) params.set("has_social", "true");
      if (filterJobId) params.set("search_job_id", filterJobId);
      if (sorting.length > 0) {
        params.set("sort_by", sorting[0].id);
        params.set("sort_dir", sorting[0].desc ? "desc" : "asc");
      }

      const res = await fetch(`/api/leads?${params.toString()}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setLeads(json.data ?? []);
      setLeadsCount(json.count ?? 0);
    } catch {
      toast.error("Fehler beim Laden der Leads");
    } finally {
      setLeadsLoading(false);
    }
  }, [filterSearch, filterStatus, filterIndustries, filterLegalForms, filterCities, filterStates, filterCountry, filterPresence, filterJobId, sorting, effectivePageSize]);

  const fetchJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const res = await fetch("/api/leads/search");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setSearchJobs(json.data ?? []);
    } catch {
      /* silent */
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads(1);
    fetchJobs();
  }, [fetchLeads, fetchJobs]);

  // Re-fetch when dropdown filters or sorting change (reset to page 1)
  useEffect(() => {
    setLeadsPage(1);
    setSelectedIds(new Set());
    setIsGlobalSelected(false);
    fetchLeads(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterIndustries, filterLegalForms, filterCities, filterStates, filterCountry, filterPresence, filterJobId, sorting]);

  /* ── Debounced text-filter fetch (500ms, min 2 chars or empty) ── */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // If 1 character: skip fetch
    if (filterSearch.length === 1) return;

    debounceRef.current = setTimeout(() => {
      setLeadsPage(1);
      setSelectedIds(new Set());
      setIsGlobalSelected(false);
      fetchLeads(1);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSearch]);

  /* ── Supabase Realtime: Live-Updates für Search Jobs ──
   * Ersetzt das 3-Sekunden-Polling. WebSocket-Verbindung zu Supabase bleibt
   * auch bei Tab im Hintergrund aktiv → kein "Server reagiert nicht" mehr.
   *
   * Voraussetzung: Realtime für Tabelle "search_jobs" in Supabase aktivieren:
   * Dashboard → Database → Replication → search_jobs → Realtime ON
   */
  const supabaseClient = useMemo(() => createBrowserClient(), []);

  // Stabile Refs damit der Realtime-Callback keine stale Closures hat
  const fetchLeadsRef = useRef(fetchLeads);
  const fetchJobsRef  = useRef(fetchJobs);
  const leadsPageRef  = useRef(leadsPage);
  useEffect(() => { fetchLeadsRef.current = fetchLeads; }, [fetchLeads]);
  useEffect(() => { fetchJobsRef.current  = fetchJobs;  }, [fetchJobs]);
  useEffect(() => { leadsPageRef.current  = leadsPage;  }, [leadsPage]);

  // Realtime-Subscription (einmal beim Mount, bleibt bis Unmount aktiv).
  // Live-Toaster pro Job: 1 sticky Toast pro jobId, updated bei jeder DB-Mutation,
  // wird zu success/error sobald der Job in einem End-Status landet.
  useEffect(() => {
    const channel = supabaseClient
      .channel("search_jobs_realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "search_jobs" },
        (payload) => {
          const updated = payload.new as SearchJob;
          setSearchJobs((prev) => {
            const idx = prev.findIndex((j) => j.id === updated.id);
            if (idx === -1) return prev; // Nicht unsere Job-Liste

            const prevJob = prev[idx];
            const toastId = `job-${updated.id}`;
            const locLabel = updated.location;
            const queryLabel = updated.query.length > 50 ? updated.query.slice(0, 50) + "…" : updated.query;

            // Status-Transitionen mit live-updatable Sonner Toast (gleiche ID = Update)
            if (updated.status === "running" && updated.total_count && updated.total_count > 0) {
              // Progress-Update während running
              const pct = updated.results_count != null
                ? Math.round((updated.results_count / updated.total_count) * 100)
                : 0;
              toast.loading(
                `${queryLabel} · ${locLabel}`,
                {
                  id: toastId,
                  description: `${updated.results_count ?? 0} / ${updated.total_count} Leads · ${pct}%`,
                  duration: Infinity,
                },
              );
            } else if (updated.status === "running" && prevJob.status === "pending") {
              // Pending → Running: erster Toast
              toast.loading(`${queryLabel} · ${locLabel}`, {
                id: toastId,
                description: "Suche startet…",
                duration: Infinity,
              });
            } else if (updated.status === "completed" && prevJob.status !== "completed") {
              // Sticky-Toast zu success umwandeln
              toast.success(`${queryLabel} · ${locLabel}`, {
                id: toastId,
                description: `${updated.results_count} Leads gefunden`,
                duration: 6000,
              });
              fetchLeadsRef.current(leadsPageRef.current);
            } else if (updated.status === "failed" && prevJob.status !== "failed") {
              const errMsg = (updated as unknown as { error_message?: string }).error_message;
              toast.error(`${queryLabel} · ${locLabel}`, {
                id: toastId,
                description: errMsg ?? "Suche fehlgeschlagen",
                duration: 8000,
              });
            }
            return prev.map((j) => (j.id === updated.id ? { ...j, ...updated } : j));
          });
        },
      )
      .subscribe();

    return () => { supabaseClient.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseClient]);

  // Tab-Fokus Fallback: Jobs neu laden wenn der Tab wieder aktiv wird
  useEffect(() => {
    function onFocus() { fetchJobsRef.current(); }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Polling-Fallback: solange aktive Jobs (pending/running) laufen, alle 4s frisch fetchen.
  // Realtime hat Vorrang (instant), Polling fängt nur ab wenn Realtime nicht aktiviert ist.
  // Kein Overhead bei idle (effect cleanup wenn keine aktiven Jobs).
  useEffect(() => {
    const hasActive = searchJobs.some((j) => j.status === "pending" || j.status === "running");
    if (!hasActive) return;
    const interval = setInterval(() => {
      fetchJobsRef.current();
    }, 4000);
    return () => clearInterval(interval);
  }, [searchJobs]);

  // Stale-Timeout: letzter Fallback nach 2 Stunden (Realtime hat Vorrang)
  const STALE_JOB_TIMEOUT_MS = 2 * 60 * 60 * 1000;
  const timedOutJobsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const activeJobs = searchJobs.filter((j) => j.status === "pending" || j.status === "running");
    if (activeJobs.length === 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      setSearchJobs((prev) =>
        prev.map((job) => {
          if (job.status !== "pending" && job.status !== "running") return job;
          const age = now - new Date(job.created_at).getTime();
          if (age > STALE_JOB_TIMEOUT_MS && !timedOutJobsRef.current.has(job.id)) {
            timedOutJobsRef.current.add(job.id);
            toast.error(`Suche "${job.query}" abgebrochen — Zeitüberschreitung`);
            fetch(`/api/leads/search/${job.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "failed", error_message: "Zeitüberschreitung" }),
            }).catch(() => {});
            return { ...job, status: "failed" as const, error_message: "Zeitüberschreitung" };
          }
          return job;
        }),
      );
    }, 60_000); // Nur jede Minute prüfen (nicht alle 3 Sekunden)

    return () => clearInterval(interval);
  }, [searchJobs, STALE_JOB_TIMEOUT_MS]);

  /* ── Search submit ──
   * Pro Branche × pro Region = 1 Job. 5 Jobs parallel (Backend-Slot-Limit),
   * Rest wird automatisch eingereiht und nachgezogen.
   */
  async function onSearchSubmit(values: SearchFormValues, source: SearchSource) {
    setIsSearching(true);
    setSearchSource(source);

    // Komma-getrennte Branchen aufteilen (Stadt/Land etc. bleibt gleich)
    const rawQueries = (values.query ?? "").split(",").map((s) => s.trim()).filter((s) => s.length >= 2);
    const queries = rawQueries.length > 0 ? rawQueries : [(values.query ?? "").trim()];

    const locations = values.locations && values.locations.length > 0
      ? values.locations
      : [undefined as string | undefined];

    let successCount = 0;
    let queuedCount = 0;
    const newJobs: SearchJob[] = [];

    try {
      for (const query of queries) {
        for (const loc of locations) {
          const res = await fetch("/api/leads/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query:           query,
              location:        loc || undefined,
              country:         values.country ?? "AT",
              company_type:    values.company_type,
              city:            values.city || undefined,
              require_ceo:     values.require_ceo || false,
              require_email:   values.require_email || false,
              require_website: values.require_website || false,
            }),
          });
          if (!res.ok) {
            const errorData = await res.json().catch(() => null);
            toast.error(`Suche "${query}"${loc ? ` in ${loc}` : ""} fehlgeschlagen: ${errorData?.error ?? "Fehler"}`);
            continue;
          }
          const json = await res.json();
          newJobs.push(json.data as SearchJob);
          if (json.queued) queuedCount++;
          successCount++;
        }
      }

      if (successCount > 0) {
        setSearchJobs((prev) => [...newJobs.reverse(), ...prev]);
        // Kein Auto-Tab-Switch — User bleibt wo er war, Toast zeigt Fortschritt
        // Pro Job ein sticky Loading-Toast (wird vom Realtime-Handler später zu success/error umgewandelt)
        for (const j of newJobs) {
          const queryLabel = j.query.length > 50 ? j.query.slice(0, 50) + "…" : j.query;
          toast.loading(`${queryLabel} · ${j.location}`, {
            id: `job-${j.id}`,
            description: j.status === "pending" ? "In Warteschlange…" : "Suche startet…",
            duration: Infinity,
          });
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ein Fehler ist aufgetreten");
    } finally {
      setIsSearching(false);
      setSearchSource(null);
    }
  }

  /* ── Pagination ── */
  function handlePageChange(page: number) {
    setLeadsPage(page);
    fetchLeads(page);
    setSelectedIds(new Set());
    setIsGlobalSelected(false);
  }

  /* ── Selection / Bulk actions ── */
  function handleEditFromSelection() {
    const id = Array.from(selectedIds)[0];
    const lead = leads.find((l) => l.id === id);
    if (lead) { setEditLead(lead); setEditMode("edit"); setEditOpen(true); }
  }

  function handleDeleteFromSelection() {
    setDeleteIds(Array.from(selectedIds));
    setDeleteOpen(true);
  }

  /* Zentrale Filter-Serialisierung für Bulk-Aktionen — alle aktiven Frontend-Filter
   * (Suche, Status, Branchen, Rechtsform, Stadt, Bundesland, Land, Präsenz,
   *  Suchauftrag) werden ans Backend gespiegelt. So funktionieren "Alle auswählen"
   * Operationen exakt mit dem, was der User sieht. */
  const buildBulkFilters = useCallback(() => ({
    search:        filterSearch || undefined,
    status:        filterStatus === "all" ? undefined : (filterStatus as LeadStatus),
    industry:      filterIndustries.length > 0 ? filterIndustries : undefined,
    legal_form:    filterLegalForms.length > 0 ? filterLegalForms : undefined,
    city:          filterCities.length > 0 ? filterCities : undefined,
    state:         filterStates.length > 0 ? filterStates : undefined,
    country:       filterCountry === "all" ? undefined : filterCountry,
    search_job_id: filterJobId ?? undefined,
    has_ceo:       filterPresence.includes("ceo")     || undefined,
    has_email:     filterPresence.includes("email")   || undefined,
    has_phone:     filterPresence.includes("phone")   || undefined,
    has_website:   filterPresence.includes("website") || undefined,
    has_social:    filterPresence.includes("social")  || undefined,
  }), [filterSearch, filterStatus, filterIndustries, filterLegalForms, filterCities, filterStates, filterCountry, filterJobId, filterPresence]);

  async function handleBulkStatusChange(status: LeadStatus) {
    const ids = Array.from(selectedIds);
    const payload: Record<string, unknown> = { action: "status", status };

    if (isGlobalSelected) {
      payload.selectionMode = "all";
      payload.filters = buildBulkFilters();
    } else {
      payload.ids = ids;
    }

    const res = await fetch("/api/leads/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error ?? `Fehler ${res.status}`);
    }
    toast.success(isGlobalSelected ? `Status von ${leadsCount} Leads geändert` : `Status von ${ids.length} Lead(s) geändert`);
    setSelectedIds(new Set());
    setIsGlobalSelected(false);
    fetchLeads(leadsPage);
  }

  /* ── Row-level actions ── */
  function handleEditLead(lead: Lead) {
    setEditLead(lead);
    setEditMode("edit");
    setEditOpen(true);
  }

  function handleDeleteLead(ids: string[]) {
    setDeleteIds(ids);
    setDeleteOpen(true);
  }

  async function handleRowStatusChange(lead: Lead, status: LeadStatus) {
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Status von „${lead.company}" auf „${LEAD_STATUS_CONFIG[status].label}" geändert`);
      fetchLeads(leadsPage);
    } catch {
      toast.error("Status konnte nicht geändert werden");
    }
  }

  /* ── Export ── */
  async function handleExport(format: "csv" | "xlsx") {
    try {
      let exportLeads: Lead[];

      if (isGlobalSelected) {
        // Fetch all pages (API max 100 per page)
        exportLeads = [];
        let page = 1;
        const batchSize = 100;
        while (true) {
          const params = new URLSearchParams({ page: String(page), limit: String(batchSize) });
          if (filterSearch) params.set("search", filterSearch);
          if (filterStatus !== "all") params.set("status", filterStatus);
          if (filterIndustries.length > 0) params.set("industry", filterIndustries.join(","));
          if (filterLegalForms.length > 0) params.set("legal_form", filterLegalForms.join(","));
          if (filterCities.length > 0) params.set("city", filterCities.join(","));
          if (filterStates.length > 0) params.set("state", filterStates.join(","));
          if (filterCountry !== "all") params.set("country", filterCountry);
          if (filterJobId) params.set("search_job_id", filterJobId);
          if (filterPresence.includes("ceo"))     params.set("has_ceo", "true");
          if (filterPresence.includes("email"))   params.set("has_email", "true");
          if (filterPresence.includes("phone"))   params.set("has_phone", "true");
          if (filterPresence.includes("website")) params.set("has_website", "true");
          if (filterPresence.includes("social"))  params.set("has_social", "true");
          const res = await fetch(`/api/leads?${params.toString()}`);
          if (!res.ok) throw new Error();
          const json = await res.json();
          const batch: Lead[] = json.data ?? [];
          exportLeads.push(...batch);
          if (batch.length < batchSize) break;
          page++;
        }
      } else {
        exportLeads = leads.filter((l) => selectedIds.has(l.id));
      }

      if (exportLeads.length === 0) {
        toast.error("Keine Leads zum Exportieren");
        return;
      }

      const headers = [
        "Firma", "Branche", "Rechtsform", "E-Mail", "Telefon", "Website",
        "Straße", "PLZ", "Stadt", "Land",
        "GF Name", "GF Vorname", "GF Nachname", "GF Anrede",
        "Status", "Google Rating", "Google Reviews",
        "LinkedIn", "Facebook", "Instagram",
        "Notizen", "Erstellt am",
      ];
      const rows = exportLeads.map((l) => [
        l.company, l.industry ?? "", l.legal_form ?? "", l.email ?? "", l.phone ?? "", l.website ?? "",
        l.street ?? "", l.postal_code ?? "", l.city ?? "", l.country ?? "",
        l.ceo_name ?? "", l.ceo_first_name ?? "", l.ceo_last_name ?? "", l.ceo_gender ?? "",
        l.status, l.google_rating ?? "", l.google_reviews_count ?? "",
        l.social_linkedin ?? "", l.social_facebook ?? "", l.social_instagram ?? "",
        l.notes ?? "", l.created_at?.slice(0, 10) ?? "",
      ]);

      const timestamp = new Date().toISOString().slice(0, 10);
      let blob: Blob;
      let filename: string;

      if (format === "xlsx") {
        const XLSX = await import("xlsx");
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        // Auto-fit column widths
        ws["!cols"] = headers.map((h, i) => {
          const maxLen = Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length));
          return { wch: Math.min(maxLen + 2, 40) };
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Leads");
        const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        filename = `leads-export-${timestamp}.xlsx`;
      } else {
        const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
        const csvContent = [
          headers.map(escape).join(";"),
          ...rows.map((row) => row.map(escape).join(";")),
        ].join("\n");
        blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
        filename = `leads-export-${timestamp}.csv`;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`${exportLeads.length} Lead(s) als ${format.toUpperCase()} exportiert`);
    } catch {
      toast.error("Export fehlgeschlagen");
    }
  }

  /* ── Callbacks after save/delete ── */
  function handleSaved() {
    setSelectedIds(new Set());
    fetchLeads(leadsPage);
  }

  function handleDeleted() {
    setSelectedIds(new Set());
    setDeleteIds([]);
    fetchLeads(leadsPage);
  }

  /* ── Columns (memoized) ── */
  const columns = useMemo(
    () =>
      createColumns({
        onEditLead: handleEditLead,
        onDeleteLead: handleDeleteLead,
        onStatusChange: handleRowStatusChange,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /* ── Table instance for toolbar (DataTableViewOptions needs it) ── */
  const rowSelection: Record<string, boolean> = {};
  leads.forEach((lead) => {
    if (selectedIds.has(lead.id)) rowSelection[lead.id] = true;
  });

  const toolbarTable = useReactTable({
    data: leads,
    columns,
    state: { sorting, columnVisibility, rowSelection },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      setSorting(next);
    },
    onColumnVisibilityChange: (updater) => {
      const next = typeof updater === "function" ? updater(columnVisibility) : updater;
      setColumnVisibility(next);
    },
    onRowSelectionChange: () => {},
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    getRowId: (row) => row.id,
  });

  /* ── Derived ── */
  const totalPages     = Math.max(1, Math.ceil(leadsCount / effectivePageSize));
  const activeJobsCount = searchJobs.filter(
    (j) => j.status === "pending" || j.status === "running",
  ).length;
  const pageNumbers = buildPageNumbers(leadsPage, totalPages);

  /* ══════════════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════════════ */
  const statusTabs: { value: string; label: string }[] = [
    { value: "all",            label: "Alle" },
    { value: "new",            label: "Neu" },
    { value: "interested",     label: "Interessiert" },
    { value: "contacted",      label: "Kontaktiert" },
    { value: "converted",      label: "Konvertiert" },
    { value: "not_interested", label: "Kein Interesse" },
  ];

  return (
    <div className="leads-v3 flex flex-col gap-4 py-4 md:gap-6 md:py-6">

      {/* Page Header + Search */}
      <div className="px-4 lg:px-6 space-y-4">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-[24px] font-medium tracking-tight leading-tight">Leads</h1>
            <p className="text-[13.5px] text-muted-foreground max-w-xl">
              Finde, qualifiziere und kontaktiere potenzielle Leads in Österreich, Deutschland und der Schweiz.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs font-medium"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="h-3.5 w-3.5" strokeWidth={1.75} />
              Importieren
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs font-medium"
              onClick={() => {
                setEditLead(null);
                setEditMode("create");
                setEditOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              Lead erstellen
            </Button>
          </div>
        </div>

        <LeadSearchForm
          onSubmit={onSearchSubmit}
          isSearching={isSearching}
          searchSource={searchSource}
          defaultCountry={leadSettings?.default_country}
          defaultRequireCeo={leadSettings?.require_ceo}
        />
      </div>

      {/* Top-Level View Switch: Alle Leads vs Suchaufträge */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-0 px-4 lg:px-6">
        <div className="flex items-center justify-between border-b border-border">
          <TabsList variant="line" className="border-b-0">
            <TabsTrigger value="leads" className="gap-2 text-[13px]">
              Alle Leads
              {leadsCount > 0 && (
                <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium data-[state=active]:text-primary">
                  {leadsCount.toLocaleString("de-DE")}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="search" className="gap-2 text-[13px]">
              Suchaufträge
              {activeJobsCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
                  {activeJobsCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab: Suchaufträge */}
        <TabsContent value="search" className="mt-4">
          <SearchJobsList
            jobs={searchJobs}
            loading={jobsLoading}
            onJobClick={(jobId) => {
              setFilterJobId(jobId);
              setActiveTab("leads");
            }}
            onJobCancelled={(jobId) => {
              setSearchJobs((prev) =>
                prev.map((j) =>
                  j.id === jobId
                    ? { ...j, status: "failed" as const, error_message: "Vom Benutzer abgebrochen" }
                    : j,
                ),
              );
              fetchLeads(leadsPage);
            }}
            onJobDeleted={(jobId) => {
              setSearchJobs((prev) => prev.filter((j) => j.id !== jobId));
            }}
            onBulkDeleted={(jobIds) => {
              const deletedSet = new Set(jobIds);
              setSearchJobs((prev) => prev.filter((j) => !deletedSet.has(j.id)));
            }}
            onJobRetried={(updatedJob) => {
              setSearchJobs((prev) =>
                prev.map((j) => (j.id === updatedJob.id ? updatedJob : j)),
              );
            }}
          />
        </TabsContent>

        {/* Tab: Alle Leads */}
        <TabsContent value="leads" className="mt-4 space-y-0">

          {/* Status-Sub-Tabs */}
          <Tabs value={filterStatus} onValueChange={setFilterStatus} className="space-y-0">
            <TabsList variant="line" className="border-b border-border w-full justify-start">
              {statusTabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="text-[13px] gap-2">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="rounded-b-[var(--radius)] border border-t-0 border-border bg-card overflow-hidden">

            {/* Toolbar v3 — Single row: Search + filter-triggers + view/export right */}
            <div className="px-4 py-3 border-b border-border flex items-center gap-2.5 flex-wrap bg-card">
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" strokeWidth={1.75} />
                <Input
                  placeholder="Firma, Kontakt, E-Mail …"
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
                <FilterTriggerPopover
                  label="Branche"
                  value={filterIndustries.length > 0 ? `${filterIndustries.length === 1 ? filterIndustries[0] : `${filterIndustries.length} ausgewählt`}` : null}
                  onClear={() => setFilterIndustries([])}
                  multi
                  selectValue={filterIndustries}
                  onSelectChange={setFilterIndustries}
                  options={industryOptions.length > 0 ? industryOptions : [...INDUSTRY_OPTIONS]}
                  searchPlaceholder="Branche suchen…"
                  emptyText="Keine Branche gefunden"
                />

                <FilterTriggerPopover
                  label="Bundesland"
                  value={filterStates.length > 0 ? (filterStates.length === 1 ? filterStates[0] : `${filterStates.length} ausgewählt`) : null}
                  onClear={() => setFilterStates([])}
                  multi
                  selectValue={filterStates}
                  onSelectChange={setFilterStates}
                  options={AT_BUNDESLAENDER}
                  searchPlaceholder="Bundesland suchen…"
                  emptyText="Kein Bundesland gefunden"
                />

                <FilterTriggerPopover
                  label="Stadt"
                  value={filterCities.length > 0 ? (filterCities.length === 1 ? filterCities[0] : `${filterCities.length} ausgewählt`) : null}
                  onClear={() => setFilterCities([])}
                  multi
                  selectValue={filterCities}
                  onSelectChange={setFilterCities}
                  options={cityOptions}
                  searchPlaceholder="Stadt suchen…"
                  emptyText="Keine Stadt gefunden"
                />

                <FilterTriggerPopover
                  label="Rechtsform"
                  value={filterLegalForms.length > 0 ? (filterLegalForms.length === 1 ? (COMPANY_TYPE_OPTIONS.find((o) => o.value === filterLegalForms[0])?.label ?? filterLegalForms[0]) : `${filterLegalForms.length} ausgewählt`) : null}
                  onClear={() => setFilterLegalForms([])}
                  multi
                  selectValue={filterLegalForms}
                  onSelectChange={setFilterLegalForms}
                  options={COMPANY_TYPE_OPTIONS.filter((o) => o.value !== "all").map((o) => ({ value: o.value, label: o.label }))}
                  searchPlaceholder="Rechtsform suchen…"
                  emptyText="Keine Rechtsform gefunden"
                />

                <FilterTriggerPopover
                  label="Land"
                  value={filterCountry !== "all" ? (countryOptions.find((o) => o.value === filterCountry)?.label ?? filterCountry) : null}
                  onClear={() => setFilterCountry("all")}
                  selectValue={filterCountry}
                  onSelectChange={setFilterCountry}
                  options={countryOptions}
                  searchPlaceholder="Land suchen…"
                  emptyText="Kein Land gefunden"
                />

                <FilterTriggerPopover
                  label="Kriterien"
                  value={filterPresence.length > 0 ? (filterPresence.length === 1 ? ({ ceo: "Entscheider", email: "E-Mail", phone: "Telefon", website: "Website", social: "Social Media" } as Record<string, string>)[filterPresence[0]] ?? filterPresence[0] : `${filterPresence.length} ausgewählt`) : null}
                  onClear={() => setFilterPresence([])}
                  multi
                  selectValue={filterPresence}
                  onSelectChange={setFilterPresence}
                  options={[
                    { value: "ceo", label: "Entscheider:in" },
                    { value: "email", label: "E-Mail" },
                    { value: "phone", label: "Telefon" },
                    { value: "website", label: "Website" },
                    { value: "social", label: "Social Media" },
                  ]}
                  searchPlaceholder="Filter suchen…"
                  emptyText="Kein Filter gefunden"
                />

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
                {!leadsLoading && (
                  <span className="text-[12.5px] text-muted-foreground">
                    <b className="text-foreground font-semibold">{leadsCount.toLocaleString("de-DE")}</b> Ergebnisse
                  </span>
                )}
                <DataTableViewOptions table={toolbarTable} />
              </div>
            </div>

            {/* Job-Filter Indicator (kompakt unterhalb Toolbar) */}
            {filterJobId && (
              <div className="px-4 py-2 border-b border-border bg-accent/40 flex items-center gap-2 text-[12px] text-foreground">
                <SlidersHorizontal className="h-3 w-3 text-muted-foreground" strokeWidth={1.75} />
                Gefiltert nach Suchauftrag
                <button
                  onClick={() => setFilterJobId(null)}
                  className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" strokeWidth={1.75} />
                  Aufheben
                </button>
              </div>
            )}

            {/* Table or states */}
            {leadsLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: Math.min(effectivePageSize, 12) }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full rounded-md" />
                ))}
              </div>
            ) : leads.length === 0 ? (
              <Empty className="py-20 border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <InboxIcon />
                  </EmptyMedia>
                  <EmptyTitle>
                    {hasActiveFilters ? "Keine Ergebnisse" : "Noch keine Leads"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {hasActiveFilters
                      ? "Passe die Filter an oder setze sie zurück."
                      : "Starte eine Suche, um Leads zu importieren."}
                  </EmptyDescription>
                </EmptyHeader>
                {hasActiveFilters && (
                  <EmptyContent>
                    <Button variant="outline" size="sm" onClick={resetFilters}>
                      Filter zurücksetzen
                    </Button>
                  </EmptyContent>
                )}
              </Empty>
            ) : (
              <>
                <LeadsTable
                  leads={leads}
                  columns={columns}
                  selectedIds={selectedIds}
                  onSelectionChange={setSelectedIds}
                  onEditLead={handleEditLead}
                  onDeleteLead={handleDeleteLead}
                  onStatusChange={handleRowStatusChange}
                  sorting={sorting}
                  onSortingChange={setSorting}
                  columnVisibility={columnVisibility}
                  onColumnVisibilityChange={setColumnVisibility}
                />

                {/* Pagination */}
                <Separator />
                <div className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground whitespace-nowrap">Pro Seite</span>
                      <Select
                        value={String(effectivePageSize)}
                        onValueChange={(v) => {
                          setPageSizeOverride(Number(v));
                          setLeadsPage(1);
                        }}
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
                      {((leadsPage - 1) * effectivePageSize + 1).toLocaleString("de-DE")}
                      –
                      {Math.min(leadsPage * effectivePageSize, leadsCount).toLocaleString("de-DE")}
                      {" "}von{" "}
                      <span className="font-medium text-foreground">{leadsCount.toLocaleString("de-DE")}</span>
                    </p>
                  </div>

                  {totalPages > 1 && (
                    <Pagination className="mx-0 w-auto justify-end">
                      <PaginationContent className="gap-1">
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(e) => { e.preventDefault(); if (leadsPage > 1) handlePageChange(leadsPage - 1); }}
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
                            onClick={(e) => { e.preventDefault(); if (leadsPage < totalPages) handlePageChange(leadsPage + 1); }}
                            className={leadsPage >= totalPages ? "pointer-events-none opacity-40" : ""}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  )}
                </div>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Selection Bar (fixed bottom) */}
      <LeadSelectionBar
        selectedCount={selectedIds.size}
        totalCount={leadsCount}
        selectedIds={Array.from(selectedIds)}
        isGlobalSelected={isGlobalSelected}
        filters={buildBulkFilters()}
        crmSettings={crmSettings}
        onClear={() => {
          setSelectedIds(new Set());
          setIsGlobalSelected(false);
        }}
        onSelectAll={() => setIsGlobalSelected(true)}
        onEdit={handleEditFromSelection}
        onDelete={handleDeleteFromSelection}
        onStatusChange={handleBulkStatusChange}
        onExport={handleExport}
      />

      {/* Edit / Create Sheet */}
      <LeadEditSheet
        lead={editLead}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={handleSaved}
        mode={editMode}
      />

      {/* Import Dialog */}
      <LeadImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => fetchLeads(1)}
      />

      {/* Delete Dialog */}
      <LeadDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        leadIds={deleteIds}
        isGlobalSelected={isGlobalSelected}
        totalCount={leadsCount}
        filters={buildBulkFilters()}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
