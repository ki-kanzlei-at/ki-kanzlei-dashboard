"use client";

import { useState, useRef } from "react";
import {
  ChevronLeft, ChevronRight, Download, Save,
  Loader2, Send, Clock, Image as ImageIcon, Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { HashtagInput } from "./HashtagInput";
import { PlatformAccountSelector } from "./PlatformAccountSelector";
import { UnsplashImagePicker } from "./UnsplashImagePicker";

interface PostPreviewPanelProps {
  previewHtml: string | null;
  slides: string[];
  imageUrl: string | null;
  imageAttribution: string | null;
  onImageSelected: (url: string, attribution: string) => void;
}

function extractSlides(html: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const headContent = doc.head.innerHTML;
  const children = Array.from(doc.body.children);
  const slides: HTMLElement[] = [];

  for (const child of children) {
    const el = child as HTMLElement;
    const style = el.getAttribute("style") || "";
    if (
      style.includes("1080") ||
      style.includes("400") ||
      el.classList.contains("slide") ||
      (el.tagName === "DIV" && children.length > 1)
    ) {
      slides.push(el);
    }
  }

  if (slides.length > 1) {
    return slides.map((slide) =>
      `<!DOCTYPE html><html><head>${headContent}</head><body style="margin:0;padding:0;overflow:hidden;">${slide.outerHTML}</body></html>`,
    );
  }
  return [html];
}

export function PostPreviewPanel({
  previewHtml,
  slides: externalSlides,
  imageUrl,
  imageAttribution,
  onImageSelected,
}: PostPreviewPanelProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [unsplashOpen, setUnsplashOpen] = useState(false);

  // Form state
  const [postTitle, setPostTitle] = useState("");
  const [postCaption, setPostCaption] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const slides = externalSlides.length > 0 ? externalSlides : (previewHtml ? extractSlides(previewHtml) : []);
  const isCarousel = slides.length > 1;
  const currentPreviewHtml = isCarousel ? slides[currentSlide] : previewHtml;

  /* ── Save as draft ── */
  const handleSave = async (status: "draft" | "scheduled" = "draft") => {
    if (!postTitle.trim()) {
      toast.error("Bitte gib einen Titel ein");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: postTitle.trim(),
        caption: postCaption || null,
        html_content: previewHtml,
        image_url: imageUrl,
        tags: hashtags,
        account_ids: accountIds,
        status,
      };
      if (status === "scheduled" && scheduledAt) {
        body.scheduled_at = new Date(scheduledAt).toISOString();
      }

      const res = await fetch("/api/social-media/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast.success(status === "scheduled" ? "Post geplant" : "Entwurf gespeichert");
    } catch {
      toast.error("Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  /* ── Publish now ── */
  const handlePublishNow = async () => {
    if (!postTitle.trim()) {
      toast.error("Bitte gib einen Titel ein");
      return;
    }
    if (accountIds.length === 0) {
      toast.error("Bitte wähle mindestens ein Konto");
      return;
    }
    setPublishing(true);
    try {
      // First save the post
      const saveRes = await fetch("/api/social-media/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: postTitle.trim(),
          caption: postCaption || null,
          html_content: previewHtml,
          image_url: imageUrl,
          tags: hashtags,
          account_ids: accountIds,
          status: "scheduled",
        }),
      });
      if (!saveRes.ok) throw new Error();
      const { data: post } = await saveRes.json();

      // Then publish
      const pubRes = await fetch("/api/social-media/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          post_id: post.id,
          account_ids: accountIds,
          publish_now: true,
        }),
      });
      if (!pubRes.ok) throw new Error();
      toast.success("Post veröffentlicht!");
    } catch {
      toast.error("Fehler beim Veröffentlichen");
    } finally {
      setPublishing(false);
    }
  };

  /* ── Download PNG ── */
  const handleDownload = () => {
    if (!previewHtml) return;
    setDownloading(true);
    const html = isCarousel ? slides[currentSlide] : previewHtml;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const name = postTitle || "social-post";
    a.download = isCarousel ? `${name}-slide-${currentSlide + 1}.html` : `${name}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("HTML heruntergeladen");
    setDownloading(false);
  };

  return (
    <Card className="overflow-hidden border flex flex-col h-[680px]">
      {/* Preview header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Vorschau</span>
          {isCarousel && (
            <Badge variant="secondary" className="text-[10px]">
              {slides.length} Slides
            </Badge>
          )}
        </div>
        {previewHtml && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1"
            disabled={downloading}
            onClick={handleDownload}
          >
            <Download className="h-3 w-3" />
            HTML
          </Button>
        )}
      </div>

      {/* Preview content */}
      <div className="relative bg-[#F8F9FA] shrink-0">
        {currentPreviewHtml ? (
          <>
            <iframe
              ref={iframeRef}
              srcDoc={currentPreviewHtml}
              className="w-full aspect-square bg-white"
              sandbox="allow-scripts"
              title="Post preview"
              style={{ display: "block", maxHeight: "300px" }}
            />
            {isCarousel && (
              <>
                <button
                  onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
                  disabled={currentSlide === 0}
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/90 shadow-md flex items-center justify-center disabled:opacity-30 hover:bg-white transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))}
                  disabled={currentSlide === slides.length - 1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/90 shadow-md flex items-center justify-center disabled:opacity-30 hover:bg-white transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {slides.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentSlide(i)}
                      className={`h-2 w-2 rounded-full transition-colors ${
                        i === currentSlide ? "bg-primary" : "bg-white/70"
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="w-full aspect-[3/2] flex flex-col items-center justify-center text-center p-8">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center mb-3">
              <Sparkles className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Dein Post erscheint hier</p>
          </div>
        )}
      </div>

      <Separator />

      {/* Form */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <div>
            <Label htmlFor="pp-title" className="text-xs">Titel</Label>
            <Input
              id="pp-title"
              value={postTitle}
              onChange={(e) => setPostTitle(e.target.value)}
              placeholder="z.B. DSGVO Carousel KW14"
              className="mt-1 h-8 text-sm"
            />
          </div>

          <div>
            <Label htmlFor="pp-caption" className="text-xs">Caption</Label>
            <textarea
              id="pp-caption"
              value={postCaption}
              onChange={(e) => setPostCaption(e.target.value)}
              placeholder="Caption, CTA..."
              rows={3}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <Label className="text-xs">Hashtags</Label>
            <div className="mt-1">
              <HashtagInput value={hashtags} onChange={setHashtags} />
            </div>
          </div>

          {/* Image */}
          <div>
            <Label className="text-xs">Bild</Label>
            <div className="mt-1 flex items-center gap-2">
              {imageUrl ? (
                <div className="relative h-12 w-12 rounded-md overflow-hidden border shrink-0">
                  <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                </div>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => setUnsplashOpen(true)}
              >
                <ImageIcon className="h-3 w-3" />
                {imageUrl ? "Bild ändern" : "Bild hinzufügen"}
              </Button>
              {imageAttribution && (
                <span className="text-[10px] text-muted-foreground truncate">{imageAttribution}</span>
              )}
            </div>
          </div>

          {/* Accounts */}
          <div>
            <Label className="text-xs">Veröffentlichen auf</Label>
            <div className="mt-1">
              <PlatformAccountSelector selectedIds={accountIds} onChange={setAccountIds} />
            </div>
          </div>

          {/* Schedule */}
          <div>
            <Label htmlFor="pp-schedule" className="text-xs">Planen für</Label>
            <Input
              id="pp-schedule"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="mt-1 h-8 text-sm"
            />
          </div>
        </div>
      </ScrollArea>

      {/* Action bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-t bg-background shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1"
          disabled={saving}
          onClick={() => handleSave("draft")}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Entwurf
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1"
          disabled={saving || !scheduledAt}
          onClick={() => handleSave("scheduled")}
        >
          <Clock className="h-3 w-3" />
          Planen
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1"
          disabled={downloading || !previewHtml}
          onClick={handleDownload}
        >
          <Download className="h-3 w-3" />
          HTML
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs gap-1"
          disabled={publishing || accountIds.length === 0}
          onClick={handlePublishNow}
        >
          {publishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Veröffentlichen
        </Button>
      </div>

      {/* Unsplash Picker */}
      <UnsplashImagePicker
        open={unsplashOpen}
        onOpenChange={setUnsplashOpen}
        onImageSelected={onImageSelected}
      />
    </Card>
  );
}
