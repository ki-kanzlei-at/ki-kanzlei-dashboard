"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Search,
  XCircle,
  AlertCircle,
  Square,
  Loader2,
  Trash2,
  RotateCcw,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import type { SearchJob, SearchJobStatus } from "@/types/leads";

/* Status-Config — Leads v3 (badge-status CSS classes) */
const JOB_STATUS_CONFIG: Record<
  SearchJobStatus,
  { label: string; className: string; dot: string }
> = {
  pending:   { label: "Wartet",        className: "status-new",            dot: "bg-muted-foreground" },
  running:   { label: "Läuft",         className: "status-interested",     dot: "bg-primary" },
  completed: { label: "Abgeschlossen", className: "status-converted",      dot: "bg-emerald-500" },
  failed:    { label: "Fehlgeschlagen",className: "status-not_interested", dot: "bg-muted-foreground/40" },
};

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString())     return `Heute ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Gestern ${time}`;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const COUNTRY_LABELS: Record<string, string> = {
  AT: "Österreich",
  DE: "Deutschland",
  CH: "Schweiz",
};

function formatETA(estimatedEnd: string | null): string | null {
  if (!estimatedEnd) return null;
  const remainingMs = new Date(estimatedEnd).getTime() - Date.now();
  if (remainingMs <= 0) return "gleich fertig";
  const secs = Math.ceil(remainingMs / 1000);
  if (secs <= 15) return "fast fertig";
  if (secs < 60) return `noch ${secs} Sek`;
  const mins = Math.ceil(secs / 60);
  return mins === 1 ? "noch 1 Min" : `noch ${mins} Min`;
}

const JOBS_PAGE_SIZE = 25;

function buildPageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}

interface SearchJobsListProps {
  jobs: SearchJob[];
  loading: boolean;
  onJobClick?: (jobId: string) => void;
  onJobCancelled?: (jobId: string) => void;
  onJobDeleted?: (jobId: string) => void;
  onBulkDeleted?: (jobIds: string[]) => void;
  onJobRetried?: (updatedJob: SearchJob) => void;
}

