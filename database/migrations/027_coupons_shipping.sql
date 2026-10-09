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
