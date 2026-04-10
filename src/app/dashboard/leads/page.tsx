"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import type { SortingState, VisibilityState } from "@tanstack/react-table";
import { 
  Users, 
  Search, 
  Plus, 
  Trash2, 
  SlidersHorizontal,
  MapPin,
  Calendar,
  Download,
  FilterX,
  RefreshCcw,
  InboxIcon,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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

import { LeadsTable, LEAD_STATUS_CONFIG } from "@/components/leads/LeadsTable";
import { createColumns } from "@/components/leads/columns";
import { DataTableViewOptions } from "@/components/leads/DataTableViewOptions";
import { LeadSelectionBar } from "@/components/leads/LeadSelectionBar";
import { LeadEditSheet } from "@/components/leads/LeadEditSheet";
import { LeadDeleteDialog } from "@/components/leads/LeadDeleteDialog";
import { SearchJobsList } from "@/components/leads/SearchJobsList";
import { LeadSearchForm } from "@/components/leads/LeadSearchForm";
import { IndustryCombobox } from "@/components/leads/IndustryCombobox";
import { FilterCombobox } from "@/components/leads/FilterCombobox";
import type { SearchFormValues, SearchSource } from "@/components/leads/LeadSearchForm";

import type { Lead, LeadStatus, SearchJob } from "@/types/leads";

// We need a ref to the table instance for the DataTableViewOptions
import { useReactTable, getCoreRowModel, type ColumnDef } from "@tanstack/react-table";

const PAGE_SIZE = 25;

/* ── Pagination helpers ── */
function buildPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}

/* ── Status-Liste für Filter ── */
const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all",       label: "Alle Status" },
  { value: "new",       label: "Neu" },
  { value: "interested",     label: "Interessiert" },
  { value: "contacted", label: "Kontaktiert" },
  { value: "converted", label: "Konvertiert" },
  { value: "not_interested", label: "Kein Interesse" },
];

/* ══════════════════════════════════════════════════════════════
   Hauptkomponente
   ══════════════════════════════════════════════════════════════ */
