-- Safeguard: classify testing checkouts without modifying order, delivery or payment histories.
-- The notification Worker remains the sole outbound sender.
BEGIN;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS test_reason text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS owner_reviewed_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS owner_reviewed_by uuid;
CREATE INDEX IF NOT EXISTS orders_real_created_idx ON public.orders (created_at DESC) WHERE is_test = false;
UPDATE public.orders SET is_test=true, test_reason = 'Historical checkout classified as test on 2026-10-23'
WHERE order_number IN (
'CB-091026-85646','CB-091026-63699','CB-091026-27165',
'CB-101026-36041','CB-141026-57864',
'CB-161026-19240','CB-161026-45420','CB-161026-14378',
'CB-161026-42254','CB-171026-54059'
) AND is_test = false;
CREATE OR REPLACE FUNCTION public.admin_attention_summary()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 WITH needs AS(
  SELECT o.*,'payment_review'::text reason FROM public.orders o WHERE NOT o.is_test AND payment_status IN('payment_submitted','pending_verification') AND fulfilment_status<>'cancelled'
  UNION ALL SELECT o.*,'stale_new_order' FROM public.orders o WHERE NOT o.is_test AND fulfilment_status='new' AND created_at<=now()-interval '30 minutes'
  UNION ALL SELECT o.*,'notification_failed' FROM public.orders o WHERE NOT o.is_test AND EXISTS(
   SELECT 1 FROM public.notification_deliveries d WHERE d.order_id=o.id AND (d.status IN('blocked','uncertain','dead') OR d.delivery_status IN('failed','complained')))
  UNION ALL SELECT o.*,'unreviewed_real_order' FROM public.orders o WHERE NOT o.is_test AND o.owner_reviewed_at IS NULL AND o.created_at <= now()-interval '15 minutes'
 ),samples AS(SELECT id,order_number,customer_name,customer_phone,total,payment_method,payment_status,fulfilment_status,created_at,
  greatest(0,floor(extract(epoch FROM now()-created_at)/60))::int age_minutes,reason FROM needs ORDER BY created_at,id,reason LIMIT 60),
 stats AS(SELECT public.notification_summary() n)
 SELECT jsonb_build_object('generated_at',now(),'counts',jsonb_build_object(
 'new_orders',(SELECT count(*) FROM public.orders WHERE NOT is_test AND fulfilment_status='new'),
 'payment_review',(SELECT count(*) FROM needs WHERE reason='payment_review'),
 'stale_new_orders',(SELECT count(*) FROM needs WHERE reason='stale_new_order'),
 'unreviewed_orders',(SELECT count(*) FROM needs WHERE reason='unreviewed_real_order'),
 'notification_issues',(SELECT count(*) FROM public.notification_deliveries d JOIN public.orders o ON o.id=d.order_id WHERE NOT o.is_test AND (d.status IN('blocked','uncertain','dead') OR d.delivery_status IN('failed','complained'))),'outbox',n->'owner_outbox','customer_outbox',n->'customer_outbox'),
 'needs_attention',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM samples s),'[]'),
 'needs_attention_total',(SELECT count(*) FROM needs),'sample_limit',60) FROM stats $function$
;

