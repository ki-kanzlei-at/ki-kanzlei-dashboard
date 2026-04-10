"use client";

import { useState, useCallback, useEffect } from "react";
import { Search, Loader2, ExternalLink } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

interface UnsplashImage {
  id: string;
  urls: { small: string; regular: string; raw: string };
  alt_description: string | null;
  user: { name: string; username: string; links?: { html?: string } };
  width: number;
  height: number;
}

interface UnsplashImagePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImageSelected: (url: string, attribution: string) => void;
}

export function UnsplashImagePicker({ open, onOpenChange, onImageSelected }: UnsplashImagePickerProps) {
  const [query, setQuery] = useState("");
  const [images, setImages] = useState<UnsplashImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async (searchQuery?: string) => {
    const q = searchQuery ?? query;
    if (!q.trim()) return;

    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/social-media/unsplash?query=${encodeURIComponent(q)}&per_page=20`);
      const json = await res.json();
      setImages(json.results ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [query]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setImages([]);
      setSearched(false);
    }
  }, [open]);

  const handleSelect = (img: UnsplashImage) => {
    const attribution = `Foto von ${img.user.name} auf Unsplash`;
    onImageSelected(img.urls.regular, attribution);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Unsplash Bild suchen</DialogTitle>
          <DialogDescription>
            Suche nach lizenzfreien Bildern von Unsplash.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="z.B. Kanzlei, Recht, Büro..."
              className="pl-8"
              autoFocus
            />
          </div>
          <Button type="submit" disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Suchen"}
          </Button>
        </form>

        {/* Quick tags */}
        <div className="flex flex-wrap gap-1.5">
          {["Kanzlei", "Recht", "Büro", "Meeting", "Technologie", "Business"].map((tag) => (
            <Button
              key={tag}
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => { setQuery(tag); handleSearch(tag); }}
            >
              {tag}
            </Button>
          ))}
        </div>

        {/* Results */}
        <ScrollArea className="h-[400px]">
          {loading ? (
            <div className="grid grid-cols-3 gap-2 p-1">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-md" />
              ))}
            </div>
          ) : images.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 p-1">
              {images.map((img) => (
                <button
                  key={img.id}
                  onClick={() => handleSelect(img)}
                  className="group relative aspect-square overflow-hidden rounded-md border hover:ring-2 hover:ring-primary transition-all"
                >
                  <img
                    src={img.urls.small}
                    alt={img.alt_description || "Unsplash Bild"}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  {/* Attribution overlay */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[10px] text-white truncate flex items-center gap-1">
                      <ExternalLink className="h-2.5 w-2.5" />
                      {img.user.name}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : searched ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Keine Bilder gefunden.
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Suche nach Bildern, um loszulegen.
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
