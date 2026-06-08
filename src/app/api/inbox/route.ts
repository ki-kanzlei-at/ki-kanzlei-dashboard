/* ── API Route: GET /api/inbox ──
 * Liefert alle Konversationen des Users inkl. Nachrichten (RLS-gefiltert).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { InboxConversation, InboxMessage, InboxThread } from "@/lib/inbox/types";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });

    // Nur Konversationen mit Kundenantwort (Outreach läuft im Hintergrund).
    const { data: convs, error } = await supabase
      .from("inbox_conversations")
      .select("*")
      .eq("has_inbound", true)
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("[API GET /api/inbox] db:", error.message);
      return NextResponse.json({ error: "Inbox konnte nicht geladen werden" }, { status: 500 });
    }

    const conversations = (convs ?? []) as InboxConversation[];
    const ids = conversations.map((c) => c.id);

    let messages: InboxMessage[] = [];
    if (ids.length) {
      const { data: msgs } = await supabase
        .from("inbox_messages")
        .select("*")
        .in("conversation_id", ids)
        .order("sent_at", { ascending: true });
      messages = (msgs ?? []) as InboxMessage[];
    }

    const byConv = new Map<string, InboxMessage[]>();
    for (const m of messages) {
      const arr = byConv.get(m.conversation_id);
      if (arr) arr.push(m);
      else byConv.set(m.conversation_id, [m]);
    }

    const threads: InboxThread[] = conversations.map((c) => ({ ...c, messages: byConv.get(c.id) ?? [] }));

    // „me"-Identität für die Thread-Ansicht (eigene gesendete Nachrichten).
    const [{ data: profile }, { data: acc }] = await Promise.all([
      supabase.from("user_profiles").select("display_name").eq("id", user.id).maybeSingle(),
      supabase.from("email_accounts").select("sender_email, sender_name").eq("is_active", true).order("priority", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const me = {
      name: (profile as { display_name?: string } | null)?.display_name
        || (acc as { sender_name?: string } | null)?.sender_name
        || (user.email ? user.email.split("@")[0] : "Ich"),
      mailbox: (acc as { sender_email?: string } | null)?.sender_email || user.email || "",
    };

    return NextResponse.json({ data: threads, me });
  } catch (e) {
    console.error("[API GET /api/inbox]", e);
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