CREATE OR REPLACE FUNCTION public.admin_dashboard_metrics(p_days integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE result jsonb;BEGIN
 IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 365 THEN RAISE EXCEPTION 'Invalid metrics range';END IF;
 SELECT jsonb_build_object('period_days',p_days,'orders',count(*),
 'new_orders',count(*) FILTER(WHERE fulfilment_status='new'),
 'delivered_orders',count(*) FILTER(WHERE fulfilment_status='delivered'),
 'cancelled_orders',count(*) FILTER(WHERE fulfilment_status='cancelled'),
 'gross_order_value_pkr',coalesce(sum(total) FILTER(WHERE fulfilment_status<>'cancelled'),0),
 'recognized_sales_pkr',coalesce(sum(total) FILTER(WHERE fulfilment_status<>'cancelled' AND payment_status<>'refunded'
 AND ((payment_method='cod' AND fulfilment_status='delivered') OR (payment_method<>'cod' AND payment_status='payment_verified'))),0),
 'verified_prepaid_sales_pkr',coalesce(sum(total) FILTER(WHERE fulfilment_status<>'cancelled' AND payment_method<>'cod' AND payment_status='payment_verified'),0),
 'delivered_cod_sales_pkr',coalesce(sum(total) FILTER(WHERE payment_method='cod' AND fulfilment_status='delivered' AND payment_status<>'refunded'),0),
 'pending_prepaid_value_pkr',coalesce(sum(total) FILTER(WHERE fulfilment_status<>'cancelled' AND payment_method<>'cod' AND payment_status IN('awaiting_payment','payment_submitted')),0))
 INTO result FROM public.orders WHERE NOT is_test AND created_at>=now()-make_interval(days=>p_days);
 RETURN result;
END $function$
;

CREATE OR REPLACE FUNCTION public.analytics_overview(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rev jsonb;
  v_cards jsonb;
  v_daily jsonb := '[]'::jsonb;
  v_pay jsonb := '[]'::jsonb;
  v_funnel jsonb := '[]'::jsonb;
  v_ord int := 0;
  v_gov2 bigint := 0;
  v_aov numeric := 0;
  v_can int := 0;
  v_new int := 0;
  v_repeat int := 0;
BEGIN
  SELECT public.analytics_revenue(p_from, p_to) INTO v_rev;

  SELECT COUNT(*), COALESCE(SUM(total),0), CASE WHEN COUNT(*)>0 THEN ROUND(AVG(total)) ELSE 0 END
  INTO v_ord, v_gov2, v_aov FROM orders WHERE NOT is_test AND created_at>=p_from AND created_at<p_to AND fulfilment_status<>'cancelled';
  SELECT COUNT(*) INTO v_can FROM orders WHERE NOT is_test AND created_at>=p_from AND created_at<p_to AND fulfilment_status='cancelled';

  -- New/repeat: simpler approach with NOT EXISTS
  BEGIN
    SELECT COUNT(*) INTO v_new FROM (
      SELECT DISTINCT customer_phone FROM orders
      WHERE NOT is_test AND created_at>=p_from AND created_at<p_to
      AND customer_phone IS NOT NULL AND btrim(customer_phone)<>''
      AND NOT EXISTS (
        SELECT 1 FROM orders o2
        WHERE NOT o2.is_test AND o2.customer_phone = orders.customer_phone
        AND o2.created_at < p_from
      )
    ) t;
    SELECT COUNT(*) INTO v_repeat FROM (
      SELECT DISTINCT customer_phone FROM orders
      WHERE NOT is_test AND created_at>=p_from AND created_at<p_to
      AND customer_phone IS NOT NULL AND btrim(customer_phone)<>''
      AND EXISTS (
        SELECT 1 FROM orders o2
        WHERE NOT o2.is_test AND o2.customer_phone = orders.customer_phone
        AND o2.created_at < p_from
      )
    ) t;
  END;

  v_cards := jsonb_build_object(
    'orders', v_ord,
    'gross_order_value', COALESCE((v_rev->>'gross_order_value')::bigint, v_gov2),
    'recognized_revenue', COALESCE((v_rev->>'recognized_revenue')::bigint, 0),
    'pending_cod', COALESCE((v_rev->>'pending_cod')::bigint, 0),
    'confirmed_prepaid', COALESCE((v_rev->>'confirmed_prepaid')::bigint, 0),
    'delivered_cod', COALESCE((v_rev->>'delivered_cod')::bigint, 0),
    'average_order_value', v_aov,
    'new_customers', v_new,
    'repeat_customers', v_repeat,
    'cancelled_orders', v_can,
    'cancellation_rate', CASE WHEN (v_ord+v_can)>0 THEN ROUND(100.0*v_can/(v_ord+v_can),1) ELSE 0 END,
    'currency', 'PKR'
  );

  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('date',to_char(d.day,'YYYY-MM-DD'),'revenue',COALESCE(s.revenue,0),'orders',COALESCE(s.orders,0)) ORDER BY d.day),'[]'::jsonb)
    INTO v_daily FROM (SELECT generate_series(date_trunc('day',p_from AT TIME ZONE 'Asia/Karachi'),date_trunc('day',p_to AT TIME ZONE 'Asia/Karachi')-interval '1 day',interval '1 day') AS day) d
    LEFT JOIN (SELECT date_trunc('day',created_at AT TIME ZONE 'Asia/Karachi') AS day, SUM(total)::bigint AS revenue, COUNT(*)::bigint AS orders FROM orders WHERE NOT is_test AND created_at>=p_from AND created_at<p_to AND fulfilment_status<>'cancelled' GROUP BY 1) s ON s.day=d.day;
  END;

  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('method',payment_method,'orders',orders,'gross_value',gross_value) ORDER BY gross_value DESC),'[]'::jsonb)
    INTO v_pay FROM (SELECT payment_method, COUNT(*)::bigint AS orders, SUM(total)::bigint AS gross_value FROM orders WHERE NOT is_test AND created_at>=p_from AND created_at<p_to AND fulfilment_status<>'cancelled' GROUP BY 1) t;
  END;

  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('status',fulfilment_status,'orders',orders) ORDER BY CASE fulfilment_status WHEN 'new' THEN 1 WHEN 'sourcing' THEN 2 WHEN 'packed' THEN 3 WHEN 'dispatched' THEN 4 WHEN 'delivered' THEN 5 WHEN 'cancelled' THEN 6 ELSE 7 END),'[]'::jsonb)
    INTO v_funnel FROM (SELECT fulfilment_status, COUNT(*)::bigint AS orders FROM orders WHERE NOT is_test AND created_at>=p_from AND created_at<p_to GROUP BY 1) t;
  END;

  RETURN jsonb_build_object('cards',v_cards,'daily',v_daily,'payment_split',v_pay,'funnel',v_funnel);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_revenue(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_gov           bigint := 0;
  v_prepaid       bigint := 0;
  v_delivered_cod bigint := 0;
  v_pending_cod   bigint := 0;
BEGIN
  SELECT COALESCE(SUM(total), 0) INTO v_gov
  FROM orders
  WHERE NOT is_test AND created_at >= p_from AND created_at < p_to
    AND fulfilment_status <> 'cancelled';

  SELECT COALESCE(SUM(total), 0) INTO v_prepaid
  FROM orders
  WHERE NOT is_test AND created_at >= p_from AND created_at < p_to
    AND fulfilment_status <> 'cancelled'
    AND payment_method IN ('jazzcash', 'bank_transfer')
    AND payment_status = 'payment_verified';

  SELECT COALESCE(SUM(total), 0) INTO v_delivered_cod
  FROM orders
  WHERE NOT is_test AND created_at >= p_from AND created_at < p_to
    AND payment_method = 'cod'
    AND fulfilment_status = 'delivered' AND payment_status<>'refunded';

  SELECT COALESCE(SUM(total), 0) INTO v_pending_cod
  FROM orders
  WHERE NOT is_test AND created_at >= p_from AND created_at < p_to
    AND payment_method = 'cod'
    AND fulfilment_status NOT IN ('delivered', 'cancelled') AND payment_status<>'refunded';

  RETURN jsonb_build_object(
    'gross_order_value',  v_gov,
    'confirmed_prepaid',  v_prepaid,
    'delivered_cod',      v_delivered_cod,
    'recognized_revenue', v_prepaid + v_delivered_cod,
    'pending_cod',        v_pending_cod,
    'currency', 'PKR',
    'definitions', jsonb_build_object(
      'gross_order_value',  'Value of all valid placed orders in the period. Cancelled orders are excluded.',
      'confirmed_prepaid',  'JazzCash / Bank Transfer orders whose payment was verified by staff (payment_status = payment_verified). Cancelled orders excluded.',
      'delivered_cod',      'Cash-on-delivery orders marked delivered. Refunded orders are excluded; collection is inferred from delivered status.',
      'recognized_revenue', 'Money the store can count: confirmed_prepaid + delivered_cod.',
      'pending_cod',        'COD orders placed but not yet delivered (and not cancelled). Cash not yet collected.'
    )
  );
END;
$function$
;
COMMIT;
