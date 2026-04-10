"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Building2,
  Phone,
  MapPin,
  Share2,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type { Lead, LeadStatus } from "@/types/leads";
import { COUNTRY_OPTIONS } from "@/types/leads";
import { IndustryCombobox } from "@/components/leads/IndustryCombobox";

const STATUS_OPTIONS: { value: LeadStatus; label: string; dot: string }[] = [
  { value: "new",            label: "Neu",            dot: "bg-primary/50" },
  { value: "contacted",      label: "Kontaktiert",    dot: "bg-amber-500" },
  { value: "interested",     label: "Interessiert",   dot: "bg-emerald-500" },
  { value: "not_interested", label: "Kein Interesse", dot: "bg-muted-foreground/50" },
  { value: "converted",      label: "Konvertiert",    dot: "bg-primary" },
];

const GENDER_OPTIONS = [
  { value: "herr",      label: "Herr" },
  { value: "frau",      label: "Frau" },
  { value: "divers",    label: "Divers" },
  { value: "unbekannt", label: "Unbekannt" },
];

const SOCIAL_FIELDS = [
  { name: "social_linkedin",  label: "LinkedIn",    placeholder: "https://linkedin.com/company/..." },
  { name: "social_facebook",  label: "Facebook",    placeholder: "https://facebook.com/..." },
  { name: "social_instagram", label: "Instagram",   placeholder: "https://instagram.com/..." },
  { name: "social_xing",      label: "Xing",        placeholder: "https://xing.com/companies/..." },
  { name: "social_twitter",   label: "Twitter / X", placeholder: "https://x.com/..." },
  { name: "social_youtube",   label: "YouTube",     placeholder: "https://youtube.com/@..." },
  { name: "social_tiktok",    label: "TikTok",      placeholder: "https://tiktok.com/@..." },
] as const;

const editSchema = z.object({
  company:            z.string().min(1, "Firma ist erforderlich"),
  legal_form:         z.string().optional(),
  industry:           z.string().optional(),
  status:             z.string(),
  notes:              z.string().optional(),
  ceo_gender:         z.string().optional(),
  ceo_title:          z.string().optional(),
  ceo_first_name:     z.string().optional(),
  ceo_last_name:      z.string().optional(),
  ceo_name:           z.string().optional(),
  phone:              z.string().optional(),
  email:              z.string().email("Ungültige E-Mail").optional().or(z.literal("")),
  website:            z.string().optional(),
  street:             z.string().optional(),
  postal_code:        z.string().optional(),
  city:               z.string().optional(),
  country:            z.string().optional(),
  social_linkedin:    z.string().optional(),
  social_facebook:    z.string().optional(),
  social_instagram:   z.string().optional(),
  social_xing:        z.string().optional(),
  social_twitter:     z.string().optional(),
  social_youtube:     z.string().optional(),
  social_tiktok:      z.string().optional(),
});

type EditFormValues = z.infer<typeof editSchema>;

