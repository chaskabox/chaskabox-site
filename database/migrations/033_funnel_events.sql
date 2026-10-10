-- ChaskaBox — Migration 033: Funnel/cart event tracking (Phase 2)
-- Stores anonymized funnel events for checkout conversion analytics. No PII.
-- Events: product_view, add_to_cart, cart_viewed, checkout_started, order_created

CREATE TABLE IF NOT EXISTS funnel_events (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event       TEXT NOT NULL CHECK (event IN ('product_view','add_to_cart','cart_viewed','checkout_started','order_created')),
  product_id  BIGINT,
  session_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funnel_event ON funnel_events(event);
CREATE INDEX IF NOT EXISTS idx_funnel_created ON funnel_events(created_at);
CREATE INDEX IF NOT EXISTS idx_funnel_session ON funnel_events(session_id);

ALTER TABLE funnel_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS funnel_service_all ON funnel_events;
CREATE POLICY funnel_service_all ON funnel_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow anonymous inserts (storefront logging) but no reads
DROP POLICY IF EXISTS funnel_anon_insert ON funnel_events;
CREATE POLICY funnel_anon_insert ON funnel_events FOR INSERT TO anon WITH CHECK (true);
