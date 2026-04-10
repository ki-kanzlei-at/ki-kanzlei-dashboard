import Link from "next/link";
import {
  Users, Send, TrendingUp, TrendingDown,
  ArrowUpRight, MailOpen, Reply,
  Linkedin, UserPlus, MessageSquare,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardHeader, CardTitle,
  CardDescription, CardAction,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { DashboardGreeting } from "@/components/DashboardGreeting";
import {
  LeadStatusChart,
  CampaignBarChart,
  LeadsOverTimeChart,
} from "@/components/DashboardCharts";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardOverview() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  /* ── Lead Stats ── */
  const { count: totalLeads } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true });

  const { count: newLeads } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("status", "new");

  const { count: contactedLeads } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("status", "contacted");

  const { count: interestedLeads } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("status", "interested");

  const { count: notInterestedLeads } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("status", "not_interested");

  const { count: convertedLeads } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("status", "converted");

  /* ── LinkedIn Stats ── */
  const { count: linkedinTotal } = await supabase
    .from("linkedin_leads")
    .select("*", { count: "exact", head: true });

  const { count: linkedinInvited } = await supabase
    .from("linkedin_leads")
    .select("*", { count: "exact", head: true })
    .in("status", ["invited", "accepted", "messaged", "replied"]);

  const { count: linkedinAccepted } = await supabase
    .from("linkedin_leads")
    .select("*", { count: "exact", head: true })
    .in("status", ["accepted", "messaged", "replied"]);

  const { count: linkedinReplied } = await supabase
    .from("linkedin_leads")
    .select("*", { count: "exact", head: true })
    .eq("status", "replied");

  /* ── Campaign Stats ── */
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name, status, total_count, sent_count, open_count, reply_count, bounce_count, failed_count")
    .order("created_at", { ascending: false })
    .limit(5);

  const allCampaigns = campaigns ?? [];

  const totalSent = allCampaigns.reduce((s, c) => s + (c.sent_count ?? 0), 0);
  const totalOpened = allCampaigns.reduce((s, c) => s + (c.open_count ?? 0), 0);
  const totalReplied = allCampaigns.reduce((s, c) => s + (c.reply_count ?? 0), 0);
  const activeCampaigns = allCampaigns.filter(c => c.status === "active").length;

  const openRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : "0";
  const replyRate = totalSent > 0 ? ((totalReplied / totalSent) * 100).toFixed(1) : "0";

  /* ── Leads over time (last 7 days) ── */
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const { data: recentLeads } = await supabase
    .from("leads")
    .select("created_at")
    .gte("created_at", sevenDaysAgo.toISOString())
    .order("created_at", { ascending: true });

  const leadsOverTime: { date: string; leads: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit" });
    const count = (recentLeads ?? []).filter(
      (l) => l.created_at?.slice(0, 10) === key
    ).length;
    leadsOverTime.push({ date: label, leads: count });
  }

  /* ── Display name ── */
  const displayName = (user?.user_metadata?.full_name as string | null)
    ?? (user?.user_metadata?.name as string | null)
    ?? user?.email?.split("@")[0]
    ?? "Willkommen";

  /* ── Lead Status data for donut ── */
  const leadStatusData = [
    { status: "new",              count: newLeads ?? 0 },
    { status: "contacted",        count: contactedLeads ?? 0 },
    { status: "interested",       count: interestedLeads ?? 0 },
    { status: "not_interested",   count: notInterestedLeads ?? 0 },
    { status: "converted",        count: convertedLeads ?? 0 },
  ].filter(d => d.count > 0);

  /* ── Campaign bar data ── */
  const campaignBarData = allCampaigns
    .filter(c => c.sent_count > 0)
    .slice(0, 5)
    .map(c => ({
      name: c.name,
      sent: c.sent_count ?? 0,
      opened: c.open_count ?? 0,
      replied: c.reply_count ?? 0,
      bounced: c.bounce_count ?? 0,
    }));

  /* ── KPI cards ── */
  const kpis = [
    {
      label: "Leads gesamt",
      value: (totalLeads ?? 0).toLocaleString("de-DE"),
      trend: `+${newLeads ?? 0} neu`,
      trendUp: true,
      Icon: Users,
    },
    {
      label: "E-Mails gesendet",
      value: totalSent.toLocaleString("de-DE"),
      trend: `${activeCampaigns} aktive Kampagnen`,
      trendUp: true,
      Icon: Send,
    },
    {
      label: "Open Rate",
      value: `${openRate}%`,
      trend: `${totalOpened} geöffnet`,
      trendUp: Number(openRate) > 20,
      Icon: MailOpen,
    },
    {
      label: "Reply Rate",
      value: `${replyRate}%`,
      trend: `${totalReplied} Antworten`,
      trendUp: Number(replyRate) > 5,
      Icon: Reply,
    },
  ];

  /* ── LinkedIn KPI cards ── */
  const liTotal = linkedinTotal ?? 0;
  const liInvited = linkedinInvited ?? 0;
  const liAccepted = linkedinAccepted ?? 0;
  const liReplied = linkedinReplied ?? 0;
  const liAcceptRate = liInvited > 0 ? ((liAccepted / liInvited) * 100).toFixed(1) : "0";
  const liReplyRate = liAccepted > 0 ? ((liReplied / liAccepted) * 100).toFixed(1) : "0";

  const linkedinKpis = [
    {
      label: "LinkedIn Leads",
      value: liTotal.toLocaleString("de-DE"),
      trend: `${liInvited} eingeladen`,
      trendUp: liTotal > 0,
      Icon: Linkedin,
    },
    {
      label: "Eingeladen",
      value: liInvited.toLocaleString("de-DE"),
      trend: liTotal > 0 ? `${((liInvited / liTotal) * 100).toFixed(0)}% gesendet` : "0%",
      trendUp: liInvited > 0,
      Icon: UserPlus,
    },
    {
      label: "Akzeptiert",
      value: liAccepted.toLocaleString("de-DE"),
      trend: `${liAcceptRate}% Accept Rate`,
      trendUp: Number(liAcceptRate) > 20,
      Icon: MessageSquare,
    },
    {
      label: "Antworten",
      value: liReplied.toLocaleString("de-DE"),
      trend: `${liReplyRate}% Reply Rate`,
      trendUp: Number(liReplyRate) > 5,
      Icon: Reply,
    },
  ];

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">

      {/* ── Greeting ── */}
      <div className="px-4 lg:px-6">
        <DashboardGreeting name={displayName} />
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 *:data-[slot=card]:shadow-xs">
        {kpis.map(({ label, value, trend, trendUp, Icon }) => (
          <Card key={label} className="@container/card">
            <CardHeader>
              <CardDescription className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </CardDescription>
              <CardTitle className="text-2xl font-bold tabular-nums @[250px]/card:text-3xl">
                {value}
              </CardTitle>
              <CardAction>
                <Badge
                  variant="outline"
                  className={cn(
                    "gap-1",
                    trendUp
                      ? "text-emerald-600 border-emerald-200 bg-emerald-50"
                      : "text-muted-foreground"
                  )}
                >
                  {trendUp ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {trend}
                </Badge>
              </CardAction>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* ── LinkedIn KPI Cards ── */}
      {liTotal > 0 && (
        <div className="px-4 lg:px-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="h-6 w-6 p-0 rounded-md bg-blue-50 border-blue-200 text-blue-600 justify-center">
                <Linkedin className="h-3.5 w-3.5" />
              </Badge>
              <h2 className="text-sm font-semibold">LinkedIn Outreach</h2>
            </div>
            <Button variant="ghost" size="sm" className="text-xs gap-1.5" asChild>
              <Link href="/dashboard/linkedin">
                Alle anzeigen
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 *:data-[slot=card]:shadow-xs *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-blue-500/5 *:data-[slot=card]:to-card">
            {linkedinKpis.map(({ label, value, trend, trendUp, Icon }) => (
              <Card key={label} className="@container/card">
                <CardHeader>
                  <CardDescription className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </CardDescription>
                  <CardTitle className="text-2xl font-bold tabular-nums @[250px]/card:text-3xl">
                    {value}
                  </CardTitle>
                  <CardAction>
                    <Badge
                      variant="outline"
                      className={cn(
                        "gap-1",
                        trendUp
                          ? "text-blue-600 border-blue-200 bg-blue-50"
                          : "text-muted-foreground"
                      )}
                    >
                      {trendUp ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {trend}
                    </Badge>
                  </CardAction>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @3xl/main:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Neue Leads</CardTitle>
            <CardDescription className="text-xs">
              {(recentLeads ?? []).length} Leads in den letzten 7 Tagen
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LeadsOverTimeChart data={leadsOverTime} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Lead-Status</CardTitle>
            <CardDescription className="text-xs">
              Verteilung aller {totalLeads ?? 0} Leads
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LeadStatusChart data={leadStatusData} />
          </CardContent>
        </Card>
      </div>

      {/* ── Campaign Performance ── */}
      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <div>
                <CardTitle className="text-sm font-semibold">Kampagnen-Performance</CardTitle>
                <CardDescription className="text-xs">
                  Letzte {campaignBarData.length} Kampagnen im Vergleich
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-xs gap-1.5" asChild>
                <Link href="/dashboard/campaigns">
                  Alle anzeigen
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <CampaignBarChart data={campaignBarData} />
          </CardContent>
        </Card>
      </div>

      {/* ── Recent Campaigns ── */}
      {allCampaigns.length > 0 && (
        <div className="px-4 lg:px-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between w-full">
                <div>
                  <CardTitle className="text-sm font-semibold">Letzte Kampagnen</CardTitle>
                  <CardDescription className="text-xs">
                    Neueste Kampagnen auf einen Blick
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" className="text-xs gap-1.5" asChild>
                  <Link href="/dashboard/campaigns">
                    Alle anzeigen
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="p-0">
              <div className="divide-y">
                {allCampaigns.slice(0, 5).map((c) => {
                  const cOpenRate = c.sent_count > 0 ? ((c.open_count / c.sent_count) * 100).toFixed(1) : "0";
                  const cReplyRate = c.sent_count > 0 ? ((c.reply_count / c.sent_count) * 100).toFixed(1) : "0";
                  const statusCfg: Record<string, { label: string; cls: string }> = {
                    draft:     { label: "Entwurf",  cls: "bg-zinc-50 text-zinc-600 border-zinc-200" },
                    active:    { label: "Aktiv",    cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                    paused:    { label: "Pausiert", cls: "bg-amber-50 text-amber-700 border-amber-200" },
                    completed: { label: "Fertig",   cls: "bg-blue-50 text-blue-700 border-blue-200" },
                  };
                  const st = statusCfg[c.status] ?? statusCfg.draft;

                  return (
                    <Link
                      key={c.id}
                      href={`/dashboard/campaigns/${c.id}`}
                      className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/40 transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge variant="outline" className={cn("text-[10px] font-medium px-2 py-0.5 shrink-0", st.cls)}>
                          {st.label}
                        </Badge>
                        <span className="text-sm font-medium truncate">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-5 shrink-0">
                        <div className="text-right">
                          <p className="text-xs font-medium tabular-nums">{c.sent_count}/{c.total_count}</p>
                          <p className="text-[10px] text-muted-foreground">Gesendet</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-medium tabular-nums text-amber-600">{cOpenRate}%</p>
                          <p className="text-[10px] text-muted-foreground">Open</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-medium tabular-nums text-emerald-600">{cReplyRate}%</p>
                          <p className="text-[10px] text-muted-foreground">Reply</p>
                        </div>
                        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
