/* ── Unified Inbox — Typen ── */

export type InboxChannel = "email" | "linkedin";
export type InboxStatus = "new" | "interested" | "meeting" | "question" | "declined";
export type InboxDirection = "out" | "in";

export interface InboxConversation {
  id: string;
  user_id: string;
  channel: InboxChannel;
  contact_name: string;
  contact_company: string | null;
  contact_role: string | null;
  contact_email: string | null;
  linkedin_url: string | null;
  avatar_url: string | null;
  lead_id: string | null;
  linkedin_lead_id: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  external_thread_id: string | null;
  status: InboxStatus;
  unread: boolean;
  starred: boolean;
  done: boolean;
  snoozed_until: string | null;
  last_message_at: string;
  last_snippet: string | null;
  created_at: string;
  updated_at: string;
}

export interface InboxMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  direction: InboxDirection;
  channel: InboxChannel;
  from_name: string | null;
  subject: string | null;
  body: string;
  sender_email: string | null;
  external_id: string | null;
  sent_at: string;
  created_at: string;
}

/** Conversation inkl. ihrer Nachrichten — Form, die die Inbox-UI konsumiert. */
export interface InboxThread extends InboxConversation {
  messages: InboxMessage[];
}
