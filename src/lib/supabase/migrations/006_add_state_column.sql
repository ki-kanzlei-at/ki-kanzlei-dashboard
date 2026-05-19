-- ── Migration 006: state-Spalte zu leads-Tabelle ──
-- Bundesland/Kanton für UI-Filter und postalCodeToBundesland-Resolution.
-- Wird in der Pipeline aus postal_code abgeleitet (src/lib/bundesland.ts).

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS state TEXT;

-- Index für UI-Filter nach Bundesland
CREATE INDEX IF NOT EXISTS leads_state_idx ON leads (state);
