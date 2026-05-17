"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  Search, Loader2, X, SearchCheck, ExternalLink, Trash2,
  MoreHorizontal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Pagination, PaginationContent, PaginationItem,
  PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

import { SeoStatsCards } from "@/components/seo/SeoStatsCards";
import { SeoStatusBadge } from "@/components/seo/SeoStatusBadge";
import { SeoStatusDonut, SeoPostsPerWeekChart, SeoPostsPerCategoryChart } from "@/components/seo/SeoCharts";
import { SeoSelectionBar } from "@/components/seo/SeoSelectionBar";
import { SeoViewOptions } from "@/components/seo/SeoViewOptions";
import type { SeoPost, SeoPostStats, SeoPostStatus } from "@/types/seo";

const PAGE_SIZE = 25;

const EMPTY_STATS: SeoPostStats = {
  total: 0, draft: 0, published: 0, error: 0,
  total_words: 0, categories: [],
  posts_per_week: [], posts_per_category: [],
};

const STATUS_OPTIONS = [
  { value: "all", label: "Alle Status" },
  { value: "draft", label: "Entwurf" },
  { value: "published", label: "Veröffentlicht" },
  { value: "error", label: "Fehler" },
];

const DEFAULT_COLUMNS = new Set(["status", "category", "word_count", "keywords", "date"]);

