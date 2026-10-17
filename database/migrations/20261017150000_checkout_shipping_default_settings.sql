-- Fix nationwide shipping defaults shadowed by legacy catch-all zone seed rows.
-- Named-city zones remain explicit overrides; all other destinations use owner store settings.
-- No orders, payment records, products or existing order totals are modified.
INSERT INTO public.site_settings(key,value)
 VALUES ('prepaid_free_delivery_enabled','true'::jsonb)
 ON CONFLICT(key) DO NOTHING;

-- Public storefront configuration must expose the switch just like existing shipping settings.
-- CREATE OR REPLACE preserves existing view owner/grants.
CREATE OR REPLACE VIEW public.public_site_settings AS
SELECT key,value FROM public.site_settings WHERE key=ANY(ARRAY[
 'cod_enabled','cod_delivery_fee_pkr','jazzcash_enabled','bank_transfer_enabled',
 'bank_transfer_details','prepaid_free_delivery_threshold_pkr',
 'prepaid_free_delivery_enabled','prepaid_delivery_fee_pkr','delivery_estimate',
 'support_whatsapp','support_email','store_address','jazzcash_till_id',
 'jazzcash_qr_url','promo_text','ai_customer_assistant_enabled','ai_semantic_search_enabled'
]::text[]);

ALTER TABLE public.site_settings
 ADD CONSTRAINT prepaid_free_delivery_enabled_boolean
 CHECK (key <> 'prepaid_free_delivery_enabled' OR jsonb_typeof(value)='boolean');

-- Historic seeded catch-all zones were unintentionally taking precedence
-- over method-specific global fees. Retire only the two known legacy rows.
UPDATE public.shipping_zones SET is_active=false
 WHERE is_active AND cardinality(cities)=0
 AND ((name='Nationwide COD' AND fee=300 AND free_above IS NULL)
   OR (name='JazzCash Advance' AND fee=300 AND free_above=5000));

CREATE OR REPLACE FUNCTION chaskabox_private.checkout_totals(p_order jsonb,p_consume boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item jsonb; p public.products; c public.coupons; z public.shipping_zones;
 sub int=0; fee int; dis int=0; method text=p_order->>'payment_method';
 city text=lower(trim(p_order#>>'{customer,city}')); v_code text=upper(trim(coalesce(p_order->>'coupon_code','')));
 threshold int; enabled boolean; prepaid_free_enabled boolean; q int;
BEGIN
 IF method IS NULL OR method NOT IN('cod','jazzcash','bank_transfer') THEN RAISE EXCEPTION 'Invalid payment method'; END IF;
 IF lower(coalesce(nullif(trim(p_order#>>'{customer,country}'),''),'pakistan')) NOT IN('pakistan','pk') THEN RAISE EXCEPTION 'UNSUPPORTED_COUNTRY'; END IF;
 IF city IS NULL OR length(city) NOT BETWEEN 2 AND 100 THEN RAISE EXCEPTION 'City required'; END IF;
 SELECT coalesce((SELECT (value#>>'{}')::boolean FROM public.site_settings WHERE key=method||'_enabled'),true) INTO enabled;
 IF NOT enabled THEN RAISE EXCEPTION 'Payment method disabled'; END IF;
 IF jsonb_typeof(p_order->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_order->'items') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Items required'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_order->'items') ORDER BY (value->>'product_id')::bigint LOOP
  q=(item->>'qty')::int;
  IF q NOT BETWEEN 1 AND 99 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
  SELECT * INTO p FROM public.products WHERE id=(item->>'product_id')::bigint AND visibility='visible' AND stock_state<>'unavailable' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product unavailable'; END IF;
  IF p.bundle_kind='curated' AND (NOT EXISTS(SELECT 1 FROM public.bundle_items WHERE bundle_product_id=p.id)
   OR EXISTS(SELECT 1 FROM public.bundle_items i JOIN public.products cp ON cp.id=i.component_product_id WHERE i.bundle_product_id=p.id AND (cp.visibility<>'visible' OR cp.stock_state='unavailable'))) THEN RAISE EXCEPTION 'Box unavailable'; END IF;
  sub=sub+p.price*q;
 END LOOP;
 SELECT * INTO z FROM public.shipping_zones WHERE is_active AND
  cardinality(cities)>0 AND city=ANY(SELECT lower(trim(x)) FROM unnest(cities) x)
  ORDER BY position,id LIMIT 1 FOR SHARE;
 IF FOUND THEN
  fee=z.fee;threshold=z.free_above;
 ELSE
  SELECT coalesce((SELECT (value#>>'{}')::int FROM public.site_settings WHERE key=CASE WHEN method='cod' THEN 'cod_delivery_fee_pkr' ELSE 'prepaid_delivery_fee_pkr' END),300) INTO fee;
  IF method<>'cod' THEN SELECT coalesce((SELECT (value#>>'{}')::int FROM public.site_settings WHERE key='prepaid_free_delivery_threshold_pkr'),5000) INTO threshold; END IF;
 END IF;
 IF v_code<>'' THEN
  IF v_code!~'^[A-Z0-9]{1,32}$' THEN RAISE EXCEPTION 'INVALID_COUPON'; END IF;
  SELECT * INTO c FROM public.coupons WHERE coupons.code=v_code FOR UPDATE;
  IF NOT FOUND OR NOT c.is_active OR c.valid_from>now() OR c.valid_until<=now() OR sub<coalesce(c.min_order,0)
   OR (c.max_uses IS NOT NULL AND c.used_count>=c.max_uses) THEN RAISE EXCEPTION 'COUPON_UNAVAILABLE'; END IF;
  dis=least(sub,CASE WHEN c.discount_type='percent' THEN floor(sub::numeric*c.discount_value/100)::int ELSE c.discount_value END);
  IF p_consume THEN UPDATE public.coupons SET used_count=used_count+1 WHERE id=c.id; END IF;
 END IF;
 -- Threshold uses discounted merchandise subtotal. COD never gets automatic free delivery.
 SELECT COALESCE((SELECT (value#>>'{}')::boolean FROM public.site_settings
  WHERE key='prepaid_free_delivery_enabled'),true) INTO prepaid_free_enabled;
 IF method<>'cod' AND prepaid_free_enabled AND threshold IS NOT NULL AND sub-dis>=threshold THEN fee=0; END IF;
 IF fee<0 OR dis<0 THEN RAISE EXCEPTION 'Invalid pricing configuration'; END IF;
 RETURN jsonb_build_object('subtotal',sub,'discount',dis,'delivery_fee',fee,'total',sub-dis+fee,
 'coupon_code',nullif(v_code,''),'shipping_zone_id',z.id,'currency','PKR');
END $$;

-- Preserve existing least-privilege grants and wrapper behavior.
REVOKE ALL ON FUNCTION chaskabox_private.checkout_totals(jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION chaskabox_private.checkout_totals(jsonb,boolean) TO service_role;
