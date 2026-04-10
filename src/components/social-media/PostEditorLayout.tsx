"use client";

import { useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { AIChatPanel } from "./AIChatPanel";
import { PostPreviewPanel } from "./PostPreviewPanel";

export function PostEditorLayout() {
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [slides, setSlides] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageAttribution, setImageAttribution] = useState<string | null>(null);

  const handleHtmlGenerated = useCallback((html: string) => {
    setPreviewHtml(html);
    // Extract slides
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const headContent = doc.head.innerHTML;
      const children = Array.from(doc.body.children);
      const slideEls: HTMLElement[] = [];

      for (const child of children) {
        const el = child as HTMLElement;
        const style = el.getAttribute("style") || "";
        if (
          style.includes("1080") ||
          style.includes("400") ||
          el.classList.contains("slide") ||
          (el.tagName === "DIV" && children.length > 1)
        ) {
          slideEls.push(el);
        }
      }

      if (slideEls.length > 1) {
        setSlides(
          slideEls.map((slide) =>
            `<!DOCTYPE html><html><head>${headContent}</head><body style="margin:0;padding:0;overflow:hidden;">${slide.outerHTML}</body></html>`,
          ),
        );
      } else {
        setSlides([html]);
      }
    } catch {
      setSlides([html]);
    }
  }, []);

  const handleImageSelected = useCallback((url: string, attribution: string) => {
    setImageUrl(url);
    setImageAttribution(attribution);
  }, []);

  return (
    <div className="grid lg:grid-cols-[1fr_480px] gap-4 items-start">
      {/* Chat */}
      <Card className="p-0 overflow-hidden h-[680px] border">
        <AIChatPanel
          onHtmlGenerated={handleHtmlGenerated}
          onImageSelected={handleImageSelected}
        />
      </Card>

      {/* Preview + Form */}
      <PostPreviewPanel
        previewHtml={previewHtml}
        slides={slides}
        imageUrl={imageUrl}
        imageAttribution={imageAttribution}
        onImageSelected={handleImageSelected}
      />
    </div>
  );
}
