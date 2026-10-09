-- ChaskaBox Product SEO fields
-- Enables centralized SEO management: meta title, description, OG image, canonical.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='seo_title') THEN
    ALTER TABLE products ADD COLUMN seo_title TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='seo_description') THEN
    ALTER TABLE products ADD COLUMN seo_description TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='og_image') THEN
    ALTER TABLE products ADD COLUMN og_image TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='canonical_url') THEN
    ALTER TABLE products ADD COLUMN canonical_url TEXT;
  END IF;
END $$;
