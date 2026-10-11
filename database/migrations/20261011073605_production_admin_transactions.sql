-- Service-only mutation boundary: decisions, writes and audit share one transaction.
CREATE OR REPLACE FUNCTION public.admin_order_mutate(
 p_actor uuid, p_order uuid, p_action text, p_value text DEFAULT '',
 p_note text DEFAULT '', p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE o public.orders%ROWTYPE; v_role text; v_action text; v_note text; v_before jsonb;
BEGIN
 SELECT role INTO v_role FROM public.admin_roles WHERE user_id=p_actor AND active FOR SHARE;
 IF v_role IS NULL OR v_role NOT IN ('owner','manager','fulfilment') THEN
  RETURN jsonb_build_object('error','Active order staff required','code','FORBIDDEN_ROLE','status',403);
 END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','Order not found','code','NOT_FOUND','status',404); END IF;
 IF p_expected_updated_at IS NOT NULL AND o.updated_at IS DISTINCT FROM p_expected_updated_at THEN
  RETURN jsonb_build_object('error','Order changed. Reload before trying again.','code','STALE_ORDER','status',409);
 END IF;
 v_before=to_jsonb(o); v_note=btrim(coalesce(p_note,''));
 IF p_action='status' THEN
  IF p_value IS NULL OR NOT ((o.fulfilment_status='new' AND p_value='sourcing') OR
    (o.fulfilment_status='sourcing' AND p_value='packed') OR
    (o.fulfilment_status='packed' AND p_value='dispatched') OR
    (o.fulfilment_status='dispatched' AND p_value='delivered') OR
    (o.fulfilment_status NOT IN ('delivered','cancelled') AND p_value='cancelled')) THEN
   RETURN jsonb_build_object('error','Status transition is not allowed','code','INVALID_TRANSITION','status',409);
  END IF;
  IF p_value='cancelled' AND (length(v_note)<3 OR length(v_note)>500) THEN
   RETURN jsonb_build_object('error','Cancellation reason must be 3..500 characters','code','CANCEL_REASON_REQUIRED','status',400);
  END IF;
  IF p_value IN ('packed','dispatched','delivered') AND NOT
    ((o.payment_method='cod' AND o.payment_status='cod_due') OR
     (o.payment_method IN ('jazzcash','bank_transfer') AND o.payment_status='payment_verified')) THEN
   RETURN jsonb_build_object('error','Payment is not cleared','code','PAYMENT_NOT_CLEARED','status',422);
  END IF;
  UPDATE public.orders SET fulfilment_status=p_value, updated_at=now(), admin_notes=CASE WHEN p_value='cancelled'
   THEN concat_ws(E'\n',nullif(admin_notes,''),'['||now()::text||'] cancelled by '||v_role||': '||v_note) ELSE admin_notes END
   WHERE id=p_order RETURNING * INTO o;
  v_action=CASE WHEN p_value='cancelled' THEN 'order.cancelled' ELSE 'order.status_changed' END;
 ELSIF p_action='payment' THEN
  IF p_value IS NULL OR p_value NOT IN ('verified','rejected') OR o.payment_method='cod' THEN
   RETURN jsonb_build_object('error','Valid prepaid decision required','code','NOT_PREPAID','status',422);
  END IF;
  IF o.fulfilment_status IN ('cancelled','delivered') OR o.payment_status NOT IN ('payment_submitted','awaiting_payment') THEN
   RETURN jsonb_build_object('error','Payment is already decided or order is terminal','code','ALREADY_DECIDED','status',409);
  END IF;
  IF p_value='verified' AND nullif(btrim(o.transaction_reference),'') IS NULL THEN
   RETURN jsonb_build_object('error','Payment reference required','code','MISSING_REFERENCE','status',422);
  END IF;
  IF length(v_note)>500 THEN RETURN jsonb_build_object('error','Payment note is too long','code','INVALID_NOTE','status',400); END IF;
  UPDATE public.orders SET payment_status='payment_'||p_value, updated_at=now(), admin_notes=CASE WHEN v_note<>'' THEN
   concat_ws(E'\n',nullif(admin_notes,''),'['||now()::text||'] payment '||p_value||' by '||v_role||': '||v_note) ELSE admin_notes END
   WHERE id=p_order RETURNING * INTO o;
  v_action='payment.'||p_value;
 ELSIF p_action='note' THEN
  IF length(v_note)<1 OR length(v_note)>2000 OR length(coalesce(o.admin_notes,''))+length(v_note)+100>8000 THEN
   RETURN jsonb_build_object('error','Note is empty, too long or history is full','code','INVALID_NOTE','status',400);
  END IF;
  UPDATE public.orders SET admin_notes=concat_ws(E'\n',nullif(admin_notes,''),'['||now()::text||'] '||v_role||': '||v_note),updated_at=now()
   WHERE id=p_order RETURNING * INTO o;
  v_action='order.note_added';
 ELSE RETURN jsonb_build_object('error','Invalid operation','code','INVALID_ACTION','status',400);
 END IF;
 INSERT INTO public.audit_log(actor_id,actor_role,action,entity_type,entity_id,before_data,after_data)
 VALUES(p_actor,v_role,v_action,'order',p_order::text,
   jsonb_build_object('fulfilment_status',v_before->'fulfilment_status','payment_status',v_before->'payment_status'),
   jsonb_build_object('fulfilment_status',o.fulfilment_status,'payment_status',o.payment_status,'note',nullif(v_note,'')));
 RETURN jsonb_build_object('order',to_jsonb(o),'from',v_before->'fulfilment_status');
END $$;
REVOKE ALL ON FUNCTION public.admin_order_mutate(uuid,uuid,text,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_order_mutate(uuid,uuid,text,text,text,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_staff_update(p_actor uuid,p_target uuid,p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_before public.admin_roles%ROWTYPE; v_after public.admin_roles%ROWTYPE; v_role text; v_active boolean;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(20261011,3);
 IF NOT EXISTS(SELECT 1 FROM public.admin_roles WHERE user_id=p_actor AND role='owner' AND active) THEN
  RETURN jsonb_build_object('error','Active owner required','code','FORBIDDEN_ROLE','status',403);
 END IF;
 SELECT * INTO v_before FROM public.admin_roles WHERE user_id=p_target FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','Staff member not found','code','NOT_FOUND','status',404); END IF;
 v_role=coalesce(p_patch->>'role',v_before.role);
 IF v_role NOT IN ('owner','manager','fulfilment','content') OR
   (p_patch ? 'active' AND jsonb_typeof(p_patch->'active')<>'boolean') THEN
  RETURN jsonb_build_object('error','Invalid role or active flag','code','INVALID_STAFF','status',400);
 END IF;
 v_active=coalesce((p_patch->>'active')::boolean,v_before.active);
 IF p_target=p_actor AND NOT v_active THEN RETURN jsonb_build_object('error','Cannot deactivate current account','code','SELF_LOCKOUT','status',409); END IF;
 IF v_before.role='owner' AND v_before.active AND (v_role<>'owner' OR NOT v_active) AND
   (SELECT count(*) FROM public.admin_roles WHERE role='owner' AND active)<=1 THEN
  RETURN jsonb_build_object('error','At least one active owner must remain','code','LAST_OWNER','status',409);
 END IF;
 UPDATE public.admin_roles SET role=v_role,active=v_active WHERE user_id=p_target RETURNING * INTO v_after;
 INSERT INTO public.audit_log(actor_id,actor_role,action,entity_type,entity_id,before_data,after_data)
 VALUES(p_actor,'owner','role.updated','role',p_target::text,to_jsonb(v_before),to_jsonb(v_after));
 RETURN jsonb_build_object('staff',to_jsonb(v_after));
END $$;
REVOKE ALL ON FUNCTION public.admin_staff_update(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_staff_update(uuid,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.analytics_customers(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      ('* * ' || right(regexp_replace(o.customer_phone, '\D', '', 'g'), 4)) AS phone_masked,
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
$function$;

REVOKE EXECUTE ON FUNCTION public.analytics_customers(timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_customers(timestamptz,timestamptz) TO service_role;
