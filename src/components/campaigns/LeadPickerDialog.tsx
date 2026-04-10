"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Search, X, Check, Users, CheckSquare } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Pagination,
  PaginationContent,
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
} from "@/components/ui/empty";
import { IndustryCombobox } from "@/components/leads/IndustryCombobox";

import type { Lead } from "@/types/leads";

interface LeadPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: Set<string>;
  onConfirm: (ids: Set<string>) => void;
}

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: "all", label: "Alle Status" },
  { value: "new", label: "Neu" },
  { value: "contacted", label: "Kontaktiert" },
  { value: "interested", label: "Interessiert" },
];

export function LeadPickerDialog({
  open,
  onOpenChange,
  selectedIds: initialIds,
  onConfirm,
}: LeadPickerDialogProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [industry, setIndustry] = useState<string[]>([]);
  const [city, setCity] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [industryOptions, setIndustryOptions] = useState<{ value: string; label: string }[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync initial selection when dialog opens
  useEffect(() => {
    if (open) {
      setSelected(new Set(initialIds));
    }
  }, [open, initialIds]);

  // Fetch industries
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const res = await fetch("/api/leads/industries");
        if (!res.ok) return;
        const json = await res.json();
        setIndustryOptions((json.data as string[]).map((v) => ({ value: v, label: v })));
      } catch { /* silent */ }
    })();
  }, [open]);

  const fetchLeads = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: String(PAGE_SIZE),
      });
      if (search) params.set("search", search);
      if (status !== "all") params.set("status", status);
      if (industry.length > 0) params.set("industry", industry.join(","));
      if (city) params.set("city", city);

      const res = await fetch(`/api/leads?${params.toString()}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setLeads(json.data ?? []);
      setCount(json.count ?? 0);
    } catch {
      toast.error("Fehler beim Laden der Leads");
    } finally {
      setLoading(false);
    }
  }, [search, status, industry, city]);

  // Fetch on filter changes (not search — that's debounced)
  useEffect(() => {
    if (!open) return;
    setPage(1);
    fetchLeads(1);
  }, [open, status, industry, city, fetchLeads]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (search.length === 1) return;

    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchLeads(1);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function toggleLead(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    const emailLeads = leads.filter((l) => l.email);
    const allSelected = emailLeads.length > 0 && emailLeads.every((l) => selected.has(l.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        emailLeads.forEach((l) => next.delete(l.id));
      } else {
        emailLeads.forEach((l) => next.add(l.id));
      }
      return next;
    });
  }

  function handlePageChange(p: number) {
    setPage(p);
    fetchLeads(p);
  }

  function resetFilters() {
    setSearch("");
    setStatus("all");
    setIndustry([]);
    setCity("");
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const emailLeads = leads.filter((l) => l.email);
  const allPageSelected = emailLeads.length > 0 && emailLeads.every((l) => selected.has(l.id));
  const hasFilters = search || status !== "all" || industry || city;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Leads auswählen
          </DialogTitle>
          <DialogDescription>
            Wähle die Leads für deine Kampagne aus. Nur Leads mit E-Mail-Adresse können ausgewählt werden.
          </DialogDescription>
        </DialogHeader>

        <Separator />

        {/* Filters */}
        <div className="px-6 py-3 bg-muted/20 border-b shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <InputGroup className="h-8 w-56">
              <InputGroupAddon>
                <Search className="h-3.5 w-3.5" />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Firma, Name, E-Mail..."
                className="text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>

            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="w-44">
              <IndustryCombobox
                value={industry}
                onChange={setIndustry}
                placeholder="Branche"
                options={industryOptions.length > 0 ? industryOptions : undefined}
              />
            </div>

            <InputGroup className="h-8 w-36">
              <InputGroupInput
                placeholder="Stadt..."
                className="text-xs"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </InputGroup>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-muted-foreground"
                onClick={resetFilters}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Zurücksetzen
              </Button>
            )}

            <div className="ml-auto flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {selected.size} ausgewählt
              </Badge>
              <span className="text-xs text-muted-foreground">
                {count} Ergebnisse
              </span>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto min-h-0">
          {loading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : leads.length === 0 ? (
            <Empty className="py-16 border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Users />
                </EmptyMedia>
                <EmptyTitle className="text-sm">
                  {hasFilters ? "Keine Ergebnisse" : "Keine Leads vorhanden"}
                </EmptyTitle>
                <EmptyDescription>
                  {hasFilters
                    ? "Passe die Filter an oder setze sie zurück."
                    : "Starte zuerst eine Lead-Suche."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-6">
                    <Checkbox
                      checked={allPageSelected}
                      onCheckedChange={togglePage}
                    />
                  </TableHead>
                  <TableHead>Firma</TableHead>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>Ansprechpartner</TableHead>
                  <TableHead>Stadt</TableHead>
                  <TableHead>Branche</TableHead>
                  <TableHead className="w-14">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => {
                  const hasEmail = !!lead.email;
                  const isSelected = selected.has(lead.id);
                  return (
                    <TableRow
                      key={lead.id}
                      className={`${hasEmail ? "cursor-pointer hover:bg-muted/50" : "opacity-40"} ${isSelected ? "bg-primary/5" : ""}`}
                      onClick={() => hasEmail && toggleLead(lead.id)}
                    >
                      <TableCell className="pl-6" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          disabled={!hasEmail}
                          onCheckedChange={() => hasEmail && toggleLead(lead.id)}
                        />
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {lead.company}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {lead.email ?? <span className="italic">Keine E-Mail</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {lead.ceo_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {lead.city ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {lead.industry ?? "—"}
                      </TableCell>
                      <TableCell>
                        {isSelected && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <>
            <Separator />
            <div className="px-6 py-2 flex items-center justify-between shrink-0">
              <p className="text-xs text-muted-foreground">
                Seite {page} von {totalPages}
              </p>
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent className="gap-0.5">
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => { e.preventDefault(); if (page > 1) handlePageChange(page - 1); }}
                      className={`h-7 text-xs px-2 ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
                    />
                  </PaginationItem>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let p: number;
                    if (totalPages <= 5) p = i + 1;
                    else if (page <= 3) p = i + 1;
                    else if (page >= totalPages - 2) p = totalPages - 4 + i;
                    else p = page - 2 + i;
                    return (
                      <PaginationItem key={p}>
                        <PaginationLink
                          href="#"
                          isActive={p === page}
                          onClick={(e) => { e.preventDefault(); handlePageChange(p); }}
                          className="h-7 w-7 text-xs"
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => { e.preventDefault(); if (page < totalPages) handlePageChange(page + 1); }}
                      className={`h-7 text-xs px-2 ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </>
        )}

        {/* Fixed Bottom Bar */}
        <div className="shrink-0 border-t bg-muted/30 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selected.size > 0 ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-primary/10 rounded-md px-2.5 py-1">
                  <CheckSquare className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold text-primary">
                    {selected.size} ausgewählt
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => setSelected(new Set())}
                >
                  <X className="h-3 w-3 mr-1" />
                  Auswahl aufheben
                </Button>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                Wähle Leads mit E-Mail-Adresse aus
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button
              size="sm"
              disabled={selected.size === 0}
              onClick={() => onConfirm(selected)}
            >
              {selected.size} Lead{selected.size !== 1 ? "s" : ""} übernehmen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
