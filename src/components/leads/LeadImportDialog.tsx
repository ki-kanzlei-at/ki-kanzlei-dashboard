"use client";

import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/* ── CSV Parser (simple, handles quoted fields) ── */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === "," || ch === ";") {
          cells.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    cells.push(current.trim());
    rows.push(cells);
  }
  return rows;
}

/* ── Column mapping ── */
const FIELD_MAP: Record<string, string> = {
  firma: "company",
  unternehmen: "company",
  company: "company",
  firmenname: "company",
  name: "company",
  branche: "industry",
  industry: "industry",
  rechtsform: "legal_form",
  legal_form: "legal_form",
  "e-mail": "email",
  email: "email",
  mail: "email",
  telefon: "phone",
  phone: "phone",
  tel: "phone",
  website: "website",
  webseite: "website",
  url: "website",
  strasse: "street",
  straße: "street",
  street: "street",
  adresse: "street",
  address: "street",
  plz: "postal_code",
  postleitzahl: "postal_code",
  postal_code: "postal_code",
  zip: "postal_code",
  stadt: "city",
  ort: "city",
  city: "city",
  land: "country",
  country: "country",
  bundesland: "state",
  state: "state",
  notizen: "notes",
  notes: "notes",
  anmerkungen: "notes",
  geschäftsführer: "ceo_name",
  entscheider: "ceo_name",
  ceo: "ceo_name",
  ceo_name: "ceo_name",
  titel: "ceo_title",
  ceo_title: "ceo_title",
  position: "ceo_title",
  status: "status",
  linkedin: "social_linkedin",
  social_linkedin: "social_linkedin",
  facebook: "social_facebook",
  social_facebook: "social_facebook",
  instagram: "social_instagram",
  social_instagram: "social_instagram",
};

interface LeadImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

type ImportStep = "upload" | "preview" | "importing" | "done";

interface ParsedLead {
  [key: string]: string | null;
}

export function LeadImportDialog({ open, onOpenChange, onImported }: LeadImportDialogProps) {
  const [step, setStep] = useState<ImportStep>("upload");
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappedHeaders, setMappedHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedLead[]>([]);
  const [importResult, setImportResult] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 });
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setMappedHeaders([]);
    setRows([]);
    setImportResult({ success: 0, failed: 0 });
  }

  function handleFile(file: File) {
    if (!file.name.match(/\.(csv|txt)$/i)) {
      toast.error("Bitte eine CSV-Datei hochladen");
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length < 2) {
        toast.error("Die Datei enthält keine Daten");
        return;
      }

      const rawHeaders = parsed[0];
      const mapped = rawHeaders.map((h) => {
        const normalized = h.toLowerCase().replace(/[^a-zäöüß_]/g, "");
        return FIELD_MAP[normalized] ?? "";
      });

      setHeaders(rawHeaders);
      setMappedHeaders(mapped);

      const dataRows = parsed.slice(1).map((row) => {
        const lead: ParsedLead = {};
        mapped.forEach((field, i) => {
          if (field && row[i]) {
            lead[field] = row[i] || null;
          }
        });
        return lead;
      }).filter((lead) => lead.company);

      setRows(dataRows);
      setStep("preview");
    };
    reader.readAsText(file, "UTF-8");
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleImport() {
    if (rows.length === 0) return;
    setStep("importing");

    try {
      const leads = rows.map((row) => ({
        ...row,
        status: row.status || "new",
      }));

      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leads),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Import fehlgeschlagen");
      }

      const json = await res.json();
      setImportResult({ success: json.count ?? leads.length, failed: 0 });
      setStep("done");
      onImported();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import fehlgeschlagen");
      setStep("preview");
    }
  }

  const validCount = rows.length;
  const mappedFieldCount = mappedHeaders.filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-base font-medium">
            {step === "done" ? "Import abgeschlossen" : "Leads importieren"}
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            {step === "upload" && "Lade eine CSV-Datei hoch um Leads zu importieren."}
            {step === "preview" && `${validCount} Leads erkannt · ${mappedFieldCount} von ${headers.length} Spalten zugeordnet`}
            {step === "importing" && "Leads werden importiert…"}
            {step === "done" && `${importResult.success} Lead(s) erfolgreich importiert.`}
          </DialogDescription>
        </DialogHeader>

        {/* Upload */}
        {step === "upload" && (
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
              dragActive
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted/30",
            )}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <Upload className="h-8 w-8 mx-auto text-muted-foreground/60 mb-3" strokeWidth={1.5} />
            <p className="text-[13px] font-medium text-foreground">
              CSV-Datei hierher ziehen oder klicken
            </p>
            <p className="text-[12px] text-muted-foreground mt-1">
              Unterstützte Formate: CSV (Komma oder Semikolon getrennt)
            </p>
          </div>
        )}

        {/* Preview */}
        {step === "preview" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-md">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-[13px] text-foreground font-medium truncate flex-1">{fileName}</span>
              <button onClick={reset} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="text-[12px] text-muted-foreground">
              Erkannte Spalten:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {headers.map((h, i) => (
                <span
                  key={i}
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium",
                    mappedHeaders[i]
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {mappedHeaders[i] ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <AlertCircle className="h-3 w-3" />
                  )}
                  {h}
                  {mappedHeaders[i] && (
                    <span className="opacity-60">→ {mappedHeaders[i]}</span>
                  )}
                </span>
              ))}
            </div>

            {validCount > 0 && (
              <ScrollArea className="h-[200px] border rounded-md">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">#</th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Firma</th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">E-Mail</th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Stadt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((row, i) => (
                      <tr key={i} className="border-t border-border/50">
                        <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                        <td className="px-2 py-1 truncate max-w-[160px]">{row.company ?? "—"}</td>
                        <td className="px-2 py-1 truncate max-w-[160px] text-muted-foreground">{row.email ?? "—"}</td>
                        <td className="px-2 py-1 truncate max-w-[100px] text-muted-foreground">{row.city ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 50 && (
                  <p className="text-center text-[11px] text-muted-foreground py-2">
                    … und {rows.length - 50} weitere
                  </p>
                )}
              </ScrollArea>
            )}

            {validCount === 0 && (
              <div className="flex items-center gap-2 px-3 py-3 bg-destructive/10 text-destructive rounded-md text-[13px]">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Keine gültigen Leads gefunden. Die Spalte &quot;Firma&quot; ist ein Pflichtfeld.
              </div>
            )}
          </div>
        )}

        {/* Importing */}
        {step === "importing" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Spinner className="h-8 w-8" />
            <p className="text-[13px] text-muted-foreground">
              {rows.length} Lead(s) werden importiert…
            </p>
          </div>
        )}

        {/* Done */}
        {step === "done" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <p className="text-[14px] font-medium text-foreground">
              {importResult.success} Lead(s) importiert
            </p>
          </div>
        )}

        <DialogFooter>
          {step === "preview" && validCount > 0 && (
            <Button onClick={handleImport} className="gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              {validCount} Lead(s) importieren
            </Button>
          )}
          {step === "done" && (
            <Button onClick={() => { reset(); onOpenChange(false); }}>
              Schließen
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