export default function SeoPage() {
  const [posts, setPosts] = useState<SeoPost[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<SeoPostStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(DEFAULT_COLUMNS);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  /* ── Data Loading ── */

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/seo/stats");
      if (res.ok) setStats(await res.json());
    } catch {
      // silent
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/seo/posts?${params}`);
      if (!res.ok) {
        const err = await res.text();
        console.error("[SEO loadPosts]", res.status, err);
        throw new Error(err);
      }
      const data = await res.json();
      setPosts(data.data);
      setTotalCount(data.count);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error("[SEO loadPosts error]", err);
      toast.error("Fehler beim Laden der SEO-Posts");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, categoryFilter, search]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadPosts(); }, [loadPosts]);

  /* ── Search (debounced 500ms) ── */

  function handleSearchInput(value: string) {
    setSearchInput(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, 500);
  }

  function clearFilters() {
    setStatusFilter("all");
    setCategoryFilter("all");
    setSearch("");
    setSearchInput("");
    setPage(1);
  }

  const hasFilters = statusFilter !== "all" || categoryFilter !== "all" || search;

  /* ── Column Visibility ── */

  function toggleColumn(col: string) {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  }

  /* ── Selection ── */

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === posts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(posts.map((p) => p.id)));
    }
  }

  function selectAllVisible() {
    setSelectedIds(new Set(posts.map((p) => p.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const allSelected = posts.length > 0 && selectedIds.size === posts.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < posts.length;

  /* ── Bulk Actions ── */

  async function handleBulkStatusChange(status: SeoPostStatus) {
    const ids = [...selectedIds];
    try {
      const res = await fetch("/api/seo/posts/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${ids.length} Posts auf "${status === "draft" ? "Entwurf" : "Veröffentlicht"}" gesetzt`);
      clearSelection();
      loadPosts();
      loadStats();
    } catch {
      toast.error("Fehler beim Ändern des Status");
    }
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    setDeleting(true);
    try {
      const res = await fetch("/api/seo/posts/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${ids.length} Posts gelöscht`);
      setBulkDeleteOpen(false);
      clearSelection();
      loadPosts();
      loadStats();
    } catch {
      toast.error("Fehler beim Löschen");
    } finally {
      setDeleting(false);
    }
  }

  /* ── Single Delete ── */

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/seo/posts/${deleteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Post gelöscht");
      setDeleteId(null);
      loadPosts();
      loadStats();
    } catch {
      toast.error("Fehler beim Löschen");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="px-4 lg:px-6 py-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <SearchCheck className="h-6 w-6" />
            SEO Blog-Posts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automatisch erstellte Blog-Posts im Überblick
          </p>
        </div>
      </div>

      {/* ── Stats Cards ── */}
      <SeoStatsCards stats={stats} loading={statsLoading} />

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SeoStatusDonut
          draft={stats.draft}
          published={stats.published}
          error={stats.error}
        />
        <SeoPostsPerWeekChart data={stats.posts_per_week} />
        <SeoPostsPerCategoryChart data={stats.posts_per_category} />
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suche nach Titel, Beschreibung..."
            value={searchInput}
            onChange={(e) => handleSearchInput(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {stats.categories.length > 0 && (
          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Kategorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Kategorien</SelectItem>
              {stats.categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <SeoViewOptions visibleColumns={visibleColumns} onToggle={toggleColumn} />

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1 text-xs">
            <X className="h-3.5 w-3.5" /> Zurücksetzen
          </Button>
        )}
      </div>

      {/* ── Table Container ── */}
      <div className="rounded-lg border bg-card">
        {/* Count Bar */}
        <div className="px-4 py-2.5 border-b bg-muted/30">
          <div className="text-xs text-muted-foreground">
            {loading ? (
              <Skeleton className="h-3.5 w-24 inline-block" />
            ) : (
              <>
                <span className="font-semibold text-foreground">{totalCount}</span>
                {" "}Posts{hasFilters ? " (gefiltert)" : ""}
              </>
            )}
          </div>
        </div>

        {/* Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Alle auswählen"
                />
              </TableHead>
              {visibleColumns.has("status") && (
                <TableHead className="w-[120px]">Status</TableHead>
              )}
              <TableHead className="min-w-[200px]">Titel</TableHead>
              {visibleColumns.has("category") && (
                <TableHead className="w-[130px]">Kategorie</TableHead>
              )}
              {visibleColumns.has("word_count") && (
                <TableHead className="w-[90px] text-right">Wörter</TableHead>
              )}
              {visibleColumns.has("keywords") && (
                <TableHead className="w-[150px]">Keywords</TableHead>
              )}
              {visibleColumns.has("date") && (
                <TableHead className="w-[110px]">Datum</TableHead>
              )}
              <TableHead className="w-[48px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                  {visibleColumns.has("status") && <TableCell><Skeleton className="h-4 w-16" /></TableCell>}
                  <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                  {visibleColumns.has("category") && <TableCell><Skeleton className="h-4 w-16" /></TableCell>}
                  {visibleColumns.has("word_count") && <TableCell><Skeleton className="h-4 w-10" /></TableCell>}
                  {visibleColumns.has("keywords") && <TableCell><Skeleton className="h-4 w-20" /></TableCell>}
                  {visibleColumns.has("date") && <TableCell><Skeleton className="h-4 w-16" /></TableCell>}
                  <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                </TableRow>
              ))
            ) : posts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={2 + [...visibleColumns].length + 1}
                  className="text-center text-muted-foreground py-12"
                >
                  Keine SEO-Posts vorhanden
                </TableCell>
              </TableRow>
            ) : (
              posts.map((post) => {
                const isSelected = selectedIds.has(post.id);
                return (
                  <TableRow
                    key={post.id}
                    className={`hover:bg-muted/40 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                  >
                    <TableCell>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(post.id)}
                        aria-label={`${post.title} auswählen`}
                      />
                    </TableCell>
                    {visibleColumns.has("status") && (
                      <TableCell>
                        <SeoStatusBadge status={post.status} />
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-medium text-sm line-clamp-1">{post.title}</p>
                        {post.meta_description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {post.meta_description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    {visibleColumns.has("category") && (
                      <TableCell>
                        {post.category && (
                          <Badge variant="secondary" className="text-[11px]">
                            {post.category}
                          </Badge>
                        )}
                      </TableCell>
                    )}
                    {visibleColumns.has("word_count") && (
                      <TableCell className="text-right tabular-nums text-sm">
                        {post.word_count.toLocaleString("de-DE")}
                      </TableCell>
                    )}
                    {visibleColumns.has("keywords") && (
                      <TableCell>
                        {post.target_keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {post.target_keywords.slice(0, 2).map((kw) => (
                              <Badge key={kw} variant="outline" className="text-[10px]">
                                {kw}
                              </Badge>
                            ))}
                            {post.target_keywords.length > 2 && (
                              <Badge variant="outline" className="text-[10px]">
                                +{post.target_keywords.length - 2}
                              </Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                    )}
                    {visibleColumns.has("date") && (
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {new Date(post.created_at).toLocaleDateString("de-AT")}
                      </TableCell>
                    )}
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          {post.publish_url && (
                            <DropdownMenuItem asChild className="text-xs gap-2 cursor-pointer">
                              <a href={post.publish_url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3.5 w-3.5" />
                                Öffnen
                              </a>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-xs gap-2 cursor-pointer text-destructive focus:text-destructive"
                            onClick={() => setDeleteId(post.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Löschen
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t px-4 py-2">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setPage(Math.max(1, page - 1))}
                    className={page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const p = i + 1;
                  return (
                    <PaginationItem key={p}>
                      <PaginationLink
                        onClick={() => setPage(p)}
                        isActive={page === p}
                        className="cursor-pointer"
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    className={page >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>

      {/* ── Selection Bar ── */}
      <SeoSelectionBar
        selectedCount={selectedIds.size}
        totalCount={posts.length}
        onClear={clearSelection}
        onDelete={() => setBulkDeleteOpen(true)}
        onStatusChange={handleBulkStatusChange}
        onSelectAll={selectAllVisible}
      />

      {/* ── Single Delete Dialog ── */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dieser SEO-Post wird unwiderruflich gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Bulk Delete Dialog ── */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{selectedIds.size} Posts löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die ausgewählten Posts werden unwiderruflich gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {selectedIds.size} Posts löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
