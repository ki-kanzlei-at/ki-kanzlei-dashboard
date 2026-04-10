"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
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
  DACH_COUNTRIES,
  getRegionOptions,
  getRegionLabel,
} from "@/types/leads";
import { FilterCombobox } from "@/components/leads/FilterCombobox";

const searchSchema = z
  .object({
    country:      z.string().min(2),
    query:        z.string().optional(),
    locations:    z.array(z.string()).optional(),
    city:         z.string().optional(),
    company_type: z.string().optional(),
    require_ceo:  z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const hasQuery     = data.query && data.query.trim().length >= 2;
    const hasCity      = data.city && data.city.trim().length >= 1;
    const hasLocations = data.locations && data.locations.length > 0;

    if (!hasQuery && !hasCity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bitte Branche oder Stadt angeben",
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

export function LeadSearchForm({ onSubmit, isSearching, defaultCountry, defaultRequireCeo }: LeadSearchFormProps) {
  const form = useForm<SearchFormValues>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      country: defaultCountry || "AT",
      query: "",
      locations: [],
      city: "",
      company_type: "all",
      require_ceo: defaultRequireCeo ?? false,
    },
  });

  const selectedCountry = form.watch("country");
  const selectedLocations = form.watch("locations") ?? [];
  const regionOptions = getRegionOptions(selectedCountry);
  const regionLabel = getRegionLabel(selectedCountry);

  function handleCountryChange(value: string) {
    form.setValue("country", value);
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
    });
  }

  // unused — FilterCombobox builds its own label from options

  return (
    <Form {...form}>
      <Card>
        <CardContent className="pt-5">
          <div className="space-y-3">

            {/* Row 1: Branche + Land */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="query"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>Branche *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                        <Input
                          placeholder="z.B. Steuerberater, Anwalt, Arzt"
                          className="pl-9"
                          {...field}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(); } }}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormItem className="min-w-0">
                <FormLabel>Land *</FormLabel>
                <Select value={selectedCountry} onValueChange={handleCountryChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DACH_COUNTRIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            </div>

            {/* Row 2: Region (Multi) + Stadt */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="locations"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>
                      {regionLabel}
                      {selectedLocations.length > 1 && (
                        <span className="ml-1.5 text-xs text-primary font-normal">
                          → {selectedLocations.length} Suchaufträge
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
                      placeholder={`${regionLabel === "Kanton" ? "Kanton" : "Bundesland"} wählen`}
                      searchPlaceholder={`${regionLabel} suchen…`}
                      emptyText={`Kein ${regionLabel} gefunden`}
                      className="w-full"
                    />
                    <FormMessage />
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
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Row 3: Rechtsform */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="company_type"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>Rechtsform</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value || "all"}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Alle Rechtsformen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {COMPANY_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            {/* Row 4: Checkbox + Button */}
            <div className="flex items-center justify-between pt-2">
              <FormField
                control={form.control}
                name="require_ceo"
                render={({ field }) => (
                  <FormItem className="space-y-0">
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          id="require-ceo"
                        />
                      </FormControl>
                      <label htmlFor="require-ceo" className="text-sm cursor-pointer leading-none">
                        Nur mit Geschäftsführer
                      </label>
                    </div>
                  </FormItem>
                )}
              />

              <Button
                type="button"
                disabled={isSearching}
                className="gap-2"
                onClick={handleSubmit}
              >
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {isSearching
                  ? "Suche läuft…"
                  : selectedLocations.length > 1
                    ? `${selectedLocations.length} Suchen starten`
                    : "Leads suchen"}
              </Button>
            </div>

          </div>
        </CardContent>
      </Card>
    </Form>
  );
}

export type { SearchFormValues };
