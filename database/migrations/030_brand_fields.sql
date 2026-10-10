-- ChaskaBox Migration 030: Brand page fields
-- Extends the brands table (created in 022) with SEO/content fields
-- required for Phase 2A brand directory + brand detail pages.
-- Safe to run multiple times (IF NOT EXISTS guards).

-- 1. Normalized name for dedupe/matching (lowercased, trimmed)
ALTER TABLE brands ADD COLUMN IF NOT EXISTS normalized_name TEXT;

-- 2. Content fields
ALTER TABLE brands ADD COLUMN IF NOT EXISTS hero_image_url TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS short_description TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS long_description TEXT;

-- 3. SEO fields
ALTER TABLE brands ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS seo_description TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS og_image_url TEXT;

-- 4. Merchandising
ALTER TABLE brands ADD COLUMN IF NOT EXISTS featured_product_ids BIGINT[] NOT NULL DEFAULT '{}';
ALTER TABLE brands ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

-- 5. updated_at trigger (keep existing behavior consistent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_brands_updated_at'
  ) THEN
    CREATE TRIGGER trg_brands_updated_at
      BEFORE UPDATE ON brands
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- 6. Helpful index for public brand lookups
CREATE INDEX IF NOT EXISTS idx_brands_slug_visible ON brands(slug) WHERE is_visible = TRUE;
CREATE INDEX IF NOT EXISTS idx_brands_sort ON brands(sort_order, position);

-- 7. Backfill normalized_name from existing names (idempotent)
UPDATE brands
SET normalized_name = lower(trim(name))
WHERE normalized_name IS NULL;
