-- ============================================================
-- ChaskaBox — P1/P2/P3 Admin Migrations (022-028)
-- Supabase Dashboard → SQL Editor → New Query → Paste → Run
-- Safe: sab CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- Koi existing data delete nahi hoga.
-- ============================================================

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

-- ==================== 023_product_seo.sql ====================

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

-- ==================== 024_notification_templates.sql ====================

-- ChaskaBox Notification Templates
-- Editable email/WhatsApp templates. Variables: {{order_number}}, {{customer_name}}, {{total}}, {{tracking_url}}

CREATE TABLE IF NOT EXISTS notification_templates (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,  -- 'order_confirmation', 'status_shipped', etc.
  channel     TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  subject     TEXT,  -- email only
  body        TEXT NOT NULL,
  variables   TEXT[] DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: service role only
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notif_tpl_service_all ON notification_templates;
CREATE POLICY notif_tpl_service_all ON notification_templates FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Default templates
INSERT INTO notification_templates (name, channel, subject, body, variables) VALUES
('order_received_owner', 'email', 'New Order {{order_number}} — Rs. {{total}}',
 'New order received!\n\nOrder: {{order_number}}\nCustomer: {{customer_name}} ({{customer_phone}})\nTotal: Rs. {{total}}\nPayment: {{payment_method}}\n\nView: {{admin_url}}',
 ARRAY['order_number','customer_name','customer_phone','total','payment_method','admin_url']),

('order_thankyou_customer', 'whatsapp', NULL,
 '🍬 *ChaskaBox* — Shukriya {{customer_name}}!\n\nYour order *{{order_number}}* (Rs. {{total}}) is confirmed!\n\nWe''ll source your snacks fresh and deliver in 4-7 days.\nTrack: {{tracking_url}}',
 ARRAY['customer_name','order_number','total','tracking_url']),

('status_update', 'whatsapp', NULL,
 '🍬 *ChaskaBox Update*\n\nHi {{customer_name}}! Your order *{{order_number}}* is {{status_text}}\n\nTrack: {{tracking_url}}',
 ARRAY['customer_name','order_number','status_text','tracking_url']),

('abandoned_cart', 'whatsapp', NULL,
 '🛍️ Hi {{customer_name}}! You left some tasty snacks in your ChaskaBox bag.\n\nComplete your order before they''re gone!\nShop: https://chaskabox.online/shop/',
 ARRAY['customer_name'])
ON CONFLICT (name) DO NOTHING;

-- ==================== 025_resolution_cases.sql ====================

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

-- ==================== 026_theme_settings.sql ====================

-- ChaskaBox Theme Settings (key-value store)
-- Stores design tokens: colors, fonts, logo, spacing, header/footer options.

CREATE TABLE IF NOT EXISTS theme_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE theme_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS theme_service_all ON theme_settings;
CREATE POLICY theme_service_all ON theme_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Defaults (match current site design)
INSERT INTO theme_settings (key, value) VALUES
('primary_color', '#1a2b5c'),
('accent_color', '#f59e0b'),
('background_color', '#ffffff'),
('text_color', '#1f2937'),
('font_family', 'system-ui'),
('border_radius', '12'),
('logo_url', '/logo.png'),
('favicon_url', '/favicon.ico'),
('header_style', 'standard'),
('announcement_text', ''),
('announcement_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

-- ==================== 027_coupons_shipping.sql ====================

-- ChaskaBox Coupons / Discount codes

CREATE TABLE IF NOT EXISTS coupons (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  discount_type   TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value  INTEGER NOT NULL CHECK (discount_value > 0),
  min_order       INTEGER DEFAULT 0,  -- minimum order Rs.
  max_uses        INTEGER,  -- NULL = unlimited
  used_count      INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from      TIMESTAMPTZ DEFAULT now(),
  valid_until     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coupons_service_all ON coupons;
CREATE POLICY coupons_service_all ON coupons FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Shipping zones
CREATE TABLE IF NOT EXISTS shipping_zones (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  cities      TEXT[] DEFAULT '{}',  -- empty = all cities
  fee         INTEGER NOT NULL DEFAULT 300,
  free_above  INTEGER,  -- free delivery above this amount
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE shipping_zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shipzone_service_all ON shipping_zones;
CREATE POLICY shipzone_service_all ON shipping_zones FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Default zones (match current policy)
INSERT INTO shipping_zones (name, fee, free_above, position) VALUES
('Nationwide COD', 300, NULL, 1),
('JazzCash Advance', 300, 5000, 2)
ON CONFLICT DO NOTHING;

-- ==================== 028_product_versions.sql ====================

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
