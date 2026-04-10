"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Calendar, dateFnsLocalizer, type Event } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { de } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "./shadcn-big-calendar.css";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SocialMediaPost } from "@/types/social-media";
import { SOCIAL_STATUS_CONFIG } from "@/types/social-media";
import { PostDetailSheet } from "./PostDetailSheet";

const locales = { de };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

interface CalendarEvent extends Event {
  post: SocialMediaPost;
  statusColor: string;
}

export function PostsCalendarView() {
  const [posts, setPosts] = useState<SocialMediaPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<SocialMediaPost | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/social-media/posts?pageSize=200");
      const json = await res.json();
      if (json.data) setPosts(json.data.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const events: CalendarEvent[] = useMemo(() => {
    return posts.map((post) => {
      const dateStr = post.scheduled_at ?? post.created_at;
      const date = new Date(dateStr);
      const sc = SOCIAL_STATUS_CONFIG[post.status as keyof typeof SOCIAL_STATUS_CONFIG];
      return {
        title: post.title,
        start: date,
        end: date,
        allDay: true,
        post,
        statusColor: sc?.dot ?? "bg-muted-foreground",
      };
    });
  }, [posts]);

  const handleSelectEvent = (event: CalendarEvent) => {
    setSelectedPost(event.post);
    setSheetOpen(true);
  };

  // Drafts without scheduled date
  const unscheduledDrafts = posts.filter(
    (p) => p.status === "draft" && !p.scheduled_at,
  );

  const eventStyleGetter = (event: CalendarEvent) => {
    const sc = SOCIAL_STATUS_CONFIG[event.post.status as keyof typeof SOCIAL_STATUS_CONFIG];
    let bgColor = "var(--primary)";
    if (event.post.status === "draft") bgColor = "oklch(0.769 0.188 70.08)"; // amber
    if (event.post.status === "scheduled") bgColor = "oklch(0.623 0.214 259.815)"; // blue
    if (event.post.status === "published") bgColor = "oklch(0.696 0.17 162.48)"; // emerald
    if (event.post.status === "failed") bgColor = "oklch(0.577 0.245 27.325)"; // red

    return {
      style: {
        backgroundColor: bgColor,
        borderRadius: "4px",
        opacity: 0.9,
        color: "white",
        border: "none",
        fontSize: "11px",
        padding: "1px 4px",
      },
    };
  };

  const messages = {
    today: "Heute",
    previous: "Zurück",
    next: "Weiter",
    month: "Monat",
    week: "Woche",
    day: "Tag",
    agenda: "Agenda",
    noEventsInRange: "Keine Posts in diesem Zeitraum",
  };

  return (
    <>
      <div className="space-y-4">
        <Card className="p-4">
          {loading ? (
            <div className="text-center py-8 text-sm text-muted-foreground">Lade Kalender...</div>
          ) : (
            <div style={{ height: 600 }}>
              <Calendar<CalendarEvent>
                localizer={localizer}
                events={events}
                startAccessor="start"
                endAccessor="end"
                views={["month", "week", "agenda"]}
                defaultView="month"
                culture="de"
                messages={messages}
                onSelectEvent={handleSelectEvent}
                eventPropGetter={eventStyleGetter}
                popup
              />
            </div>
          )}
        </Card>

        {/* Unscheduled drafts */}
        {unscheduledDrafts.length > 0 && (
          <Card className="p-4">
            <h3 className="text-sm font-medium mb-3">
              Ungeplante Entwürfe ({unscheduledDrafts.length})
            </h3>
            <div className="space-y-2">
              {unscheduledDrafts.map((post) => {
                const sc = SOCIAL_STATUS_CONFIG.draft;
                return (
                  <button
                    key={post.id}
                    onClick={() => {
                      setSelectedPost(post);
                      setSheetOpen(true);
                    }}
                    className="flex items-center gap-2 w-full text-left p-2 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <span className={`h-2 w-2 rounded-full ${sc.dot} shrink-0`} />
                    <span className="text-sm truncate flex-1">{post.title}</span>
                    <Badge variant="outline" className={`text-[10px] ${sc.className}`}>
                      {sc.label}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      <PostDetailSheet
        post={selectedPost}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onUpdated={fetchPosts}
      />
    </>
  );
}
