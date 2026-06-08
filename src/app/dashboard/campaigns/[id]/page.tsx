"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Play,
  Pause,
  CheckCircle2,
  MoreHorizontal,
  Trash2,
  Search,
  X,
  Users,
  Send,
  MailOpen,
  MousePointerClick,
  Reply,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { Campaign, CampaignLead, CampaignLeadStatus, CampaignStatus } from "@/types/campaigns";

/* ── Config ── */
const STATUS_CONFIG: Record<CampaignStatus, { label: string; className: string }> = {
  draft:     { label: "Entwurf",  className: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400" },
  active:    { label: "Aktiv",    className: "bg-primary/10 text-primary border-primary/20" },
  paused:    { label: "Pausiert", className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400" },
  completed: { label: "Fertig",   className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400" },
  archived:  { label: "Archiviert", className: "bg-zinc-50 text-zinc-500 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-500" },
};

const LEAD_STATUS_CONFIG: Record<CampaignLeadStatus, { label: string; className: string }> = {
  pending:   { label: "Ausstehend", className: "text-muted-foreground" },
  sent:      { label: "Gesendet",   className: "text-blue-600" },
  failed:    { label: "Fehler",     className: "text-red-600" },
  opened:    { label: "Geöffnet",   className: "text-amber-600" },
  bounced:   { label: "Bounce",     className: "text-red-500" },
  replied:   { label: "Antwort",    className: "text-emerald-600" },
  completed: { label: "Fertig",     className: "text-muted-foreground" },
};

function pct(count: number, total: number): string {
  if (total === 0) return "—";
  return `${((count / total) * 100).toFixed(1)}%`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-AT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PAGE_SIZE = 25;

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<CampaignLead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadsCount, setLeadsCount] = useState(0);
  const [leadsPage, setLeadsPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");

  const fetchCampaign = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${id}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setCampaign(json.data);
    } catch {
      toast.error("Kampagne nicht gefunden");
      router.push("/dashboard/campaigns");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  const fetchLeads = useCallback(async (page = 1) => {
    setLeadsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (searchFilter) params.set("search", searchFilter);

      const res = await fetch(`/api/campaigns/${id}/leads?${params.toString()}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setLeads(json.data ?? []);
      setLeadsCount(json.count ?? 0);
    } catch {
      toast.error("Fehler beim Laden der Leads");
    } finally {
      setLeadsLoading(false);
    }
  }, [id, statusFilter, searchFilter]);

  useEffect(() => { fetchCampaign(); }, [fetchCampaign]);
  useEffect(() => { fetchLeads(1); setLeadsPage(1); }, [fetchLeads]);

  // Auto-refresh for active campaigns
  useEffect(() => {
    if (campaign?.status !== "active") return;
    const interval = setInterval(() => {
      fetchCampaign();
      fetchLeads(leadsPage);
    }, 15000);
    return () => clearInterval(interval);
  }, [campaign?.status, fetchCampaign, fetchLeads, leadsPage]);

  async function handleStatusChange(status: CampaignStatus) {
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      toast.success(status === "active" ? "Kampagne gestartet" : `Status auf "${STATUS_CONFIG[status].label}" geändert`);
      fetchCampaign();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Kampagne gelöscht");
      router.push("/dashboard/campaigns");
    } catch {
      toast.error("Fehler beim Löschen");
    }
  }

  /* ── Loading State ── */
  if (loading) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!campaign) return null;

  const cfg = STATUS_CONFIG[campaign.status];
  const totalLeadPages = Math.ceil(leadsCount / PAGE_SIZE);
  const hasFilters = searchFilter || statusFilter !== "all";

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 mt-0.5 shrink-0"
            onClick={() => router.push("/dashboard/campaigns")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{campaign.name}</h1>
              <Badge
                variant="outline"
                className={`text-[11px] font-medium px-2.5 py-0.5 ${cfg.className}`}
              >
                {cfg.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Erstellt am {formatDate(campaign.created_at)}
              {campaign.started_at && (
                <span> · Gestartet am {formatDate(campaign.started_at)}</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(campaign.status === "draft" || campaign.status === "paused") && (
            <Button onClick={() => handleStatusChange("active")} className="h-9 px-4">
              <Play className="h-4 w-4 mr-2" />
              Starten
            </Button>
          )}
          {campaign.status === "active" && (
            <>
              <Button variant="outline" className="h-9" onClick={() => handleStatusChange("paused")}>
                <Pause className="h-4 w-4 mr-2" />
                Pausieren
              </Button>
              <Button variant="outline" className="h-9" onClick={() => handleStatusChange("completed")}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Abschließen
              </Button>
            </>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Kampagne löschen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Error Banner ── */}
      {campaign.error_message && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Workflow-Fehler</AlertTitle>
          <AlertDescription>
            <p>{campaign.error_message}</p>
            <p className="mt-1 text-xs">
              Die Kampagne wurde automatisch pausiert. Du kannst sie nach Behebung des Fehlers erneut starten.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 *:data-[slot=card]:shadow-xs">
        {[
          {
            value: campaign.total_count,
            label: "Leads gesamt",
            trend: `${campaign.sent_count} verarbeitet`,
            trendUp: campaign.sent_count > 0,
            Icon: Users,
          },
          {
            value: campaign.sent_count,
            label: "Gesendet",
            trend: campaign.total_count > 0 ? `${((campaign.sent_count / campaign.total_count) * 100).toFixed(0)}% abgeschlossen` : "0%",
            trendUp: campaign.sent_count > 0,
            Icon: Send,
          },
          {
            value: pct(campaign.open_count, campaign.sent_count),
            label: "Open Rate",
            trend: `${campaign.open_count} geöffnet`,
            trendUp: campaign.sent_count > 0 && (campaign.open_count / campaign.sent_count) > 0.2,
            Icon: MailOpen,
          },
          {
            value: pct(campaign.click_count, campaign.sent_count),
            label: "Click Rate",
            trend: `${campaign.click_count} geklickt`,
            trendUp: campaign.sent_count > 0 && campaign.click_count > 0,
            Icon: MousePointerClick,
          },
          {
            value: pct(campaign.reply_count, campaign.sent_count),
            label: "Reply Rate",
            trend: `${campaign.reply_count} Antworten`,
            trendUp: campaign.sent_count > 0 && (campaign.reply_count / campaign.sent_count) > 0.05,
            Icon: Reply,
          },
          {
            value: pct(campaign.bounce_count, campaign.sent_count),
            label: "Bounce Rate",
            trend: `${campaign.bounce_count} Bounces`,
            trendUp: campaign.bounce_count === 0,
            Icon: AlertTriangle,
          },
        ].map(({ value, label, trend, trendUp, Icon }) => (
          <Card key={label} className="@container/card">
            <CardHeader>
              <CardDescription className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </CardDescription>
              <CardTitle className="text-2xl font-bold tabular-nums @[250px]/card:text-3xl">
                {value}
              </CardTitle>
              <CardAction>
                <Badge
                  variant="outline"
                  className={`gap-1 ${
                    trendUp
                      ? "text-primary border-primary/20 bg-primary/5"
                      : "text-muted-foreground"
                  }`}
                >
                  {trendUp ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {trend}
                </Badge>
              </CardAction>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* ── Leads Section ── */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              Empfänger
              <Badge variant="secondary" className="text-xs font-normal">
                {leadsCount}
              </Badge>
            </CardTitle>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 pt-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suche nach Firma oder E-Mail..."
                className="pl-9 h-9"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="pending">Ausstehend</SelectItem>
                <SelectItem value="sent">Gesendet</SelectItem>
                <SelectItem value="opened">Geöffnet</SelectItem>
                <SelectItem value="replied">Antwort</SelectItem>
                <SelectItem value="bounced">Bounce</SelectItem>
                <SelectItem value="failed">Fehler</SelectItem>
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-muted-foreground"
                onClick={() => { setSearchFilter(""); setStatusFilter("all"); }}
              >
                <X className="h-4 w-4 mr-1.5" />
                Zurücksetzen
              </Button>
            )}
          </div>
        </CardHeader>

        <Separator />

        {leadsLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : leads.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              {hasFilters ? "Keine Ergebnisse" : "Keine Leads in dieser Kampagne"}
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Firma</TableHead>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>Ansprechpartner</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-36">Geöffnet</TableHead>
                  <TableHead className="w-56">Antwort</TableHead>
                  <TableHead className="w-32 pr-5">Gesendet am</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((cl) => {
                  const lsCfg = LEAD_STATUS_CONFIG[cl.status];
                  return (
                    <TableRow key={cl.id} className="h-13">
                      <TableCell className="pl-5 font-medium text-sm">
                        {cl.lead?.company ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {cl.lead?.email ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {cl.lead?.ceo_name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <span className={`text-sm ${lsCfg.className}`}>
                          {lsCfg.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {cl.open_count > 0 ? (
                          <div>
                            <span className="text-amber-600 font-medium tabular-nums">{cl.open_count}x</span>
                            <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                              {formatDateTime(cl.first_opened_at)}
                            </p>
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {cl.replied_at ? (
                          <div>
                            <p className="text-emerald-600 font-medium text-xs">
                              {formatDateTime(cl.replied_at)}
                            </p>
                            {cl.reply_preview && (
                              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                                {cl.reply_preview}
                              </p>
                            )}
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground pr-5">
                        {formatDateTime(cl.sent_at)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalLeadPages > 1 && (
              <>
                <Separator />
                <div className="px-5 py-3.5 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Seite {leadsPage} von {totalLeadPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={leadsPage <= 1}
                      onClick={() => { const p = leadsPage - 1; setLeadsPage(p); fetchLeads(p); }}
                    >
                      Zurück
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={leadsPage >= totalLeadPages}
                      onClick={() => { const p = leadsPage + 1; setLeadsPage(p); fetchLeads(p); }}
                    >
                      Weiter
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
