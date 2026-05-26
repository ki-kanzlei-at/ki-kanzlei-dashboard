import Link from "next/link";
import {
  Plus, RefreshCw, ArrowRight, Sparkles, Search, Send, Linkedin,
  FileText, Mail, Reply, Check, UserPlus, Flame, MoreHorizontal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

import { DashGreeting } from "@/components/dashboard/DashGreeting";
import { DashPerformanceChart } from "@/components/dashboard/DashPerformanceChart";
import { DashTasks, type DashTask } from "@/components/dashboard/DashTasks";
import { cn } from "@/lib/utils";

/* ── Avatar color helper ── */
function avatarColor(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `oklch(0.62 0.13 ${h})`;
}

/* ── Relative time formatter ── */
function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `vor ${hr} Std.`;
  const d = Math.round(hr / 24);
  if (d === 1) return "gestern";
  if (d < 14) return `vor ${d} Tagen`;
  const w = Math.round(d / 7);
  if (w < 8) return `vor ${w} Wochen`;
  return new Date(iso).toLocaleDateString("de-AT", { day: "2-digit", month: "short" });
}

export default async function DashboardOverview() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  /* ── Lead Aggregations ─────────────────────────────────────────────── */
  const [
    { count: totalLeads },
    { count: convertedLeads },
    { count: interestedLeads },
    { data: recentLeads },
  ] = await Promise.all([
    supabase.from("leads").select("*", { count: "exact", head: true }),
    supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "converted"),
    supabase.from("leads").select("*", { count: "exact", head: true }).eq("status", "interested"),
    supabase
      .from("leads")
      .select("id, company, industry, city, status, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  /* ── Campaign Aggregations ─────────────────────────────────────────── */
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name, status, total_count, sent_count, open_count, reply_count, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  const allCampaigns = campaigns ?? [];
  const totalSent    = allCampaigns.reduce((s, c) => s + (c.sent_count ?? 0), 0);
  const totalOpened  = allCampaigns.reduce((s, c) => s + (c.open_count ?? 0), 0);
  const totalReplied = allCampaigns.reduce((s, c) => s + (c.reply_count ?? 0), 0);
  const activeCampaigns = allCampaigns.filter((c) => c.status === "active").length;
  const replyRate = totalSent > 0 ? ((totalReplied / totalSent) * 100) : 0;

  // Top campaigns by reply rate (mit min. 1 versendet)
  const topCampaigns = allCampaigns
    .filter((c) => (c.sent_count ?? 0) > 0)
    .map((c) => {
      const rate = ((c.reply_count ?? 0) / (c.sent_count || 1)) * 100;
      return { ...c, rate };
    })
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 4);

  /* ── LinkedIn Aggregations ─────────────────────────────────────────── */
  const [
    { data: hotLinkedIn },
    { count: linkedinReplied },
  ] = await Promise.all([
    supabase
      .from("linkedin_leads")
      .select("id, full_name, headline, company, location, ai_score")
      .gte("ai_score", 80)
      .order("ai_score", { ascending: false })
      .limit(5),
    supabase
      .from("linkedin_leads")
      .select("*", { count: "exact", head: true })
      .eq("status", "replied"),
  ]);

  /* ── Mailbox Health ─────────────────────────────────────────────────── */
  const { data: mailboxes } = await supabase
    .from("email_accounts")
    .select("id, sender_email, provider, daily_limit, sent_today, health_status, is_active")
    .eq("is_active", true)
    .limit(3);

  /* ── Recent activity (campaign replies + linkedin replies + new leads) ── */
  const [
    { data: replyEvents },
    { data: openEvents },
    { data: linkedinEvents },
    { data: convertedRecent },
  ] = await Promise.all([
    supabase
      .from("campaign_leads")
      .select("id, replied_at, campaign_id, reply_preview, campaigns(name), leads(company)")
      .not("replied_at", "is", null)
      .order("replied_at", { ascending: false })
      .limit(4),
    supabase
      .from("campaign_leads")
      .select("id, first_opened_at, campaign_id, campaigns(name), leads(company)")
      .not("first_opened_at", "is", null)
      .order("first_opened_at", { ascending: false })
      .limit(3),
    supabase
      .from("linkedin_leads")
      .select("id, full_name, status, connection_accepted_at, last_message_at")
      .or("connection_accepted_at.not.is.null,last_message_at.not.is.null")
      .order("updated_at", { ascending: false })
      .limit(3),
    supabase
      .from("leads")
      .select("id, company, updated_at")
      .eq("status", "converted")
      .order("updated_at", { ascending: false })
      .limit(2),
  ]);

  type FeedItem = {
    kind: "reply" | "conv" | "li" | "open" | "new";
    who: string;
    text: string;
    what: string;
    href: string;
    ts: string;
  };

  const feed: FeedItem[] = [];
  for (const e of replyEvents ?? []) {
    const company = (e.leads as { company?: string } | null)?.company ?? "Lead";
    const camp    = (e.campaigns as { name?: string } | null)?.name ?? "Kampagne";
    feed.push({
      kind: "reply",
      who: company,
      text: "hat geantwortet auf",
      what: camp,
      href: e.campaign_id ? `/dashboard/campaigns/${e.campaign_id}` : "/dashboard/campaigns",
      ts: e.replied_at as string,
    });
  }
  for (const e of openEvents ?? []) {
    const company = (e.leads as { company?: string } | null)?.company ?? "Lead";
    const camp    = (e.campaigns as { name?: string } | null)?.name ?? "Kampagne";
    feed.push({
      kind: "open",
      who: company,
      text: "hat eine Mail geöffnet aus",
      what: camp,
      href: e.campaign_id ? `/dashboard/campaigns/${e.campaign_id}` : "/dashboard/campaigns",
      ts: e.first_opened_at as string,
    });
  }
  for (const e of linkedinEvents ?? []) {
    const accepted = !!e.connection_accepted_at;
    feed.push({
      kind: "li",
      who: e.full_name,
      text: accepted ? "hat Vernetzungsanfrage akzeptiert auf" : "neue Nachricht auf",
      what: "LinkedIn",
      href: `/dashboard/linkedin`,
      ts: (accepted ? e.connection_accepted_at : e.last_message_at) as string,
    });
  }
  for (const e of convertedRecent ?? []) {
    feed.push({
      kind: "conv",
      who: e.company,
      text: "wurde konvertiert",
      what: "Mandat gewonnen",
      href: "/dashboard/leads?status=converted",
      ts: e.updated_at as string,
    });
  }
  feed.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  const feedTop = feed.slice(0, 7);

  /* ── Performance Chart Data (last 30 days) ─────────────────────────── */
  const since = new Date();
  since.setDate(since.getDate() - 29);
  const { data: chartCampaignLeads } = await supabase
    .from("campaign_leads")
    .select("sent_at, first_opened_at, replied_at")
    .gte("sent_at", since.toISOString());

  // Build per-day buckets
  const days: { date: string; sent: number; opened: number; replied: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - 29 + i);
    days.push({ date: d.toISOString().slice(0, 10), sent: 0, opened: 0, replied: 0 });
  }
  const bucketMap = new Map(days.map((d) => [d.date, d]));
  for (const ev of chartCampaignLeads ?? []) {
    if (ev.sent_at) {
      const k = ev.sent_at.slice(0, 10);
      const b = bucketMap.get(k); if (b) b.sent += 1;
    }
    if (ev.first_opened_at) {
      const k = ev.first_opened_at.slice(0, 10);
      const b = bucketMap.get(k); if (b) b.opened += 1;
    }
    if (ev.replied_at) {
      const k = ev.replied_at.slice(0, 10);
      const b = bucketMap.get(k); if (b) b.replied += 1;
    }
  }

  /* ── Funnel Data ───────────────────────────────────────────────────── */
  const totalLeadsInFunnel = totalLeads ?? 0;
  const funnel = [
    { label: "Versendet",   val: totalSent,    pct: 100,                                                        success: false },
    { label: "Geöffnet",    val: totalOpened,  pct: totalSent > 0 ? (totalOpened  / totalSent) * 100 : 0,        success: false },
    { label: "Geantwortet", val: totalReplied, pct: totalSent > 0 ? (totalReplied / totalSent) * 100 : 0,        success: false },
    { label: "Interessiert",val: interestedLeads ?? 0, pct: totalLeadsInFunnel > 0 ? ((interestedLeads ?? 0) / totalLeadsInFunnel) * 100 : 0, success: false },
    { label: "Konvertiert", val: convertedLeads  ?? 0, pct: totalLeadsInFunnel > 0 ? ((convertedLeads  ?? 0) / totalLeadsInFunnel) * 100 : 0, success: true  },
  ];

  /* ── Setup progress (Onboarding-Nudge) ─────────────────────────────── */
  const { data: settings } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();

  const setupSteps = [
    { ok: !!user, label: "Account" },
    { ok: (mailboxes?.length ?? 0) > 0, label: "Mailbox" },
    { ok: !!(settings?.unipile_account_id), label: "LinkedIn" },
    { ok: (totalLeads ?? 0) > 0, label: "Leads" },
    { ok: activeCampaigns > 0, label: "Kampagne" },
  ];
  const setupDone = setupSteps.filter((s) => s.ok).length;
  const setupShowNudge = setupDone < setupSteps.length;

  /* ── Tasks (statisch — Backend kommt später) ────────────────────────── */
  const tasks: DashTask[] = [];
  if ((replyEvents?.length ?? 0) > 0) {
    const first = replyEvents![0];
    const co = (first.leads as { company?: string } | null)?.company ?? "Lead";
    tasks.push({ id: "t1", text: `Antwort von ${co} beantworten`, due: "Heute", urgent: true });
  }
  if (activeCampaigns === 0 && (totalLeads ?? 0) > 0) {
    tasks.push({ id: "t2", text: "Erste Kampagne starten", due: "Heute", urgent: true });
  }
  if ((mailboxes?.length ?? 0) === 0) {
    tasks.push({ id: "t3", text: "Mailbox in Einstellungen verbinden", due: "Heute", urgent: true });
  }
  if (interestedLeads && interestedLeads > 0) {
    tasks.push({ id: "t4", text: `${interestedLeads} interessierte Leads in Pipeline verschieben`, due: "Diese Woche", urgent: false });
  }
  tasks.push({ id: "t5", text: "Wöchentliches Reporting anschauen", due: "Freitag", urgent: false });

  /* ── Display Name ──────────────────────────────────────────────────── */
  const displayName = (user?.user_metadata?.full_name as string | null)
    ?? (user?.user_metadata?.name as string | null)
    ?? user?.email?.split("@")[0]
    ?? "Willkommen";
  const firstName = displayName.split(" ")[0];

  /* ── KPI cards ─────────────────────────────────────────────────────── */
  const kpis = [
    {
      label: "Aktive Leads",
      value: (totalLeads ?? 0).toLocaleString("de-DE"),
      deltaDir: "up" as const,
      delta: `+${(recentLeads ?? []).length} neu`,
      sub: "diese Woche",
    },
    {
      label: "Ø Antwortrate",
      value: `${replyRate.toFixed(1)} %`,
      deltaDir: replyRate >= 15 ? "up" as const : replyRate >= 8 ? "flat" as const : "down" as const,
      delta: totalSent > 0 ? `${totalReplied} Antworten` : "—",
      sub: "alle Kampagnen",
    },
    {
      label: "Mandate gewonnen",
      value: (convertedLeads ?? 0).toLocaleString("de-DE"),
      deltaDir: "up" as const,
      delta: `+${convertedRecent?.length ?? 0}`,
      sub: "letzte 7 Tage",
    },
    {
      label: "Aktive Kampagnen",
      value: activeCampaigns.toLocaleString("de-DE"),
      deltaDir: activeCampaigns > 0 ? "up" as const : "flat" as const,
      delta: `${allCampaigns.length} gesamt`,
      sub: "im Workspace",
    },
  ];

  /* ── Status pill helper for top campaigns ──────────────────────────── */

  const newReplies = replyEvents?.filter((e) => {
    if (!e.replied_at) return false;
    return Date.now() - new Date(e.replied_at).getTime() < 24 * 60 * 60 * 1000;
  }).length ?? 0;
  const urgentTaskCount = tasks.filter((t) => t.urgent).length;

  return (
    <div className="leads-v3 flex flex-col gap-5 py-4 md:gap-6 md:py-6">

      {/* ── Greeting ────────────────────────────────────────────────── */}
      <div className="px-4 lg:px-6">
        <div className="dash-greeting">
          <DashGreeting
            firstName={firstName}
            newReplies={newReplies}
            urgentTasks={urgentTaskCount}
          />
          <div className="dash-greeting-actions">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium" asChild>
              <Link href="/dashboard">
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                Aktualisieren
              </Link>
            </Button>
            <Button size="sm" className="h-8 gap-1.5 text-xs font-medium" asChild>
              <Link href="/dashboard/campaigns">
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Neue Kampagne
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* ── Onboarding Nudge ────────────────────────────────────────── */}
      {setupShowNudge && (
        <div className="px-4 lg:px-6">
          <div className="onb-nudge">
            <div className="nudge-icon">
              <Sparkles className="h-4 w-4" strokeWidth={1.75} />
            </div>
            <div className="onb-nudge-info">
              <div className="onb-nudge-title">
                Setup zu {Math.round((setupDone / setupSteps.length) * 100)} % abgeschlossen
              </div>
              <div className="onb-nudge-desc">
                Fehlt noch: {setupSteps.filter((s) => !s.ok).map((s) => s.label).join(", ")}.
              </div>
            </div>
            <div className="onb-nudge-progress">
              <div className="bar">
                <div className="bar-fill" style={{ width: `${(setupDone / setupSteps.length) * 100}%` }} />
              </div>
              <span>{setupDone} / {setupSteps.length}</span>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium" asChild>
                <Link href="/dashboard/settings">
                  Fortsetzen
                  <ArrowRight className="h-3 w-3" strokeWidth={1.75} />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── KPI Strip ───────────────────────────────────────────────── */}
      <div className="px-4 lg:px-6">
        <div className="kpis">
          {kpis.map((k) => (
            <div key={k.label} className="kpi-card">
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value">{k.value}</div>
              <div className="kpi-row">
                <span className={`kpi-delta kpi-delta-${k.deltaDir}`}>
                  {k.deltaDir === "up" ? "↑" : k.deltaDir === "down" ? "↓" : "—"} {k.delta}
                </span>
                <span className="kpi-sub">{k.sub}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Quick Actions ───────────────────────────────────────────── */}
      <div className="px-4 lg:px-6">
        <div className="quick-actions">
          <Link href="/dashboard/leads" className="quick-action">
            <div className="qa-icon"><Search className="h-4 w-4" strokeWidth={1.75} /></div>
            <div className="min-w-0 flex-1">
              <div className="qa-t">Neue Lead-Suche</div>
              <div className="qa-s">Branche & Region</div>
            </div>
            <ArrowRight className="qa-arrow h-3.5 w-3.5" strokeWidth={1.75} />
          </Link>
          <Link href="/dashboard/campaigns" className="quick-action">
            <div className="qa-icon"><Send className="h-4 w-4" strokeWidth={1.75} /></div>
            <div className="min-w-0 flex-1">
              <div className="qa-t">Neue Kampagne</div>
              <div className="qa-s">E-Mail-Sequenz starten</div>
            </div>
            <ArrowRight className="qa-arrow h-3.5 w-3.5" strokeWidth={1.75} />
          </Link>
          <Link href="/dashboard/linkedin" className="quick-action">
            <div className="qa-icon"><Linkedin className="h-4 w-4" strokeWidth={1.75} /></div>
            <div className="min-w-0 flex-1">
              <div className="qa-t">LinkedIn-Sequenz</div>
              <div className="qa-s">Connections erweitern</div>
            </div>
            <ArrowRight className="qa-arrow h-3.5 w-3.5" strokeWidth={1.75} />
          </Link>
          <Link href="/dashboard/leads?tab=import" className="quick-action">
            <div className="qa-icon"><FileText className="h-4 w-4" strokeWidth={1.75} /></div>
            <div className="min-w-0 flex-1">
              <div className="qa-t">CSV importieren</div>
              <div className="qa-s">Bestehende Liste laden</div>
            </div>
            <ArrowRight className="qa-arrow h-3.5 w-3.5" strokeWidth={1.75} />
          </Link>
        </div>
      </div>

      {/* ── Grid 2-1: Performance + Funnel ──────────────────────────── */}
      <div className="px-4 lg:px-6">
        <div className="dash-grid dash-grid-2-1">

          {/* Performance Chart */}
          <div className="section-card">
            <div className="section-card-head">
              <div>
                <h3>Kampagnen-Performance</h3>
                <p>Versendet, geöffnet und geantwortet über alle aktiven Kampagnen.</p>
              </div>
            </div>
            <div className="section-card-body">
              <DashPerformanceChart data={days} />
            </div>
          </div>

          {/* Funnel */}
          <div className="section-card">
            <div className="section-card-head">
              <div>
                <h3>Konvertierungs-Funnel</h3>
                <p>Letzte 30 Tage · alle Kampagnen.</p>
              </div>
            </div>
            <div className="section-card-body">
              <div className="funnel-list">
                {funnel.map((s) => {
                  const cappedPct = Math.min(100, Math.max(0, s.pct));
                  return (
                    <div key={s.label} className="funnel-stage">
                      <span className="label">{s.label}</span>
                      <div className="bar">
                        <div
                          className={cn("bar-fill", s.success && "is-success")}
                          style={{ width: `${cappedPct}%` }}
                        >
                          {cappedPct >= 12 && `${cappedPct.toFixed(0)}%`}
                        </div>
                      </div>
                      <span className="val">
                        {s.val.toLocaleString("de-DE")}
                        <span className="pct">{s.pct.toFixed(1)}% von Versand</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Grid 1-1: Activity Feed + Top Campaigns ─────────────────── */}
      <div className="px-4 lg:px-6">
        <div className="dash-grid dash-grid-1-1">

          {/* Activity Stream */}
          <div className="section-card">
            <div className="section-card-head">
              <div>
                <h3>Aktivitäts-Stream</h3>
                <p>Was gerade in deinem Workspace passiert.</p>
              </div>
              <Link href="/dashboard/leads" className="text-[12.5px] text-primary font-medium hover:underline">
                Alle ansehen →
              </Link>
            </div>
            <div className="section-card-body">
              {feedTop.length === 0 ? (
                <div className="py-8 text-center text-[12.5px] text-muted-foreground">
                  Noch keine Aktivität. Starte deine erste Kampagne.
                </div>
              ) : (
                <div className="feed">
                  {feedTop.map((it, i) => {
                    const Icon = it.kind === "reply" ? Reply
                      : it.kind === "conv" ? Check
                      : it.kind === "li"   ? Linkedin
                      : it.kind === "open" ? Mail
                      : UserPlus;
                    return (
                      <div key={i} className="feed-row">
                        <div className={`feed-icon feed-icon-${it.kind}`}>
                          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </div>
                        <div className="feed-info">
                          <div className="feed-text">
                            <b>{it.who}</b> {it.text}{" "}
                            <Link href={it.href} className="text-primary font-medium hover:underline">
                              {it.what}
                            </Link>
                          </div>
                        </div>
                        <span className="feed-time">{relTime(it.ts)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Top Campaigns */}
          <div className="section-card">
            <div className="section-card-head">
              <div>
                <h3>Top-Kampagnen</h3>
                <p>Sortiert nach Antwortrate.</p>
              </div>
              <Link href="/dashboard/campaigns" className="text-[12.5px] text-primary font-medium hover:underline">
                Alle Kampagnen →
              </Link>
            </div>
            <div className="section-card-body">
              {topCampaigns.length === 0 ? (
                <div className="py-8 text-center text-[12.5px] text-muted-foreground">
                  Noch keine versendeten Kampagnen.
                </div>
              ) : (
                <div>
                  {topCampaigns.map((c) => {
                    const maxRate = Math.max(...topCampaigns.map((x) => x.rate), 1);
                    return (
                      <Link key={c.id} href={`/dashboard/campaigns/${c.id}`} className="perf-row">
                        <div>
                          <div className="perf-name">{c.name}</div>
                          <div className="perf-meta">
                            <span>{(c.sent_count ?? 0).toLocaleString("de-DE")}/{(c.total_count ?? 0).toLocaleString("de-DE")} versendet</span>
                            <span className="sep" />
                            <span>Antwortrate</span>
                          </div>
                        </div>
                        <div className="perf-bar">
                          <div className="perf-bar-fill" style={{ width: `${(c.rate / maxRate) * 100}%` }} />
                        </div>
                        <div className="perf-rate">{c.rate.toFixed(1)}%</div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Grid 3: Tasks + Hot Leads + Mailbox Health ──────────────── */}
      <div className="px-4 lg:px-6">
        <div className="dash-grid dash-grid-3">

          {/* Tasks */}
          <div className="section-card">
            <div className="section-card-head">
              <div>
                <h3>Deine Aufgaben</h3>
                <p>{tasks.length} offen · {urgentTaskCount} dringend</p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="section-card-body">
              <DashTasks items={tasks} />
            </div>
          </div>

          {/* Hot Leads */}
          <div className="section-card">
            <div className="section-card-head">
              <div>
                <h3>
                  Heiße Leads{" "}
                  <Flame className="inline h-3.5 w-3.5 ml-1 text-orange-500" strokeWidth={1.75} />
                </h3>
                <p>LinkedIn-Score ≥ 80 — direkt kontaktieren.</p>
              </div>
            </div>
            <div className="section-card-body">
              {(hotLinkedIn ?? []).length === 0 ? (
                <div className="py-8 text-center text-[12.5px] text-muted-foreground">
                  Noch keine heißen Leads. Starte eine KI-Analyse.
                </div>
              ) : (
                <div>
                  {(hotLinkedIn ?? []).map((l) => {
                    const meta = [l.headline, l.location].filter(Boolean).join(" · ") || l.company || "—";
                    return (
                      <Link key={l.id} href="/dashboard/linkedin" className="hot-row">
                        <div className="hot-favicon" style={{ background: avatarColor(l.full_name) }}>
                          {l.full_name[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="hot-name truncate">{l.full_name}</div>
                          <div className="hot-meta truncate">{meta}</div>
                        </div>
                        <div className="hot-score">
                          {l.ai_score}
                          <span className="lbl">Score</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Mailbox Health */}
          <div className="section-card">
            <div className="section-card-head">
              <div>
                <h3>Mailbox-Zustand</h3>
                <p>Tägliche Limits · Versand heute.</p>
              </div>
            </div>
            <div className="section-card-body">
              {(mailboxes ?? []).length === 0 ? (
                <div className="py-6 text-center">
                  <Mail className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-[12.5px] text-muted-foreground mb-3">Noch keine Mailbox verbunden.</p>
                  <Button variant="outline" size="sm" className="text-xs" asChild>
                    <Link href="/dashboard/settings">Mailbox verbinden</Link>
                  </Button>
                </div>
              ) : (
                <>
                  {(mailboxes ?? []).map((m) => {
                    const limit = m.daily_limit ?? 50;
                    const sent  = m.sent_today ?? 0;
                    const pct   = Math.min(100, (sent / Math.max(1, limit)) * 100);
                    const fillClass = pct >= 90 ? "is-danger" : pct >= 75 ? "is-warning" : "";
                    return (
                      <div key={m.id} className="mailbox-mini">
                        <div className="logo">
                          <Mail className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </div>
                        <div className="info">
                          <div className="name">{m.sender_email}</div>
                          <div className="meta">{sent}/{limit} heute</div>
                        </div>
                        <div className="bar">
                          <div className={cn("bar-fill", fillClass)} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <Link
                    href="/dashboard/settings"
                    className="mt-3 inline-block text-[12.5px] text-primary font-medium hover:underline"
                  >
                    Alle Mailboxen verwalten →
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
