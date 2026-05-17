"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Link2,
  Globe,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

import type { CrmProvider, CrmExportResult } from "@/lib/crm/types";
import { CRM_PROVIDERS, WEBHOOK_PROVIDER, type ProviderMeta } from "@/lib/crm/providers";
import { FIELD_MAPPINGS } from "@/lib/crm/field-mapping";
import type { LeadFilters } from "@/types/leads";

type View = "select" | "mapping" | "result";

interface CrmSettings {
  hubspot_api_key?: string | null;
  pipedrive_api_key?: string | null;
  pipedrive_domain?: string | null;
  salesforce_instance_url?: string | null;
  salesforce_access_token?: string | null;
  zoho_client_id?: string | null;
  zoho_client_secret?: string | null;
  zoho_refresh_token?: string | null;
  webhook_url?: string | null;
}

interface CrmExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  selectedIds: string[];
  isGlobalSelected: boolean;
  totalCount: number;
  filters: LeadFilters;
  crmSettings: CrmSettings;
}

function isProviderConnected(provider: ProviderMeta, settings: CrmSettings): boolean {
  return provider.requiredKeys.every((key) => {
    const val = settings[key as keyof CrmSettings];
    return val && val.trim().length > 0;
  });
}

export function CrmExportDialog({
  open,
  onOpenChange,
  selectedCount,
  selectedIds,
  isGlobalSelected,
  totalCount,
  filters,
  crmSettings,
}: CrmExportDialogProps) {
  const [view, setView] = useState<View>("select");
  const [selectedProvider, setSelectedProvider] = useState<CrmProvider | null>(null);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<CrmExportResult | null>(null);
  const [webhookUrlInput, setWebhookUrlInput] = useState("");

  const displayCount = isGlobalSelected ? totalCount : selectedCount;

  function handleClose() {
    onOpenChange(false);
    // Reset nach animation
    setTimeout(() => {
      setView("select");
      setSelectedProvider(null);
      setResult(null);
      setWebhookUrlInput("");
    }, 200);
  }

  function handleSelectProvider(provider: CrmProvider) {
    setSelectedProvider(provider);
    setView("mapping");
  }

  async function handleExport() {
    if (!selectedProvider) return;

    setExporting(true);
    try {
      const payload: Record<string, unknown> = {
        provider: selectedProvider,
      };

      if (isGlobalSelected) {
        payload.selectionMode = "all";
        payload.filters = filters;
      } else {
        payload.selectionMode = "ids";
        payload.ids = selectedIds;
      }

      // Webhook URL from input if not in settings
      if (selectedProvider === "webhook" && webhookUrlInput) {
        payload.webhook_url = webhookUrlInput;
      }

      const res = await fetch("/api/export/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error ?? `Fehler ${res.status}`);
      }

      const json = await res.json();
      setResult(json.data as CrmExportResult);
      setView("result");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export fehlgeschlagen");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {view === "select" && "In CRM exportieren"}
            {view === "mapping" && "Feldmapping"}
            {view === "result" && "Export-Ergebnis"}
          </DialogTitle>
          <DialogDescription>
            {view === "select" && `${displayCount} Lead(s) in ein CRM-System exportieren`}
            {view === "mapping" && selectedProvider && `Felder für ${getProviderName(selectedProvider)}`}
            {view === "result" && "Zusammenfassung des Exports"}
          </DialogDescription>
        </DialogHeader>

        {/* ── View 1: Provider-Auswahl ── */}
        {view === "select" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {CRM_PROVIDERS.map((p) => {
                const connected = isProviderConnected(p, crmSettings);
                return (
                  <button
                    key={p.id}
                    onClick={() => connected ? handleSelectProvider(p.id) : undefined}
                    className={`flex items-center gap-3 border rounded-lg p-4 text-left transition-colors ${
                      connected
                        ? "hover:border-primary/50 hover:bg-primary/5 cursor-pointer"
                        : "opacity-60 cursor-not-allowed"
                    }`}
                  >
                    <div className="h-8 w-8 rounded shrink-0 flex items-center justify-center" style={{ backgroundColor: `${p.color}15` }}>
                      <Image src={p.logo} alt={p.name} width={20} height={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      {connected ? (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-[10px] px-1.5 py-0 mt-0.5">
                          Verbunden
                        </Badge>
                      ) : (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          <a href="/dashboard/settings" className="underline" onClick={(e) => { e.stopPropagation(); }}>
                            In Einstellungen verbinden
                          </a>
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Webhook Sektion */}
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Webhook (Zapier / Make)</p>
              </div>

              {crmSettings.webhook_url ? (
                <button
                  onClick={() => handleSelectProvider("webhook")}
                  className="w-full flex items-center gap-3 border rounded-lg p-4 text-left hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer"
                >
                  <div className="h-8 w-8 rounded shrink-0 flex items-center justify-center bg-orange-50">
                    <Link2 className="h-4 w-4 text-orange-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{crmSettings.webhook_url}</p>
                    <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-[10px] px-1.5 py-0 mt-0.5">
                      Verbunden
                    </Badge>
                  </div>
                </button>
              ) : (
                <div className="space-y-2">
                  <Input
                    type="url"
                    placeholder="https://hooks.zapier.com/..."
                    value={webhookUrlInput}
                    onChange={(e) => setWebhookUrlInput(e.target.value)}
                    className="h-9 text-sm font-mono"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!webhookUrlInput.trim()}
                    onClick={() => handleSelectProvider("webhook")}
                    className="w-full"
                  >
                    <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
                    Mit Webhook exportieren
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── View 2: Feldmapping ── */}
        {view === "mapping" && selectedProvider && (
          <div className="space-y-4">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground -ml-2"
              onClick={() => setView("select")}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Zurück
            </Button>

            <ScrollArea className="max-h-64">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Unser Feld</th>
                    <th className="pb-2 font-medium">CRM-Feld</th>
                  </tr>
                </thead>
                <tbody>
                  {FIELD_MAPPINGS[selectedProvider]?.map((m, i) => (
                    <tr key={i} className="border-t">
                      <td className="py-1.5 text-muted-foreground">{m.from}</td>
                      <td className="py-1.5 font-mono text-xs">{m.to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>

            <Separator />

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {displayCount} Lead(s) exportieren
              </p>
              <Button
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Exportiere...
                  </>
                ) : (
                  <>
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Exportieren
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── View 3: Ergebnis ── */}
        {view === "result" && result && (
          <div className="space-y-4">
            {/* Zähler */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border p-3">
                <p className="text-2xl font-bold">{result.total}</p>
                <p className="text-xs text-muted-foreground">Gesamt</p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-2xl font-bold text-emerald-600">{result.success}</p>
                <p className="text-xs text-emerald-600">Erfolgreich</p>
              </div>
              <div className={`rounded-lg border p-3 ${result.failed > 0 ? "border-amber-200 bg-amber-50" : ""}`}>
                <p className={`text-2xl font-bold ${result.failed > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                  {result.failed}
                </p>
                <p className={`text-xs ${result.failed > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                  Fehlgeschlagen
                </p>
              </div>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
              {result.failed === 0 ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <p className="text-sm font-medium text-emerald-600">
                    Alle Leads erfolgreich exportiert
                  </p>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <p className="text-sm font-medium text-amber-600">
                    {result.failed} Lead(s) konnten nicht exportiert werden
                  </p>
                </>
              )}
            </div>

            {/* Fehlerdetails */}
            {result.errors.length > 0 && (
              <ScrollArea className="max-h-32">
                <div className="space-y-1">
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-xs text-muted-foreground font-mono bg-muted/50 rounded px-2 py-1">
                      {err}
                    </p>
                  ))}
                </div>
              </ScrollArea>
            )}

            <div className="flex justify-end">
              <Button onClick={handleClose}>Schließen</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function getProviderName(provider: CrmProvider): string {
  if (provider === "webhook") return WEBHOOK_PROVIDER.name;
  return CRM_PROVIDERS.find((p) => p.id === provider)?.name ?? provider;
}
