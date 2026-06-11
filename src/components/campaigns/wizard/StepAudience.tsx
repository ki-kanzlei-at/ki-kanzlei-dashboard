"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Search, InboxIcon, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  flexRender,
  useReactTable,
  getCoreRowModel,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { createColumns } from "@/components/leads/columns";
import { FilterTriggerPopover } from "@/components/shared/FilterTriggerPopover";
import { postalCodeToBundesland } from "@/lib/bundesland";
import { cn } from "@/lib/utils";
import type { AudienceState } from "./types";
import type { Lead } from "@/types/leads";

interface StepAudienceProps {
  state: AudienceState;
  onChange: (next: AudienceState) => void;
}

/* Gleiche Pagination wie auf der Leads-Seite */
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 500] as const;
const DEFAULT_PAGE_SIZE = 100;

function buildPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}

const COUNTRY_LABELS: Record<string, string> = {
  AT: "Österreich",
  DE: "Deutschland",
  CH: "Schweiz",
};

/* Ansprechbarer Pool (Status neu, mit E-Mail, in keiner Kampagne) —
 * Quelle für Filter-Optionen UND Sichtbarkeits-Filter der Tabelle. */
interface FacetRow {
  id: string;
  country: string | null;
  postal_code: string | null;
  city: string | null;
  industry: string | null;
  legal_form: string | null;
}

