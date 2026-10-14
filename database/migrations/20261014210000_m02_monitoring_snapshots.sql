-- M02: read-only aggregate signals. Apply only in approved M0-M05 release.
BEGIN;
CREATE OR REPLACE FUNCTION public.agent_m02_order_signals()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
 SELECT jsonb_build_object(
   'stale_new_orders', count(*) FILTER (
     WHERE fulfilment_status='new' AND created_at<=now()-interval '30 minutes'),
   'payment_reviews', count(*) FILTER (
     WHERE payment_status IN ('payment_submitted','pending_verification')
       AND fulfilment_status IS DISTINCT FROM 'cancelled'),
   'overdue_open_orders', count(*) FILTER (
     WHERE fulfilment_status IN ('new','sourcing','packed','dispatched')
       AND created_at<now()-interval '5 days'),
   'notification_failures', (
     SELECT count(*) FROM public.notification_deliveries
     WHERE status IN ('blocked','uncertain','dead')
        OR delivery_status IN ('failed','complained'))
 ) FROM public.orders;
$fn$;
REVOKE ALL ON FUNCTION public.agent_m02_order_signals() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_m02_order_signals() TO service_role;
CREATE OR REPLACE FUNCTION public.agent_m02_inventory_signals()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
 SELECT jsonb_build_object(
   'visible_unavailable',count(*) FILTER (
     WHERE visibility='visible' AND stock_state='unavailable'),
   'visible_sourced_after_order',count(*) FILTER (
     WHERE visibility='visible' AND stock_state='sourced_after_order'),
   'visible_unknown_stock',count(*) FILTER (
     WHERE visibility='visible' AND stock_state IS NULL),
   'visible_products',count(*) FILTER (WHERE visibility='visible'),
   'quantity_tracking_available',false
 ) FROM public.products;
$fn$;
REVOKE ALL ON FUNCTION public.agent_m02_inventory_signals() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_m02_inventory_signals() TO service_role;
COMMIT;
