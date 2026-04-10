/* ── E-Mail Accounts für Multi-Domain Outreach ── */

CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('smtp', 'microsoft_graph')),

  -- Gemeinsam
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  reply_to TEXT,

  -- SMTP
  smtp_host TEXT,
  smtp_port INTEGER DEFAULT 587,
  smtp_username TEXT,
  smtp_password TEXT,
  smtp_encryption TEXT DEFAULT 'tls' CHECK (smtp_encryption IN ('tls', 'ssl', 'none')),

  -- Microsoft Graph
  ms_tenant_id TEXT,
  ms_client_id TEXT,
  ms_client_secret TEXT,

  -- Limits & Rotation
  daily_limit INTEGER NOT NULL DEFAULT 50,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,

  -- Warmup
  warmup_enabled BOOLEAN NOT NULL DEFAULT false,
  warmup_day INTEGER NOT NULL DEFAULT 0,
  warmup_start INTEGER NOT NULL DEFAULT 10,
  warmup_increment INTEGER NOT NULL DEFAULT 5,

  -- Health
  health_status TEXT NOT NULL DEFAULT 'unknown' CHECK (health_status IN ('good', 'warning', 'bad', 'unknown')),
  last_error TEXT,

  -- Tracking
  sent_today INTEGER NOT NULL DEFAULT 0,
  sent_today_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_sent INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index für schnelle Abfragen
CREATE INDEX idx_email_accounts_user_active ON email_accounts(user_id, is_active);

-- RLS aktivieren
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users können eigene E-Mail-Konten lesen"
  ON email_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users können eigene E-Mail-Konten erstellen"
  ON email_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users können eigene E-Mail-Konten updaten"
  ON email_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users können eigene E-Mail-Konten löschen"
  ON email_accounts FOR DELETE
  USING (auth.uid() = user_id);

-- Service Role braucht auch Zugriff (für Cron Jobs)
CREATE POLICY "Service role full access on email_accounts"
  ON email_accounts FOR ALL
  USING (auth.role() = 'service_role');
