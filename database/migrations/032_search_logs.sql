-- ChaskaBox — Migration 032: Search analytics logging (Phase 2)
-- Stores anonymized search queries for analytics. No PII.

CREATE TABLE IF NOT EXISTS search_logs (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  query         TEXT NOT NULL,
  results_count INTEGER NOT NULL DEFAULT 0,
  clicked_product_id BIGINT,
  session_id    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_logs_query ON search_logs(query);
CREATE INDEX IF NOT EXISTS idx_search_logs_created ON search_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_search_logs_noresult ON search_logs(results_count) WHERE results_count = 0;

ALTER TABLE search_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS searchlog_service_all ON search_logs;
CREATE POLICY searchlog_service_all ON search_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow anonymous inserts (storefront logging) but no reads
DROP POLICY IF EXISTS searchlog_anon_insert ON search_logs;
CREATE POLICY searchlog_anon_insert ON search_logs FOR INSERT TO anon WITH CHECK (true);
