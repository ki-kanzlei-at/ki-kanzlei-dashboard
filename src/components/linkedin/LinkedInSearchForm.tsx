"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DACH_COUNTRIES,
  getRegionOptions,
  getRegionLabel,
} from "@/types/leads";
import type { LegacySearchResult as UnipileSearchResult } from "@/lib/connectsafely/types";

/* ── LinkedIn Account Limits ── */
const ACCOUNT_LIMITS = {
  classic:         { search: 1000, outreach: 25, label: "Classic",         color: "text-muted-foreground" },
  premium:         { search: 1000, outreach: 25, label: "Premium",         color: "text-blue-600" },
  sales_navigator: { search: 2500, outreach: 50, label: "Sales Navigator", color: "text-amber-600" },
} as const;

type AccountType = keyof typeof ACCOUNT_LIMITS;

const searchSchema = z.object({
  query: z.string().min(2, "Mindestens 2 Zeichen"),
  country: z.string().min(2),
  location: z.string().optional(),
  city: z.string().optional(),
});

type SearchFormValues = z.infer<typeof searchSchema>;

interface LinkedInSearchFormProps {
  onImported: () => void;
}

export function LinkedInSearchForm({ onImported }: LinkedInSearchFormProps) {
  const [searching, setSearching] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>("classic");
  const [ready, setReady] = useState(false);
  const abortRef = useRef(false);

  const form = useForm<SearchFormValues>({
    resolver: zodResolver(searchSchema),
    defaultValues: { query: "", country: "AT", location: "", city: "" },
  });

  const selectedCountry = form.watch("country");
  const regionOptions = getRegionOptions(selectedCountry);
  const regionLabel = getRegionLabel(selectedCountry);
  const limits = ACCOUNT_LIMITS[accountType];

  // Auto-detect account type on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/linkedin/accounts");
        if (!res.ok) { setReady(true); return; }
        const json = await res.json();
        const settingsRes = await fetch("/api/settings");
        const settingsJson = await settingsRes.json();
        const savedId = settingsJson.data?.connectsafely_account_id ?? settingsJson.data?.unipile_account_id;
        const accounts = json.data ?? [];
        const match = savedId
          ? accounts.find((a: { id: string }) => a.id === savedId)
          : accounts[0];
        if (match?.type) setAccountType(match.type as AccountType);
      } catch { /* silent */ }
      finally { setReady(true); }
    })();
  }, []);

  function handleCountryChange(value: string) {
    form.setValue("country", value);
    form.setValue("location", "");
    form.clearErrors();
  }

  const importBatch = useCallback(async (items: UnipileSearchResult[], query: string) => {
    if (items.length === 0) return 0;

    // Filter out unknown/invalid profiles (including German "LinkedIn Mitglied")
    const INVALID_NAMES = new Set([
      "unknown", "linkedin member", "linkedin user", "linkedin mitglied",
      "linkedin-mitglied", "linkedin nutzer",
    ]);
    const validItems = items.filter((r) => {
      const name = (r.name || "").toLowerCase().trim();
      return name && !INVALID_NAMES.has(name) && name.length > 1;
    });
    if (validItems.length === 0) return 0;

    const leads = validItems.map((r) => {
      const fullName = r.name || [r.first_name, r.last_name].filter(Boolean).join(" ") || r.id;
      const nameParts = fullName.split(" ");
      return {
        linkedin_url: r.profile_url || r.public_profile_url || `https://www.linkedin.com/in/${r.public_identifier || r.id}`,
        linkedin_id: r.id || r.provider_id,
        full_name: fullName,
        first_name: r.first_name || nameParts[0] || null,
        last_name: r.last_name || nameParts.slice(1).join(" ") || null,
        headline: r.headline || null,
        location: r.location || null,
        profile_picture_url: r.profile_picture_url || null,
        search_query: query,
      };
    });

    try {
      const res = await fetch("/api/linkedin/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads }),
      });
      const json = await res.json();
      return res.ok ? (json.count ?? leads.length) : 0;
    } catch {
      return 0;
    }
  }, []);

  /**
   * Search a single location and paginate through all results.
   * Returns { imported, duplicates, results }.
   */
  async function searchLocation(
    queryStr: string,
    locationStr: string,
    apiType: string,
    existingUrls: Set<string>,
    toastId: string | number,
    totals: { imported: number; duplicates: number; results: number },
    regionLabel?: string,
  ) {
    let cursor: string | null = null;
    let pageNum = 0;
    let locationTotal = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (abortRef.current) break;

      const pageRes: Response = await fetch("/api/linkedin/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: queryStr,
          location: locationStr || undefined,
          cursor,
          api: apiType,
        }),
      });

      const json = await pageRes.json();

      if (!pageRes.ok) {
        if (pageNum === 0 && !regionLabel) {
          toast.error(json.error || "Suche fehlgeschlagen", { id: toastId, duration: 5000 });
        }
        break;
      }

      const items: UnipileSearchResult[] = json.data?.items ?? [];
      if (items.length === 0) break;

      if (pageNum === 0 && json.data?.paging?.total_count) {
        locationTotal = json.data.paging.total_count;
      }

      totals.results += items.length;

      // Split into new vs duplicate
      const newItems: UnipileSearchResult[] = [];
      for (const item of items) {
        const url = item.profile_url || item.public_profile_url
          || `https://www.linkedin.com/in/${item.public_identifier || item.id}`;
        if (existingUrls.has(url)) {
          totals.duplicates++;
        } else {
          newItems.push(item);
          existingUrls.add(url);
        }
      }

      // Import new items
      if (newItems.length > 0) {
        const count = await importBatch(newItems, queryStr);
        totals.imported += count;
      }

      // Update toast
      const regionInfo = regionLabel ? ` · ${regionLabel}` : "";
      const progress = locationTotal > 0
        ? ` (${Math.round(((totals.results) / locationTotal) * 100)}%)`
        : "";
      toast.loading(`${totals.results.toLocaleString("de")} Ergebnisse geladen${progress}`, {
        id: toastId,
        description: `${totals.imported} neu importiert · ${totals.duplicates} Duplikate${regionInfo}`,
      });

      cursor = json.data?.cursor ?? null;
      pageNum++;
      if (!cursor) break;
    }
  }

  async function handleSearch() {
    const valid = await form.trigger();
    if (!valid) return;

    const values = form.getValues();
    const queryStr = values.query.trim();

    abortRef.current = false;
    setSearching(true);

    const apiType = accountType === "sales_navigator" ? "sales_navigator" : "classic";

    // Determine which locations to search
    const hasCity = !!values.city?.trim();
    const hasRegion = !!values.location && values.location !== "all";
    const searchAllRegions = !hasCity && !hasRegion;

    // Build list of locations to search
    let locations: { str: string; label?: string }[];

    if (hasCity) {
      locations = [{ str: values.city!.trim() }];
    } else if (hasRegion) {
      locations = [{ str: values.location! }];
    } else {
      // No specific region → search each region individually to bypass LinkedIn's per-search limit
      const regions = getRegionOptions(values.country).filter((r) => r.value !== "all");
      locations = regions.map((r) => ({ str: r.value, label: r.label }));
    }

    const toastId = toast.loading(
      searchAllRegions
        ? `LinkedIn-Suche gestartet (${locations.length} Regionen)…`
        : "LinkedIn-Suche gestartet…",
      { description: "Ergebnisse werden geladen und importiert", duration: Infinity },
    );

    const totals = { imported: 0, duplicates: 0, results: 0 };

    try {
      // Load ALL existing URLs to detect duplicates
      const existingRes = await fetch("/api/linkedin/leads?pageSize=9999");
      const existingJson = await existingRes.json();
      const existingUrls = new Set<string>(
        (existingJson.data?.data ?? []).map((l: { linkedin_url: string }) => l.linkedin_url),
      );

      for (let i = 0; i < locations.length; i++) {
        if (abortRef.current) break;

        const loc = locations[i];

        if (searchAllRegions) {
          toast.loading(
            `Region ${i + 1}/${locations.length}: ${loc.label ?? loc.str}`,
            {
              id: toastId,
              description: `${totals.imported} neu importiert · ${totals.duplicates} Duplikate`,
            },
          );
        }

        await searchLocation(
          queryStr, loc.str, apiType,
          existingUrls, toastId, totals, loc.label,
        );
      }

      // Final toast
      if (totals.results === 0) {
        toast.info("Keine Ergebnisse gefunden", {
          id: toastId,
          description: "Versuche andere Suchbegriffe oder einen anderen Standort.",
          duration: 5000,
        });
      } else if (totals.imported > 0) {
        toast.success(`${totals.imported} neue Leads importiert`, {
          id: toastId,
          description: `${totals.results.toLocaleString("de")} Ergebnisse durchsucht · ${totals.duplicates} Duplikate übersprungen`,
          duration: 5000,
        });
        onImported();
      } else {
        toast.info("Alle Ergebnisse bereits vorhanden", {
          id: toastId,
          description: `${totals.results.toLocaleString("de")} Ergebnisse, ${totals.duplicates} Duplikate`,
          duration: 5000,
        });
        onImported();
      }
    } catch {
      toast.error("Netzwerkfehler bei der Suche", { id: toastId, duration: 5000 });
    } finally {
      setSearching(false);
    }
  }

  return (
    <Form {...form}>
      <Card>
        <CardContent className="pt-5">
          <div className="space-y-3">

            {/* Row 1: Suchbegriff + Land */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="query"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>Suchbegriff *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                        <Input
                          placeholder="z.B. Rechtsanwalt, CEO, Steuerberater"
                          className="pl-9"
                          {...field}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormItem className="min-w-0">
                <FormLabel>Land</FormLabel>
                <Select value={selectedCountry} onValueChange={handleCountryChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DACH_COUNTRIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            </div>

            {/* Row 2: Region + Stadt */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>{regionLabel}</FormLabel>
                    <Select
                      onValueChange={(val) => { field.onChange(val === "all" ? "" : val); }}
                      value={field.value || "all"}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={`Alle ${regionLabel === "Kanton" ? "Kantone" : "Bundesländer"}`} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {regionOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>Stadt / Ort</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="z.B. Salzburg"
                        {...field}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Row 3: Button */}
            <div className="flex items-end gap-3">
              <Button
                type="button"
                disabled={!ready || searching}
                className="gap-2 h-9"
                onClick={searching ? () => { abortRef.current = true; } : handleSearch}
              >
                {searching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {searching ? "Suche läuft…" : "Suche starten"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </Form>
  );
}
