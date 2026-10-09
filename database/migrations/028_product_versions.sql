-- ChaskaBox Product version history
-- Snapshot before each update; enables revert.

CREATE TABLE IF NOT EXISTS product_versions (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  snapshot    JSONB NOT NULL,  -- full product row before change
  changed_by  TEXT,  -- admin user id or email
  change_type TEXT NOT NULL DEFAULT 'update',  -- update, revert
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pv_product ON product_versions(product_id, created_at DESC);

ALTER TABLE product_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pv_service_all ON product_versions;
CREATE POLICY pv_service_all ON product_versions FOR ALL TO service_role USING (true) WITH CHECK (true);
