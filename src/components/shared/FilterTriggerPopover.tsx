"use client";

/* ── Filter-Chip mit Popover-Auswahl ──
 * Gemeinsame Komponente für Kampagnen-Liste und Wizard-Zielgruppe
 * (gleicher Stil wie die Filterleiste im Leads-Bereich).
 * Single-Select (Standard) oder Multi-Select via `multi`.
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

interface BaseProps {
  label: string;
  value: string | null;
  onClear: () => void;
  options: { value: string; label: string }[];
  searchPlaceholder?: string;
  emptyText?: string;
}

export type FilterTriggerPopoverProps =
  | (BaseProps & { multi?: false; selectValue: string; onSelectChange: (value: string) => void })
  | (BaseProps & { multi: true; selectValue: string[]; onSelectChange: (value: string[]) => void });

export function FilterTriggerPopover(props: FilterTriggerPopoverProps) {
  const { label, value, onClear, options } = props;
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
          <CommandInput placeholder={props.searchPlaceholder ?? `${label} suchen…`} className="h-9 text-[13px]" />
          <CommandList className="max-h-[260px] overflow-y-auto overscroll-contain">
            <CommandEmpty className="py-4 text-center text-[12px] text-muted-foreground">
              {props.emptyText ?? "Kein Eintrag gefunden"}
            </CommandEmpty>
            {options.map((opt) => {
              const selected = props.multi
                ? props.selectValue.includes(opt.value)
                : props.selectValue === opt.value;
              return (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    if (props.multi) {
                      props.onSelectChange(
                        selected
                          ? props.selectValue.filter((v) => v !== opt.value)
                          : [...props.selectValue, opt.value],
                      );
                    } else {
                      props.onSelectChange(opt.value);
                    }
                  }}
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
