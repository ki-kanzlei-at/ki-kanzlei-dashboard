-- ── Multi-Mailbox pro Kampagne (automatische Rotation) ──────────────
-- Leeres Array = Verhalten wie bisher (mailbox_id bzw. alle aktiven Konten).
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS mailbox_ids uuid[] NOT NULL DEFAULT '{}';

-- Bestehende Einzel-Mailbox-Kampagnen ins Array übernehmen
UPDATE public.campaigns
   SET mailbox_ids = ARRAY[mailbox_id]
 WHERE mailbox_id IS NOT NULL
   AND (mailbox_ids IS NULL OR cardinality(mailbox_ids) = 0);
