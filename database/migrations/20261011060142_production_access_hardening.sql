-- Process 01: server-only CMS writes, private analytics, verified recipient
-- ownership, and no parallel customer/staff REST mutation paths.
-- Existing staff APIs use service_role after checking the caller's live role.
-- This migration does not alter customer order contents or staff memberships.

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.navigation_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- Preserve policy identities while restricting their principals. There is no
-- need to delete policies or reopen write access during this release.
DO $policies$
DECLARE p record;
BEGIN
  FOR p IN SELECT * FROM (VALUES
    ('categories','categories_admin_all'),
    ('category_products','category_products_admin_all'),
    ('navigation_menus','navigation_admin_all'),
    ('store_settings','store_settings_admin_all'),
    ('orders','orders_staff_update'),
    ('audit_log','audit_log_insert'),
    ('admin_roles','admin_roles_owner_write'),
    ('reviews','reviews_insert'),
    ('reviews','reviews_moderate'),
    ('reviews','reviews_owner_delete')
  ) AS restricted(table_name, policy_name)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_policies
      WHERE schemaname = 'public' AND tablename = p.table_name
        AND policyname = p.policy_name) THEN
      EXECUTE format('ALTER POLICY %I ON public.%I TO service_role', p.policy_name, p.table_name);
    END IF;
  END LOOP;
END;
$policies$;

REVOKE ALL ON public.categories, public.category_products,
  public.navigation_menus, public.store_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.categories, public.category_products,
  public.navigation_menus TO anon, authenticated;
GRANT ALL ON public.categories, public.category_products,
  public.navigation_menus, public.store_settings TO service_role;

DO $reads$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public'
    AND tablename='categories' AND policyname='categories_public_read') THEN
    CREATE POLICY categories_public_read ON public.categories FOR SELECT
      TO anon, authenticated USING (is_visible = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public'
    AND tablename='navigation_menus' AND policyname='navigation_public_read') THEN
    CREATE POLICY navigation_public_read ON public.navigation_menus FOR SELECT
      TO anon, authenticated USING (is_enabled = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public'
    AND tablename='category_products' AND policyname='category_products_public_read') THEN
    CREATE POLICY category_products_public_read ON public.category_products
      FOR SELECT TO anon, authenticated USING (
        EXISTS (SELECT 1 FROM public.categories c
                WHERE c.id = category_id AND c.is_visible = true)
        AND EXISTS (SELECT 1 FROM public.products p
                    WHERE p.id = product_id AND p.visibility = 'visible')
      );
  END IF;
END;
$reads$;

-- Revoke PUBLIC as well as the explicit anon/authenticated grants. Revoking
-- anon alone leaves inherited PUBLIC execution and customer execution intact.
DO $hardening$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'analytics\_%' ESCAPE '\'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.signature);
  END LOOP;
END;
$hardening$;

-- All these writes must pass the authenticated server API's business rules.
-- Approved/own review and own-order SELECT policies remain in place.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON
  public.orders, public.audit_log, public.admin_roles, public.reviews
  FROM PUBLIC, anon, authenticated;

-- Email confirmation is enabled on the production Auth service. Read the
-- confirmed identity from auth.users; profile phones and user_metadata are
-- deliberately excluded. Each original guest order can be bound only once.
-- Historical orders with no recipient email require support verification.
CREATE OR REPLACE FUNCTION public.link_guest_orders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $claim$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_linked integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(u.email)) INTO v_email
  FROM auth.users u
  WHERE u.id = v_user_id AND u.email_confirmed_at IS NOT NULL
    AND coalesce(u.is_anonymous, false) = false;
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Confirm your account email before linking past orders'
      USING ERRCODE = '42501';
  END IF;
  UPDATE public.orders o
  SET user_id = v_user_id
  WHERE o.user_id IS NULL
    AND lower(btrim(o.customer_email)) = v_email;
  GET DIAGNOSTICS v_linked = ROW_COUNT;
  RETURN jsonb_build_object('linked', v_linked, 'ownership', 'confirmed_email');
END;
$claim$;
REVOKE ALL ON FUNCTION public.link_guest_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_guest_orders() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
