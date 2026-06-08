-- Integration-OAuth-Tokens (Multi-Tenant SaaS): pro User ein JSONB mit
--   { "<providerId>": { access_token, refresh_token, expires_at, instance_url, domain } }
-- Eine OAuth-App pro Anbieter (ENV-Creds), Tokens werden pro Kunde hier abgelegt.
alter table public.user_settings
  add column if not exists integration_tokens jsonb;
