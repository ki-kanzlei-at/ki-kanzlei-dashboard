/* ── Supabase Data Access Layer: AI Researcher ── */

import { createClient } from "./server";
import type {
  ResearchSession,
  ResearchSessionWithMessages,
  ResearchMessage,
  ResearchSource,
  ResearchMethod,
  LeadFields,
} from "@/types/research";
import type { LeadStatus } from "@/types/leads";

/* ── Row-Mapper ── */
type SessionRow = Record<string, unknown>;
type MessageRow = Record<string, unknown>;

function mapSession(r: SessionRow): ResearchSession {
  return {
    id: r.id as string,
    method: (r.method as ResearchMethod) ?? "url",
    lead_id: (r.lead_id as string | null) ?? null,
    company: r.company as string,
    website: (r.website as string | null) ?? null,
    industry: (r.industry as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    state: (r.state as string | null) ?? null,
    country: (r.country as string) ?? "AT",
    score: (r.score as number | null) ?? null,
    status: (r.status as LeadStatus | null) ?? null,
    facts: (r.facts as string | null) ?? null,
    lead_fields: (r.lead_fields as LeadFields | null) ?? {},
    sources: (r.sources as ResearchSource[] | null) ?? [],
    suggestions: (r.suggestions as string[] | null) ?? [],
    saved_lead_id: (r.saved_lead_id as string | null) ?? null,
    saved_at: (r.saved_at as string | null) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

function mapMessage(r: MessageRow): ResearchMessage {
  return {
    id: r.id as string,
    role: r.role as ResearchMessage["role"],
    text: (r.text as string | null) ?? null,
    blocks: (r.blocks as ResearchMessage["blocks"]) ?? null,
    card: (r.card as ResearchMessage["card"]) ?? null,
    person: (r.person as ResearchMessage["person"]) ?? null,
    created_at: r.created_at as string,
  };
}

export interface CreateSessionInput {
  method: ResearchMethod;
  lead_id?: string | null;
  company: string;
  website?: string | null;
  industry?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string;
  score?: number | null;
  status?: LeadStatus | null;
  facts?: string | null;
  lead_fields?: LeadFields;
  sources?: ResearchSource[];
  suggestions?: string[];
}

export async function createSession(
  userId: string,
  input: CreateSessionInput,
): Promise<ResearchSession> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("research_sessions")
    .insert({
      user_id: userId,
      method: input.method,
      lead_id: input.lead_id ?? null,
      company: input.company,
      website: input.website ?? null,
      industry: input.industry ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      country: input.country ?? "AT",
      score: input.score ?? null,
      status: input.status ?? null,
      facts: input.facts ?? null,
      lead_fields: input.lead_fields ?? {},
      sources: input.sources ?? [],
      suggestions: input.suggestions ?? [],
    })
    .select("*")
    .single();

  if (error) throw new Error(`Fehler beim Anlegen der Recherche: ${error.message}`);
  return mapSession(data);
}

export async function getSessions(userId: string): Promise<ResearchSession[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("research_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`Fehler beim Laden der Recherchen: ${error.message}`);
  return (data ?? []).map(mapSession);
}

export async function getSessionById(id: string): Promise<ResearchSession | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("research_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapSession(data) : null;
}

export async function getSessionWithMessages(
  id: string,
): Promise<ResearchSessionWithMessages | null> {
  const session = await getSessionById(id);
  if (!session) return null;
  const messages = await getMessages(id);
  return { ...session, messages };
}

export async function getMessages(sessionId: string): Promise<ResearchMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("research_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapMessage);
}

export interface AddMessageInput {
  role: ResearchMessage["role"];
  text?: string | null;
  blocks?: ResearchMessage["blocks"];
  card?: ResearchMessage["card"];
  person?: ResearchMessage["person"];
}

export async function addMessage(
  userId: string,
  sessionId: string,
  input: AddMessageInput,
): Promise<ResearchMessage> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("research_messages")
    .insert({
      session_id: sessionId,
      user_id: userId,
      role: input.role,
      text: input.text ?? null,
      blocks: input.blocks ?? null,
      card: input.card ?? null,
      person: input.person ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Fehler beim Speichern der Nachricht: ${error.message}`);

  // Session-Zeitstempel aktualisieren (für die Sortierung im Rail)
  await supabase.from("research_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sessionId);

  return mapMessage(data);
}

export async function getMessageById(messageId: string): Promise<ResearchMessage | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("research_messages")
    .select("*")
    .eq("id", messageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapMessage(data) : null;
}

export async function updateMessageBlocks(
  messageId: string,
  blocks: ResearchMessage["blocks"],
): Promise<ResearchMessage | null> {
  const supabase = await createClient();
  // Nur KI-Nachrichten dürfen neu formuliert werden; RLS sichert die Eigentümerschaft.
  const { data, error } = await supabase
    .from("research_messages")
    .update({ blocks })
    .eq("id", messageId)
    .eq("role", "ai")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`Fehler beim Aktualisieren der Nachricht: ${error.message}`);
  return data ? mapMessage(data) : null;
}

export async function markSessionSaved(
  sessionId: string,
  savedLeadId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("research_sessions")
    .update({ saved_lead_id: savedLeadId, saved_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}

export async function deleteSession(id: string): Promise<void> {
  const supabase = await createClient();
  // research_messages werden per FK ON DELETE CASCADE mitgelöscht
  const { error } = await supabase.from("research_sessions").delete().eq("id", id);
  if (error) throw new Error(`Fehler beim Löschen der Recherche: ${error.message}`);
}
