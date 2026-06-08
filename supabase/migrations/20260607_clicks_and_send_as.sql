-- ══════════════════════════════════════════════════════════════════
-- Kampagnen-Klickzähler (Funnel-Parität mit Öffnungen) + Send-As für
-- OAuth-Shared-Postfächer
-- ══════════════════════════════════════════════════════════════════

-- ── campaigns: click_count (analog zu open_count/reply_count/bounce_count) ──
alter table public.campaigns add column if not exists click_count integer not null default 0;

create or replace function public.increment_click_count(p_campaign_id uuid)
returns void language sql as $$
  update public.campaigns
     set click_count = click_count + 1,
         last_activity_at = now(),
         last_activity_kind = 'click'
   where id = p_campaign_id;
$$;

-- ── email_accounts: Send-As-Adresse für OAuth-Shared-Postfächer ──
-- Wenn gesetzt, sendet der delegierte OAuth-Versand (Microsoft/Google) aus
-- dieser freigegebenen Adresse statt aus dem angemeldeten Postfach.
alter table public.email_accounts add column if not exists send_as_email text;
