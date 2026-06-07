-- ══════════════════════════════════════════════════════════════════
-- Campaigns MVP: extend schema with wizard fields + sequence tracking
-- ══════════════════════════════════════════════════════════════════

-- ── campaigns: wizard payload ──────────────────────────────────────
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS mailbox_id        uuid REFERENCES public.email_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sender_name       text,
  ADD COLUMN IF NOT EXISTS goal              text,
  ADD COLUMN IF NOT EXISTS language          text NOT NULL DEFAULT 'de-AT',
  ADD COLUMN IF NOT EXISTS tone              text NOT NULL DEFAULT 'professional',
  ADD COLUMN IF NOT EXISTS system_prompt     text,
  ADD COLUMN IF NOT EXISTS sequence_steps    jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sequence_delays   jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS schedule          jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tracking          jsonb NOT NULL DEFAULT '{"opens":true,"clicks":true,"replies":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_stop_on_reply boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS steps_total       integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS conversion_count  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_activity_at  timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_kind text;

-- Status-Constraint säubern (nur die bekannten Werte zulassen)
DO $$
BEGIN
  -- Drop alten Check falls vorhanden (Idempotent)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'campaigns_status_check' AND conrelid = 'public.campaigns'::regclass
  ) THEN
    ALTER TABLE public.campaigns DROP CONSTRAINT campaigns_status_check;
  END IF;
  ALTER TABLE public.campaigns
    ADD CONSTRAINT campaigns_status_check
    CHECK (status IN ('draft','active','paused','completed','archived'));
END $$;

-- ── campaign_leads: sequence tracking ──────────────────────────────
ALTER TABLE public.campaign_leads
  ADD COLUMN IF NOT EXISTS step_index    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_send_at  timestamptz,
  ADD COLUMN IF NOT EXISTS last_sent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS clicked_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_clicked_at timestamptz;

-- Initiale next_send_at = sofort versendbereit für bestehende Leads
UPDATE public.campaign_leads
   SET next_send_at = COALESCE(next_send_at, created_at)
 WHERE status = 'pending';

-- ── Indizes für Cron-Performance ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_campaign_leads_next_send_at
  ON public.campaign_leads (campaign_id, next_send_at)
  WHERE status NOT IN ('replied','bounced','failed');

CREATE INDEX IF NOT EXISTS idx_campaigns_mailbox_id
  ON public.campaigns (mailbox_id);

-- ── Atomic counter RPCs (Idempotent erstellen) ────────────────────
CREATE OR REPLACE FUNCTION public.increment_sent_count(p_campaign_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.campaigns
     SET sent_count = sent_count + 1,
         last_activity_at = now(),
         last_activity_kind = 'send'
   WHERE id = p_campaign_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_failed_count(p_campaign_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.campaigns
     SET failed_count = failed_count + 1
   WHERE id = p_campaign_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_open_count(p_campaign_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.campaigns
     SET open_count = open_count + 1,
         last_activity_at = now(),
         last_activity_kind = 'open'
   WHERE id = p_campaign_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_bounce_count(p_campaign_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.campaigns
     SET bounce_count = bounce_count + 1,
         last_activity_at = now()
   WHERE id = p_campaign_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_reply_count(p_campaign_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.campaigns
     SET reply_count = reply_count + 1,
         last_activity_at = now(),
         last_activity_kind = 'reply'
   WHERE id = p_campaign_id;
$$;

CREATE OR REPLACE FUNCTION public.increment_conversion_count(p_campaign_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.campaigns
     SET conversion_count = conversion_count + 1,
         last_activity_at = now()
   WHERE id = p_campaign_id;
$$;
