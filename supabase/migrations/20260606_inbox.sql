-- ══════════════════════════════════════════════════════════════════
-- Unified Inbox: conversations + messages (E-Mail-Kampagnen + LinkedIn)
-- Zweiseitige Threads: outgoing (Send/Cron/Invite) + inbound (IMAP/Graph/Webhook)
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.inbox_conversations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel           text NOT NULL CHECK (channel IN ('email','linkedin')),

  -- Kontakt
  contact_name      text NOT NULL DEFAULT '',
  contact_company   text,
  contact_role      text,
  contact_email     text,
  linkedin_url      text,
  avatar_url        text,

  -- Verknüpfung in die bestehende Pipeline
  lead_id           uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  linkedin_lead_id  uuid REFERENCES public.linkedin_leads(id) ON DELETE SET NULL,
  campaign_id       uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  campaign_name     text,
  external_thread_id text,          -- LinkedIn conversationUrn / E-Mail-Thread-Wurzel

  -- Inbox-Status
  status            text NOT NULL DEFAULT 'new'
                      CHECK (status IN ('new','interested','meeting','question','declined')),
  unread            boolean NOT NULL DEFAULT false,
  starred           boolean NOT NULL DEFAULT false,
  done              boolean NOT NULL DEFAULT false,
  snoozed_until     timestamptz,
  last_message_at   timestamptz NOT NULL DEFAULT now(),
  last_snippet      text,
  -- Inbox zeigt NUR Konversationen mit Kundenantwort; Outreach läuft im Hintergrund.
  has_inbound       boolean NOT NULL DEFAULT false,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Upsert-Schlüssel: je User eindeutig pro LinkedIn-Lead bzw. pro E-Mail-Kontakt
CREATE UNIQUE INDEX IF NOT EXISTS uq_inbox_conv_linkedin
  ON public.inbox_conversations (user_id, linkedin_lead_id)
  WHERE linkedin_lead_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_inbox_conv_email
  ON public.inbox_conversations (user_id, contact_email)
  WHERE channel = 'email' AND contact_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_conv_user_last
  ON public.inbox_conversations (user_id, done, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.inbox_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid NOT NULL REFERENCES public.inbox_conversations(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction         text NOT NULL CHECK (direction IN ('out','in')),
  channel           text NOT NULL CHECK (channel IN ('email','linkedin')),
  from_name         text,
  subject           text,
  body              text NOT NULL DEFAULT '',
  sender_email      text,
  external_id       text,           -- Provider-Message-ID (Dedupe)
  sent_at           timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbox_msg_conv
  ON public.inbox_messages (conversation_id, sent_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inbox_msg_external
  ON public.inbox_messages (user_id, channel, external_id)
  WHERE external_id IS NOT NULL;

-- ── RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.inbox_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_messages      ENABLE ROW LEVEL SECURITY;

CREATE POLICY inbox_conv_owner ON public.inbox_conversations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY inbox_conv_service ON public.inbox_conversations
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY inbox_msg_owner ON public.inbox_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY inbox_msg_service ON public.inbox_messages
  FOR ALL USING (auth.role() = 'service_role');
