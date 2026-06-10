"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Search, Check, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FilterTriggerPopover } from "@/components/shared/FilterTriggerPopover";
import { cn } from "@/lib/utils";
import type { AudienceState } from "./types";
import type { Lead } from "@/types/leads";

interface StepAudienceProps {
  state: AudienceState;
  onChange: (next: AudienceState) => void;
}

const PAGE_SIZE = 50;
/* Kampagnen kontaktieren nur frische Leads: wer schon kontaktiert wurde,
 * abgesagt hat oder Kunde ist, taucht hier gar nicht erst auf — dafür gibt
 * es den Lead-Status. */
const EXCLUDED_STATUS = "contacted,not_interested,converted";

export function StepAudience({ state, onChange }: StepAudienceProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [count, setCount] = useState(0);

  const [industryOptions, setIndustryOptions] = useState<{ value: string; label: string }[]>([]);
  const [cityOptions, setCityOptions] = useState<{ value: string; label: string }[]>([]);

  // Filter-Optionen einmal laden
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

  const buildParams = useCallback((extra: Record<string, string> = {}) => {
    const params = new URLSearchParams(extra);
    if (search) params.set("search", search);
    if (industryFilter !== "all") params.set("industry", industryFilter);
    if (cityFilter !== "all") params.set("city", cityFilter);
    params.set("exclude_status", EXCLUDED_STATUS);
    params.set("has_email", "true");
    return params;
  }, [search, industryFilter, cityFilter]);

  const fetchLeads = useCallback(async (pageToLoad: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = buildParams({ page: String(pageToLoad), limit: String(PAGE_SIZE) });
      const res = await fetch(`/api/leads?${params.toString()}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      const data: Lead[] = json.data ?? [];
      setLeads((prev) => (append ? [...prev, ...data] : data));
      setCount(json.count ?? 0);
      setPage(pageToLoad);
    } catch {
      if (!append) { setLeads([]); setCount(0); }
      toast.error("Leads konnten nicht geladen werden");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [buildParams]);

  /* Filter-/Suchänderung → Seite 1 neu laden (debounced) */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { fetchLeads(1, false); }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchLeads]);

  function toggle(id: string) {
    const next = new Set(state.selectedLeadIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange({ ...state, selectedLeadIds: next });
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
      ids.forEach((id) => next.add(id));
      onChange({ ...state, selectedLeadIds: next });
    } catch {
      toast.error("Auswahl fehlgeschlagen — bitte erneut versuchen");
    } finally {
      setSelectingAll(false);
    }
  }

  const selectedSize = state.selectedLeadIds.size;
  const allVisibleSelected = leads.length > 0 && leads.every((l) => state.selectedLeadIds.has(l.id));
  const hasMore = leads.length < count;

  return (
    <>
      <div className="step-head">
        <div className="step-eyebrow">Schritt 3 von 5</div>
        <h1 className="step-heading">Empfänger auswählen</h1>
        <p className="step-desc">
          Bereits kontaktierte Leads, Absagen und Kund:innen werden automatisch
          ausgelassen — hier erscheinen nur Leads mit E-Mail-Adresse, die noch
          niemand angeschrieben hat.
        </p>
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

        <FilterTriggerPopover
          label="Branche"
          value={industryFilter !== "all" ? industryFilter : null}
          onClear={() => setIndustryFilter("all")}
          options={industryOptions}
          selectValue={industryFilter}
          onSelectChange={setIndustryFilter}
        />
        <FilterTriggerPopover
          label="Stadt"
          value={cityFilter !== "all" ? cityFilter : null}
          onClear={() => setCityFilter("all")}
          options={cityOptions}
          selectValue={cityFilter}
          onSelectChange={setCityFilter}
        />

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
            disabled={selectingAll || count === 0}
          >
            {selectingAll && <Loader2 className="h-3 w-3 animate-spin" />}
            Alle {count.toLocaleString("de-DE")} auswählen
          </Button>
        </div>
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
            Keine passenden Leads gefunden. Passe Suche oder Filter an —
            oder lege im Leads-Bereich neue an.
          </div>
        ) : (
          <>
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
                      aria-label="Alle geladenen auswählen"
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
                  <th>Ansprechperson</th>
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
                        <span style={{ fontSize: 12.5 }}>{l.city ?? "—"}</span>
                      </td>
                      <td>
                        <span style={{ fontSize: 12.5 }}>{l.ceo_name ?? "—"}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {hasMore && (
              <div className="px-4 py-3 border-t border-border text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => fetchLeads(page + 1, true)}
                  disabled={loadingMore}
                >
                  {loadingMore
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} />}
                  Weitere laden
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
