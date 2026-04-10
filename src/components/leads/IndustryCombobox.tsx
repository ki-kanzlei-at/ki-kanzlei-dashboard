"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { INDUSTRY_OPTIONS } from "@/types/leads";

interface IndustryComboboxProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
  options?: { value: string; label: string }[];
}

export function IndustryCombobox({
  value,
  onChange,
  placeholder = "Branche filtern",
  className,
  options,
}: IndustryComboboxProps) {
  const [open, setOpen] = useState(false);
  const items = options ?? INDUSTRY_OPTIONS;

  function toggle(val: string) {
    if (value.includes(val)) {
      onChange(value.filter((v) => v !== val));
    } else {
      onChange([...value, val]);
    }
  }

  const buttonLabel = (() => {
    if (value.length === 0) return null;
    if (value.length <= 3) return value.map((v) => items.find((i) => i.value === v)?.label ?? v).join(", ");
    return `${value.length} Branchen`;
  })();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-9 w-full justify-between font-normal", className)}
        >
          <span className="truncate">
            {buttonLabel ?? <span className="text-muted-foreground">{placeholder}</span>}
          </span>
          {value.length > 0 ? (
            <span
              role="button"
              aria-label="Auswahl zurücksetzen"
              className="ml-1 rounded-full bg-primary/20 text-primary h-4 w-4 flex items-center justify-center shrink-0 cursor-pointer hover:bg-primary/30 transition-colors"
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
            >
              <X className="h-2.5 w-2.5" />
            </span>
          ) : (
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Branche suchen..." />
          <CommandList className="max-h-60 overflow-y-auto">
            <CommandEmpty>Keine Branche gefunden</CommandEmpty>
            {items.map((opt) => (
              <CommandItem
                key={opt.value}
                value={opt.label}
                onSelect={() => toggle(opt.value)}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4 shrink-0",
                    value.includes(opt.value) ? "opacity-100" : "opacity-0",
                  )}
                />
                {opt.label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
