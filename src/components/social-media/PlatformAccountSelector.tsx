"use client";

import { useEffect, useState, useCallback } from "react";
import { Linkedin, Instagram, Facebook, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { SocialMediaAccount, SocialPlatform } from "@/types/social-media";

const PLATFORM_ICONS: Record<SocialPlatform, React.ElementType> = {
  linkedin: Linkedin,
  instagram: Instagram,
  facebook: Facebook,
};

const PLATFORM_COLORS: Record<SocialPlatform, string> = {
  linkedin: "bg-blue-600 text-white",
  instagram: "bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 text-white",
  facebook: "bg-blue-500 text-white",
};

interface PlatformAccountSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function PlatformAccountSelector({ selectedIds, onChange }: PlatformAccountSelectorProps) {
  const [accounts, setAccounts] = useState<SocialMediaAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/social-media/accounts");
      const json = await res.json();
      if (json.data) {
        setAccounts(json.data.filter((a: SocialMediaAccount) => a.is_active));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Lade Konten...
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-1">
        Keine Konten verbunden. Gehe zu Einstellungen → Social Media.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {accounts.map((account) => {
        const Icon = PLATFORM_ICONS[account.platform];
        const checked = selectedIds.includes(account.id);

        return (
          <label
            key={account.id}
            className="flex items-center gap-2.5 cursor-pointer hover:bg-muted/30 rounded-md p-1.5 -mx-1.5 transition-colors"
          >
            <Checkbox checked={checked} onCheckedChange={() => toggle(account.id)} />
            <Avatar className="h-6 w-6">
              {account.platform_avatar_url ? (
                <AvatarImage src={account.platform_avatar_url} />
              ) : null}
              <AvatarFallback className={`${PLATFORM_COLORS[account.platform]} text-[10px]`}>
                <Icon className="h-3 w-3" />
              </AvatarFallback>
            </Avatar>
            <span className="text-sm truncate flex-1">{account.label}</span>
            <Badge variant="outline" className="text-[10px] shrink-0">
              {account.platform}
            </Badge>
          </label>
        );
      })}
    </div>
  );
}
