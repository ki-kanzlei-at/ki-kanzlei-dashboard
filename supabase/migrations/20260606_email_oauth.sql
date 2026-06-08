-- OAuth-Login ("Mit Microsoft/Google anmelden") für E-Mail-Konten:
-- Token-Speicherung (delegiert) + neue Provider-Werte.
ALTER TABLE public.email_accounts
  ADD COLUMN IF NOT EXISTS oauth_access_token     text,
  ADD COLUMN IF NOT EXISTS oauth_refresh_token    text,
  ADD COLUMN IF NOT EXISTS oauth_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS oauth_scope            text;

ALTER TABLE public.email_accounts DROP CONSTRAINT IF EXISTS email_accounts_provider_check;
ALTER TABLE public.email_accounts
  ADD CONSTRAINT email_accounts_provider_check
  CHECK (provider IN ('smtp','microsoft_graph','microsoft_oauth','google_oauth'));