export function SearchJobsList({
  jobs,
  loading,
  onJobClick,
  onJobCancelled,
  onJobDeleted,
  onBulkDeleted,
  onJobRetried,
}: SearchJobsListProps) {
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds]     = useState<Set<string>>(new Set());
  const [retryingIds, setRetryingIds]     = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting]   = useState(false);
  const [page, setPage]                   = useState(1);

  /* Aktive immer oben, fertige paginiert */
  const activeJobs = jobs.filter((j) => j.status === "pending" || j.status === "running");
  const doneJobs   = jobs.filter((j) => j.status !== "pending" && j.status !== "running");

  /* Queue-Position pro pending Job */
  const queuePositions = new Map<string, number>();
  const ownPending = [...activeJobs.filter((j) => j.status === "pending")]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  ownPending.forEach((j, idx) => queuePositions.set(j.id, idx + 1));

  const totalDonePages = Math.max(1, Math.ceil(doneJobs.length / JOBS_PAGE_SIZE));
  const safePage       = Math.min(page, totalDonePages);
  const doneFrom       = (safePage - 1) * JOBS_PAGE_SIZE;
  const doneTo         = doneFrom + JOBS_PAGE_SIZE;
  const visibleDone    = doneJobs.slice(doneFrom, doneTo);
  const visibleJobs    = [...activeJobs, ...visibleDone];
  const pageNumbers    = buildPageNumbers(safePage, totalDonePages);

  const runningCount = activeJobs.filter((j) => j.status === "running").length;
  const pendingCount = activeJobs.filter((j) => j.status === "pending").length;

  /* ── Actions ── */
  async function handleCancel(job: SearchJob) {
    setCancellingIds((s) => new Set(s).add(job.id));
    try {
      const res = await fetch(`/api/leads/search/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "failed", error_message: "Vom Benutzer abgebrochen" }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Suche „${job.query}" abgebrochen`);
      onJobCancelled?.(job.id);
    } catch {
      toast.error("Abbrechen fehlgeschlagen");
    } finally {
      setCancellingIds((s) => { const n = new Set(s); n.delete(job.id); return n; });
    }
  }

  async function handleDelete(job: SearchJob) {
    setDeletingIds((s) => new Set(s).add(job.id));
    try {
      const res = await fetch(`/api/leads/search/${job.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(`Suchauftrag „${job.query}" gelöscht`);
      onJobDeleted?.(job.id);
    } catch {
      toast.error("Löschen fehlgeschlagen");
    } finally {
      setDeletingIds((s) => { const n = new Set(s); n.delete(job.id); return n; });
    }
  }

  async function handleBulkDelete() {
    if (doneJobs.length === 0) return;
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/leads/search/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: doneJobs.map((j) => j.id) }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${doneJobs.length} Suchaufträge gelöscht`);
      setPage(1);
      onBulkDeleted?.(doneJobs.map((j) => j.id));
    } catch {
      toast.error("Bulk-Löschen fehlgeschlagen");
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleRetry(job: SearchJob) {
    setRetryingIds((s) => new Set(s).add(job.id));
    try {
      const res = await fetch(`/api/leads/search/${job.id}/retry`, { method: "POST" });
      if (!res.ok) throw new Error();
      const json = await res.json();
      toast.success(`Suche „${job.query}" wird wiederholt`);
      onJobRetried?.(json.data as SearchJob);
    } catch {
      toast.error("Wiederholen fehlgeschlagen");
    } finally {
      setRetryingIds((s) => { const n = new Set(s); n.delete(job.id); return n; });
    }
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-muted/30">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="p-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  /* ── Empty ── */
  if (jobs.length === 0) {
    return (
      <div className="rounded-lg border bg-card overflow-hidden">
        <Empty className="py-20 border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>Keine Suchaufträge</EmptyTitle>
            <EmptyDescription>
              Starte oben eine neue Suche um Leads zu finden.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  /* ── Render Table ── */
  return (
    <div className="rounded-[var(--radius)] border border-border bg-card overflow-hidden">

      {/* Count-Bar — schlanker, ohne AI-Tropes (Pulse-Dot raus) */}
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-2 flex-wrap bg-card">
        <div className="text-[12.5px] text-muted-foreground">
          <b className="text-foreground font-semibold">{jobs.length.toLocaleString("de-DE")}</b> Suchaufträge
          {runningCount > 0 && <span className="ml-3">· {runningCount} {runningCount === 1 ? "aktiv" : "aktiv"}</span>}
          {pendingCount > 0 && <span className="ml-3">· {pendingCount} in Warteschlange</span>}
        </div>
        {doneJobs.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-destructive gap-1.5"
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
          >
            {bulkDeleting ? <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.75} /> : <Trash2 className="h-3 w-3" strokeWidth={1.75} />}
            Abgeschlossene löschen
          </Button>
        )}
      </div>

      {/* Tabelle — gleiche Struktur wie LeadsTable */}
      <div className="overflow-x-auto">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b">
              <TableHead className="px-3 text-xs font-medium" style={{ width: 260 }}>Suchbegriff</TableHead>
              <TableHead className="px-3 text-xs font-medium" style={{ width: 150 }}>Region</TableHead>
              <TableHead className="px-3 text-xs font-medium" style={{ width: 110 }}>Land</TableHead>
              <TableHead className="px-3 text-xs font-medium" style={{ width: 120 }}>Status</TableHead>
              <TableHead className="px-3 text-xs font-medium" style={{ width: 220 }}>Fortschritt</TableHead>
              <TableHead className="px-3 text-xs font-medium" style={{ width: 150 }}>Erstellt</TableHead>
              <TableHead className="px-3 text-xs font-medium" style={{ width: 48 }}></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleJobs.map((job) => {
              const cfg            = JOB_STATUS_CONFIG[job.status];
              const isActive       = job.status === "pending" || job.status === "running";
              const isPending      = job.status === "pending";
              const isRunning      = job.status === "running";
              const isCancelling   = cancellingIds.has(job.id);
              const isDeleting     = deletingIds.has(job.id);
              const isRetrying     = retryingIds.has(job.id);
              const queuePos       = queuePositions.get(job.id) ?? 0;
              const progressPercent = job.total_count && job.total_count > 0
                ? Math.min(100, Math.round((job.results_count / job.total_count) * 100))
                : undefined;
              const etaText = isActive ? formatETA(job.estimated_end_at ?? null) : null;

              const isCompleted = job.status === "completed";
              return (
                <TableRow
                  key={job.id}
                  className={cn(
                    "group transition-colors border-b last:border-b-0",
                    isRunning ? "bg-primary/[0.02] hover:bg-primary/[0.05]" : "hover:bg-muted/40",
                    isCompleted && onJobClick && "cursor-pointer",
                  )}
                  onClick={isCompleted && onJobClick ? () => onJobClick(job.id) : undefined}
                >
                  {/* Suchbegriff — pur, Status nur im Status-Spalte */}
                  <TableCell className="py-2 px-3">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-sm font-medium truncate leading-tight">{job.query}</p>
                      </TooltipTrigger>
                      <TooltipContent>{job.query}</TooltipContent>
                    </Tooltip>
                  </TableCell>

                  {/* Region */}
                  <TableCell className="py-2 px-3">
                    <span className="text-xs text-muted-foreground truncate block">
                      {job.location}
                    </span>
                  </TableCell>

                  {/* Land */}
                  <TableCell className="py-2 px-3">
                    <span className="text-xs text-muted-foreground">
                      {COUNTRY_LABELS[job.country] ?? job.country}
                    </span>
                  </TableCell>

                  {/* Status */}
                  <TableCell className="py-2.5 px-3">
                    <span className={cn("badge-status", cfg.className)}>
                      <span className="dot" />
                      {cfg.label}
                    </span>
                  </TableCell>

                  {/* Fortschritt */}
                  <TableCell className="py-2 px-3">
                    <div className="space-y-1 min-w-0">
                      {isRunning && progressPercent !== undefined && (
                        <Progress value={progressPercent} className="h-1" />
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {(job.results_count > 0 || job.total_count) && (
                          <span>
                            {job.results_count}
                            {job.total_count ? ` von ${job.total_count}` : ""} Leads
                          </span>
                        )}
                        {etaText && <span className="text-primary/70">{etaText}</span>}
                        {isPending && queuePos > 0 && (
                          <span className="text-primary/70">
                            {queuePos === 1 ? "startet gleich" : `Position ${queuePos}`}
                          </span>
                        )}
                        {job.status === "failed" && job.error_message && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex items-center gap-1 text-muted-foreground truncate">
                                <AlertCircle className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                                <span className="truncate">{job.error_message}</span>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{job.error_message}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  {/* Erstellt */}
                  <TableCell className="py-2 px-3">
                    <span className="text-xs text-muted-foreground">
                      {formatTime(job.created_at)}
                    </span>
                  </TableCell>

                  {/* Aktionen */}
                  <TableCell className="py-2 px-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity data-[state=open]:opacity-100"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
                          <span className="sr-only">Aktionen</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                          Aktionen
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {isActive && (
                          <DropdownMenuItem
                            className="text-xs gap-2 cursor-pointer"
                            disabled={isCancelling}
                            onClick={() => handleCancel(job)}
                          >
                            {isCancelling ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : isPending ? (
                              <XCircle className="h-3.5 w-3.5" />
                            ) : (
                              <Square className="h-3.5 w-3.5 fill-current" />
                            )}
                            {isPending ? "Abbrechen" : "Stoppen"}
                          </DropdownMenuItem>
                        )}
                        {!isActive && job.status === "failed" && (
                          <DropdownMenuItem
                            className="text-xs gap-2 cursor-pointer"
                            disabled={isRetrying}
                            onClick={() => handleRetry(job)}
                          >
                            {isRetrying ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            Wiederholen
                          </DropdownMenuItem>
                        )}
                        {!isActive && (
                          <DropdownMenuItem
                            className="text-xs gap-2 cursor-pointer text-destructive focus:text-destructive"
                            disabled={isDeleting}
                            onClick={() => handleDelete(job)}
                          >
                            {isDeleting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            Löschen
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination — identisch zur Leads-Tabelle */}
      {totalDonePages > 1 && (
        <>
          <Separator />
          <div className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-muted-foreground whitespace-nowrap">
              Seite {safePage} von {totalDonePages} ({doneJobs.length} abgeschlossen)
            </p>
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent className="gap-1">
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => { e.preventDefault(); if (safePage > 1) setPage(safePage - 1); }}
                    className={safePage <= 1 ? "pointer-events-none opacity-40" : ""}
                  />
                </PaginationItem>
                {pageNumbers.map((p, i) =>
                  p === "…" ? (
                    <PaginationItem key={`ellipsis-${i}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink
                        href="#"
                        isActive={p === safePage}
                        onClick={(e) => { e.preventDefault(); setPage(p as number); }}
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => { e.preventDefault(); if (safePage < totalDonePages) setPage(safePage + 1); }}
                    className={safePage >= totalDonePages ? "pointer-events-none opacity-40" : ""}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </>
      )}
    </div>
  );
}
