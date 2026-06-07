"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Users, Search, X, Plus, Check } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { AudienceState } from "./types";
import type { Lead } from "@/types/leads";

interface StepAudienceProps {
  state: AudienceState;
  onChange: (next: AudienceState) => void;
}

const PAGE_SIZE = 50;

interface FilterChipProps {
  label: string;
  value: string | null;
  onClear: () => void;
  options: { value: string; label: string }[];
  selectValue: string;
  onSelectChange: (v: string) => void;
}

function FilterChip({ label, value, onClear, options, selectValue, onSelectChange }: FilterChipProps) {
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

export function StepAudience({ state, onChange }: StepAudienceProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [count, setCount] = useState(0);

  const [industryOptions, setIndustryOptions] = useState<{ value: string; label: string }[]>([]);
  const [cityOptions, setCityOptions] = useState<{ value: string; label: string }[]>([]);

  // Fetch industries + cities once
  useEffect(() => {
    (async () => {
      try {
        const [iRes, cRes] = await Promise.all([
          fetch("/api/leads/industries"),
          fetch("/api/leads/cities"),
        ]);
        if (iRes.ok) {
          const j = await iRes.json();
          setIndustryOptions((j.data as string[] | undefined ?? []).map((v) => ({ value: v, label: v })));
        }
        if (cRes.ok) {
          const j = await cRes.json();
          setCityOptions((j.data as string[] | undefined ?? []).map((v) => ({ value: v, label: v })));
        }
      } catch { /* silent */ }
    })();
  }, []);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: "1",
        limit: String(PAGE_SIZE),
      });
      if (search) params.set("search", search);
      if (industryFilter !== "all") params.set("industry", industryFilter);
      if (cityFilter !== "all") params.set("city", cityFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("has_email", "true");

      const res = await fetch(`/api/leads?${params.toString()}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setLeads(json.data ?? []);
      setCount(json.count ?? 0);
    } catch {
      setLeads([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [search, industryFilter, cityFilter, statusFilter]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { fetchLeads(); }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchLeads]);

  function toggle(id: string) {
    const next = new Set(state.selectedLeadIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange({ ...state, selectedLeadIds: next });
  }
  function selectAllVisible() {
    const next = new Set(state.selectedLeadIds);
    leads.forEach((l) => next.add(l.id));
    onChange({ ...state, selectedLeadIds: next });
  }
  function clearAll() {
    onChange({ ...state, selectedLeadIds: new Set() });
  }

  const selectedSize = state.selectedLeadIds.size;
  const allVisibleSelected = leads.length > 0 && leads.every((l) => state.selectedLeadIds.has(l.id));

  const dailyCap = 50;
  const estimatedDays = Math.max(1, Math.ceil(selectedSize / dailyCap));

  return (
    <>
      <div className="step-head">
        <div className="step-eyebrow">
          <Users className="h-3 w-3" strokeWidth={1.75} />
          Schritt 3 von 5
        </div>
        <h1 className="step-heading">Empfänger:innen auswählen</h1>
        <p className="step-desc">
          Wähle direkt aus deinem Lead-Bestand. Filter und Suche helfen, die richtigen zu finden.
        </p>
      </div>

      <div className="audience-bar">
        <div className="audience-bar-count">
          <span className="big">{selectedSize.toLocaleString("de-DE")}</span>
          <div>
            <div className="audience-bar-lbl">
              {selectedSize === 0
                ? "Keine ausgewählt"
                : selectedSize === 1
                  ? "Empfänger:in ausgewählt"
                  : "Empfänger:innen ausgewählt"}
            </div>
            <div className="audience-bar-sub">
              von {count.toLocaleString("de-DE")} Leads · Geschätzte Sende-Dauer:{" "}
              <b>{estimatedDays} {estimatedDays === 1 ? "Tag" : "Tage"}</b> bei {dailyCap}/Tag
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {selectedSize > 0 && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearAll}>
              Auswahl leeren
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={selectAllVisible}>
            <Check className="h-3 w-3" strokeWidth={1.75} />
            Alle {leads.length} sichtbaren
          </Button>
        </div>
      </div>

      <div className="lead-picker-toolbar">
        <div className="relative w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" strokeWidth={1.75} />
          <Input
            placeholder="Firma, Kontakt, E-Mail …"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-[13px]"
          />
        </div>

        <FilterChip
          label="Branche"
          value={industryFilter !== "all" ? industryFilter : null}
          onClear={() => setIndustryFilter("all")}
          options={industryOptions}
          selectValue={industryFilter}
          onSelectChange={setIndustryFilter}
        />
        <FilterChip
          label="Stadt"
          value={cityFilter !== "all" ? cityFilter : null}
          onClear={() => setCityFilter("all")}
          options={cityOptions}
          selectValue={cityFilter}
          onSelectChange={setCityFilter}
        />
        <FilterChip
          label="Status"
          value={statusFilter !== "all" ? statusFilter : null}
          onClear={() => setStatusFilter("all")}
          options={[
            { value: "new",         label: "Neu" },
            { value: "contacted",   label: "Kontaktiert" },
            { value: "interested",  label: "Interessiert" },
          ]}
          selectValue={statusFilter}
          onSelectChange={setStatusFilter}
        />

        <span className="ml-auto text-[12.5px] text-muted-foreground">
          {leads.length} von {count.toLocaleString("de-DE")} Leads
        </span>
      </div>

      <div className="lead-picker-table">
        {loading ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        ) : leads.length === 0 ? (
          <div className="px-6 py-12 text-center text-[13px] text-muted-foreground">
            Keine Leads gefunden. Passe die Filter an oder importiere weitere Leads.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <button
                    type="button"
                    className={cn(
                      "checkbox-box mx-auto",
                      allVisibleSelected && "is-checked",
                    )}
                    aria-label="Alle sichtbaren auswählen"
                    onClick={() => {
                      const next = new Set(state.selectedLeadIds);
                      if (allVisibleSelected) {
                        leads.forEach((l) => next.delete(l.id));
                      } else {
                        leads.forEach((l) => next.add(l.id));
                      }
                      onChange({ ...state, selectedLeadIds: next });
                    }}
                  >
                    {allVisibleSelected && <Check className="h-2.5 w-2.5" strokeWidth={2.5} />}
                  </button>
                </th>
                <th>Unternehmen</th>
                <th>Branche</th>
                <th>Standort</th>
                <th>Entscheider:in</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const isSelected = state.selectedLeadIds.has(l.id);
                return (
                  <tr
                    key={l.id}
                    className={cn(isSelected && "is-selected")}
                    onClick={() => toggle(l.id)}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className={cn("checkbox-box mx-auto", isSelected && "is-checked")}
                        onClick={() => toggle(l.id)}
                        aria-label={`${l.company} auswählen`}
                      >
                        {isSelected && <Check className="h-2.5 w-2.5" strokeWidth={2.5} />}
                      </button>
                    </td>
                    <td>
                      <div>
                        <div className="co-name">{l.company}</div>
                        {l.email && <div className="meta">{l.email}</div>}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: 12.5 }}>{l.industry ?? "—"}</span>
                    </td>
                    <td>
                      <div>
                        <span style={{ fontSize: 12.5 }}>{l.city ?? "—"}</span>
                        {l.state && (
                          <div className="meta">{l.state}</div>
                        )}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: 12.5 }}>{l.ceo_name ?? "—"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="row-toggle mt-4 rounded-lg border border-border bg-card px-4 py-3">
        <div className="label-block">
          <div className="t">Bereits kontaktierte Leads ausblenden</div>
          <div className="s">Empfohlen, verhindert Mehrfach-Kontaktierungen.</div>
        </div>
        <Switch
          checked={state.excludeContacted}
          onCheckedChange={(v) => onChange({ ...state, excludeContacted: v })}
        />
      </div>
    </>
  );
}

/* Checkbox box for the table — reuses .checkbox-box from globals.css */
