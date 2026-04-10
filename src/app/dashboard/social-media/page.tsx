"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Share2, FileText, Clock, CheckCircle2, AlertCircle, Sparkles,
} from "lucide-react";
import {
  Card, CardHeader, CardDescription, CardTitle, CardAction,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PostEditorLayout } from "@/components/social-media/PostEditorLayout";
import { PostsListView } from "@/components/social-media/PostsListView";
import { PostsCalendarView } from "@/components/social-media/PostsCalendarView";
import type { SocialMediaPostStats } from "@/types/social-media";

export default function SocialMediaPage() {
  const [stats, setStats] = useState<SocialMediaPostStats | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/social-media/stats");
      const json = await res.json();
      if (json.data) setStats(json.data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const statCards = [
    { label: "Gesamt", value: stats?.total ?? 0, icon: FileText, desc: "Posts erstellt" },
    { label: "Geplant", value: stats?.scheduled ?? 0, icon: Clock, desc: "Wartend" },
    { label: "Veröffentlicht", value: stats?.published ?? 0, icon: CheckCircle2, desc: "Live" },
    { label: "Entwürfe", value: stats?.draft ?? 0, icon: AlertCircle, desc: "In Arbeit" },
  ];

  return (
    <div className="px-4 lg:px-6 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Share2 className="h-6 w-6" />
          Social Media
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          KI-gestützter Post-Generator, Content-Plan und Kalender
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label} className="@container/card">
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {s.value}
              </CardTitle>
              <CardAction>
                <Badge variant="outline" className="text-muted-foreground">
                  <s.icon className="h-3 w-3 mr-1" />
                  {s.desc}
                </Badge>
              </CardAction>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="generator" className="space-y-4">
        <TabsList>
          <TabsTrigger value="generator" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Generator
          </TabsTrigger>
          <TabsTrigger value="content-plan" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Content-Plan
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Kalender
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generator">
          <PostEditorLayout />
        </TabsContent>

        <TabsContent value="content-plan">
          <PostsListView />
        </TabsContent>

        <TabsContent value="calendar">
          <PostsCalendarView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