export function StepAudience({ state, onChange }: StepAudienceProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectingAll, setSelectingAll] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [count, setCount] = useState(0);

  const [search, setSearch] = useState("");
  const [country, setCountry] = useState<string>("all");
  const [states, setStates] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [legalForms, setLegalForms] = useState<string[]>([]);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const [facets, setFacets] = useState<FacetRow[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/campaigns/audience-facets");
        if (!res.ok) return;
        const json = await res.json();
        setFacets((json.data as FacetRow[] | undefined) ?? []);
      } catch { /* silent — Server filtert beim Erstellen trotzdem */ }
    })();
  }, []);

  /* IDs des ansprechbaren Pools — Tabelle blendet alles andere aus
   * (zusätzlich filtert der Server beim Erstellen der Kampagne). */
  const eligibleIds = useMemo(
    () => (facets ? new Set(facets.map((r) => r.id)) : null),
    [facets],
  );

  /* ── Kaskadierende Filter-Optionen ──
   * Jede Liste enthält nur Werte, die nach Anwendung der jeweils ANDEREN
   * aktiven Filter im Pool noch vorkommen. */
  const rowState = useCallback(
    (r: FacetRow) => (r.country === "AT" ? postalCodeToBundesland(r.postal_code) : null),
    [],
  );

  const matchesExcept = useCallback(
    (r: FacetRow, skip: string) =>
      (skip === "country" || country === "all" || r.country === country) &&
      (skip === "state" || states.length === 0 || states.includes(rowState(r) ?? "")) &&
      (skip === "industry" || industries.length === 0 || (!!r.industry && industries.includes(r.industry))) &&
      (skip === "city" || cities.length === 0 || (!!r.city && cities.includes(r.city))) &&
      (skip === "legal" || legalForms.length === 0 || (!!r.legal_form && legalForms.includes(r.legal_form))),
    [country, states, industries, cities, legalForms, rowState],
  );

  const distinctOptions = useCallback(
    (rows: FacetRow[], pick: (r: FacetRow) => string | null) => {
      const set = new Set<string>();
      rows.forEach((r) => { const v = pick(r); if (v) set.add(v); });
      return Array.from(set)
        .sort((a, b) => a.localeCompare(b, "de"))
        .map((v) => ({ value: v, label: v }));
    },
    [],
  );

  const countryOptions = useMemo(
    () => (facets ? distinctOptions(facets.filter((r) => matchesExcept(r, "country")), (r) => r.country) : [])
      .map((o) => ({ ...o, label: COUNTRY_LABELS[o.value] ?? o.value })),
    [facets, matchesExcept, distinctOptions],
  );
  const stateOptions = useMemo(
    () => (facets && country === "AT"
      ? distinctOptions(facets.filter((r) => matchesExcept(r, "state")), rowState)
      : []),
    [facets, country, matchesExcept, distinctOptions, rowState],
  );
  const industryOptions = useMemo(
    () => (facets ? distinctOptions(facets.filter((r) => matchesExcept(r, "industry")), (r) => r.industry) : []),
    [facets, matchesExcept, distinctOptions],
  );
  const cityOptions = useMemo(
    () => (facets ? distinctOptions(facets.filter((r) => matchesExcept(r, "city")), (r) => r.city) : []),
    [facets, matchesExcept, distinctOptions],
  );
  const legalFormOptions = useMemo(
    () => (facets ? distinctOptions(facets.filter((r) => matchesExcept(r, "legal")), (r) => r.legal_form) : []),
    [facets, matchesExcept, distinctOptions],
  );

  /* Exakte Pool-Größe für die aktuellen Filter (ohne Textsuche) */
  const facetCount = useMemo(
    () => (facets ? facets.filter((r) => matchesExcept(r, "")).length : null),
    [facets, matchesExcept],
  );

  const buildParams = useCallback((extra: Record<string, string> = {}) => {
    const params = new URLSearchParams(extra);
    if (search) params.set("search", search);
    if (country !== "all") params.set("country", country);
    if (states.length > 0) params.set("state", states.join(","));
    if (industries.length > 0) params.set("industry", industries.join(","));
    if (cities.length > 0) params.set("city", cities.join(","));
    if (legalForms.length > 0) params.set("legal_form", legalForms.join(","));
    if (sorting.length > 0) {
      params.set("sort_by", sorting[0].id);
      params.set("sort_dir", sorting[0].desc ? "desc" : "asc");
    }
    /* Kampagnen kontaktieren nur frische Leads mit E-Mail */
    params.set("status", "new");
    params.set("has_email", "true");
    return params;
  }, [search, country, states, industries, cities, legalForms, sorting]);

  const fetchLeads = useCallback(async (pageToLoad: number) => {
    setLoading(true);
    try {
      const params = buildParams({ page: String(pageToLoad), limit: String(pageSize) });
      const res = await fetch(`/api/leads?${params.toString()}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setLeads(json.data ?? []);
      setCount(json.count ?? 0);
      setPage(pageToLoad);
    } catch {
      setLeads([]);
      setCount(0);
      toast.error("Leads konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [buildParams, pageSize]);

  /* Filter-/Suchänderung → Seite 1 neu laden (debounced) */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { fetchLeads(1); }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchLeads]);

  const hasActiveFilters = !!search || country !== "all" || states.length > 0
    || industries.length > 0 || cities.length > 0 || legalForms.length > 0;

  function resetFilters() {
    setSearch("");
    setCountry("all");
    setStates([]);
    setIndustries([]);
    setCities([]);
    setLegalForms([]);
  }

  /** Alle Treffer der aktuellen Filter auswählen — über alle Seiten. */
  async function selectAllMatching() {
    setSelectingAll(true);
    try {
      const params = buildParams({ ids_only: "true" });
      const res = await fetch(`/api/leads?${params.toString()}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      const ids: string[] = json.data ?? [];
      const next = new Set(state.selectedLeadIds);
      ids.forEach((id) => { if (!eligibleIds || eligibleIds.has(id)) next.add(id); });
      onChange({ ...state, selectedLeadIds: next });
    } catch {
      toast.error("Auswahl fehlgeschlagen — bitte erneut versuchen");
    } finally {
      setSelectingAll(false);
    }
  }

  /* Leads außerhalb des Pools (z. B. inzwischen anderweitig verwendet) ausblenden */
  const visibleLeads = useMemo(
    () => (eligibleIds ? leads.filter((l) => eligibleIds.has(l.id)) : leads),
    [leads, eligibleIds],
  );

  /* Ohne Textsuche kennt der Facetten-Pool die exakte Anzahl; mit Suche
   * liefert der Server die Zahl. */
  const displayCount = !search && facetCount !== null ? facetCount : count;

  /* ── Tabelle: exakt die Leads-Spalten, ohne Zeilen-Aktionen ── */
  const columns = useMemo(
    () => createColumns({
      onEditLead: () => {},
      onDeleteLead: () => {},
      onStatusChange: async () => {},
    }).filter((c) => (c as { id?: string }).id !== "actions"),
    [],
  );

  const rowSelection: Record<string, boolean> = {};
  visibleLeads.forEach((l) => {
    if (state.selectedLeadIds.has(l.id)) rowSelection[l.id] = true;
  });

  const table = useReactTable({
    data: visibleLeads,
    columns,
    state: { sorting, columnVisibility, rowSelection },
    onSortingChange: (updater) => {
      setSorting((prev) => (typeof updater === "function" ? updater(prev) : updater));
    },
    onColumnVisibilityChange: (updater) => {
      setColumnVisibility((prev) => (typeof updater === "function" ? updater(prev) : updater));
    },
    /* Auswahl seitenübergreifend halten: nur Zeilen der aktuellen Seite
     * werden hinzugefügt/entfernt, der Rest der Auswahl bleibt bestehen. */
    onRowSelectionChange: (updater) => {
      const current: Record<string, boolean> = {};
      visibleLeads.forEach((l) => {
        if (state.selectedLeadIds.has(l.id)) current[l.id] = true;
      });
      const next = typeof updater === "function" ? updater(current) : updater;
      const merged = new Set(state.selectedLeadIds);
      visibleLeads.forEach((l) => {
        if (next[l.id]) merged.add(l.id); else merged.delete(l.id);
      });
      onChange({ ...state, selectedLeadIds: merged });
    },
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    getRowId: (row) => row.id,
  });

  const selectedSize = state.selectedLeadIds.size;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const pageNumbers = buildPageNumbers(page, totalPages);

  function handlePageChange(p: number) {
    fetchLeads(p);
  }

  return (
    <>
      <div className="step-head">
        <div className="step-eyebrow">Schritt 2 von 4</div>
        <h1 className="step-heading">Empfänger auswählen</h1>
        <p className="step-desc">
          Wähle aus, wer diese Kampagne erhalten soll. Du siehst hier alle
          Leads mit Status <b>Neu</b> und E-Mail-Adresse.
        </p>
      </div>

      <div className="rounded-[var(--radius)] border border-border bg-card overflow-hidden">

        {/* Toolbar — 1:1 wie auf der Leads-Seite */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-2.5 flex-wrap bg-card">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" strokeWidth={1.75} />
            <Input
              placeholder="Firma, Kontakt, E-Mail …"
              className="pl-9 h-8 text-[13px] bg-card"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-grid place-items-center h-5 w-5 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Suche löschen"
              >
                <X className="h-3 w-3" strokeWidth={1.75} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <FilterTriggerPopover
              label="Land"
              value={country !== "all" ? (COUNTRY_LABELS[country] ?? country) : null}
              onClear={() => { setCountry("all"); setStates([]); }}
              selectValue={country}
              onSelectChange={(v) => { setCountry(v); setStates([]); }}
              options={countryOptions}
              searchPlaceholder="Land suchen…"
              emptyText="Kein Land gefunden"
            />
            {country === "AT" && (
              <FilterTriggerPopover
                label="Bundesland"
                value={states.length > 0 ? (states.length === 1 ? states[0] : `${states.length} ausgewählt`) : null}
                onClear={() => setStates([])}
                multi
                selectValue={states}
                onSelectChange={setStates}
                options={stateOptions}
                searchPlaceholder="Bundesland suchen…"
                emptyText="Kein Bundesland im Datenbestand"
              />
            )}
            <FilterTriggerPopover
              label="Branche"
              value={industries.length > 0 ? (industries.length === 1 ? industries[0] : `${industries.length} ausgewählt`) : null}
              onClear={() => setIndustries([])}
              multi
              selectValue={industries}
              onSelectChange={setIndustries}
              options={industryOptions}
              searchPlaceholder="Branche suchen…"
              emptyText="Keine Branche im Datenbestand"
            />
            <FilterTriggerPopover
              label="Stadt"
              value={cities.length > 0 ? (cities.length === 1 ? cities[0] : `${cities.length} ausgewählt`) : null}
              onClear={() => setCities([])}
              multi
              selectValue={cities}
              onSelectChange={setCities}
              options={cityOptions}
              searchPlaceholder="Stadt suchen…"
              emptyText="Keine Stadt im Datenbestand"
            />
            <FilterTriggerPopover
              label="Rechtsform"
              value={legalForms.length > 0 ? (legalForms.length === 1 ? legalForms[0] : `${legalForms.length} ausgewählt`) : null}
              onClear={() => setLegalForms([])}
              multi
              selectValue={legalForms}
              onSelectChange={setLegalForms}
              options={legalFormOptions}
              searchPlaceholder="Rechtsform suchen…"
              emptyText="Keine Rechtsform im Datenbestand"
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

          <div className="ml-auto flex items-center gap-2.5">
            {selectedSize > 0 && (
              <>
                <span className="text-[12.5px] text-muted-foreground">
                  <b className="text-foreground font-semibold">{selectedSize.toLocaleString("de-DE")}</b> ausgewählt
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => onChange({ ...state, selectedLeadIds: new Set() })}
                >
                  Leeren
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={selectAllMatching}
              disabled={selectingAll || displayCount === 0}
            >
              {selectingAll && <Loader2 className="h-3 w-3 animate-spin" />}
              Alle {displayCount.toLocaleString("de-DE")} auswählen
            </Button>
          </div>
        </div>

        {/* Table or states */}
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-md" />
            ))}
          </div>
        ) : visibleLeads.length === 0 ? (
          <Empty className="py-20 border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <InboxIcon />
              </EmptyMedia>
              <EmptyTitle>
                {hasActiveFilters ? "Keine Ergebnisse" : "Keine auswählbaren Leads"}
              </EmptyTitle>
              <EmptyDescription>
                {hasActiveFilters
                  ? "Passe die Filter an oder setze sie zurück."
                  : "Lege im Leads-Bereich neue Leads mit E-Mail-Adresse an."}
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
            {/* Tabelle — exakt die Leads-Optik; Zeilenklick wählt aus */}
            <div className="overflow-x-auto">
              <Table className="table-fixed">
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id} className="hover:bg-transparent border-b bg-card">
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          className="h-[42px] px-3.5 text-[11.5px] font-medium text-muted-foreground tracking-wide whitespace-nowrap"
                          style={{ width: header.getSize() }}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={cn(
                        "cursor-pointer transition-colors group border-b last:border-b-0",
                        row.getIsSelected()
                          ? "bg-accent hover:bg-accent/80"
                          : "hover:bg-muted/40",
                      )}
                      onClick={() => row.toggleSelected()}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell
                          key={cell.id}
                          className="py-3 px-3.5 align-middle text-[13px]"
                          style={{ width: cell.column.getSize() }}
                          onClick={cell.column.id === "select" ? (e) => e.stopPropagation() : undefined}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination — 1:1 wie auf der Leads-Seite */}
            <Separator />
            <div className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Pro Seite</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => setPageSize(Number(v))}
                  >
                    <SelectTrigger className="h-8 w-[78px] text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)} className="text-sm">{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-sm text-muted-foreground whitespace-nowrap">
                  {((page - 1) * pageSize + 1).toLocaleString("de-DE")}
                  –
                  {Math.min(page * pageSize, count).toLocaleString("de-DE")}
                  {" "}von{" "}
                  <span className="font-medium text-foreground">{count.toLocaleString("de-DE")}</span>
                </p>
              </div>

              {totalPages > 1 && (
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
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
