"use client";

import { useState, useEffect } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Save, Loader2, Send, Clock } from "lucide-react";
import type { SocialMediaPost } from "@/types/social-media";
import { SOCIAL_STATUS_CONFIG } from "@/types/social-media";
import { HashtagInput } from "./HashtagInput";
import { PlatformAccountSelector } from "./PlatformAccountSelector";

interface PostDetailSheetProps {
  post: SocialMediaPost | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}

export function PostDetailSheet({ post, open, onOpenChange, onUpdated }: PostDetailSheetProps) {
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");

  // Sync state when post changes
  useEffect(() => {
    if (post) {
      setTitle(post.title);
      setCaption(post.caption ?? "");
      setHashtags(post.tags ?? []);
      setAccountIds(post.account_ids ?? []);
      setScheduledAt(post.scheduled_at ? post.scheduled_at.slice(0, 16) : "");
    }
  }, [post]);

  const handleSave = async (status?: "scheduled") => {
    if (!post) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title,
        caption,
        tags: hashtags,
        account_ids: accountIds,
      };
      if (status === "scheduled" && scheduledAt) {
        body.scheduled_at = new Date(scheduledAt).toISOString();
        body.status = "scheduled";
      }

      const res = await fetch(`/api/social-media/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast.success(status === "scheduled" ? "Post geplant" : "Post aktualisiert");
      onUpdated?.();
      onOpenChange(false);
    } catch {
      toast.error("Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!post) return;
    if (accountIds.length === 0) {
      toast.error("Bitte wähle mindestens ein Konto");
      return;
    }
    setPublishing(true);
    try {
      // Update post with account_ids first
      await fetch(`/api/social-media/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_ids: accountIds, title, caption, tags: hashtags }),
      });

      const res = await fetch("/api/social-media/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: post.id,
          account_ids: accountIds,
          publish_now: true,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Post veröffentlicht!");
      onUpdated?.();
      onOpenChange(false);
    } catch {
      toast.error("Fehler beim Veröffentlichen");
    } finally {
      setPublishing(false);
    }
  };

  if (!post) return null;

  const sc = SOCIAL_STATUS_CONFIG[post.status as keyof typeof SOCIAL_STATUS_CONFIG];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] sm:w-[500px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Post bearbeiten
            <Badge variant="outline" className={`text-[10px] ${sc?.className}`}>
              {sc?.label}
            </Badge>
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-120px)] mt-4">
          <div className="space-y-5 pr-4">
            {/* Preview */}
            {post.html_content && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Vorschau</Label>
                <iframe
                  srcDoc={post.html_content}
                  className="w-full aspect-square rounded-md border bg-white"
                  sandbox="allow-scripts"
                  title="Post preview"
                />
              </div>
            )}

            {/* Title */}
            <div>
              <Label htmlFor="sheet-title" className="text-xs">Titel</Label>
              <Input
                id="sheet-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1"
              />
            </div>

            {/* Caption */}
            <div>
              <Label htmlFor="sheet-caption" className="text-xs">Caption</Label>
              <textarea
                id="sheet-caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Hashtags */}
            <div>
              <Label className="text-xs">Hashtags</Label>
              <div className="mt-1">
                <HashtagInput value={hashtags} onChange={setHashtags} />
              </div>
            </div>

            <Separator />

            {/* Accounts */}
            <div>
              <Label className="text-xs">Veröffentlichen auf</Label>
              <div className="mt-1">
                <PlatformAccountSelector selectedIds={accountIds} onChange={setAccountIds} />
              </div>
            </div>

            {/* Schedule */}
            <div>
              <Label htmlFor="sheet-schedule" className="text-xs">Planen für</Label>
              <Input
                id="sheet-schedule"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="mt-1"
              />
            </div>

            <Separator />

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 gap-1.5"
                onClick={() => handleSave()}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Speichern
              </Button>
              {scheduledAt && (
                <Button
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => handleSave("scheduled")}
                  disabled={saving}
                >
                  <Clock className="h-4 w-4" />
                  Planen
                </Button>
              )}
              <Button
                className="flex-1 gap-1.5"
                onClick={handlePublish}
                disabled={publishing || accountIds.length === 0}
              >
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Veröffentlichen
              </Button>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
