/*
 * 009_connectsafely_migration.sql
 *
 * Migration Unipile → ConnectSafely.ai
 *  - Adds connectsafely_* columns to user_settings (mirrors old unipile_* fields).
 *  - Copies existing unipile_* values into the new columns so already-configured
 *    users see a soft prompt (UI shows old data, can re-enter ConnectSafely key).
 *  - Creates linkedin_action_log table for rate-limit tracking on actions we don't
 *    otherwise persist (search, profile lookups, follows, comments).
 *
 * The unipile_* columns are intentionally kept for one release cycle so that
 * a rollback is trivial. They can be dropped in a later migration.
 */

-- 1. Add ConnectSafely settings columns
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS connectsafely_api_key      text,
  ADD COLUMN IF NOT EXISTS connectsafely_account_id   text,
  ADD COLUMN IF NOT EXISTS connectsafely_webhook_secret text;

-- 2. Soft-copy: where the user previously had a Unipile config but no
--    ConnectSafely one, leave the placeholder so settings UI still shows
--    their LinkedIn integration is "configured" while they migrate the key.
--    (Only the account_id can be re-used — API keys differ between providers.)
UPDATE public.user_settings
   SET connectsafely_account_id = unipile_account_id
 WHERE connectsafely_account_id IS NULL
   AND unipile_account_id      IS NOT NULL;

-- 3. Action log for rate-limit accounting
CREATE TABLE IF NOT EXISTS public.linkedin_action_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action      text NOT NULL,         -- 'profilePerDay' | 'searchPerMonth' | 'followPerDay' | 'commentPerDay' | ...
  meta        jsonb,                 -- target profileId, search query, etc.
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS linkedin_action_log_user_action_time_idx
  ON public.linkedin_action_log (user_id, action, created_at DESC);

-- Row-level security: each user sees only their own log entries.
ALTER TABLE public.linkedin_action_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "log_select_own" ON public.linkedin_action_log;
CREATE POLICY "log_select_own" ON public.linkedin_action_log
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "log_insert_own" ON public.linkedin_action_log;
CREATE POLICY "log_insert_own" ON public.linkedin_action_log
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Service role bypasses RLS via the admin client (used by cron + server routes).

COMMENT ON TABLE public.linkedin_action_log IS
  'Counts low-touch LinkedIn actions per user for soft rate-limit enforcement.';
COMMENT ON COLUMN public.user_settings.connectsafely_api_key IS
  'Bearer token for https://api.connectsafely.ai (replaces unipile_api_key/unipile_dsn).';
COMMENT ON COLUMN public.user_settings.connectsafely_account_id IS
  'LinkedIn account ID exposed by ConnectSafely /account/status.';
COMMENT ON COLUMN public.user_settings.connectsafely_webhook_secret IS
  'Signing secret used to verify X-Webhook-Signature on inbound webhooks.';