export default function LeadScrapingPage() {
  /* ── State ── */
  const [leads, setLeads]           = useState<Lead[]>([]);
  const [leadsCount, setLeadsCount] = useState(0);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadsPage, setLeadsPage]   = useState(1);

  const [searchJobs, setSearchJobs] = useState<SearchJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchSource, setSearchSource] = useState<SearchSource | null>(null);
  const [activeTab, setActiveTab]   = useState("search");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isGlobalSelected, setIsGlobalSelected] = useState(false);

  const [editLead, setEditLead]     = useState<Lead | null>(null);
  const [editOpen, setEditOpen]     = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteIds, setDeleteIds]   = useState<string[]>([]);
  const [crmSettings, setCrmSettings] = useState<Record<string, string | null>>({});
  const [leadSettings, setLeadSettings] = useState<{ default_country?: string; default_status?: string; require_ceo?: boolean; require_email?: boolean; page_size?: number } | null>(null);
  const effectivePageSize = leadSettings?.page_size || PAGE_SIZE;

  /* ── Filter State ── */
  const [filterSearch, setFilterSearch]         = useState("");
  const [filterStatus, setFilterStatus]         = useState("all");
  const [filterIndustries, setFilterIndustries]   = useState<string[]>([]);
  const [filterLegalForms, setFilterLegalForms]   = useState<string[]>([]);
  const [filterCities, setFilterCities]           = useState<string[]>([]);
  const [filterCountry, setFilterCountry]       = useState<string>("all");

  /* ── Sorting & Column Visibility ── */
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  /* ── Dynamic Filter Options ── */
  const [industryOptions, setIndustryOptions] = useState<{ value: string; label: string }[]>([]);
  const [cityOptions, setCityOptions]     = useState<{ value: string; label: string }[]>([]);
  const [countryOptions, setCountryOptions] = useState<{ value: string; label: string }[]>([]);

  const hasActiveFilters = filterSearch || filterStatus !== "all" || filterIndustries.length > 0 || filterLegalForms.length > 0 || filterCities.length > 0 || filterCountry !== "all";

  function resetFilters() {
    setFilterSearch("");
    setFilterStatus("all");
    setFilterIndustries([]);
    setFilterLegalForms([]);
    setFilterCities([]);
    setFilterCountry("all");
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

  /* ── Fetch filter options (countries — einmalig) ── */
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
  }, [leads]); // refetch when leads change

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

  /* ── Branchen dynamisch nach Status neu laden ── */
  useEffect(() => {
    (async () => {
      try {
        const url = filterStatus !== "all"
          ? `/api/leads/industries?status=${filterStatus}`
          : "/api/leads/industries";
        const res = await fetch(url);
        if (!res.ok) return;
        const json = await res.json();
        const newOptions = (json.data as string[]).map((v) => ({ value: v, label: v }));
        setIndustryOptions(newOptions);
        // Nicht mehr vorhandene Branchen aus Auswahl entfernen
        if (filterIndustries.length > 0) {
          const validSet = new Set(newOptions.map((o) => o.value));
          const valid = filterIndustries.filter((i) => validSet.has(i));
          if (valid.length !== filterIndustries.length) setFilterIndustries(valid);
        }
      } catch { /* silent */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);

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
      if (filterCountry !== "all") params.set("country", filterCountry);
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
  }, [filterSearch, filterStatus, filterIndustries, filterLegalForms, filterCities, filterCountry, sorting, effectivePageSize]);

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
  }, [filterStatus, filterIndustries, filterLegalForms, filterCities, filterCountry, sorting]);

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

  /* ── Polling + Stale-Job-Timeout ── */
  const STALE_JOB_TIMEOUT_MS = 60 * 60 * 1000; // 60 Minuten — Pipeline kann bei großen Regionen lange dauern
  const timedOutJobsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const activeJobs = searchJobs.filter(
      (j) => j.status === "pending" || j.status === "running",
    );
    if (activeJobs.length === 0) return;

    const interval = setInterval(async () => {
      let hasChanges = false;
      const now = Date.now();
      const updatedJobs = await Promise.all(
        searchJobs.map(async (job) => {
          if (job.status !== "pending" && job.status !== "running") return job;

          // Timeout nur einmal pro Job auslösen
          const jobAge = now - new Date(job.created_at).getTime();
          if (jobAge > STALE_JOB_TIMEOUT_MS && !timedOutJobsRef.current.has(job.id)) {
            timedOutJobsRef.current.add(job.id);
            hasChanges = true;
            toast.error(
              `Suche "${job.query}" abgebrochen — Zeitüberschreitung (Server nicht erreichbar)`,
            );
            fetch(`/api/leads/search/${job.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: "failed",
                error_message: "Zeitüberschreitung — Server nicht erreichbar",
              }),
            }).catch(() => {});
            return {
              ...job,
              status: "failed" as const,
              error_message: "Zeitüberschreitung — Server nicht erreichbar",
            };
          }

          try {
            const res = await fetch(`/api/leads/search/${job.id}`);
            if (!res.ok) return job;
            const json = await res.json();
            const updated = json.data as SearchJob;
            if (updated.status !== job.status || updated.results_count !== job.results_count) {
              hasChanges = true;
              if (updated.status === "completed") {
                toast.success(
                  `Suche "${job.query} in ${job.location}" abgeschlossen — ${updated.results_count} Ergebnisse`,
                );
              } else if (updated.status === "failed") {
                toast.error(
                  `Suche "${job.query}" fehlgeschlagen: ${updated.error_message ?? "Unbekannter Fehler"}`,
                );
              }
            }
            return updated;
          } catch {
            return job;
          }
        }),
      );
      setSearchJobs(updatedJobs);
      if (hasChanges) fetchLeads(leadsPage);
    }, 3000);

    return () => clearInterval(interval);
  }, [searchJobs, fetchLeads, leadsPage]);

  /* ── Search submit (unterstützt mehrere Regionen gleichzeitig) ── */
  async function onSearchSubmit(values: SearchFormValues, source: SearchSource) {
    setIsSearching(true);
    setSearchSource(source);

    // Suchbegriffe: Komma-getrennte Eingabe aufteilen
    const rawQueries = (values.query ?? "").split(",").map((s) => s.trim()).filter((s) => s.length >= 2);
    const queries = rawQueries.length > 0 ? rawQueries : [values.query ?? ""];

    const locations = values.locations && values.locations.length > 0
      ? values.locations
      : [undefined as string | undefined];

    let successCount = 0;
    const newJobs: SearchJob[] = [];

    try {
      for (const query of queries) {
        for (const loc of locations) {
          const res = await fetch("/api/leads/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query:        query,
              location:     loc || undefined,
              country:      values.country ?? "AT",
              company_type: values.company_type,
              city:         values.city || undefined,
              require_ceo:  values.require_ceo || false,
            }),
          });
          if (!res.ok) {
            const errorData = await res.json().catch(() => null);
            toast.error(`Suche "${query}"${loc ? ` in ${loc}` : ""} fehlgeschlagen: ${errorData?.error ?? "Fehler"}`);
            continue;
          }
          const json = await res.json();
          newJobs.push(json.data as SearchJob);
          successCount++;
        }
      }

      if (successCount > 0) {
        setSearchJobs((prev) => [...newJobs.reverse(), ...prev]);
        setActiveTab("search");
        const total = queries.length * locations.length;
        if (total === 1) {
          const loc = locations[0];
          const locationLabel = values.city ? values.city : loc || values.country || "DACH";
          toast.success(`Suche nach "${queries[0]}" in ${locationLabel} gestartet`);
        } else {
          toast.success(`${successCount} Suchaufträge gestartet`);
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
    if (lead) { setEditLead(lead); setEditOpen(true); }
  }

  function handleDeleteFromSelection() {
    setDeleteIds(Array.from(selectedIds));
    setDeleteOpen(true);
  }

  async function handleBulkStatusChange(status: LeadStatus) {
    const ids = Array.from(selectedIds);
    const payload: any = { action: "status", status };
    
    if (isGlobalSelected) {
      payload.selectionMode = "all";
      payload.filters = {
        search: filterSearch,
        status: filterStatus === "all" ? undefined : filterStatus,
        industry: filterIndustries.length > 0 ? filterIndustries : undefined,
        legal_form: filterLegalForms.length > 0 ? filterLegalForms : undefined,
        city: filterCities.length > 0 ? filterCities : undefined,
        country: filterCountry === "all" ? undefined : filterCountry,
      };
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
          if (filterCountry !== "all") params.set("country", filterCountry);
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
        "LinkedIn", "Facebook", "Instagram", "Xing",
        "Notizen", "Erstellt am",
      ];
      const rows = exportLeads.map((l) => [
        l.company, l.industry ?? "", l.legal_form ?? "", l.email ?? "", l.phone ?? "", l.website ?? "",
        l.street ?? "", l.postal_code ?? "", l.city ?? "", l.country ?? "",
        l.ceo_name ?? "", l.ceo_first_name ?? "", l.ceo_last_name ?? "", l.ceo_gender ?? "",
        l.status, l.google_rating ?? "", l.google_reviews_count ?? "",
        l.social_linkedin ?? "", l.social_facebook ?? "", l.social_instagram ?? "", l.social_xing ?? "",
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
  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">

      {/* Page Header + Search */}
      <div className="px-4 lg:px-6 space-y-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Finde und verwalte potenzielle Kunden. Suche nach Branche, Region oder Ort.
          </p>
        </div>
        <LeadSearchForm onSubmit={onSearchSubmit} isSearching={isSearching} searchSource={searchSource} defaultCountry={leadSettings?.default_country} defaultRequireCeo={leadSettings?.require_ceo} />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-0 px-4 lg:px-6">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="search" className="gap-1.5">
              <Search className="h-4 w-4" />
              Suchaufträge
              {activeJobsCount > 0 && (
                <Badge className="ml-1 bg-primary/10 text-primary hover:bg-primary/15">
                  {activeJobsCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="leads" className="gap-1.5">
              <Users className="h-4 w-4" />
              Alle Leads
              {leadsCount > 0 && (
                <Badge className="ml-1 bg-primary/10 text-primary hover:bg-primary/15">
                  {leadsCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab: Suchaufträge */}
        <TabsContent value="search" className="mt-4">
          <SearchJobsList
            jobs={searchJobs}
            loading={jobsLoading}
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
        <TabsContent value="leads" className="mt-4">
          <div className="rounded-lg border bg-card overflow-hidden">

            {/* Toolbar */}
            <div className="px-4 py-3 border-b bg-muted/20 space-y-2.5">
              {/* Zeile 1: Textsuche + Status + Branche */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 pointer-events-none z-10" />
                  <Input
                    placeholder="Suche (Firma, Name, E-Mail)"
                    className="pl-9 h-9 text-sm"
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                  />
                </div>

                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-9 w-40 text-sm">
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

                <div className="w-48">
                  <IndustryCombobox
                    value={filterIndustries}
                    onChange={setFilterIndustries}
                    placeholder="Branche filtern"
                    options={industryOptions.length > 0 ? industryOptions : undefined}
                  />
                </div>

                <DataTableViewOptions table={toolbarTable} />
              </div>

              {/* Zeile 2: Standort-Filter + Rechtsform + Reset */}
              <div className="flex items-center gap-3 flex-wrap">
                <FilterCombobox
                  value={filterCountry}
                  onChange={setFilterCountry}
                  options={countryOptions}
                  placeholder="Land"
                  searchPlaceholder="Land suchen…"
                  emptyText="Kein Land gefunden"
                  allLabel="Alle Länder"
                  className="w-40 text-sm"
                />

                <FilterCombobox
                  multi
                  value={filterCities}
                  onChange={setFilterCities}
                  options={cityOptions}
                  placeholder="Stadt"
                  searchPlaceholder="Stadt suchen…"
                  emptyText="Keine Stadt gefunden"
                  className="w-44 text-sm"
                />

                <FilterCombobox
                  multi
                  value={filterLegalForms}
                  onChange={setFilterLegalForms}
                  options={[
                    { value: "gmbh", label: "GmbH" },
                    { value: "eu", label: "Einzelunternehmen" },
                    { value: "ag", label: "AG" },
                    { value: "og", label: "OG" },
                    { value: "kg", label: "KG" },
                  ]}
                  placeholder="Rechtsform"
                  searchPlaceholder="Rechtsform suchen…"
                  emptyText="Keine Rechtsform gefunden"
                  className="w-44 text-sm"
                />

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

              {/* Zeile 3: Aktive Multi-Filter Chips */}
              {(filterIndustries.length > 0 || filterCities.length > 0 || filterLegalForms.length > 0) && (
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  {filterIndustries.map((ind) => (
                    <Badge
                      key={ind}
                      variant="outline"
                      className="bg-primary/10 text-primary border-primary/20 gap-1 pr-1 font-normal cursor-default"
                    >
                      {ind}
                      <button
                        type="button"
                        onClick={() => setFilterIndustries(filterIndustries.filter((v) => v !== ind))}
                        className="rounded-full hover:bg-primary/20 p-0.5 transition-colors"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                  {filterCities.map((city) => (
                    <Badge
                      key={city}
                      variant="secondary"
                      className="gap-1 pr-1 font-normal cursor-default"
                    >
                      <MapPin className="h-3 w-3 opacity-60" />
                      {city}
                      <button
                        type="button"
                        onClick={() => setFilterCities(filterCities.filter((v) => v !== city))}
                        className="rounded-full hover:bg-foreground/10 p-0.5 transition-colors"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                  {filterLegalForms.map((lf) => {
                    const label = { gmbh: "GmbH", eu: "Einzelunternehmen", ag: "AG", og: "OG", kg: "KG" }[lf] ?? lf;
                    return (
                      <Badge
                        key={lf}
                        variant="outline"
                        className="bg-amber-50 text-amber-700 border-amber-200 gap-1 pr-1 font-normal cursor-default"
                      >
                        {label}
                        <button
                          type="button"
                          onClick={() => setFilterLegalForms(filterLegalForms.filter((v) => v !== lf))}
                          className="rounded-full hover:bg-amber-100 p-0.5 transition-colors"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Count-Bar */}
            <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-2 flex-wrap">
              <p className="text-sm text-muted-foreground">
                {leadsCount.toLocaleString("de-DE")} Einträge gesamt
              </p>
              {hasActiveFilters && (
                <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5 font-normal">
                  gefiltert
                </Badge>
              )}
              {selectedIds.size > 0 && (
                <Badge className="font-normal">
                  {isGlobalSelected ? leadsCount.toLocaleString("de-DE") : selectedIds.size} ausgewählt
                  {isGlobalSelected && " (alle)"}
                </Badge>
              )}
            </div>

            {/* Table or states */}
            {leadsLoading ? (
              <div className="p-5 space-y-2.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-md" />
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
                {totalPages > 1 && (
                  <>
                    <Separator />
                    <div className="px-4 py-3 flex items-center justify-between gap-4">
                      <p className="text-sm text-muted-foreground whitespace-nowrap">
                        Seite {leadsPage} von {totalPages} ({leadsCount} Leads)
                      </p>
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
                    </div>
                  </>
                )}
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
        filters={{
          search: filterSearch || undefined,
          status: filterStatus === "all" ? undefined : (filterStatus as LeadStatus),
          industry: filterIndustries.length > 0 ? filterIndustries : undefined,
          legal_form: filterLegalForms.length > 0 ? filterLegalForms : undefined,
          city: filterCities.length > 0 ? filterCities : undefined,
          country: filterCountry === "all" ? undefined : filterCountry,
        }}
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

      {/* Edit Sheet */}
      <LeadEditSheet
        lead={editLead}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={handleSaved}
      />

      {/* Delete Dialog */}
      <LeadDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        leadIds={deleteIds}
        isGlobalSelected={isGlobalSelected}
        totalCount={leadsCount}
        filters={{
          search: filterSearch,
          status: filterStatus === "all" ? undefined : (filterStatus as LeadStatus),
          industry: filterIndustries.length > 0 ? filterIndustries : undefined,
          legal_form: filterLegalForms.length > 0 ? filterLegalForms : undefined,
          city: filterCities.length > 0 ? filterCities : undefined,
          country: filterCountry === "all" ? undefined : filterCountry,
        }}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
