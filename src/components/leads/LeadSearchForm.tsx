"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Search, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COMPANY_TYPE_OPTIONS,
  getRegionOptions,
  getRegionLabel,
} from "@/types/leads";
import { DACH_COUNTRIES } from "@/lib/countries";
import { FilterCombobox } from "@/components/leads/FilterCombobox";
import { Slider } from "@/components/ui/slider";

const searchSchema = z
  .object({
    country:      z.enum(["AT", "DE", "CH"]),
    query:        z.string().optional(),
    locations:    z.array(z.string()).optional(),
    city:         z.string().optional(),
    company_type: z.string().optional(),
    require_ceo:  z.boolean().optional(),
    require_email: z.boolean().optional(),
    require_website: z.boolean().optional(),
    min_employees: z.string().optional(),
    max_results:  z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const hasQuery     = data.query && data.query.trim().length >= 2;
    const hasCity      = data.city && data.city.trim().length >= 1;
    const hasLocations = data.locations && data.locations.length > 0;

    /* Branche ist Pflicht — das Backend verlangt query. Stadt allein reicht nicht. */
    if (!hasQuery) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Branche ist erforderlich (mind. 2 Zeichen)",
        path: ["query"],
      });
    }

    if (hasQuery && !hasCity && !hasLocations) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bitte Region wählen oder Stadt eingeben",
        path: ["locations"],
      });
    }
  });

type SearchFormValues = z.infer<typeof searchSchema>;
export type SearchSource = "native";

interface LeadSearchFormProps {
  onSubmit: (values: SearchFormValues, source: SearchSource) => Promise<void>;
  isSearching: boolean;
  searchSource?: SearchSource | null;
  defaultCountry?: string;
  defaultRequireCeo?: boolean;
}

type DachCountry = "AT" | "DE" | "CH";

function asDach(country: string | undefined): DachCountry {
  return country === "DE" || country === "CH" ? country : "AT";
}