interface LeadEditSheetProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function LeadEditSheet({ lead, open, onOpenChange, onSaved }: LeadEditSheetProps) {
  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      company: "", legal_form: "", industry: "", status: "new", notes: "",
      ceo_gender: "", ceo_title: "", ceo_first_name: "", ceo_last_name: "", ceo_name: "",
      phone: "", email: "", website: "",
      street: "", postal_code: "", city: "", country: "",
      social_linkedin: "", social_facebook: "", social_instagram: "",
      social_xing: "", social_twitter: "", social_youtube: "", social_tiktok: "",
    },
  });

  useEffect(() => {
    if (lead && open) {
      form.reset({
        company:              lead.company ?? "",
        legal_form:           lead.legal_form ?? "",
        industry:             lead.industry ?? "",
        status:               lead.status,
        notes:                lead.notes ?? "",
        ceo_gender:           lead.ceo_gender ?? "",
        ceo_title:            lead.ceo_title ?? "",
        ceo_first_name:       lead.ceo_first_name ?? "",
        ceo_last_name:        lead.ceo_last_name ?? "",
        ceo_name:             lead.ceo_name ?? "",
        phone:                lead.phone ?? "",
        email:                lead.email ?? "",
        website:              lead.website ?? "",
        street:               lead.street ?? lead.address ?? "",
        postal_code:          lead.postal_code ?? "",
        city:                 lead.city ?? "",
        country:              lead.country ?? "",
        social_linkedin:      lead.social_linkedin ?? "",
        social_facebook:      lead.social_facebook ?? "",
        social_instagram:     lead.social_instagram ?? "",
        social_xing:          lead.social_xing ?? "",
        social_twitter:       lead.social_twitter ?? "",
        social_youtube:       lead.social_youtube ?? "",
        social_tiktok:        lead.social_tiktok ?? "",
      });
    }
  }, [lead, open, form]);

  // Auto-generate ceo_name from parts
  const ceoTitle = form.watch("ceo_title");
  const ceoFirst = form.watch("ceo_first_name");
  const ceoLast  = form.watch("ceo_last_name");

  useEffect(() => {
    const parts = [ceoTitle, ceoFirst, ceoLast].filter(Boolean);
    if (parts.length >= 2) {
      form.setValue("ceo_name", parts.join(" "), { shouldDirty: false });
    }
  }, [ceoTitle, ceoFirst, ceoLast, form]);

  async function onSubmit(values: EditFormValues) {
    if (!lead) return;
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company:              values.company,
          legal_form:           values.legal_form || null,
          industry:             values.industry || null,
          status:               values.status,
          notes:                values.notes || null,
          ceo_gender:           values.ceo_gender || null,
          ceo_title:            values.ceo_title || null,
          ceo_first_name:       values.ceo_first_name || null,
          ceo_last_name:        values.ceo_last_name || null,
          ceo_name:             values.ceo_name || null,
          phone:                values.phone || null,
          email:                values.email || null,
          website:              values.website || null,
          street:               values.street || null,
          postal_code:          values.postal_code || null,
          city:                 values.city || null,
          country:              values.country || null,
          social_linkedin:      values.social_linkedin || null,
          social_facebook:      values.social_facebook || null,
          social_instagram:     values.social_instagram || null,
          social_xing:          values.social_xing || null,
          social_twitter:       values.social_twitter || null,
          social_youtube:       values.social_youtube || null,
          social_tiktok:        values.social_tiktok || null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Lead aktualisiert");
      onOpenChange(false);
      onSaved();
    } catch {
      toast.error("Fehler beim Speichern");
    }
  }

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === form.watch("status"));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[640px] sm:w-[720px] flex flex-col p-0 gap-0">

        {/* Header */}
        <SheetHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base truncate leading-tight">
                {lead?.company ?? "Lead bearbeiten"}
              </SheetTitle>
              <SheetDescription className="text-xs mt-0.5">
                {lead?.city ? `${lead.city} · ` : ""}Daten bearbeiten und speichern
              </SheetDescription>
            </div>
            {currentStatus && (
              <Badge variant="secondary" className="shrink-0 text-xs font-medium gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${currentStatus.dot}`} />
                {currentStatus.label}
              </Badge>
            )}
          </div>
        </SheetHeader>

        {/* Form */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">

            <Tabs defaultValue="company" className="flex flex-col flex-1 min-h-0">
              <div className="px-6 pt-3 pb-0 shrink-0 border-b">
                <TabsList className="h-8 w-full grid grid-cols-5 mb-0">
                  <TabsTrigger value="company" className="text-[11px] gap-1">
                    <Building2 className="h-3 w-3" />
                    Firma
                  </TabsTrigger>
                  <TabsTrigger value="contact_person" className="text-[11px] gap-1">
                    <User className="h-3 w-3" />
                    Person
                  </TabsTrigger>
                  <TabsTrigger value="contact" className="text-[11px] gap-1">
                    <Phone className="h-3 w-3" />
                    Kontakt
                  </TabsTrigger>
                  <TabsTrigger value="address" className="text-[11px] gap-1">
                    <MapPin className="h-3 w-3" />
                    Adresse
                  </TabsTrigger>
                  <TabsTrigger value="social" className="text-[11px] gap-1">
                    <Share2 className="h-3 w-3" />
                    Social
                  </TabsTrigger>
                </TabsList>
              </div>

              <ScrollArea className="flex-1">

                {/* Tab: Firma */}
                <TabsContent value="company" className="mt-0 px-6 py-5 space-y-4 data-[state=inactive]:hidden">
                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Firmenname *</FormLabel>
                        <FormControl>
                          <Input className="h-9" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="legal_form"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Rechtsform</FormLabel>
                        <FormControl>
                          <Input className="h-9" placeholder="GmbH, e.U., AG, ..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="industry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Branche</FormLabel>
                        <FormControl>
                          <IndustryCombobox
                            value={field.value ? [field.value] : []}
                            onChange={(val) => field.onChange(val[0] ?? "")}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Separator />

                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {STATUS_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                <div className="flex items-center gap-2">
                                  <span className={`h-2 w-2 rounded-full shrink-0 ${opt.dot}`} />
                                  {opt.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Notizen</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Interne Notizen zu diesem Lead..."
                            className="min-h-20 text-sm resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                {/* Tab: Ansprechpartner */}
                <TabsContent value="contact_person" className="mt-0 px-6 py-5 space-y-4 data-[state=inactive]:hidden">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="ceo_gender"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">Anrede</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl>
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="–" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {GENDER_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="ceo_title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">Titel</FormLabel>
                          <FormControl>
                            <Input className="h-9" placeholder="Mag., Dr., DI, Ing., MBA" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="ceo_first_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">Vorname</FormLabel>
                          <FormControl>
                            <Input className="h-9" placeholder="Vorname" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="ceo_last_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">Nachname</FormLabel>
                          <FormControl>
                            <Input className="h-9" placeholder="Nachname" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Separator />

                  <FormField
                    control={form.control}
                    name="ceo_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">
                          Vollständiger Name (automatisch)
                        </FormLabel>
                        <FormControl>
                          <Input className="h-9 bg-muted/50" readOnly {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                {/* Tab: Kontakt */}
                <TabsContent value="contact" className="mt-0 px-6 py-5 space-y-4 data-[state=inactive]:hidden">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">Telefon</FormLabel>
                          <FormControl>
                            <Input className="h-9" placeholder="+43 ..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">E-Mail</FormLabel>
                          <FormControl>
                            <Input type="email" className="h-9" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Website</FormLabel>
                        <FormControl>
                          <Input className="h-9" placeholder="https://" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                {/* Tab: Adresse */}
                <TabsContent value="address" className="mt-0 px-6 py-5 space-y-4 data-[state=inactive]:hidden">
                  <FormField
                    control={form.control}
                    name="street"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Straße & Hausnummer</FormLabel>
                        <FormControl>
                          <Input className="h-9" placeholder="Musterstraße 1" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-3 gap-3">
                    <FormField
                      control={form.control}
                      name="postal_code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">PLZ</FormLabel>
                          <FormControl>
                            <Input className="h-9" placeholder="1010" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">Ort / Stadt</FormLabel>
                          <FormControl>
                            <Input className="h-9" placeholder="Wien" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">Land</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl>
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Land wählen" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {COUNTRY_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>

                {/* Tab: Social Media */}
                <TabsContent value="social" className="mt-0 px-6 py-5 space-y-3 data-[state=inactive]:hidden">
                  <p className="text-xs text-muted-foreground mb-1">
                    Social-Media-Profile des Unternehmens
                  </p>
                  {SOCIAL_FIELDS.map(({ name, label, placeholder }) => (
                    <FormField
                      key={name}
                      control={form.control}
                      name={name}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">{label}</FormLabel>
                          <FormControl>
                            <Input
                              className="h-9"
                              placeholder={placeholder}
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </TabsContent>

              </ScrollArea>
            </Tabs>

            {/* Footer */}
            <SheetFooter className="px-6 py-4 border-t bg-muted/30 flex-row gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                Abbrechen
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting && (
                  <Spinner className="h-4 w-4 mr-2" />
                )}
                Speichern
              </Button>
            </SheetFooter>

          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
