-- ── Lead-Status-Constraint ans aktuelle Modell angleichen ───────────
-- Der alte Check stammte aus einem früheren Status-Modell
-- (new/enriched/contacted/converted/closed) und blockierte die von der App
-- verwendeten Werte 'interested' und 'not_interested' — Statuswechsel auf
-- „Interessiert"/„Kein Interesse" scheiterten dadurch an der DB.

-- Etwaige Alt-Werte aufs aktuelle Modell mappen (defensiv; Stand 10.06.2026: keine)
UPDATE public.leads SET status = 'new'            WHERE status = 'enriched';
UPDATE public.leads SET status = 'not_interested' WHERE status = 'closed';

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('new', 'contacted', 'interested', 'not_interested', 'converted'));
