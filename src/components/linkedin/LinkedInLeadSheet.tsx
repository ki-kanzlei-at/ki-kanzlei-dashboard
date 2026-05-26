"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Loader2, ExternalLink, Sparkles, MapPin, MessageSquare,
  Plus, Users, Linkedin, Briefcase, GraduationCap,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import type { LinkedInLead, LinkedInLeadStatus } from "@/types/linkedin";
import { LINKEDIN_STATUS_CONFIG } from "@/types/linkedin";

interface LinkedInLeadSheetProps {
  lead: LinkedInLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (updatedLead?: LinkedInLead) => void;
}

/* ── Helpers ── */

function initialsFrom(lead: LinkedInLead): string {
  const first = lead.first_name?.[0] ?? "";
  const last  = lead.last_name?.[0]  ?? "";
  const combined = (first + last).toUpperCase();
  if (combined) return combined;
  return (lead.full_name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const now = Date.now();
  const ts = new Date(iso).getTime();
  const diff = now - ts;
  const min = Math.round(diff / 60_000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `vor ${hr} Std.`;
  const d = Math.round(hr / 24);
  if (d === 1) return "gestern";
  if (d < 14) return `vor ${d} Tagen`;
  const w = Math.round(d / 7);
  if (w < 8) return `vor ${w} Wochen`;
  return new Date(iso).toLocaleDateString("de-AT", { day: "2-digit", month: "short", year: "numeric" });
}

function formatExact(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("de-AT", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/* ── DegreeBadge ── Aktuell haben wir keinen Verbindungsgrad aus der API,
 * leiten ihn aus dem Status ab: connected/messaged/replied ≙ 1st, sonst 3rd. */
function deriveDegree(status: LinkedInLeadStatus): 1 | 2 | 3 {
  if (status === "accepted" || status === "messaged" || status === "replied") return 1;
  if (status === "invited" || status === "queued") return 2;
  return 3;
}

function DegreeBadge({ status }: { status: LinkedInLeadStatus }) {
  const degree = deriveDegree(status);
  const label = degree === 1 ? "1st" : degree === 2 ? "2nd" : "3rd";
  return <span className={`li-degree li-degree-${degree}`}>{label}</span>;
}

/* ══════════════════════════════════════════════════════════════
   Tab content components
   ══════════════════════════════════════════════════════════════ */

function ProfileTab({ lead }: { lead: LinkedInLead }) {
  return (
    <div className="px-6 py-5">
      {/* Über */}
      <div className="li-section-title">Über <span className="line" /></div>
      {lead.ai_summary ? (
        <p className="text-[13px] text-muted-foreground leading-relaxed">{lead.ai_summary}</p>
      ) : lead.headline ? (
        <p className="text-[13px] text-muted-foreground leading-relaxed">{lead.headline}</p>
      ) : (
        <p className="text-[12.5px] text-muted-foreground italic">
          Noch keine Profil-Zusammenfassung. Klick auf <b>KI-Analyse</b> um eine zu generieren.
        </p>
      )}

      {/* Position / Firma als "Berufserfahrung" wenn vorhanden */}
      {(lead.position || lead.company) && (
        <>
          <div className="li-section-title">Berufserfahrung <span className="line" /></div>
          <div className="li-exp-row">
            <div className="li-exp-logo">
              {lead.company ? lead.company[0].toUpperCase() : <Briefcase className="h-4 w-4" />}
            </div>
            <div>
              {lead.position && <div className="li-exp-pos">{lead.position}</div>}
              {lead.company && <div className="li-exp-co">{lead.company}</div>}
              {lead.industry && <div className="li-exp-time">{lead.industry}</div>}
            </div>
          </div>
        </>
      )}

      {/* Score (falls KI-Analyse vorhanden) */}
      {lead.ai_score != null && (
        <>
          <div className="li-section-title">KI-Bewertung <span className="line" /></div>
          <div className="flex items-center gap-3 mb-1">
            <span className={cn(
              "text-[20px] font-semibold tabular-nums",
              lead.ai_score >= 70 ? "text-emerald-600"
                : lead.ai_score >= 40 ? "text-primary"
                : "text-muted-foreground",
            )}>
              {lead.ai_score}
            </span>
            <span className="text-[12px] text-muted-foreground">/ 100</span>
          </div>
        </>
      )}

      {/* Notes */}
      {lead.notes && (
        <>
          <div className="li-section-title">Notizen <span className="line" /></div>
          <p className="text-[13px] text-foreground whitespace-pre-wrap leading-relaxed">{lead.notes}</p>
        </>
      )}
    </div>
  );
}

function MessagesTab({
  lead, onSendStatusChange,
}: {
  lead: LinkedInLead;
  onSendStatusChange: (status: LinkedInLeadStatus) => void;
}) {
  const [draft, setDraft] = useState("");

  // Keine Nachricht senden möglich, wenn nicht verbunden
  const canSend = lead.status === "accepted" || lead.status === "messaged" || lead.status === "replied";

  // Zeige Status-spezifische Empty-States / Threads
  if (lead.status === "new" || lead.status === "analyzed") {
    return (
      <div className="px-6 py-12 text-center">
        <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
        <div className="text-[14px] font-medium text-foreground mb-1">Noch kein Kontakt</div>
        <div className="text-[12.5px] text-muted-foreground mb-4">
          Sende eine Vernetzungsanfrage, um den Dialog zu starten.
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => onSendStatusChange("queued")}
        >
          <Plus className="h-3.5 w-3.5" /> In Warteschlange
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 flex-1 overflow-y-auto">
        <div className="li-thread">
          {/* Outgoing invite */}
          {lead.invite_message && (
            <>
              <div className="li-msg li-msg-out">{lead.invite_message}</div>
              <div className="li-msg-time">{relativeTime(lead.connection_sent_at)}</div>
            </>
          )}

          {/* Connection accepted (system message) */}
          {lead.connection_accepted_at && (
            <div className="text-center text-[11.5px] text-muted-foreground py-2">
              Vernetzung akzeptiert · {relativeTime(lead.connection_accepted_at)}
            </div>
          )}

          {/* Follow-up message */}
          {lead.follow_up_message && (
            <>
              <div className="li-msg li-msg-out">{lead.follow_up_message}</div>
              <div className="li-msg-time">{relativeTime(lead.follow_up_sent_at)}</div>
            </>
          )}

          {/* If replied — last_message_at gives timing but no content stored. Show generic indicator. */}
          {lead.status === "replied" && lead.last_message_at && (
            <>
              <div className="li-msg li-msg-in italic text-muted-foreground">
                {lead.full_name.split(" ").slice(-1)[0]} hat geantwortet. Vollständige Konversation auf LinkedIn ansehen.
              </div>
              <div className="li-msg-time">{relativeTime(lead.last_message_at)}</div>
            </>
          )}

          {!lead.invite_message && !lead.follow_up_message && !lead.last_message_at && (
            <div className="text-center text-[12.5px] text-muted-foreground py-6">
              Keine Nachrichten-Historie verfügbar.
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="px-6 py-3 border-t bg-muted/20 shrink-0">
        <Textarea
          placeholder={canSend ? "Nachricht schreiben…" : "Verbindung ausstehend — Nachricht aktuell nicht möglich"}
          rows={3}
          className="text-[13px] resize-none bg-card"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!canSend}
        />
        <div className="flex items-center gap-2 mt-2">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" disabled={!canSend}>
            <Sparkles className="h-3 w-3" /> KI-Antwort vorschlagen
          </Button>
          <div className="flex-1" />
          <a
            href={lead.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            Auf LinkedIn senden <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

function ActivityTab({ lead }: { lead: LinkedInLead }) {
  type ActivityItem = { when: string; iso: string | null | undefined; what: string; hot?: boolean };
  const items = useMemo<ActivityItem[]>(() => {
    const out: ActivityItem[] = [];
    if (lead.last_message_at && lead.status === "replied") {
      out.push({ when: relativeTime(lead.last_message_at), iso: lead.last_message_at, what: "Antwort erhalten", hot: true });
    }
    if (lead.connection_accepted_at) {
      out.push({ when: relativeTime(lead.connection_accepted_at), iso: lead.connection_accepted_at, what: "Vernetzung akzeptiert", hot: lead.status === "accepted" });
    }
    if (lead.follow_up_sent_at) {
      out.push({ when: relativeTime(lead.follow_up_sent_at), iso: lead.follow_up_sent_at, what: "Follow-Up gesendet" });
    }
    if (lead.connection_sent_at) {
      out.push({ when: relativeTime(lead.connection_sent_at), iso: lead.connection_sent_at, what: "Vernetzungsanfrage gesendet" });
    }
    if (lead.search_query) {
      out.push({ when: relativeTime(lead.created_at), iso: lead.created_at, what: `Aus Suche „${lead.search_query}" hinzugefügt` });
    } else {
      out.push({ when: relativeTime(lead.created_at), iso: lead.created_at, what: "Lead erstellt" });
    }
    return out;
  }, [lead]);

  return (
    <div className="px-6 py-5">
      <div className="li-section-title">Aktivitätsverlauf <span className="line" /></div>
      <div className="timeline">
        {items.map((it, i) => (
          <div key={i} className={cn("timeline-item", !it.hot && "is-muted")}>
            <div className="timeline-when" title={formatExact(it.iso)}>{it.when}</div>
            <div className="timeline-what">{it.what}</div>
          </div>
        ))}
      </div>

      {lead.error_message && (
        <>
          <div className="li-section-title">Fehler <span className="line" /></div>
          <div className="bg-red-50 border border-red-100 text-red-700 text-[12.5px] p-3 rounded-lg">
            {lead.error_message}
          </div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Main Component
   ══════════════════════════════════════════════════════════════ */

export function LinkedInLeadSheet({ lead, open, onOpenChange, onUpdated }: LinkedInLeadSheetProps) {
  const [tab, setTab] = useState<"profile" | "messages" | "activity">("profile");
  const [analyzing, setAnalyzing] = useState(false);

  // Reset tab when opening different lead
  useEffect(() => {
    if (lead) setTab("profile");
  }, [lead?.id]);

  if (!lead) return null;

  const config = LINKEDIN_STATUS_CONFIG[lead.status];

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/linkedin/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead!.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Analyse fehlgeschlagen");
        return;
      }
      toast.success("Profil analysiert");
      onUpdated(json.data ?? undefined);
    } catch {
      toast.error("Netzwerkfehler");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleStatusChange(status: LinkedInLeadStatus) {
    try {
      const res = await fetch(`/api/linkedin/leads/${lead!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      toast.success("Status geändert");
      onUpdated(json.data ?? undefined);
    } catch {
      toast.error("Fehler beim Ändern des Status");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[540px] sm:w-[600px] flex flex-col p-0 gap-0 sm:max-w-[600px]"
      >

        {/* ── Profile Header (Gradient) ── */}
        <SheetHeader className="p-0 space-y-0">
          <div className="li-sheet-profile">
            <div className="li-sheet-photo-row">
              <div className="li-sheet-photo">
                {lead.profile_picture_url
                  ? <img src={lead.profile_picture_url} alt={lead.full_name} />
                  : initialsFrom(lead)}
              </div>
              <div className="li-sheet-info">
                <SheetTitle className="li-sheet-name">
                  {lead.full_name}
                  <DegreeBadge status={lead.status} />
                </SheetTitle>
                {lead.headline && (
                  <SheetDescription className="li-sheet-headline">
                    {lead.headline}
                  </SheetDescription>
                )}
                <div className="li-sheet-meta">
                  {lead.location && (
                    <span className="item">
                      <MapPin className="h-3 w-3" /> {lead.location}
                    </span>
                  )}
                  {lead.location && <span>·</span>}
                  <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3" /> LinkedIn-Profil öffnen
                  </a>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", config.dot)} />
                    <span>{config.label}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Action button row */}
            <div className="flex flex-wrap gap-2 mt-4">
              {(lead.status === "new" || lead.status === "analyzed" || lead.status === "error") && (
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => handleStatusChange("queued")}
                >
                  <Plus className="h-3.5 w-3.5" /> In Warteschlange
                </Button>
              )}
              {(lead.status === "accepted" || lead.status === "replied" || lead.status === "messaged") && (
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => setTab("messages")}
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Nachricht senden
                </Button>
              )}
              {lead.status === "invited" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => handleStatusChange("declined")}
                >
                  Request zurückziehen
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={handleAnalyze}
                disabled={analyzing}
              >
                {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {lead.ai_score != null ? "Erneut analysieren" : "KI-Analyse"}
              </Button>
              {lead.matched_lead_id && (
                <a href={`/dashboard/leads?id=${lead.matched_lead_id}`}>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Im CRM ansehen
                  </Button>
                </a>
              )}
            </div>
          </div>
        </SheetHeader>

        {/* ── Tabs (line variant) ── */}
        <div className="px-6 border-b shrink-0">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList variant="line" className="border-b-0 h-auto py-0 -mb-px">
              <TabsTrigger value="profile" className="text-[13px] gap-1.5">
                <Linkedin className="h-3.5 w-3.5" />
                Profil
              </TabsTrigger>
              <TabsTrigger value="messages" className="text-[13px] gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" />
                Nachrichten
              </TabsTrigger>
              <TabsTrigger value="activity" className="text-[13px] gap-1.5">
                <GraduationCap className="h-3.5 w-3.5" />
                Aktivität
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* ── Tab Body ── */}
        {tab === "messages" ? (
          <MessagesTab lead={lead} onSendStatusChange={handleStatusChange} />
        ) : (
          <ScrollArea className="flex-1">
            {tab === "profile" && <ProfileTab lead={lead} />}
            {tab === "activity" && <ActivityTab lead={lead} />}
          </ScrollArea>
        )}

      </SheetContent>
    </Sheet>
  );
}
