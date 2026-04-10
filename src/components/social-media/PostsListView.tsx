"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Trash2, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import type { SocialMediaPost, SocialMediaPostStatus } from "@/types/social-media";
import { SOCIAL_STATUS_CONFIG, PLATFORM_CONFIG } from "@/types/social-media";
import { PostDetailSheet } from "./PostDetailSheet";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";

export function PostsListView() {
  const [posts, setPosts] = useState<SocialMediaPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [selectedPost, setSelectedPost] = useState<SocialMediaPost | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "15" });
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/social-media/posts?${params}`);
      const json = await res.json();
      if (json.data) {
        setPosts(json.data.data);
        setTotalPages(json.data.totalPages);
        setTotal(json.data.count);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleSearch = (value: string) => {
    if (searchTimeout) clearTimeout(searchTimeout);
    const timeout = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 500);
    setSearchTimeout(timeout);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Post wirklich löschen?")) return;
    try {
      await fetch(`/api/social-media/posts/${id}`, { method: "DELETE" });
      fetchPosts();
      toast.success("Post gelöscht");
    } catch {
      toast.error("Fehler beim Löschen");
    }
  };

  const handleOpenDetail = (post: SocialMediaPost) => {
    setSelectedPost(post);
    setSheetOpen(true);
  };

  return (
    <>
      <Card className="p-0">
        {/* Filters */}
        <div className="flex items-center gap-3 p-4 border-b">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Posts durchsuchen..."
              className="pl-8"
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              <SelectItem value="draft">Entwurf</SelectItem>
              <SelectItem value="scheduled">Geplant</SelectItem>
              <SelectItem value="published">Veröffentlicht</SelectItem>
              <SelectItem value="failed">Fehlgeschlagen</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground ml-auto">{total} Posts</span>
        </div>

        {/* Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Titel</TableHead>
              <TableHead>Plattformen</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Erstellt</TableHead>
              <TableHead>Geplant für</TableHead>
              <TableHead className="w-[80px]">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : posts.map((post) => {
                  const sc = SOCIAL_STATUS_CONFIG[post.status as SocialMediaPostStatus];
                  return (
                    <TableRow
                      key={post.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleOpenDetail(post)}
                    >
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {post.title}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {post.platform.map((p) => {
                            const pc = PLATFORM_CONFIG[p];
                            return (
                              <Badge key={p} variant="outline" className={`text-[10px] ${pc?.color ?? ""}`}>
                                {pc?.label ?? p}
                              </Badge>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={sc?.className}>
                          <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${sc?.dot}`} />
                          {sc?.label ?? post.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(post.created_at), "dd. MMM yyyy", { locale: de })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {post.scheduled_at
                          ? format(new Date(post.scheduled_at), "dd. MMM yyyy HH:mm", { locale: de })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => handleOpenDetail(post)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleDelete(post.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
            {!loading && posts.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Keine Posts gefunden
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <span className="text-sm text-muted-foreground">Seite {page} von {totalPages}</span>
            <div className="flex gap-1">
              <Button size="icon" variant="outline" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="outline" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Detail Sheet */}
      <PostDetailSheet
        post={selectedPost}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onUpdated={fetchPosts}
      />
    </>
  );
}
