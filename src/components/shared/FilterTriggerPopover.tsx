"use client";

/* ── Filter-Chip mit Popover-Auswahl ──
 * Gemeinsame Komponente für Kampagnen-Liste und Wizard-Zielgruppe
 * (gleicher Stil wie die Filterleiste im Leads-Bereich).
 */

import { Plus, X, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface FilterTriggerPopoverProps {
  label: string;
  value: string | null;
  onClear: () => void;
  selectValue: string;
  onSelectChange: (value: string) => void;
  options: { value: string; label: string }[];
}

export function FilterTriggerPopover({
  label,
  value,
  onClear,
  selectValue,
  onSelectChange,
  options,
}: FilterTriggerPopoverProps) {
  const hasValue = !!value;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn("filter-trigger", hasValue && "has-value")}>
          {!hasValue && <Plus className="h-3 w-3" strokeWidth={1.75} />}
          <span className="lbl">{label}</span>
          {hasValue && <span className="val">{value}</span>}
          {hasValue && (
            <span
              role="button"
              tabIndex={0}
              aria-label={`${label} entfernen`}
              className="x-btn"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onClear(); }
              }}
            >
              <X className="h-2.5 w-2.5" strokeWidth={1.75} />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command>
          <CommandInput placeholder={`${label} suchen…`} className="h-9 text-[13px]" />
          <CommandList className="max-h-[260px] overflow-y-auto overscroll-contain">
            <CommandEmpty className="py-4 text-center text-[12px] text-muted-foreground">
              Kein Eintrag gefunden
            </CommandEmpty>
            {options.map((opt) => {
              const selected = selectValue === opt.value;
              return (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => onSelectChange(opt.value)}
                  className="text-[13px] cursor-pointer"
                >
                  <Check className={cn("mr-2 h-3.5 w-3.5", selected ? "opacity-100" : "opacity-0")} />
                  {opt.label}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
