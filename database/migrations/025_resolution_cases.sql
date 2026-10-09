-- ChaskaBox Refund/Resolution cases
-- Track customer issues: refunds, replacements, complaints.

CREATE TABLE IF NOT EXISTS resolution_cases (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id      UUID REFERENCES orders(id) ON DELETE SET NULL,
  order_number  TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  issue_type    TEXT NOT NULL CHECK (issue_type IN ('refund','replacement','complaint','damaged','missing_item','late_delivery','other')),
  description   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','rejected')),
  resolution    TEXT,  -- what was done
  refund_amount INTEGER DEFAULT 0,  -- Rs.
  created_by    TEXT DEFAULT 'admin',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_resolution_status ON resolution_cases(status);
CREATE INDEX IF NOT EXISTS idx_resolution_order ON resolution_cases(order_id);

ALTER TABLE resolution_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS resolution_service_all ON resolution_cases;
CREATE POLICY resolution_service_all ON resolution_cases FOR ALL TO service_role USING (true) WITH CHECK (true);
