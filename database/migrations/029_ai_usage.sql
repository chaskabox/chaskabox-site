-- ChaskaBox AI usage tracking (quota display)

CREATE TABLE IF NOT EXISTS ai_usage (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task        TEXT NOT NULL,
  user_id     TEXT,
  success     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_date ON ai_usage(created_at DESC);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_usage_service_all ON ai_usage;
CREATE POLICY ai_usage_service_all ON ai_usage FOR ALL TO service_role USING (true) WITH CHECK (true);
