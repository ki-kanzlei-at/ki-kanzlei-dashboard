-- ── Migration 007: unbenutzte Spalten in leads-Tabelle entfernen ──
-- Stichprobe von 5000 Leads zeigt: diese Spalten sind 0-4% gefüllt
-- und werden von der Pipeline nicht (mehr) genutzt.
--
-- Vor Ausführung Backup empfohlen.

ALTER TABLE leads
  DROP COLUMN IF EXISTS category,           -- 0% gefüllt (durch industry ersetzt)
  DROP COLUMN IF EXISTS employee_count,     -- 0% (Pipeline kann's nicht extrahieren)
  DROP COLUMN IF EXISTS social_xing;        -- 3% (XING tot für B2B in DACH)

-- Schema-Cache reload damit PostgREST/Frontend die neue Form kennt
NOTIFY pgrst, 'reload schema';
