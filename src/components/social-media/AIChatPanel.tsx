"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRef, useEffect, useState, useCallback, type FormEvent } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Send, Sparkles, User, Image as ImageIcon,
  LayoutGrid, Smartphone, Briefcase,
  Loader2, ImagePlus,
} from "lucide-react";
import { UnsplashImagePicker } from "./UnsplashImagePicker";

interface AIChatPanelProps {
  onHtmlGenerated?: (html: string) => void;
  onImageSelected?: (url: string, attribution: string) => void;
}

const QUICK_PROMPTS = [
  { label: "Single Post", icon: ImageIcon, prompt: "Erstelle einen einzelnen Instagram-Post (1080x1080px) über " },
  { label: "Carousel", icon: LayoutGrid, prompt: "Erstelle ein Instagram-Carousel mit 5 Slides über " },
  { label: "Story", icon: Smartphone, prompt: "Erstelle eine Instagram-Story (1080x1920px) über " },
  { label: "LinkedIn", icon: Briefcase, prompt: "Erstelle einen LinkedIn-Post (1200x627px) über " },
];

function extractHtml(content: string): string | null {
  const codeBlockMatch = content.match(/```html?\s*\n([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  const htmlDocMatch = content.match(/(<!DOCTYPE[\s\S]*?<\/html>)/i);
  if (htmlDocMatch) return htmlDocMatch[1].trim();
  return null;
}

function getTextContent(parts: unknown): string {
  if (typeof parts === "string") return parts;
  if (Array.isArray(parts)) {
    return parts
      .filter((p: Record<string, unknown>) => p.type === "text")
      .map((p: Record<string, unknown>) => p.text as string)
      .join("");
  }
  return "";
}

function stripHtmlFromText(text: string): string {
  return text
    .replace(/```html?\s*\n[\s\S]*?```/g, "[HTML-Post generiert]")
    .replace(/<!DOCTYPE[\s\S]*?<\/html>/gi, "[HTML-Post generiert]")
    .trim();
}

export function AIChatPanel({ onHtmlGenerated, onImageSelected }: AIChatPanelProps) {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/social-media/chat" }),
  });

  const scrollEndRef = useRef<HTMLDivElement>(null);
  const [lastExtractedHtml, setLastExtractedHtml] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [unsplashOpen, setUnsplashOpen] = useState(false);

  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    const lastAi = [...messages].reverse().find((m) => m.role === "assistant");
    if (lastAi) {
      const content = getTextContent(lastAi.parts);
      const html = extractHtml(content);
      if (html && html !== lastExtractedHtml) {
        setLastExtractedHtml(html);
        onHtmlGenerated?.(html);
      }
    }
  }, [messages, lastExtractedHtml, onHtmlGenerated]);

  const handleQuickPrompt = useCallback((prompt: string) => {
    setInput(prompt);
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    sendMessage({ text: input.trim() });
    setInput("");
  };

  const handleUnsplashSelect = (url: string, attribution: string) => {
    onImageSelected?.(url, attribution);
    // Add image context to chat
    setInput((prev) => {
      const prefix = prev ? `${prev}\n\n` : "";
      return `${prefix}[Bild ausgewählt: ${url} — ${attribution}] Verwende dieses Bild im Post.`;
    });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Quick prompts bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30 overflow-x-auto">
        {QUICK_PROMPTS.map((qp) => (
          <Badge
            key={qp.label}
            variant="outline"
            className="cursor-pointer hover:bg-primary/10 hover:border-primary/30 transition-colors px-3 py-1.5 text-xs shrink-0 gap-1.5"
            onClick={() => handleQuickPrompt(qp.prompt)}
          >
            <qp.icon className="h-3 w-3" />
            {qp.label}
          </Badge>
        ))}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">KI Post-Generator</h3>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-xs">
                Beschreibe deinen Post und die KI erstellt ein passendes Design im KI Kanzlei Branding.
              </p>
            </div>
          )}

          {messages.map((message) => {
            const isUser = message.role === "user";
            const rawContent = getTextContent(message.parts);
            const displayText = isUser ? rawContent : stripHtmlFromText(rawContent);

            if (!displayText) return null;

            return (
              <div
                key={message.id}
                className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}
              >
                <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                  <AvatarFallback
                    className={
                      isUser
                        ? "bg-primary text-primary-foreground text-xs"
                        : "bg-gradient-to-br from-[#3884EE] to-[#42B5EF] text-white text-xs"
                    }
                    style={!isUser ? { background: "linear-gradient(135deg, #3884EE, #42B5EF)" } : undefined}
                  >
                    {isUser ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    isUser
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-muted/70 text-foreground rounded-tl-sm"
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">{displayText}</div>
                </div>
              </div>
            );
          })}

          {isStreaming && (
            <div className="flex gap-2.5">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback
                  className="text-white text-xs"
                  style={{ background: "linear-gradient(135deg, #3884EE, #42B5EF)" }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </AvatarFallback>
              </Avatar>
              <div className="bg-muted/70 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          <div ref={scrollEndRef} />
        </div>
      </ScrollArea>

      {/* Input bar */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 px-3 py-2.5 border-t bg-background"
      >
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0"
          onClick={() => setUnsplashOpen(true)}
          title="Unsplash Bild suchen"
        >
          <ImagePlus className="h-4 w-4" />
        </Button>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Beschreibe deinen Post..."
          disabled={isStreaming}
          className="flex-1 h-9 text-sm rounded-lg border-muted-foreground/20 focus-visible:ring-primary/30"
        />
        <Button
          type="submit"
          size="icon"
          disabled={isStreaming || !input.trim()}
          className="h-9 w-9 rounded-lg shrink-0"
        >
          {isStreaming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>

      {/* Unsplash Picker */}
      <UnsplashImagePicker
        open={unsplashOpen}
        onOpenChange={setUnsplashOpen}
        onImageSelected={handleUnsplashSelect}
      />
    </div>
  );
}
