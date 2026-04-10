"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  MoreHorizontal,
  Trash2,
  Play,
  Pause,
  AlertTriangle,
  Eye,
  X,
  Send,
  Flame,
  Mail,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";

import { CampaignCreateDialog } from "@/components/campaigns/CampaignCreateDialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { Campaign, CampaignStatus } from "@/types/campaigns";

/* ── Email Account type (for warmup overview) ── */
interface EmailAccountSummary {
  id: string;
  label: string;
  sender_email: string;
  is_active: boolean;
  warmup_enabled: boolean;
  warmup_day: number;
  warmup_start: number;
  warmup_increment: number;
  daily_limit: number;
  sent_today: number;
  health_status: string;
}

/* ── Status Config ── */
const STATUS_CONFIG: Record<CampaignStatus, { label: string; className: string }> = {
  draft:     { label: "Entwurf",  className: "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400" },
  active:    { label: "Aktiv",    className: "bg-primary/10 text-primary border-primary/20" },
  paused:    { label: "Pausiert", className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400" },
  completed: { label: "Fertig",   className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400" },
};

function pct(count: number, total: number): string {
  if (total === 0) return "—";
  return `${((count / total) * 100).toFixed(1)}%`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-AT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [emailAccounts, setEmailAccounts] = useState<EmailAccountSummary[]>([]);

  // Fetch email accounts for warmup overview
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/email-accounts");
        if (!res.ok) return;
        const { data } = await res.json();
        setEmailAccounts(data ?? []);
      } catch { /* silent */ }
    })();
  }, []);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchFilter) params.set("search", searchFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/campaigns?${params.toString()}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setCampaigns(json.data ?? []);
    } catch {
      toast.error("Fehler beim Laden der Kampagnen");
    } finally {
      setLoading(false);
    }
  }, [searchFilter, statusFilter]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  async function handleStatusChange(id: string, status: CampaignStatus) {
    try {
      if (status === "active") {
        const res = await fetch(`/api/campaigns/${id}/trigger`, { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "Fehler beim Starten");
        }
        toast.success("Kampagne gestartet");
      } else {
        const res = await fetch(`/api/campaigns/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) throw new Error();
        toast.success(`Status auf "${STATUS_CONFIG[status].label}" geändert`);
      }
      fetchCampaigns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Kampagne gelöscht");
      fetchCampaigns();
    } catch {
      toast.error("Fehler beim Löschen");
    }
  }

  const hasFilters = searchFilter || statusFilter !== "all";

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
      {/* ── Page Header ── */}
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            Kampagnen
          </h1>
          <p className="text-sm text-muted-foreground">
            Erstelle und verwalte deine Cold-Email-Outreach-Kampagnen
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="h-10 px-5">
          <Plus className="h-4 w-4 mr-2" />
          Neue Kampagne
        </Button>
      </div>

      {/* ── Filters ── */}
      <Card>
        <CardContent className="flex items-center gap-3 py-3 px-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Kampagne suchen..."
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
              <SelectItem value="draft">Entwurf</SelectItem>
              <SelectItem value="active">Aktiv</SelectItem>
              <SelectItem value="paused">Pausiert</SelectItem>
              <SelectItem value="completed">Fertig</SelectItem>
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-3 text-muted-foreground"
              onClick={() => { setSearchFilter(""); setStatusFilter("all"); }}
            >
              <X className="h-4 w-4 mr-1.5" />
              Zurücksetzen
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ── Warmup & Accounts Overview ── */}
      {emailAccounts.length > 0 && (
        <Card>
          <CardContent className="py-4 px-5">
            <div className="flex items-center gap-2 mb-3">
              <Flame className="h-4 w-4 text-orange-500" />
              <span className="text-sm font-semibold">E-Mail-Konten & Warmup</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {emailAccounts.filter((a) => a.is_active).length} aktiv · Kapazität: {emailAccounts.filter((a) => a.is_active).reduce((s, a) => {
                  if (!a.warmup_enabled) return s + a.daily_limit;
                  const effective = Math.min(a.daily_limit, a.warmup_start + a.warmup_increment * a.warmup_day);
                  return s + effective;
                }, 0)} E-Mails/Tag
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {emailAccounts.filter((a) => a.is_active).map((acc) => {
                const effectiveLimit = acc.warmup_enabled
                  ? Math.min(acc.daily_limit, acc.warmup_start + acc.warmup_increment * acc.warmup_day)
                  : acc.daily_limit;
                const warmupProgress = acc.warmup_enabled
                  ? Math.min(100, (effectiveLimit / acc.daily_limit) * 100)
                  : 100;
                const daysLeft = acc.warmup_enabled && effectiveLimit < acc.daily_limit
                  ? Math.ceil((acc.daily_limit - effectiveLimit) / acc.warmup_increment)
                  : 0;
                return (
                  <div key={acc.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <Badge
                      variant="outline"
                      className={cn(
                        "size-2.5 p-0 rounded-full border-0 shrink-0",
                        acc.health_status === "good"    ? "bg-green-500" :
                        acc.health_status === "warning" ? "bg-amber-500" :
                        acc.health_status === "bad"     ? "bg-red-500"   : "bg-muted-foreground/40",
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{acc.label || acc.sender_email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {acc.warmup_enabled ? (
                          <>
                            <Progress value={warmupProgress} className="h-1 flex-1" />
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal shrink-0">
                              {effectiveLimit}/{acc.daily_limit}
                            </Badge>
                          </>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal gap-1">
                            <TrendingUp className="size-3" /> {acc.daily_limit}/Tag
                          </Badge>
                        )}
                      </div>
                      {acc.warmup_enabled && daysLeft > 0 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal mt-1 border-orange-200 bg-orange-50 text-orange-600">
                          Tag {acc.warmup_day} · {daysLeft}d bis Volllast
                        </Badge>
                      )}
                      {acc.warmup_enabled && daysLeft === 0 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal mt-1 border-green-200 bg-green-50 text-green-700">
                          Warmup abgeschlossen
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Campaign List ── */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-20">
            <Empty className="border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Send />
                </EmptyMedia>
                <EmptyTitle className="text-base">
                  {hasFilters
                    ? "Keine Kampagnen gefunden"
                    : "Noch keine Kampagnen erstellt"}
                </EmptyTitle>
                <EmptyDescription className="max-w-sm mx-auto">
                  {hasFilters
                    ? "Passe die Filter an oder setze sie zurück."
                    : "Erstelle deine erste Cold-Email-Kampagne und starte mit dem Outreach."}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {hasFilters ? (
                  <Button variant="outline" onClick={() => { setSearchFilter(""); setStatusFilter("all"); }}>
                    Filter zurücksetzen
                  </Button>
                ) : (
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Erste Kampagne erstellen
                  </Button>
                )}
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-28 pl-5">Status</TableHead>
                <TableHead>Kampagne</TableHead>
                <TableHead className="text-center w-28">Gesendet</TableHead>
                <TableHead className="text-center w-24">Open</TableHead>
                <TableHead className="text-center w-24">Reply</TableHead>
                <TableHead className="text-center w-24">Bounce</TableHead>
                <TableHead className="w-28">Erstellt</TableHead>
                <TableHead className="w-14 pr-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => {
                const cfg = STATUS_CONFIG[c.status];
                return (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer h-14 hover:bg-muted/40 transition-colors"
                    onClick={() => router.push(`/dashboard/campaigns/${c.id}`)}
                  >
                    <TableCell className="pl-5">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={`text-[11px] font-medium px-2.5 py-0.5 ${cfg.className}`}
                        >
                          {cfg.label}
                        </Badge>
                        {c.error_message && (
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-semibold text-sm">{c.name}</p>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {c.sent_count}
                        <span className="text-muted-foreground/50">/{c.total_count}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm font-medium tabular-nums">
                        {pct(c.open_count, c.sent_count)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm font-medium tabular-nums text-emerald-600">
                        {pct(c.reply_count, c.sent_count)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {pct(c.bounce_count, c.sent_count)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(c.created_at)}
                      </span>
                    </TableCell>
                    <TableCell className="pr-5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onClick={() => router.push(`/dashboard/campaigns/${c.id}`)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Details anzeigen
                          </DropdownMenuItem>
                          {(c.status === "draft" || c.status === "paused") && (
                            <DropdownMenuItem onClick={() => handleStatusChange(c.id, "active")}>
                              <Play className="h-4 w-4 mr-2" />
                              Kampagne starten
                            </DropdownMenuItem>
                          )}
                          {c.status === "active" && (
                            <DropdownMenuItem onClick={() => handleStatusChange(c.id, "paused")}>
                              <Pause className="h-4 w-4 mr-2" />
                              Pausieren
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => handleDelete(c.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Löschen
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ── Create Dialog ── */}
      <CampaignCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={fetchCampaigns}
      />
    </div>
  );
}
