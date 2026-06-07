"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Coins, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BalanceResponse {
  balance: number;
  subscription: {
    plan: string;
    status: string;
    monthly_credits: number;
  } | null;
}

export function CreditsBadge() {
  const [data, setData] = useState<BalanceResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/credits/balance", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 30_000); // alle 30s refresh
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (loading) {
    return (
      <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[12.5px] text-muted-foreground" disabled>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </Button>
    );
  }

  const balance = data?.balance ?? 0;
  const monthlyCap = data?.subscription?.monthly_credits ?? 0;
  const lowCredits = monthlyCap > 0 && balance < monthlyCap * 0.1;

  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className={cn(
        "h-8 gap-1.5 text-[12.5px] font-medium",
        lowCredits && "text-amber-700 hover:text-amber-800 dark:text-amber-400",
      )}
    >
      <Link href="/dashboard/settings?tab=billing" title="Credits-Stand · klicken für Details">
        <Coins className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span className="tabular-nums">{balance.toLocaleString("de-DE")}</span>
        {monthlyCap > 0 && (
          <span className="text-muted-foreground hidden sm:inline">
            / {monthlyCap.toLocaleString("de-DE")}
          </span>
        )}
      </Link>
    </Button>
  );
}
