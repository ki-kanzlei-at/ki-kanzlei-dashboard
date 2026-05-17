-- ══════════════════════════════════════════════════════
-- pg_cron Watchdog: Stuck Jobs automatisch als failed markieren
-- ══════════════════════════════════════════════════════
--
-- Dieses Script einmalig im Supabase SQL Editor ausführen.
-- Die Pipeline updatet `updated_at` bei jedem verarbeiteten Lead.
-- Wenn updated_at >15 Min alt ist und Status "running" → Job hängt.
--
-- Voraussetzung: pg_cron Extension muss aktiviert sein
-- (Supabase Dashboard → Database → Extensions → pg_cron aktivieren)

-- Extension aktivieren (falls noch nicht geschehen)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Bestehenden Cron-Job löschen falls vorhanden
SELECT cron.unschedule('recover-stuck-jobs')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'recover-stuck-jobs'
);

-- Alle 10 Minuten: stuck "running" Jobs als "failed" markieren
SELECT cron.schedule(
  'recover-stuck-jobs',
  '*/10 * * * *',
  $$
  UPDATE search_jobs
  SET status = 'failed',
      error_message = 'Timeout: Job reagiert nicht mehr. Bitte erneut starten.',
      completed_at = NOW(),
      updated_at = NOW()
  WHERE status = 'running'
    AND updated_at < NOW() - INTERVAL '15 minutes';
  $$
);

-- Überprüfen ob der Job angelegt wurde
SELECT * FROM cron.job WHERE jobname = 'recover-stuck-jobs';
