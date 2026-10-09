-- ChaskaBox Loyalty Program
-- Simple points: 1 point per Rs. 100 spent. 1 point = Rs. 1 discount on redeem.
-- Identified by phone number (no auth required for storefront).

CREATE TABLE IF NOT EXISTS loyalty_accounts (
  phone       TEXT PRIMARY KEY,  -- normalized: 92XXXXXXXXXX
  points      INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_redeemed INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_history (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phone       TEXT NOT NULL REFERENCES loyalty_accounts(phone) ON DELETE CASCADE,
  points      INTEGER NOT NULL,  -- positive = earned, negative = redeemed
  reason      TEXT NOT NULL,     -- 'order_CB-XXX', 'redeem_CB-XXX', 'adjustment'
  order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_history_phone ON loyalty_history(phone);
CREATE INDEX IF NOT EXISTS idx_loyalty_history_created ON loyalty_history(created_at DESC);

-- RLS: service role only (all access via API functions)
ALTER TABLE loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loyalty_service_all ON loyalty_accounts;
CREATE POLICY loyalty_service_all ON loyalty_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS loyalty_hist_service_all ON loyalty_history;
CREATE POLICY loyalty_hist_service_all ON loyalty_history FOR ALL TO service_role USING (true) WITH CHECK (true);
