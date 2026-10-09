-- ChaskaBox Brands management
-- Brands are currently text prefixes in product names (e.g., "Hilal | Cupkake").
-- This table enables proper brand management: logos, descriptions, visibility.

CREATE TABLE IF NOT EXISTS brands (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  logo_url    TEXT,
  description TEXT,
  is_visible  BOOLEAN NOT NULL DEFAULT TRUE,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brands_visible ON brands(is_visible);
CREATE INDEX IF NOT EXISTS idx_brands_position ON brands(position);

-- Optional: link products to brands (nullable, for future use)
-- Products currently use text brand extraction; this enables gradual migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='brand_id') THEN
    ALTER TABLE products ADD COLUMN brand_id BIGINT REFERENCES brands(id) ON DELETE SET NULL;
  END IF;
END $$;

-- RLS: service role only
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brands_service_all ON brands;
CREATE POLICY brands_service_all ON brands FOR ALL TO service_role USING (true) WITH CHECK (true);
