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

type BaseProps = {
  options: { value: string; label: string }[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  allLabel?: string;
  className?: string;
};

type SingleProps = BaseProps & {
  multi?: false;
  value: string;
  onChange: (value: string) => void;
};

type MultiProps = BaseProps & {
  multi: true;
  value: string[];
  onChange: (value: string[]) => void;
};

type FilterComboboxProps = SingleProps | MultiProps;

export function FilterCombobox(props: FilterComboboxProps) {
  const {
    options,
    placeholder = "Auswählen",
    searchPlaceholder = "Suchen…",
    emptyText = "Nichts gefunden",
    allLabel = "Alle",
    className,
  } = props;

  const [open, setOpen] = useState(false);

  /* ── Multi-Select ── */
  if (props.multi) {
    const { value, onChange } = props;

    function toggle(val: string) {
      if (value.includes(val)) {
        onChange(value.filter((v) => v !== val));
      } else {
        onChange([...value, val]);
      }
    }

    const buttonLabel = (() => {
      if (value.length === 0) return null;
      if (value.length <= 3) return value.map((v) => options.find((o) => o.value === v)?.label ?? v).join(", ");
      return `${value.length} ausgewählt`;
    })();

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("h-9 justify-between font-normal", className)}
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
        <PopoverContent className="w-[220px] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList className="max-h-60 overflow-y-auto">
              <CommandEmpty>{emptyText}</CommandEmpty>
              {options.map((opt) => (
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

  /* ── Single-Select (unverändert) ── */
  const { value, onChange } = props as SingleProps;
  const allOptions = [{ value: "all", label: allLabel }, ...options];
  const currentLabel =
    value === "all"
      ? allLabel
      : options.find((opt) => opt.value === value)?.label ?? value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-9 justify-between font-normal", className)}
        >
          <span className="truncate">
            {value === "all" ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              currentLabel
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-60 overflow-y-auto">
            <CommandEmpty>{emptyText}</CommandEmpty>
            {allOptions.map((opt) => (
              <CommandItem
                key={opt.value}
                value={opt.label}
                onSelect={() => {
                  onChange(opt.value === value ? "all" : opt.value);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4 shrink-0",
                    value === opt.value ? "opacity-100" : "opacity-0",
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
