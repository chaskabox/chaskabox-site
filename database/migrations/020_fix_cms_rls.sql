-- Migration 020: Fix CMS RLS — replace unrestricted FOR ALL policies from 019
-- with role-restricted policies. Forward, transactional, safely repeatable.
--
-- Background: migration 019 created FOR ALL ... USING (true) WITH CHECK (true)
-- policies on categories, category_products, navigation_menus, store_settings.
-- Those allow ANYONE (including anon) to read hidden rows and write.
--
-- This migration:
-- 1. Drops the permissive policies (if they exist)
-- 2. Creates restricted policies:
--    - Public: SELECT only on visible/enabled rows
--    - Admin writes: via service_role (bypasses RLS) or authenticated users
--      with admin role claim (checked via app_metadata)
-- 3. Is idempotent: safe to run multiple times

BEGIN;

-- Helper: check if current user has admin role via JWT app_metadata
-- (Supabase Auth: authenticated users have auth.jwt() -> app_metadata -> role)

-- ============================================================
-- categories
-- ============================================================
DROP POLICY IF EXISTS "categories_admin_all" ON categories;
DROP POLICY IF EXISTS "categories_public_read" ON categories;

-- Public: read visible categories only
CREATE POLICY "categories_public_read" ON categories
  FOR SELECT USING (is_visible = true);

-- Admin: full access for users with admin role in app_metadata
-- Service role bypasses RLS entirely (used by server APIs)
CREATE POLICY "categories_admin_write" ON categories
  FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','admin','content_manager')
  ) WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','admin','content_manager')
  );

-- ============================================================
-- category_products
-- ============================================================
DROP POLICY IF EXISTS "category_products_admin_all" ON category_products;

-- Public: read assignments for visible categories
CREATE POLICY "category_products_public_read" ON category_products
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM categories c WHERE c.id = category_id AND c.is_visible = true)
  );

-- Admin: full access
CREATE POLICY "category_products_admin_write" ON category_products
  FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','admin','content_manager')
  ) WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','admin','content_manager')
  );

-- ============================================================
-- navigation_menus
-- ============================================================
DROP POLICY IF EXISTS "navigation_admin_all" ON navigation_menus;
DROP POLICY IF EXISTS "navigation_public_read" ON navigation_menus;

-- Public: read enabled items only
CREATE POLICY "navigation_public_read" ON navigation_menus
  FOR SELECT USING (is_enabled = true);

-- Admin: full access
CREATE POLICY "navigation_admin_write" ON navigation_menus
  FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','admin','content_manager')
  ) WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','admin','content_manager')
  );

-- ============================================================
-- store_settings
-- ============================================================
DROP POLICY IF EXISTS "store_settings_admin_all" ON store_settings;

-- Public: read explicitly public settings only
-- (Private keys like API credentials must never be in this table)
CREATE POLICY "store_settings_public_read" ON store_settings
  FOR SELECT USING (
    key IN (
      'store_name','support_phone','support_email','address','whatsapp',
      'delivery_fee','free_delivery_threshold','cod_enabled','jazzcash_enabled',
      'bank_transfer_enabled','order_minimum','promo_message','maintenance_mode'
    )
  );

-- Admin: full access (owner/admin only for settings — content staff excluded)
CREATE POLICY "store_settings_admin_write" ON store_settings
  FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','admin')
  ) WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('owner','admin')
  );

COMMIT;
