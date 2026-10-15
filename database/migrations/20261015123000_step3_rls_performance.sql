-- Step 3 candidate only: review/approve before applying to production.
-- Replays safely. Original policy names, target roles, commands, row ownership,
-- and permissions are intentionally preserved. No AI activation or data writes.
-- Cache row-independent identity and staff helpers once per SQL statement.
ALTER POLICY addresses_own_all ON public.addresses
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
ALTER POLICY admin_roles_own_read ON public.admin_roles
  USING (user_id = (SELECT auth.uid()));
ALTER POLICY customers_own_read ON public.customers
  USING (user_id = (SELECT auth.uid()));
ALTER POLICY orders_customer_read ON public.orders
  USING (user_id = (SELECT auth.uid()));
ALTER POLICY order_items_customer_read ON public.order_items
  USING (order_id IN (SELECT o.id FROM public.orders AS o WHERE o.user_id = (SELECT auth.uid())));
ALTER POLICY reviews_own_read ON public.reviews
  USING (user_id = (SELECT auth.uid()));
ALTER POLICY media_write ON public.media
  USING ((SELECT public.staff_role()) = ANY (ARRAY['owner','manager','content']))
  WITH CHECK (
    (SELECT public.staff_role()) = ANY (ARRAY['owner','manager','content'])
    AND (uploaded_by = (SELECT auth.uid()) OR uploaded_by IS NULL)
  );
ALTER POLICY profiles_own_select ON public.profiles
  USING (id = (SELECT auth.uid()));
ALTER POLICY profiles_own_insert ON public.profiles
  WITH CHECK (id = (SELECT auth.uid()));
ALTER POLICY profiles_own_update ON public.profiles
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- Missing FK-leading indexes identified by the 15 Oct production database
-- advisor. Indexes support referential work without changing table contents.
-- Review available space and the current production schema before rollout.
CREATE INDEX IF NOT EXISTS step3_agent_events_job_idx ON chaskabox_agents.agent_events (job_id);
CREATE INDEX IF NOT EXISTS step3_category_products_product_idx ON public.category_products (product_id);
CREATE INDEX IF NOT EXISTS step3_customer_notification_outbox_order_idx ON public.customer_notification_outbox (order_id);
CREATE INDEX IF NOT EXISTS step3_navigation_menus_parent_idx ON public.navigation_menus (parent_id);
CREATE INDEX IF NOT EXISTS step3_orders_customer_idx ON public.orders (customer_id);
CREATE INDEX IF NOT EXISTS step3_orders_shipping_zone_idx ON public.orders (shipping_zone_id);
CREATE INDEX IF NOT EXISTS step3_products_brand_idx ON public.products (brand_id);
CREATE INDEX IF NOT EXISTS step3_reviews_order_idx ON public.reviews (order_id);
CREATE INDEX IF NOT EXISTS step3_reviews_user_idx ON public.reviews (user_id);
CREATE INDEX IF NOT EXISTS step3_wishlists_product_idx ON public.wishlists (product_id);
