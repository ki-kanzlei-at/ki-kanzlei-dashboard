"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Users,
  Rocket,
  ArrowRight,
  ArrowLeft,
  Check,
  Settings2,
  FileText,
  Mail,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { LeadPickerDialog } from "./LeadPickerDialog";

interface CampaignCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const STEPS = [
  { id: 1, label: "Details", icon: FileText },
  { id: 2, label: "Einstellungen", icon: Settings2 },
  { id: 3, label: "Empfänger", icon: Users },
] as const;

export function CampaignCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: CampaignCreateDialogProps) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [dailyLimit, setDailyLimit] = useState(200);
  const [delayMinutes, setDelayMinutes] = useState(8);
  const [replyTo, setReplyTo] = useState("info@ki-kanzlei.at");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setName("");
      setDailyLimit(200);
      setDelayMinutes(8);
      setReplyTo("info@ki-kanzlei.at");
      setSelectedIds(new Set());
    }
  }, [open]);

  function canProceed(): boolean {
    if (step === 1) return name.trim().length > 0;
    if (step === 2) return dailyLimit > 0 && delayMinutes > 0 && replyTo.trim().length > 0;
    if (step === 3) return selectedIds.size > 0;
    return false;
  }

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Bitte einen Namen eingeben");
      return;
    }
    if (selectedIds.size === 0) {
      toast.error("Bitte mindestens einen Lead auswählen");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          daily_limit: dailyLimit,
          delay_minutes: delayMinutes,
          reply_to: replyTo.trim(),
          lead_ids: Array.from(selectedIds),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Fehler beim Erstellen");
      }

      toast.success("Kampagne erstellt");
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ein Fehler ist aufgetreten");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="text-lg">
              Neue Kampagne erstellen
            </DialogTitle>
            <DialogDescription className="text-sm">
              {step === 1 && "Gib deiner Kampagne einen aussagekräftigen Namen."}
              {step === 2 && "Konfiguriere die Versand-Einstellungen."}
              {step === 3 && "Wähle die Empfänger für deine Kampagne aus."}
            </DialogDescription>
          </DialogHeader>

          {/* Stepper */}
          <div className="px-6 pb-4">
            <div className="flex items-center gap-1">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const isActive = step === s.id;
                const isDone = step > s.id;
                return (
                  <div key={s.id} className="flex items-center flex-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (isDone) setStep(s.id);
                      }}
                      className={`
                        flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors w-full
                        ${isActive
                          ? "bg-primary/10 text-primary"
                          : isDone
                            ? "text-primary/70 hover:bg-primary/5 cursor-pointer"
                            : "text-muted-foreground"
                        }
                      `}
                    >
                      <div
                        className={`
                          flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold
                          ${isActive
                            ? "bg-primary text-primary-foreground"
                            : isDone
                              ? "bg-primary/20 text-primary"
                              : "bg-muted text-muted-foreground"
                          }
                        `}
                      >
                        {isDone ? <Check className="h-3 w-3" /> : s.id}
                      </div>
                      <span className="hidden sm:inline">{s.label}</span>
                    </button>
                    {i < STEPS.length - 1 && (
                      <div
                        className={`h-px flex-1 mx-1 ${
                          step > s.id ? "bg-primary/30" : "bg-border"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Step Content */}
          <div className="px-6 py-6 min-h-[200px]">
            {/* Step 1: Details */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-2.5">
                  <Label htmlFor="campaign-name" className="text-sm font-medium">
                    Kampagnenname
                  </Label>
                  <Input
                    id="campaign-name"
                    placeholder="z.B. Psychotherapeuten Wien Q1"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-10"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    Wähle einen eindeutigen Namen, um deine Kampagne später leicht wiederzufinden.
                  </p>
                </div>
              </div>
            )}

            {/* Step 2: Einstellungen */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-5">
                  <div className="space-y-2.5">
                    <Label htmlFor="daily-limit" className="text-sm font-medium">
                      Tageslimit
                    </Label>
                    <Input
                      id="daily-limit"
                      type="number"
                      min={1}
                      max={500}
                      value={dailyLimit}
                      onChange={(e) => setDailyLimit(parseInt(e.target.value) || 200)}
                      className="h-10"
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximale Anzahl E-Mails pro Tag
                    </p>
                  </div>
                  <div className="space-y-2.5">
                    <Label htmlFor="delay-minutes" className="text-sm font-medium">
                      Verzögerung (Min.)
                    </Label>
                    <Input
                      id="delay-minutes"
                      type="number"
                      min={1}
                      max={60}
                      value={delayMinutes}
                      onChange={(e) => setDelayMinutes(parseInt(e.target.value) || 8)}
                      className="h-10"
                    />
                    <p className="text-xs text-muted-foreground">
                      Wartezeit zwischen einzelnen E-Mails
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="reply-to" className="text-sm font-medium">
                    Antwort-Adresse (Reply-To)
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reply-to"
                      type="email"
                      placeholder="info@ki-kanzlei.at"
                      value={replyTo}
                      onChange={(e) => setReplyTo(e.target.value)}
                      className="h-10 pl-9"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    An diese Adresse werden Antworten gesendet
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: Empfänger */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Empfänger auswählen</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Wähle die Leads, die diese Kampagne erhalten sollen.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPickerOpen(true)}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    {selectedIds.size > 0 ? "Auswahl ändern" : "Leads auswählen"}
                  </Button>
                </div>

                {selectedIds.size > 0 ? (
                  <div className="rounded-lg border bg-primary/5 p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">
                          {selectedIds.size} Lead{selectedIds.size !== 1 ? "s" : ""} ausgewählt
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Bereit für den Versand
                        </p>
                      </div>
                      <Badge className="bg-primary/10 text-primary border-primary/20">
                        {selectedIds.size}
                      </Badge>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-8 text-center">
                    <Users className="h-8 w-8 text-muted-foreground/50 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      Noch keine Leads ausgewählt
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Klicke auf &quot;Leads auswählen&quot; um Empfänger hinzuzufügen.
                    </p>
                  </div>
                )}

                {/* Summary */}
                {selectedIds.size > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Zusammenfassung
                      </p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="flex justify-between py-1.5">
                          <span className="text-muted-foreground">Kampagne</span>
                          <span className="font-medium">{name}</span>
                        </div>
                        <div className="flex justify-between py-1.5">
                          <span className="text-muted-foreground">Empfänger</span>
                          <span className="font-medium">{selectedIds.size}</span>
                        </div>
                        <div className="flex justify-between py-1.5">
                          <span className="text-muted-foreground">Tageslimit</span>
                          <span className="font-medium">{dailyLimit} / Tag</span>
                        </div>
                        <div className="flex justify-between py-1.5">
                          <span className="text-muted-foreground">Verzögerung</span>
                          <span className="font-medium">{delayMinutes} Min.</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Footer */}
          <DialogFooter className="px-6 py-4 flex-row justify-between sm:justify-between">
            <div>
              {step > 1 && (
                <Button
                  variant="ghost"
                  onClick={() => setStep(step - 1)}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Zurück
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Abbrechen
              </Button>

              {step < 3 ? (
                <Button
                  disabled={!canProceed()}
                  onClick={() => setStep(step + 1)}
                >
                  Weiter
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button
                  disabled={!canProceed() || creating}
                  onClick={handleCreate}
                >
                  {creating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4 mr-2" />
                  )}
                  Kampagne erstellen
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LeadPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selectedIds={selectedIds}
        onConfirm={(ids) => {
          setSelectedIds(ids);
          setPickerOpen(false);
        }}
      />
    </>
  );
}
