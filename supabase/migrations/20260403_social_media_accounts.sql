-- Social Media Accounts (OAuth-connected platforms)
CREATE TABLE social_media_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('linkedin', 'instagram', 'facebook')),

  -- OAuth tokens
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,

  -- Platform identifiers
  platform_user_id TEXT,
  platform_username TEXT,
  platform_avatar_url TEXT,

  -- Facebook / Instagram specifics
  page_id TEXT,
  page_name TEXT,
  page_access_token TEXT,
  instagram_business_account_id TEXT,

  -- Meta
  scopes TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  health_status TEXT DEFAULT 'unknown' CHECK (health_status IN ('good', 'warning', 'bad', 'unknown')),
  last_error TEXT,
  total_posts_published INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE social_media_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own social accounts" ON social_media_accounts
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Service role full access social accounts" ON social_media_accounts
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_sma_user ON social_media_accounts(user_id);
CREATE INDEX idx_sma_platform ON social_media_accounts(user_id, platform);

-- Add account_ids to social_media_posts
ALTER TABLE social_media_posts ADD COLUMN IF NOT EXISTS account_ids UUID[] DEFAULT '{}';
