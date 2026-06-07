-- MVP-Schema-Cleanup: nicht mehr benötigte Tabellen entfernen.
-- Beide sind leer (0 Zeilen) und werden im gesamten Code/Migrationen nirgends referenziert;
-- keine Foreign Keys oder Views hängen daran.
--   • outreach_campaigns — abgelöst durch `campaigns` (+ `campaign_leads`)
--   • blog_posts         — abgelöst durch `seo_posts`
DROP TABLE IF EXISTS public.outreach_campaigns;
DROP TABLE IF EXISTS public.blog_posts;
