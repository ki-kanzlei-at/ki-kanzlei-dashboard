-- ══════════════════════════════════════════════════════════════════
-- Campaigns Hardening: Multi-User-Sicherheit, Duplikat-Schutz, Indizes
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Kein globaler reply_to-Default mehr (Betreiber-Adresse!) ────
-- Leerer String = "vom sendenden Postfach ableiten" (Code-Fallback).
ALTER TABLE public.campaigns
  ALTER COLUMN reply_to SET DEFAULT '',
  ALTER COLUMN reply_to DROP NOT NULL;

-- ── 2. Duplikat-Schutz: ein Lead nur einmal pro Kampagne ───────────
-- Vorhandene Duplikate zuerst bereinigen (älteste Zeile gewinnt).
DELETE FROM public.campaign_leads a
USING public.campaign_leads b
WHERE a.campaign_id = b.campaign_id
  AND a.lead_id = b.lead_id
  AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_leads_campaign_lead
  ON public.campaign_leads (campaign_id, lead_id);

-- ── 3. Fehlende Indizes für Tracking/Sync-Querypfade ───────────────
-- trackBounce/trackReply + Inbox-Sync filtern leads per E-Mail
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads (email);
-- Bounce-Schwelle zählt per (user, sender_email, status, bounced_at)
CREATE INDEX IF NOT EXISTS idx_campaign_leads_sender_status
  ON public.campaign_leads (sender_email, status, bounced_at);
-- Inbox-Sync & RLS filtern campaign_leads per user_id
CREATE INDEX IF NOT EXISTS idx_campaign_leads_user_id
  ON public.campaign_leads (user_id);

-- ── 4. Cron-Index: auch 'completed' ausschließen ───────────────────
-- Terminale completed-Zeilen sind langfristig die Mehrheit und blähen
-- den alten Teilindex sonst auf.
DROP INDEX IF EXISTS idx_campaign_leads_next_send_at;
CREATE INDEX IF NOT EXISTS idx_campaign_leads_next_send_at
  ON public.campaign_leads (campaign_id, next_send_at)
  WHERE status NOT IN ('replied','bounced','failed','completed');

-- ── 5. user_id-FKs: keine verwaisten Kampagnen nach User-Löschung ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'campaigns_user_id_fkey' AND conrelid = 'public.campaigns'::regclass
  ) THEN
    -- Verwaiste Zeilen entfernen, sonst schlägt die FK-Validierung fehl
    DELETE FROM public.campaigns c
    WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = c.user_id);

    ALTER TABLE public.campaigns
      ADD CONSTRAINT campaigns_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'campaign_leads_user_id_fkey' AND conrelid = 'public.campaign_leads'::regclass
  ) THEN
    DELETE FROM public.campaign_leads cl
    WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = cl.user_id);

    ALTER TABLE public.campaign_leads
      ADD CONSTRAINT campaign_leads_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
