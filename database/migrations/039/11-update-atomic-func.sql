CREATE OR REPLACE FUNCTION public.create_order_atomic(p_order jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $func$
DECLARE
  v_existing orders%ROWTYPE;
  v_order orders%ROWTYPE;
  v_item jsonb;
  v_product products%ROWTYPE;
  v_subtotal integer := 0;
  v_delivery integer := 0;
  v_total integer := 0;
  v_cod_fee integer := 300;
  v_prepaid_fee integer := 300;
  v_free_threshold integer := 5000;
  v_payment text;
  v_user uuid := NULL;
  v_qty integer;
  v_method text;
  v_cod_enabled boolean := true;
  v_jazz_enabled boolean := true;
  v_bank_enabled boolean := true;
BEGIN
  IF p_order IS NULL THEN RAISE EXCEPTION 'order payload required'; END IF;
  SELECT * INTO v_existing FROM orders WHERE idempotency_key=(p_order->>'idempotency_key') LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('replay',true,'order',to_jsonb(v_existing)); END IF;
  BEGIN v_user := NULLIF(p_order->>'user_id','')::uuid; EXCEPTION WHEN others THEN v_user := NULL; END;
  IF v_user IS NOT NULL AND auth.uid() IS DISTINCT FROM v_user THEN
    -- service role may call this with a verified user id; reject direct mismatches for normal JWT calls
    IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'user mismatch'; END IF;
  END IF;
  IF jsonb_typeof(p_order->'items') <> 'array' OR jsonb_array_length(p_order->'items')=0 THEN RAISE EXCEPTION 'items required'; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_order->'items') LOOP
    v_qty := COALESCE((v_item->>'qty')::integer,0);
    IF v_qty < 1 OR v_qty > 99 THEN RAISE EXCEPTION 'invalid quantity'; END IF;
    SELECT * INTO v_product FROM products WHERE id=(v_item->>'product_id')::bigint AND visibility='visible' AND stock_state <> 'unavailable' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'product unavailable'; END IF;
    v_subtotal := v_subtotal + (v_product.price * v_qty);
  END LOOP;
  v_method := p_order->>'payment_method';
  IF v_method NOT IN ('cod','jazzcash','bank_transfer') THEN RAISE EXCEPTION 'invalid payment method'; END IF;
  SELECT COALESCE((SELECT (value#>>'{}')::boolean FROM site_settings WHERE key='cod_enabled'), true) INTO v_cod_enabled;
  SELECT COALESCE((SELECT (value#>>'{}')::boolean FROM site_settings WHERE key='jazzcash_enabled'), true) INTO v_jazz_enabled;
  SELECT COALESCE((SELECT (value#>>'{}')::boolean FROM site_settings WHERE key='bank_transfer_enabled'), true) INTO v_bank_enabled;
  IF (v_method='cod' AND NOT v_cod_enabled) OR (v_method='jazzcash' AND NOT v_jazz_enabled) OR (v_method='bank_transfer' AND NOT v_bank_enabled) THEN
    RAISE EXCEPTION 'payment method disabled';
  END IF;
  SELECT COALESCE((SELECT (value#>>'{}')::integer FROM site_settings WHERE key='cod_delivery_fee_pkr'), 300) INTO v_cod_fee;
  SELECT COALESCE((SELECT (value#>>'{}')::integer FROM site_settings WHERE key='prepaid_delivery_fee_pkr'), 300) INTO v_prepaid_fee;
  SELECT COALESCE((SELECT (value#>>'{}')::integer FROM site_settings WHERE key='prepaid_free_delivery_threshold_pkr'), 5000) INTO v_free_threshold;
  v_payment := CASE WHEN v_method='cod' THEN 'cod_due' ELSE 'payment_submitted' END;
  v_delivery := CASE WHEN v_method='cod' THEN v_cod_fee WHEN v_subtotal >= v_free_threshold THEN 0 ELSE v_prepaid_fee END;
  v_total := v_subtotal + v_delivery;
  INSERT INTO orders(order_number,idempotency_key,user_id,customer_name,customer_phone,customer_email,customer_address,customer_city,payment_method,payment_status,fulfilment_status,subtotal,delivery_fee,total,transaction_reference,customer_note)
  VALUES(p_order->>'order_number',p_order->>'idempotency_key',v_user,p_order#>>'{customer,name}',p_order#>>'{customer,phone}',NULLIF(p_order#>>'{customer,email}',''),p_order#>>'{customer,address}',p_order#>>'{customer,city}',v_method,v_payment,'new',v_subtotal,v_delivery,v_total,NULLIF(p_order->>'transaction_reference',''),NULLIF(p_order->>'customer_note','')) RETURNING * INTO v_order;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_order->'items') LOOP
    v_qty := (v_item->>'qty')::integer;
    SELECT * INTO v_product FROM products WHERE id=(v_item->>'product_id')::bigint;
    INSERT INTO order_items(order_id,product_id,product_name,pack,unit_price,quantity,line_total)
    VALUES(v_order.id,v_product.id,v_product.name,v_product.pack,v_product.price,v_qty,v_product.price*v_qty);
  END LOOP;
  RETURN jsonb_build_object('replay',false,'order',to_jsonb(v_order));
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_existing FROM orders WHERE idempotency_key=(p_order->>'idempotency_key') LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('replay',true,'order',to_jsonb(v_existing)); END IF;
  RAISE;
END $func$;
REVOKE ALL ON FUNCTION public.create_order_atomic(jsonb) FROM PUBLIC, anon, authenticated;
