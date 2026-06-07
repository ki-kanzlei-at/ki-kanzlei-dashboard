-- ══════════════════════════════════════════════════════════════════
-- AI Researcher — Recherche-Sessions + Chat-Verlauf
-- Gemini-gestützte Firmen-Recherche mit zitierten Quellen.
-- ══════════════════════════════════════════════════════════════════

/* ── research_sessions ──
   Eine Session = eine recherchierte Firma (aus CRM-Lead, URL oder Zielgruppen-Discovery). */
CREATE TABLE IF NOT EXISTS public.research_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  method          text NOT NULL DEFAULT 'url',          -- 'target' | 'crm' | 'url'
  lead_id         uuid,                                  -- Quell-Lead (falls aus CRM recherchiert)
  company         text NOT NULL,
  website         text,
  industry        text,                                  -- Label aus INDUSTRY_OPTIONS
  city            text,
  state           text,
  country         text NOT NULL DEFAULT 'AT',
  score           integer,                               -- KI-geschätzter Fit-Score 0–100
  status          text,                                  -- Lead-Status-Snapshot (falls CRM)
  facts           text,                                  -- kompakte Eckdaten (Prompt-Kontext)
  sources         jsonb NOT NULL DEFAULT '[]'::jsonb,    -- [{ n, kind, title, sub, url }]
  suggestions     jsonb NOT NULL DEFAULT '[]'::jsonb,    -- Vorschlags-Fragen
  saved_lead_id   uuid,                                  -- ins CRM gespeicherter Lead
  saved_at        timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_sessions_user      ON public.research_sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_sessions_lead      ON public.research_sessions(lead_id);

CREATE TRIGGER trg_research_sessions_updated_at
  BEFORE UPDATE ON public.research_sessions
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE public.research_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "research_sessions_owner" ON public.research_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

/* ── research_messages ──
   Chat-Verlauf einer Session. role: 'user' | 'ai' | 'system'. */
CREATE TABLE IF NOT EXISTS public.research_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES public.research_sessions(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,
  role            text NOT NULL,                         -- 'user' | 'ai' | 'system'
  text            text,                                  -- User-Frage / Roh-Text
  blocks          jsonb,                                 -- AI: [{ type:'p'|'h'|'ul', ... }]
  card            jsonb,                                 -- System: { company, when, items:[{icon,label,detail}] }
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_messages_session ON public.research_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_research_messages_user    ON public.research_messages(user_id);

ALTER TABLE public.research_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "research_messages_owner" ON public.research_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
