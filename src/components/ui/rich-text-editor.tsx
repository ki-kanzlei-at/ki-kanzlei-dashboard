"use client";

import * as React from "react";
import { Bold, Italic, Underline, List, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minHeight?: number;
}

/**
 * Schlanker, dependency-freier Rich-Text-Editor im shadcn-Stil.
 * Gibt HTML zurück (contentEditable). Bewusst ohne externe Lib —
 * der offizielle @shadcn-Registry bietet keinen Editor.
 */
export function RichTextEditor({
  value, onChange, placeholder, disabled, className, minHeight = 110,
}: RichTextEditorProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = React.useState(true);

  // Externer Wert → DOM, aber nur wenn das Feld nicht gerade fokussiert ist
  // (sonst springt der Cursor beim Tippen).
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement !== el && el.innerHTML !== (value || "")) {
      el.innerHTML = value || "";
    }
    setEmpty(isVisuallyEmpty(el.innerHTML));
  }, [value]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    setEmpty(isVisuallyEmpty(el.innerHTML));
    onChange(el.innerHTML);
  };

  const exec = (cmd: string, arg?: string) => {
    document.execCommand(cmd, false, arg);
    ref.current?.focus();
    emit();
  };

  const addLink = () => {
    const url = window.prompt("Link-URL (https://…)");
    if (!url) return;
    const safe = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    exec("createLink", safe);
  };

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow]",
        "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
    >
      <div className="flex items-center gap-0.5 border-b px-1.5 py-1">
        <ToolbarButton label="Fett" onClick={() => exec("bold")}><Bold className="size-3.5" /></ToolbarButton>
        <ToolbarButton label="Kursiv" onClick={() => exec("italic")}><Italic className="size-3.5" /></ToolbarButton>
        <ToolbarButton label="Unterstrichen" onClick={() => exec("underline")}><Underline className="size-3.5" /></ToolbarButton>
        <div className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton label="Aufzählung" onClick={() => exec("insertUnorderedList")}><List className="size-3.5" /></ToolbarButton>
        <ToolbarButton label="Link einfügen" onClick={addLink}><Link2 className="size-3.5" /></ToolbarButton>
      </div>
      <div className="relative">
        {empty && placeholder && (
          <div className="pointer-events-none absolute left-3 top-2 whitespace-pre-line text-sm text-muted-foreground">
            {placeholder}
          </div>
        )}
        <div
          ref={ref}
          role="textbox"
          aria-multiline="true"
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
          style={{ minHeight }}
          className="w-full resize-y overflow-auto px-3 py-2 text-sm leading-relaxed outline-none [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
        />
      </div>
    </div>
  );
}

function ToolbarButton({
  label, onClick, children,
}: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      // mousedown verhindern, damit die Textselektion beim Klick erhalten bleibt
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="inline-flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

function isVisuallyEmpty(html: string): boolean {
  return html.replace(/<br\s*\/?>/gi, "").replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, "").trim() === "";
}
