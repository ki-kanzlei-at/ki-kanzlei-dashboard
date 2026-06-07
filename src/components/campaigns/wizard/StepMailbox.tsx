"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, Plus, Check, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { MailboxOption, MailboxState } from "./types";

interface StepMailboxProps {
  state: MailboxState;
  onChange: (next: MailboxState) => void;
}

/* Brand SVGs — same look as the design source */
function GoogleLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.55 6.55 0 0 1 5.5 12c0-.73.13-1.43.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.83Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}
function MicrosoftLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="2"    y="2"    width="9.5" height="9.5" fill="#F35325" />
      <rect x="12.5" y="2"    width="9.5" height="9.5" fill="#81BC06" />
      <rect x="2"    y="12.5" width="9.5" height="9.5" fill="#05A6F0" />
      <rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#FFBA08" />
    </svg>
  );
}
function SmtpLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

const PROVIDER_LABEL: Record<string, string> = {
  google: "Google Workspace",
  microsoft_graph: "Microsoft 365",
  smtp: "SMTP",
};

function ProviderLogo({ provider }: { provider: string }) {
  if (provider === "google") return <GoogleLogo />;
  if (provider === "microsoft_graph") return <MicrosoftLogo />;
  return <SmtpLogo />;
}

function HealthDot({ status }: { status: string }) {
  const cls =
    status === "good"    ? "is-healthy" :
    status === "warning" ? "is-warming" :
    "is-paused";
  const label =
    status === "good"    ? "Aktiv" :
    status === "warning" ? "Warm-up läuft" :
    "Pausiert";
  return (
    <span className={cn("health-dot", cls)}>
      <span className="dot" />
      {label}
    </span>
  );
}

export function StepMailbox({ state, onChange }: StepMailboxProps) {
  const [accounts, setAccounts] = useState<MailboxOption[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/email-accounts");
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (!cancelled) setAccounts(json.data ?? []);
      } catch {
        if (!cancelled) setAccounts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function pick(mb: MailboxOption) {
    if (!mb.is_active) return;
    onChange({
      mailboxId: mb.id,
      email: mb.sender_email,
      provider: mb.provider,
      senderName: mb.label || mb.sender_email,
    });
  }

  return (
    <>
      <div className="step-head">
        <div className="step-eyebrow">
          <Mail className="h-3 w-3" strokeWidth={1.75} />
          Schritt 1 von 5
        </div>
        <h1 className="step-heading">Welche Mailbox versendet?</h1>
        <p className="step-desc">
          Wähle eines deiner verbundenen E-Mail-Konten als Absender.
          Tägliches Limit und Warm-up-Status werden pro Mailbox verwaltet.
        </p>
      </div>

      {loading ? (
        <div className="choice-stack">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-[10px]" />
          ))}
        </div>
      ) : accounts && accounts.length > 0 ? (
        <div className="choice-stack">
          {accounts.map((mb) => {
            const selected = state.mailboxId === mb.id;
            const remaining = Math.max(0, mb.daily_limit - mb.sent_today);
            const disabled = !mb.is_active;
            return (
              <button
                key={mb.id}
                type="button"
                disabled={disabled}
                onClick={() => pick(mb)}
                className={cn(
                  "choice-card",
                  selected && "is-selected",
                  disabled && "is-disabled",
                )}
              >
                <div className="choice-logo" style={{ background: "white", border: "1px solid var(--border)" }}>
                  <ProviderLogo provider={mb.provider} />
                </div>
                <div className="choice-info">
                  <h3 className="choice-name">{mb.sender_email}</h3>
                  <p className="choice-desc">
                    {PROVIDER_LABEL[mb.provider] ?? mb.provider}
                    {mb.label && ` · Absender: ${mb.label}`}
                  </p>
                  <div className="choice-meta">
                    <HealthDot status={mb.is_active ? mb.health_status : "paused"} />
                    <span className="chip">
                      {mb.sent_today}/{mb.daily_limit} heute · {remaining} verfügbar
                    </span>
                    {mb.warmup_enabled && (
                      <span className="chip">Tag {mb.warmup_day}/14</span>
                    )}
                  </div>
                </div>
                <div className="choice-check">
                  {selected && <Check className="h-3 w-3" strokeWidth={2.5} />}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="choice-card is-disabled" style={{ cursor: "default" }}>
          <div className="choice-logo">
            <Mail className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
          </div>
          <div className="choice-info">
            <h3 className="choice-name">Noch keine Mailbox verbunden</h3>
            <p className="choice-desc">
              Verbinde zuerst ein Google-, Microsoft- oder SMTP-Konto, bevor du eine Kampagne erstellen kannst.
            </p>
          </div>
        </div>
      )}

      <Link
        href="/dashboard/settings"
        className="choice-card"
        style={{ padding: "14px 18px", justifyContent: "flex-start", textDecoration: "none" }}
      >
        <div className="choice-logo" style={{ width: 36, height: 36, flex: "0 0 36px", background: "var(--muted)" }}>
          <Plus className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
        </div>
        <div className="choice-info">
          <h3 className="choice-name" style={{ fontSize: 13.5 }}>Neue Mailbox in Einstellungen verbinden</h3>
          <p className="choice-desc">Google Workspace, Microsoft 365 oder benutzerdefiniertes SMTP</p>
        </div>
      </Link>

      {state.mailboxId && (
        <div className="wiz-callout" style={{ marginTop: 18 }}>
          <Info className="ico h-4 w-4" strokeWidth={1.75} />
          <div>
            <div className="t">Mehrere Mailboxen rotieren?</div>
            <div className="b">
              Du kannst später mehrere Mailboxen für diese Kampagne hinzufügen — wir verteilen Mails automatisch und halten alle unter ihrem Tageslimit.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
