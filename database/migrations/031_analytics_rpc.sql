-- ============================================================================
-- ChaskaBox — Migration 031: Analytics RPC functions (Phase 2B)
-- OFFLINE. Apply once in Supabase SQL Editor (production).
--
-- SECURITY DEFINER functions owned by postgres; they run with the owner's
-- rights regardless of caller. Execution is granted ONLY to service_role.
-- All admin analytics endpoints call these via POST /rest/v1/rpc/<name>
-- using the server-side service-role key. The browser never calls them.
--
-- Money is integer PKR everywhere. "Valid orders" = fulfilment_status <>
-- 'cancelled'. Recognized revenue = confirmed prepaid + delivered COD.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. analytics_revenue(p_from, p_to)
-- Revenue breakdown with plain-language definitions for tooltips.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_revenue(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gov           bigint := 0;
  v_prepaid       bigint := 0;
  v_delivered_cod bigint := 0;
  v_pending_cod   bigint := 0;
BEGIN
  SELECT COALESCE(SUM(total), 0) INTO v_gov
  FROM orders
  WHERE created_at >= p_from AND created_at < p_to
    AND fulfilment_status <> 'cancelled';

  SELECT COALESCE(SUM(total), 0) INTO v_prepaid
  FROM orders
  WHERE created_at >= p_from AND created_at < p_to
    AND fulfilment_status <> 'cancelled'
    AND payment_method IN ('jazzcash', 'bank_transfer')
    AND payment_status = 'payment_verified';

  SELECT COALESCE(SUM(total), 0) INTO v_delivered_cod
  FROM orders
  WHERE created_at >= p_from AND created_at < p_to
    AND payment_method = 'cod'
    AND fulfilment_status = 'delivered';

  SELECT COALESCE(SUM(total), 0) INTO v_pending_cod
  FROM orders
  WHERE created_at >= p_from AND created_at < p_to
    AND payment_method = 'cod'
    AND fulfilment_status NOT IN ('delivered', 'cancelled');

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
      'delivered_cod',      'Cash-on-delivery orders marked delivered. This cash has been collected.',
      'recognized_revenue', 'Money the store can count: confirmed_prepaid + delivered_cod.',
      'pending_cod',        'COD orders placed but not yet delivered (and not cancelled). Cash not yet collected.'
    )
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. analytics_overview(p_from, p_to)
-- Top cards + daily series + payment split + fulfilment funnel.
-- New customer = phone whose FIRST-EVER order falls inside the range.
-- Repeat customer = phone ordered before the range and again inside it.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_overview(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cards   jsonb;
  v_daily   jsonb;
  v_pay     jsonb;
  v_funnel  jsonb;
BEGIN
  WITH o AS (
    SELECT * FROM orders WHERE created_at >= p_from AND created_at < p_to
  ),
  valid AS (
    SELECT * FROM o WHERE fulfilment_status <> 'cancelled'
  ),
  range_phones AS (
    SELECT DISTINCT customer_phone AS phone FROM valid
    WHERE customer_phone IS NOT NULL AND btrim(customer_phone) <> ''
  ),
  first_ever AS (
    SELECT customer_phone AS phone, MIN(created_at) AS first_at
    FROM orders
    WHERE customer_phone IS NOT NULL AND btrim(customer_phone) <> ''
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'orders',             (SELECT COUNT(*) FROM valid),
    'gross_order_value',  (SELECT COALESCE(SUM(total), 0) FROM valid),
    'recognized_revenue', (SELECT COALESCE(SUM(total), 0) FROM valid
                           WHERE (payment_method IN ('jazzcash', 'bank_transfer')
                                  AND payment_status = 'payment_verified')
                              OR (payment_method = 'cod' AND fulfilment_status = 'delivered')),
    'pending_cod',        (SELECT COALESCE(SUM(total), 0) FROM valid
                           WHERE payment_method = 'cod' AND fulfilment_status <> 'delivered'),
    'confirmed_prepaid',  (SELECT COALESCE(SUM(total), 0) FROM valid
                           WHERE payment_method IN ('jazzcash', 'bank_transfer')
                             AND payment_status = 'payment_verified'),
    'delivered_cod',      (SELECT COALESCE(SUM(total), 0) FROM valid
                           WHERE payment_method = 'cod' AND fulfilment_status = 'delivered'),
    'average_order_value',(SELECT CASE WHEN COUNT(*) > 0 THEN ROUND(AVG(total)) ELSE 0 END FROM valid),
    'new_customers',      (SELECT COUNT(*) FROM range_phones r
                           JOIN first_ever f USING (phone) WHERE f.first_at >= p_from),
    'repeat_customers',   (SELECT COUNT(*) FROM range_phones r
                           JOIN first_ever f USING (phone) WHERE f.first_at < p_from),
    'cancelled_orders',   (SELECT COUNT(*) FROM o WHERE fulfilment_status = 'cancelled'),
    'cancellation_rate',  (SELECT CASE WHEN COUNT(*) > 0
                             THEN ROUND(100.0 * COUNT(*) FILTER (WHERE fulfilment_status = 'cancelled') / COUNT(*), 1)
                             ELSE 0 END FROM o),
    'currency', 'PKR'
  ) INTO v_cards;

  -- Daily revenue + orders series (one point per day in range).
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object('date', d.day::date,
                              'revenue', COALESCE(s.revenue, 0),
                              'orders',  COALESCE(s.orders, 0))
           ORDER BY d.day), '[]'::jsonb)
  INTO v_daily
  FROM (
    SELECT generate_series(date_trunc('day', p_from),
                           date_trunc('day', p_to) - interval '1 day',
                           interval '1 day') AS day
  ) d
  LEFT JOIN (
    SELECT date_trunc('day', created_at) AS day,
           SUM(total)::bigint AS revenue, COUNT(*)::bigint AS orders
    FROM orders
    WHERE created_at >= p_from AND created_at < p_to
      AND fulfilment_status <> 'cancelled'
    GROUP BY 1
  ) s ON s.day = d.day;

  -- Payment-method split (valid orders only).
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object('method', payment_method,
                              'orders', orders,
                              'gross_value', gross_value)
           ORDER BY gross_value DESC), '[]'::jsonb)
  INTO v_pay
  FROM (
    SELECT payment_method,
           COUNT(*)::bigint AS orders,
           SUM(total)::bigint AS gross_value
    FROM orders
    WHERE created_at >= p_from AND created_at < p_to
      AND fulfilment_status <> 'cancelled'
    GROUP BY 1
  ) t;

  -- Fulfilment funnel (all orders incl. cancelled as terminal stage).
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object('status', fulfilment_status, 'orders', orders)
           ORDER BY CASE fulfilment_status
             WHEN 'new' THEN 1 WHEN 'sourcing' THEN 2 WHEN 'packed' THEN 3
             WHEN 'dispatched' THEN 4 WHEN 'delivered' THEN 5
             WHEN 'cancelled' THEN 6 ELSE 7 END), '[]'::jsonb)
  INTO v_funnel
  FROM (
    SELECT fulfilment_status, COUNT(*)::bigint AS orders
    FROM orders
    WHERE created_at >= p_from AND created_at < p_to
    GROUP BY 1
  ) t;

  RETURN jsonb_build_object(
    'cards', v_cards,
    'daily', v_daily,
    'payment_split', v_pay,
    'funnel', v_funnel
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. analytics_products(p_from, p_to, p_sort, p_limit)
-- Per-product sales + trend + never-sold + missing-image lists.
-- Product names come from immutable order_items snapshots.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_products(
  p_from timestamptz, p_to timestamptz, p_sort text, p_limit int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows  jsonb;
  v_never jsonb;
  v_noimg jsonb;
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_sort  text := CASE lower(COALESCE(p_sort, 'units'))
                    WHEN 'revenue'    THEN 'revenue DESC'
                    WHEN 'recognized' THEN 'recognized_revenue DESC'
                    WHEN 'orders'     THEN 'orders DESC'
                    WHEN 'name'       THEN 'product_name ASC'
                    ELSE 'units DESC'
                  END;
BEGIN
  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(sub.payload), ''[]''::jsonb) FROM (' ||
    'SELECT jsonb_build_object(' ||
    '''product_id'', s.product_id, ''name'', s.product_name, ''units'', s.units, ' ||
    '''gross_value'', s.revenue, ''recognized_revenue'', COALESCE(s.recognized_revenue, 0), ' ||
    '''orders'', s.orders, ''units_last7'', COALESCE(s.units_last7, 0), ''units_prev7'', COALESCE(s.units_prev7, 0)' ||
    ') AS payload FROM (' ||
    'SELECT oi.product_id, MAX(oi.product_name) AS product_name, ' ||
    'SUM(oi.quantity)::bigint AS units, SUM(oi.line_total)::bigint AS revenue, ' ||
    'SUM(oi.line_total) FILTER (WHERE (o.payment_method IN (''jazzcash'',''bank_transfer'') ' ||
    'AND o.payment_status = ''payment_verified'' AND o.fulfilment_status <> ''cancelled'') ' ||
    'OR (o.payment_method = ''cod'' AND o.fulfilment_status = ''delivered''))::bigint AS recognized_revenue, ' ||
    'COUNT(DISTINCT o.id)::bigint AS orders, ' ||
    'SUM(oi.quantity) FILTER (WHERE o.created_at >= GREATEST($1, $2 - interval ''7 days''))::bigint AS units_last7, ' ||
    'SUM(oi.quantity) FILTER (WHERE o.created_at >= GREATEST($1, $2 - interval ''14 days'') ' ||
    'AND o.created_at < GREATEST($1, $2 - interval ''7 days''))::bigint AS units_prev7 ' ||
    'FROM order_items oi JOIN orders o ON o.id = oi.order_id ' ||
    'WHERE o.created_at >= $1 AND o.created_at < $2 AND o.fulfilment_status <> ''cancelled'' ' ||
    'GROUP BY oi.product_id) s ORDER BY %s LIMIT $3) sub',
    v_sort)
  USING p_from, p_to, v_limit
  INTO v_rows;

  -- Products never sold (any visibility except archived).
  SELECT jsonb_build_object(
           'count', (SELECT COUNT(*) FROM products p
                    WHERE p.visibility <> 'archived'
                      AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.id)),
           'sample', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                         'product_id', p.id, 'name', p.name, 'price', p.price)
                       ORDER BY p.name)
                     FROM (SELECT id, name, price FROM products p
                           WHERE p.visibility <> 'archived'
                             AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.id)
                           ORDER BY p.name LIMIT 20) p), '[]'::jsonb)
         )
  INTO v_never;

  -- Products missing images (visible catalogue only).
  SELECT jsonb_build_object(
           'count', (SELECT COUNT(*) FROM products p
                    WHERE p.visibility = 'visible'
                      AND (p.image_url IS NULL OR btrim(p.image_url) = '')),
           'sample', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                         'product_id', p.id, 'name', p.name)
                       ORDER BY p.name)
                     FROM (SELECT id, name FROM products p
                           WHERE p.visibility = 'visible'
                             AND (p.image_url IS NULL OR btrim(p.image_url) = '')
                           ORDER BY p.name LIMIT 20) p), '[]'::jsonb)
         )
  INTO v_noimg;

  RETURN jsonb_build_object(
    'products', v_rows,
    'never_sold', v_never,
    'missing_images', v_noimg,
    'currency', 'PKR'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. analytics_categories(p_from, p_to)
-- Per-category orders/units/revenue/AOV + top-3 products + 7d trend.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_categories(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH ps AS (
    SELECT COALESCE(NULLIF(btrim(p.category), ''), 'Uncategorized') AS category,
           oi.product_id,
           MAX(oi.product_name) AS product_name,
           SUM(oi.quantity)::bigint AS units,
           SUM(oi.line_total)::bigint AS revenue,
           COUNT(DISTINCT o.id)::bigint AS orders,
           SUM(oi.quantity) FILTER (
             WHERE o.created_at >= GREATEST(p_from, p_to - interval '7 days'))::bigint AS units_last7
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE o.created_at >= p_from AND o.created_at < p_to
      AND o.fulfilment_status <> 'cancelled'
    GROUP BY 1, 2
  )
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'category', c.category,
             'orders', c.orders,
             'units', c.units,
             'revenue', c.revenue,
             'aov', CASE WHEN c.orders > 0 THEN ROUND(c.revenue::numeric / c.orders) ELSE 0 END,
             'units_last7', c.units_last7,
             'top_products', c.top_products
           ) ORDER BY c.revenue DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT category,
           SUM(orders)::bigint AS orders,
           SUM(units)::bigint AS units,
           SUM(revenue)::bigint AS revenue,
           SUM(COALESCE(units_last7, 0))::bigint AS units_last7,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', t.product_name, 'units', t.units)
                                      ORDER BY t.units DESC), '[]'::jsonb)
            FROM (SELECT ps2.product_name, ps2.units
                  FROM ps ps2 WHERE ps2.category = ps.category
                  ORDER BY ps2.units DESC LIMIT 3) t) AS top_products
    FROM ps
    GROUP BY category
  ) c;

  RETURN jsonb_build_object('categories', v_result, 'currency', 'PKR');
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. analytics_brands(p_from, p_to)
-- Per-brand units/orders/value/AOV + logo + top products + 7d trend.
-- Brand key is the product brand text; brands table joined for logo/slug.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_brands(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH ps AS (
    SELECT COALESCE(NULLIF(btrim(p.brand), ''), 'Unbranded') AS brand,
           oi.product_id,
           MAX(oi.product_name) AS product_name,
           SUM(oi.quantity)::bigint AS units,
           SUM(oi.line_total)::bigint AS revenue,
           SUM(oi.line_total) FILTER (
             WHERE (o.payment_method IN ('jazzcash', 'bank_transfer')
                    AND o.payment_status = 'payment_verified'
                    AND o.fulfilment_status <> 'cancelled')
                OR (o.payment_method = 'cod' AND o.fulfilment_status = 'delivered')
           )::bigint AS recognized_revenue,
           COUNT(DISTINCT o.id)::bigint AS orders,
           SUM(oi.quantity) FILTER (
             WHERE o.created_at >= GREATEST(p_from, p_to - interval '7 days'))::bigint AS units_last7
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE o.created_at >= p_from AND o.created_at < p_to
      AND o.fulfilment_status <> 'cancelled'
    GROUP BY 1, 2
  )
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'brand', b.brand,
             'brand_id', b.brand_id,
             'logo_url', b.logo_url,
             'slug', b.slug,
             'orders', b.orders,
             'units', b.units,
             'gross_value', b.revenue,
             'recognized_revenue', COALESCE(b.recognized_revenue, 0),
             'aov', CASE WHEN b.orders > 0 THEN ROUND(b.revenue::numeric / b.orders) ELSE 0 END,
             'units_last7', b.units_last7,
             'top_products', b.top_products
           ) ORDER BY b.revenue DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT ps.brand,
           MAX(br.id) AS brand_id,
           MAX(br.logo_url) AS logo_url,
           MAX(br.slug) AS slug,
           SUM(ps.orders)::bigint AS orders,
           SUM(ps.units)::bigint AS units,
           SUM(ps.revenue)::bigint AS revenue,
           SUM(COALESCE(ps.recognized_revenue, 0))::bigint AS recognized_revenue,
           SUM(COALESCE(ps.units_last7, 0))::bigint AS units_last7,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', t.product_name, 'units', t.units)
                                      ORDER BY t.units DESC), '[]'::jsonb)
            FROM (SELECT ps2.product_name, ps2.units
                  FROM ps ps2 WHERE ps2.brand = ps.brand
                  ORDER BY ps2.units DESC LIMIT 3) t) AS top_products
    FROM ps
    LEFT JOIN brands br ON br.name = ps.brand
    GROUP BY ps.brand
  ) b;

  RETURN jsonb_build_object('brands', v_result, 'currency', 'PKR');
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. analytics_customers(p_from, p_to)
-- New vs repeat, repeat rate, orders/customer, top customers (PII masked).
-- Masking: "Rameez Ahmed" -> "Rameez A.", phone -> last 4 digits only.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_customers(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_summary jsonb;
  v_top     jsonb;
BEGIN
  WITH valid AS (
    SELECT * FROM orders
    WHERE created_at >= p_from AND created_at < p_to
      AND fulfilment_status <> 'cancelled'
      AND customer_phone IS NOT NULL AND btrim(customer_phone) <> ''
  ),
  first_ever AS (
    SELECT customer_phone AS phone, MIN(created_at) AS first_at
    FROM orders
    WHERE customer_phone IS NOT NULL AND btrim(customer_phone) <> ''
    GROUP BY 1
  ),
  phones AS (
    SELECT DISTINCT customer_phone AS phone FROM valid
  )
  SELECT jsonb_build_object(
           'new_customers',    (SELECT COUNT(*) FROM phones r
                                JOIN first_ever f USING (phone) WHERE f.first_at >= p_from),
           'repeat_customers', (SELECT COUNT(*) FROM phones r
                                JOIN first_ever f USING (phone) WHERE f.first_at < p_from),
           'repeat_rate_pct',  (SELECT CASE WHEN COUNT(*) > 0 THEN
                                  ROUND(100.0 * COUNT(*) FILTER (WHERE f.first_at < p_from) / COUNT(*), 1)
                                ELSE 0 END
                                FROM phones r JOIN first_ever f USING (phone)),
           'orders_per_customer', (SELECT CASE WHEN COUNT(DISTINCT customer_phone) > 0
                                    THEN ROUND(COUNT(*)::numeric / COUNT(DISTINCT customer_phone), 2)
                                    ELSE 0 END FROM valid),
           'distinct_customers', (SELECT COUNT(*) FROM phones)
         )
  INTO v_summary;

  -- Top customers by recognized spend, PII masked server-side.
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'name', t.display_name,
             'phone', t.phone_masked,
             'orders', t.orders,
             'recognized_spend', t.recognized_spend,
             'gross_spend', t.gross_spend,
             'last_purchase', t.last_purchase
           ) ORDER BY t.recognized_spend DESC NULLS LAST), '[]'::jsonb)
  INTO v_top
  FROM (
    SELECT
      CASE
        WHEN btrim(o.customer_name) = '' OR o.customer_name IS NULL THEN 'Customer'
        ELSE split_part(btrim(o.customer_name), ' ', 1) ||
             CASE WHEN position(' ' IN btrim(o.customer_name)) > 0
                  THEN ' ' || left(split_part(btrim(o.customer_name), ' ', 2), 1) || '.'
                  ELSE '' END
      END AS display_name,
      ('*** *** ' || right(regexp_replace(o.customer_phone, '\D', '', 'g'), 4)) AS phone_masked,
      COUNT(*)::bigint AS orders,
      SUM(o.total) FILTER (
        WHERE (o.payment_method IN ('jazzcash', 'bank_transfer')
               AND o.payment_status = 'payment_verified')
           OR (o.payment_method = 'cod' AND o.fulfilment_status = 'delivered')
      )::bigint AS recognized_spend,
      SUM(o.total)::bigint AS gross_spend,
      MAX(o.created_at) AS last_purchase
    FROM orders o
    WHERE o.created_at >= p_from AND o.created_at < p_to
      AND o.fulfilment_status <> 'cancelled'
    GROUP BY 1, 2
    ORDER BY recognized_spend DESC NULLS LAST
    LIMIT 20
  ) t;

  RETURN jsonb_build_object(
    'summary', v_summary,
    'top_customers', v_top,
    'currency', 'PKR',
    'privacy_note', 'Names are shortened (first name + last initial) and phones show only the last 4 digits.'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. analytics_shipping(p_from, p_to)
-- Fulfillment stage durations (hours) from order_status_events timeline.
-- Only stages actually reached are counted.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_shipping(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH stage AS (
    SELECT order_id,
      MIN(created_at) FILTER (WHERE event_type = 'fulfilment_status' AND new_status = 'packed')     AS packed_at,
      MIN(created_at) FILTER (WHERE event_type = 'fulfilment_status' AND new_status = 'dispatched') AS dispatched_at,
      MIN(created_at) FILTER (WHERE event_type = 'fulfilment_status' AND new_status = 'delivered')   AS delivered_at
    FROM order_status_events
    GROUP BY order_id
  ),
  joined AS (
    SELECT o.id, o.created_at, s.packed_at, s.dispatched_at, s.delivered_at
    FROM orders o
    JOIN stage s ON s.order_id = o.id::text
    WHERE o.created_at >= p_from AND o.created_at < p_to
      AND o.fulfilment_status <> 'cancelled'
  )
  SELECT jsonb_build_object(
           'avg_hours_order_to_packed',     ROUND(AVG(EXTRACT(EPOCH FROM (packed_at - created_at)) / 3600)::numeric, 1),
           'avg_hours_packed_to_dispatched',ROUND(AVG(EXTRACT(EPOCH FROM (dispatched_at - packed_at)) / 3600)::numeric, 1),
           'avg_hours_dispatched_to_delivered', ROUND(AVG(EXTRACT(EPOCH FROM (delivered_at - dispatched_at)) / 3600)::numeric, 1),
           'avg_hours_total_fulfillment',   ROUND(AVG(EXTRACT(EPOCH FROM (delivered_at - created_at)) / 3600)::numeric, 1),
           'orders_reaching_packed',     COUNT(packed_at),
           'orders_reaching_dispatched', COUNT(dispatched_at),
           'orders_reaching_delivered',  COUNT(delivered_at),
           'orders_in_range',            COUNT(*),
           'note', 'Averages use only orders that actually reached each stage. Hours.'
         )
  INTO v_result
  FROM joined;

  RETURN COALESCE(v_result,
    jsonb_build_object('note', 'No fulfillment stage data in this range.'));
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. analytics_issues(p_from, p_to)
-- Resolution/refund case stats from resolution_cases.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_issues(p_from timestamptz, p_to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
           'by_status', (SELECT COALESCE(jsonb_object_agg(status, cnt), '{}'::jsonb)
                         FROM (SELECT status, COUNT(*)::bigint AS cnt
                               FROM resolution_cases
                               WHERE created_at >= p_from AND created_at < p_to
                               GROUP BY 1) t),
           'by_issue_type', (SELECT COALESCE(jsonb_object_agg(issue_type, cnt), '{}'::jsonb)
                             FROM (SELECT issue_type, COUNT(*)::bigint AS cnt
                                   FROM resolution_cases
                                   WHERE created_at >= p_from AND created_at < p_to
                                   GROUP BY 1) t),
           'total_cases', (SELECT COUNT(*) FROM resolution_cases
                            WHERE created_at >= p_from AND created_at < p_to),
           'open_cases',  (SELECT COUNT(*) FROM resolution_cases
                            WHERE status IN ('open', 'in_progress')),
           'avg_resolution_hours', (SELECT ROUND(
                                      AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)::numeric, 1)
                                    FROM resolution_cases
                                    WHERE created_at >= p_from AND created_at < p_to
                                      AND resolved_at IS NOT NULL),
           'total_refund_amount', (SELECT COALESCE(SUM(refund_amount), 0) FROM resolution_cases
                                   WHERE created_at >= p_from AND created_at < p_to),
           'issue_rate_per_100_orders', (
              SELECT CASE WHEN (SELECT COUNT(*) FROM orders
                                WHERE created_at >= p_from AND created_at < p_to
                                  AND fulfilment_status <> 'cancelled') > 0
                     THEN ROUND(100.0 *
                          (SELECT COUNT(*) FROM resolution_cases
                           WHERE created_at >= p_from AND created_at < p_to) /
                          (SELECT COUNT(*) FROM orders
                           WHERE created_at >= p_from AND created_at < p_to
                             AND fulfilment_status <> 'cancelled'), 2)
                     ELSE 0 END),
           'currency', 'PKR'
         )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. analytics_notifications()
-- Owner + customer notification outbox status; order-level flags (30d).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_notifications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
           'owner_outbox', (SELECT COALESCE(jsonb_object_agg(status, cnt), '{}'::jsonb)
                            FROM (SELECT status, COUNT(*)::bigint AS cnt
                                  FROM notification_outbox GROUP BY 1) t),
           'owner_outbox_retrying', (SELECT COUNT(*) FROM notification_outbox
                                     WHERE status IN ('pending', 'processing', 'retry')),
           'owner_outbox_dead',     (SELECT COUNT(*) FROM notification_outbox
                                     WHERE status = 'dead'),
           'customer_outbox', (SELECT COALESCE(jsonb_object_agg(status, cnt), '{}'::jsonb)
                               FROM (SELECT status, COUNT(*)::bigint AS cnt
                                     FROM customer_notification_outbox GROUP BY 1) t),
           'customer_outbox_dead', (SELECT COUNT(*) FROM customer_notification_outbox
                                    WHERE status = 'dead'),
           'last_30d_orders', (SELECT jsonb_build_object(
                                  'total', COUNT(*),
                                  'email_sent', COUNT(*) FILTER (WHERE email_sent),
                                  'email_failed', COUNT(*) FILTER (WHERE NOT email_sent AND email_error IS NOT NULL),
                                  'whatsapp_sent', COUNT(*) FILTER (WHERE whatsapp_sent),
                                  'whatsapp_failed', COUNT(*) FILTER (WHERE NOT whatsapp_sent AND whatsapp_error IS NOT NULL)
                                )
                                FROM orders
                                WHERE created_at >= now() - interval '30 days'),
           'note', 'Separate counters for owner alerts (notification_outbox) and customer updates (customer_notification_outbox).'
         )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. analytics_attention()
-- Needs-attention items computed from real data. No fake urgency:
-- an item appears only when its count > 0.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_attention()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items jsonb;
BEGIN
  WITH items AS (
    -- 1. Notification failures in last 7 days.
    SELECT 'notification_failures'::text AS type, 'high'::text AS severity,
           'Notification failures (7d)'::text AS title,
           (cnt::text || ' order(s) in the last 7 days failed email/WhatsApp notification.')::text AS detail,
           cnt, '/admin#notifications'::text AS link
    FROM (SELECT COUNT(*)::bigint AS cnt FROM orders
          WHERE created_at >= now() - interval '7 days'
            AND ((NOT email_sent AND email_error IS NOT NULL)
              OR (NOT whatsapp_sent AND whatsapp_error IS NOT NULL))) t
    WHERE cnt > 0
    UNION ALL
    -- 2. Products missing images (visible catalogue).
    SELECT 'missing_images', 'medium',
           'Products missing images',
           (cnt::text || ' visible product(s) have no image. Examples: ' ||
            COALESCE(sample_names, '—')),
           cnt, '/admin#products'
    FROM (SELECT COUNT(*)::bigint AS cnt,
                 string_agg(name, ', ' ORDER BY name) AS sample_names
          FROM (SELECT name FROM products
                WHERE visibility = 'visible'
                  AND (image_url IS NULL OR btrim(image_url) = '')
                ORDER BY name LIMIT 3) s) t
    WHERE cnt > 0
    UNION ALL
    -- 3. Orders stuck > 5 days in a non-delivered state.
    SELECT 'stuck_orders', 'high',
           'Orders stuck over 5 days',
           (cnt::text || ' order(s) stuck in fulfilment for 5+ days. Oldest: ' ||
            COALESCE(oldest_numbers, '—')),
           cnt, '/admin#orders'
    FROM (SELECT COUNT(*)::bigint AS cnt,
                 string_agg(order_number, ', ' ORDER BY created_at) AS oldest_numbers
          FROM (SELECT order_number, created_at FROM orders
                WHERE fulfilment_status IN ('new', 'sourcing', 'packed', 'dispatched')
                  AND created_at < now() - interval '5 days'
                ORDER BY created_at LIMIT 5) s) t
    WHERE cnt > 0
    UNION ALL
    -- 4. Broken Chaska Boxes (bundle product with zero components).
    SELECT 'broken_boxes', 'medium',
           'Chaska Boxes with no items',
           (cnt::text || ' box(es) have no products: ' || COALESCE(sample_names, '—')),
           cnt, '/admin#boxes'
    FROM (SELECT COUNT(*)::bigint AS cnt,
                 string_agg(name, ', ' ORDER BY name) AS sample_names
          FROM (SELECT p.name FROM products p
                WHERE p.is_bundle AND p.visibility <> 'archived'
                  AND NOT EXISTS (SELECT 1 FROM bundle_items bi
                                  WHERE bi.bundle_product_id = p.id)
                ORDER BY p.name LIMIT 5) s) t
    WHERE cnt > 0
    UNION ALL
    -- 5. Visible products with zero sales in last 30 days.
    SELECT 'low_sellers_30d', 'low',
           'No sales in 30 days',
           (cnt::text || ' visible product(s) sold 0 units in the last 30 days.'),
           cnt, '/admin#products'
    FROM (SELECT COUNT(*)::bigint AS cnt FROM products p
          WHERE p.visibility = 'visible' AND NOT p.is_bundle
            AND NOT EXISTS (SELECT 1 FROM order_items oi
                            JOIN orders o ON o.id = oi.order_id
                            WHERE oi.product_id = p.id
                              AND o.created_at >= now() - interval '30 days'
                              AND o.fulfilment_status <> 'cancelled')) t
    WHERE cnt > 0
    UNION ALL
    -- 6. Dead notification outbox entries.
    SELECT 'dead_notifications', 'medium',
           'Dead notification queue entries',
           (cnt::text || ' notification(s) exhausted retries (dead).'),
           cnt, '/admin#notifications'
    FROM (SELECT (SELECT COUNT(*) FROM notification_outbox WHERE status = 'dead') +
                 (SELECT COUNT(*) FROM customer_notification_outbox WHERE status = 'dead') AS cnt) t
    WHERE cnt > 0
  )
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object('type', type, 'severity', severity, 'title', title,
                              'detail', detail, 'count', cnt, 'link', link)
           ORDER BY CASE severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                    cnt DESC),
         '[]'::jsonb)
  INTO v_items
  FROM items;

  RETURN jsonb_build_object('generated_at', now(), 'items', v_items);
END;
$$;

-- ----------------------------------------------------------------------------
-- Grants: service_role only. Revoke public access explicitly.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'analytics_revenue(timestamptz,timestamptz)',
    'analytics_overview(timestamptz,timestamptz)',
    'analytics_products(timestamptz,timestamptz,text,int)',
    'analytics_categories(timestamptz,timestamptz)',
    'analytics_brands(timestamptz,timestamptz)',
    'analytics_customers(timestamptz,timestamptz)',
    'analytics_shipping(timestamptz,timestamptz)',
    'analytics_issues(timestamptz,timestamptz)',
    'analytics_notifications()',
    'analytics_attention()'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END;
$$;