export function LeadSearchForm({ onSubmit, isSearching, defaultCountry, defaultRequireCeo }: LeadSearchFormProps) {
  const form = useForm<SearchFormValues>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      country: asDach(defaultCountry),
      query: "",
      locations: [],
      city: "",
      company_type: "all",
      require_ceo: defaultRequireCeo ?? false,
      require_email: false,
      require_website: false,
      min_employees: "",
      max_results: "",
    },
  });

  const selectedCountry = form.watch("country");
  const selectedLocations = form.watch("locations") ?? [];
  const regionOptions = getRegionOptions(selectedCountry);
  const regionLabel = getRegionLabel(selectedCountry);

  function handleCountryChange(value: string) {
    form.setValue("country", asDach(value));
    form.setValue("locations", []);
    form.clearErrors();
  }

  async function handleSubmit() {
    const valid = await form.trigger();
    if (!valid) return;
    const values = form.getValues();
    await onSubmit({
      ...values,
      company_type: values.company_type === "all" ? undefined : values.company_type,
    }, "native");
    form.reset({
      country: values.country,
      locations: [],
      require_ceo: values.require_ceo,
      require_email: values.require_email,
      require_website: values.require_website,
      // Filter beibehalten über mehrere Suchen hinweg
      min_employees: values.min_employees,
      max_results: values.max_results,
    });
  }

  return (
    <Form {...form}>
      <Card className="border-border/70 shadow-none">
        <CardHeader className="pb-4 border-b border-border/70">
          <CardTitle className="text-base font-medium tracking-tight">Neue Suche</CardTitle>
          <CardDescription className="text-[13px]">
            Branche, Region und Filter — wir finden die passenden Leads.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">

          {/* Hero grid: Branche | Region | Land | Button */}
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1.3fr_0.9fr_auto] gap-3 items-end">
            <FormField
              control={form.control}
              name="query"
              render={({ field }) => (
                <FormItem className="min-w-0">
                  <FormLabel className="text-xs font-medium">Branche</FormLabel>
                  <FormControl>
                    <div className="relative flex items-center">
                      <Search className="absolute left-3 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" strokeWidth={1.75} />
                      <Input
                        placeholder="z. B. Steuerberater, Anwalt, Arzt …"
                        className="pl-9 h-9 bg-card"
                        {...field}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(); } }}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-[11px]" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="locations"
              render={({ field }) => (
                <FormItem className="min-w-0">
                  <FormLabel className="text-xs font-medium flex items-center gap-1.5">
                    {regionLabel}
                    {selectedLocations.length > 1 && (
                      <span className="ml-auto text-[10.5px] text-primary font-normal">
                        {selectedLocations.length} Jobs
                      </span>
                    )}
                  </FormLabel>
                  <FilterCombobox
                    multi
                    value={field.value ?? []}
                    onChange={(val) => {
                      field.onChange(val);
                      form.clearErrors("locations");
                    }}
                    options={regionOptions
                      .filter((o) => o.value !== "all")
                      .map((o) => ({ value: o.value, label: o.label }))}
                    placeholder={`${regionLabel} wählen`}
                    searchPlaceholder={`${regionLabel} suchen…`}
                    emptyText={`Kein ${regionLabel} gefunden`}
                    className="w-full"
                  />
                  <FormMessage className="text-[11px]" />
                </FormItem>
              )}
            />

            <FormItem className="min-w-0">
              <FormLabel className="text-xs font-medium flex items-center gap-1.5">
                Land
              </FormLabel>
              <FilterCombobox
                value={selectedCountry || "AT"}
                onChange={(val) => handleCountryChange(val || "AT")}
                options={DACH_COUNTRIES.map((c) => ({
                  value: c.value,
                  label: c.label,
                }))}
                placeholder="Land wählen"
                searchPlaceholder="Land suchen…"
                emptyText="Kein Land gefunden"
                className="w-full"
              />
            </FormItem>

            <div className="flex items-end md:pb-0">
              <Button
                type="button"
                disabled={isSearching}
                className="h-9 px-4 gap-2 font-medium w-full md:min-w-[160px]"
                onClick={handleSubmit}
              >
                {isSearching ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Sucht …
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {selectedLocations.length > 1 ? `${selectedLocations.length} Suchen starten` : "Suche starten"}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Optionaler erweiterter Block: Stadt + Rechtsform */}
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1.3fr_0.9fr] gap-3 items-end">
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem className="min-w-0">
                  <FormLabel className="text-xs font-medium text-muted-foreground">Stadt / Ort (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="z. B. Salzburg, Wien, Zürich" className="h-9 bg-card text-sm" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="company_type"
              render={({ field }) => (
                <FormItem className="min-w-0">
                  <FormLabel className="text-xs font-medium text-muted-foreground">Rechtsform</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || "all"}
                  >
                    <FormControl>
                      <SelectTrigger className="h-9 w-full text-sm bg-card">
                        <SelectValue placeholder="Alle Rechtsformen" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-white">
                      {COMPANY_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-sm">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          </div>

          {/* Kompakte Zeile: Anzahl Leads · Min. Mitarbeiter · Qualitäts-Toggles */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-1">
            <FormField
              control={form.control}
              name="max_results"
              render={({ field }) => {
                const n = field.value ? Number(field.value) : 0;
                return (
                  <FormItem className="flex items-center gap-3 space-y-0">
                    <FormLabel className="m-0 whitespace-nowrap text-xs font-medium text-muted-foreground">Anzahl Leads</FormLabel>
                    <Slider
                      min={0}
                      max={500}
                      step={10}
                      value={[n]}
                      onValueChange={([v]) => field.onChange(v === 0 ? "" : String(v))}
                      className="w-44"
                    />
                    <span className="w-10 shrink-0 text-xs font-normal tabular-nums text-muted-foreground">{n === 0 ? "Alle" : n}</span>
                  </FormItem>
                );
              }}
            />

            <FormField
              control={form.control}
              name="min_employees"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormLabel className="m-0 whitespace-nowrap text-xs font-medium text-muted-foreground">Min. Mitarbeiter</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} placeholder="z. B. 10" className="h-8 w-24 bg-card text-sm" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <FormField control={form.control} name="require_ceo" render={({ field }) => (
                <FormItem className="space-y-0"><div className="flex items-center gap-2">
                  <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} id="require-ceo" className="h-3.5 w-3.5" /></FormControl>
                  <label htmlFor="require-ceo" className="text-[12.5px] cursor-pointer leading-none text-foreground">Nur mit Geschäftsführer:in</label>
                </div></FormItem>
              )} />
              <FormField control={form.control} name="require_email" render={({ field }) => (
                <FormItem className="space-y-0"><div className="flex items-center gap-2">
                  <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} id="require-email" className="h-3.5 w-3.5" /></FormControl>
                  <label htmlFor="require-email" className="text-[12.5px] cursor-pointer leading-none text-foreground">Mit verifizierter E-Mail</label>
                </div></FormItem>
              )} />
              <FormField control={form.control} name="require_website" render={({ field }) => (
                <FormItem className="space-y-0"><div className="flex items-center gap-2">
                  <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} id="require-website" className="h-3.5 w-3.5" /></FormControl>
                  <label htmlFor="require-website" className="text-[12.5px] cursor-pointer leading-none text-foreground">Mit Website</label>
                </div></FormItem>
              )} />
            </div>
          </div>

        </CardContent>
      </Card>
    </Form>
  );
}

export type { SearchFormValues };
