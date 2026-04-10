"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Linkedin, Instagram, Facebook,
  Loader2, Trash2, RefreshCw,
  CheckCircle2, AlertCircle, XCircle, HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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

const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
};

const HEALTH_ICONS: Record<string, { icon: React.ElementType; className: string }> = {
  good: { icon: CheckCircle2, className: "text-emerald-500" },
  warning: { icon: AlertCircle, className: "text-amber-500" },
  bad: { icon: XCircle, className: "text-destructive" },
  unknown: { icon: HelpCircle, className: "text-muted-foreground" },
};

const CONNECT_BUTTONS = [
  {
    id: "instagram" as SocialPlatform,
    label: "Mit Instagram anmelden",
    icon: Instagram,
    className: "bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 hover:opacity-90 text-white border-0",
    authUrl: "/api/social-media/auth/meta",
  },
  {
    id: "linkedin" as SocialPlatform,
    label: "Mit LinkedIn anmelden",
    icon: Linkedin,
    className: "bg-[#0A66C2] hover:bg-[#004182] text-white border-0",
    authUrl: "/api/social-media/auth/linkedin",
  },
  {
    id: "facebook" as SocialPlatform,
    label: "Mit Facebook anmelden",
    icon: Facebook,
    className: "bg-[#1877F2] hover:bg-[#0C5DC7] text-white border-0",
    authUrl: "/api/social-media/auth/meta",
  },
];

export default function SocialMediaAccountsManager() {
  const [accounts, setAccounts] = useState<SocialMediaAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/social-media/accounts");
      const json = await res.json();
      if (json.data) setAccounts(json.data);
    } catch {
      toast.error("Fehler beim Laden der Konten");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Handle OAuth redirect success/error from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error = params.get("error");

    if (success) {
      toast.success(`${success === "linkedin" ? "LinkedIn" : "Meta"}-Konto erfolgreich verbunden!`);
      fetchAccounts();
      const url = new URL(window.location.href);
      url.searchParams.delete("success");
      window.history.replaceState({}, "", url.toString());
    }
    if (error) {
      const messages: Record<string, string> = {
        oauth_denied: "OAuth-Zugriff wurde verweigert",
        token_exchange: "Token-Austausch fehlgeschlagen",
        profile_fetch: "Profil konnte nicht geladen werden",
        pages_fetch: "Facebook-Seiten konnten nicht geladen werden",
        invalid_state: "Ungültige OAuth-Session",
        unknown: "Unbekannter Fehler bei der Verbindung",
      };
      toast.error(messages[error] || "Verbindungsfehler");
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    }
  }, [fetchAccounts]);

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await fetch(`/api/social-media/accounts/${id}/test`, { method: "POST" });
      const result = await res.json();
      if (result.ok) {
        toast.success("Verbindung erfolgreich!");
      } else {
        toast.error(result.error || "Verbindungstest fehlgeschlagen");
      }
      fetchAccounts();
    } catch {
      toast.error("Fehler beim Testen");
    } finally {
      setTestingId(null);
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      await fetch(`/api/social-media/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !isActive }),
      });
      setAccounts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, is_active: !isActive } : a)),
      );
    } catch {
      toast.error("Fehler beim Aktualisieren");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Konto wirklich entfernen?")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/social-media/accounts/${id}`, { method: "DELETE" });
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      toast.success("Konto entfernt");
    } catch {
      toast.error("Fehler beim Löschen");
    } finally {
      setDeletingId(null);
    }
  };

  // Check which platforms are already connected
  const connectedPlatforms = new Set(accounts.map((a) => a.platform));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Social-Media-Konten</CardTitle>
        <CardDescription>
          Verbinde deine Social-Media-Profile mit einem Klick für direktes Publishing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ── Connect Buttons — immer sichtbar ── */}
        <div className="grid gap-3 sm:grid-cols-3">
          {CONNECT_BUTTONS.map((btn) => {
            const Icon = btn.icon;
            const isConnected = connectedPlatforms.has(btn.id);
            return (
              <Button
                key={btn.id}
                className={`h-auto py-3 px-4 gap-2.5 justify-start text-sm font-medium ${btn.className}`}
                onClick={() => { window.location.href = btn.authUrl; }}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="truncate">
                  {isConnected ? `${PLATFORM_LABELS[btn.id]} erneut verbinden` : btn.label}
                </span>
              </Button>
            );
          })}
        </div>

        {/* ── Connected accounts ── */}
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : accounts.length > 0 ? (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium mb-3">
                Verbundene Konten ({accounts.length})
              </h4>
              <div className="space-y-2">
                {accounts.map((account) => {
                  const PlatformIcon = PLATFORM_ICONS[account.platform];
                  const health = HEALTH_ICONS[account.health_status] || HEALTH_ICONS.unknown;
                  const HealthIcon = health.icon;

                  return (
                    <div
                      key={account.id}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                    >
                      <Avatar className="h-9 w-9">
                        {account.platform_avatar_url ? (
                          <AvatarImage src={account.platform_avatar_url} alt={account.label} />
                        ) : null}
                        <AvatarFallback className={PLATFORM_COLORS[account.platform]}>
                          <PlatformIcon className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{account.label}</span>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {PLATFORM_LABELS[account.platform]}
                          </Badge>
                          <HealthIcon className={`h-3.5 w-3.5 shrink-0 ${health.className}`} />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {account.platform_username && <span>@{account.platform_username}</span>}
                          {account.page_name && account.platform !== "facebook" && (
                            <span>Seite: {account.page_name}</span>
                          )}
                          <span>{account.total_posts_published} Posts</span>
                        </div>
                        {account.last_error && (
                          <p className="text-[10px] text-destructive mt-0.5 truncate">
                            {account.last_error}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Switch
                          checked={account.is_active}
                          onCheckedChange={() => handleToggleActive(account.id, account.is_active)}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          disabled={testingId === account.id}
                          onClick={() => handleTest(account.id)}
                          title="Verbindung testen"
                        >
                          {testingId === account.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          disabled={deletingId === account.id}
                          onClick={() => handleDelete(account.id)}
                          title="Konto entfernen"
                        >
                          {deletingId === account.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
