"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface HashtagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

export function HashtagInput({ value, onChange, placeholder = "Hashtag eingeben..." }: HashtagInputProps) {
  const [input, setInput] = useState("");

  const addTag = (raw: string) => {
    const tag = raw.replace(/^#+/, "").replace(/\s+/g, "").toLowerCase();
    if (tag && !value.includes(tag)) {
      onChange([...value, tag]);
    }
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      addTag(input.trim());
    }
    if (e.key === "Backspace" && !input && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="gap-1 text-xs pr-1"
            >
              #{tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="h-8 text-sm"
      />
    </div>
  );
}
