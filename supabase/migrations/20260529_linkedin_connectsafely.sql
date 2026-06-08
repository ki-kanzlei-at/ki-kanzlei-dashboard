-- ══════════════════════════════════════════════════════════════════
-- Migration Unipile → ConnectSafely (vom Commit f7175f5)
--   - Adds connectsafely_* columns to user_settings.
--   - Soft-copy alter unipile_account_id → connectsafely_account_id.
--   - linkedin_action_log Tabelle für Rate-Limit-Tracking.
-- Quelle: src/lib/supabase/migrations/009_connectsafely_migration.sql
-- (jetzt in supabase/migrations/ für Supabase-CLI-Konsistenz)
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS connectsafely_api_key        text,
  ADD COLUMN IF NOT EXISTS connectsafely_account_id     text,
  ADD COLUMN IF NOT EXISTS connectsafely_webhook_secret text;

UPDATE public.user_settings
   SET connectsafely_account_id = unipile_account_id
 WHERE connectsafely_account_id IS NULL
   AND unipile_account_id      IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.linkedin_action_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action      text NOT NULL,
  meta        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedin_action_log_user_action_time_idx
  ON public.linkedin_action_log (user_id, action, created_at DESC);

ALTER TABLE public.linkedin_action_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "log_select_own" ON public.linkedin_action_log;
CREATE POLICY "log_select_own" ON public.linkedin_action_log
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "log_insert_own" ON public.linkedin_action_log;
CREATE POLICY "log_insert_own" ON public.linkedin_action_log
  FOR INSERT WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.linkedin_action_log IS
  'Counts low-touch LinkedIn actions per user for soft rate-limit enforcement.';
COMMENT ON COLUMN public.user_settings.connectsafely_api_key IS
  'Bearer token for https://api.connectsafely.ai (replaces unipile_api_key/unipile_dsn).';
COMMENT ON COLUMN public.user_settings.connectsafely_account_id IS
  'LinkedIn account ID exposed by ConnectSafely /account/status.';
COMMENT ON COLUMN public.user_settings.connectsafely_webhook_secret IS
  'Signing secret used to verify X-Webhook-Signature on inbound webhooks.';
