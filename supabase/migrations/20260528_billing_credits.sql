-- ══════════════════════════════════════════════════════════════════
-- Billing + Credits MVP
-- ══════════════════════════════════════════════════════════════════

/* ── subscriptions ── */
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL UNIQUE,                 -- 1 Sub pro User (MVP)
  stripe_customer_id       text UNIQUE,
  stripe_subscription_id   text UNIQUE,
  stripe_price_id          text,
  plan                     text NOT NULL,                        -- solo|growth|scale|enterprise
  status                   text NOT NULL DEFAULT 'pending_checkout',
                                                                 -- active|trialing|past_due|canceled|pending_checkout|incomplete
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean NOT NULL DEFAULT false,
  canceled_at              timestamptz,
  monthly_credits          integer NOT NULL DEFAULT 0,           -- Credits, die pro Periode neu zugeteilt werden
  last_credit_grant_at     timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id    ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id  ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status     ON public.subscriptions(status);

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_owner_read" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);
-- Schreibzugriff NUR über Service-Role (Webhook + interne Routes).

/* ── credit_balance (denormalisiert für schnellen Read) ── */
CREATE TABLE IF NOT EXISTS public.credit_balance (
  user_id        uuid PRIMARY KEY,
  balance        integer NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_balance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_balance_owner_read" ON public.credit_balance
  FOR SELECT USING (auth.uid() = user_id);

/* ── credit_ledger (Append-Only History, Source of Truth) ── */
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  delta           integer NOT NULL,                              -- positiv = grant, negativ = consume
  balance_after   integer NOT NULL,
  action_type     text NOT NULL,                                 -- 'plan_grant'|'topup'|'lead_discover'|'lead_enrich'|'mail_generate'|'mail_send'|'linkedin_action'|'seo_post'|'social_post'|'refund'|'admin_adjust'
  action_ref      text,                                          -- z.B. campaign_lead.id, lead.id, post.id — frei wählbar
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_id ON public.credit_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_action  ON public.credit_ledger(action_type);

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_ledger_owner_read" ON public.credit_ledger
  FOR SELECT USING (auth.uid() = user_id);

/* ── RPC: atomares Consume mit Insufficient-Funds-Check ── */
CREATE OR REPLACE FUNCTION public.consume_credits(
  p_user_id     uuid,
  p_amount      integer,
  p_action_type text,
  p_action_ref  text DEFAULT NULL,
  p_metadata    jsonb DEFAULT NULL
)
RETURNS TABLE (ok boolean, balance_after integer, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current integer;
  v_new     integer;
BEGIN
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT false, 0, 'amount must be > 0'::text;
    RETURN;
  END IF;

  -- Lock-Row holen oder initialisieren
  SELECT balance INTO v_current FROM public.credit_balance WHERE user_id = p_user_id FOR UPDATE;
  IF v_current IS NULL THEN
    INSERT INTO public.credit_balance(user_id, balance) VALUES (p_user_id, 0)
      ON CONFLICT (user_id) DO NOTHING;
    v_current := 0;
  END IF;

  IF v_current < p_amount THEN
    RETURN QUERY SELECT false, v_current, 'insufficient_credits'::text;
    RETURN;
  END IF;

  v_new := v_current - p_amount;
  UPDATE public.credit_balance
     SET balance = v_new, updated_at = now()
   WHERE user_id = p_user_id;

  INSERT INTO public.credit_ledger(user_id, delta, balance_after, action_type, action_ref, metadata)
    VALUES (p_user_id, -p_amount, v_new, p_action_type, p_action_ref, p_metadata);

  RETURN QUERY SELECT true, v_new, NULL::text;
END;
$$;

/* ── RPC: Credits gutschreiben (Plan-Grant, Top-Up, Refund) ── */
/* ── stripe_events: Idempotenz-Schutz gegen doppelte Webhooks ── */
CREATE TABLE IF NOT EXISTS public.stripe_events (
  event_id      text PRIMARY KEY,
  type          text NOT NULL,
  livemode      boolean NOT NULL DEFAULT false,
  processed_at  timestamptz NOT NULL DEFAULT now(),
  payload       jsonb
);
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
-- Keine RLS-Policy → nur Service-Role schreibt/liest (Webhook).

CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON public.stripe_events(type);
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at ON public.stripe_events(processed_at DESC);

CREATE OR REPLACE FUNCTION public.grant_credits(
  p_user_id     uuid,
  p_amount      integer,
  p_action_type text,
  p_action_ref  text DEFAULT NULL,
  p_metadata    jsonb DEFAULT NULL
)
RETURNS TABLE (balance_after integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current integer;
  v_new     integer;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0';
  END IF;

  SELECT balance INTO v_current FROM public.credit_balance WHERE user_id = p_user_id FOR UPDATE;
  IF v_current IS NULL THEN
    INSERT INTO public.credit_balance(user_id, balance) VALUES (p_user_id, 0);
    v_current := 0;
  END IF;

  v_new := v_current + p_amount;
  UPDATE public.credit_balance
     SET balance = v_new, updated_at = now()
   WHERE user_id = p_user_id;

  INSERT INTO public.credit_ledger(user_id, delta, balance_after, action_type, action_ref, metadata)
    VALUES (p_user_id, p_amount, v_new, p_action_type, p_action_ref, p_metadata);

  RETURN QUERY SELECT v_new;
END;
$$;
