-- Social Media Posts
CREATE TABLE social_media_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  caption TEXT,
  html_content TEXT,
  image_url TEXT,
  platform TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'draft',  -- draft | scheduled | published | failed
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  publish_results JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  chat_history JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE social_media_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own posts" ON social_media_posts
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Service role full access" ON social_media_posts
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_smp_user_status ON social_media_posts(user_id, status);
CREATE INDEX idx_smp_scheduled ON social_media_posts(scheduled_at) WHERE status = 'scheduled';
