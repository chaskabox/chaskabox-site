BEGIN;
ALTER TABLE public.products ADD COLUMN bundle_kind text
 CHECK (bundle_kind IS NULL OR bundle_kind IN ('curated','multipack'));
UPDATE public.products p SET bundle_kind=CASE WHEN EXISTS
 (SELECT 1 FROM public.bundle_items i WHERE i.bundle_product_id=p.id) THEN 'curated' ELSE 'multipack' END
 WHERE p.is_bundle;
ALTER TABLE public.orders ADD COLUMN coupon_code text;
ALTER TABLE public.orders ADD COLUMN discount integer NOT NULL DEFAULT 0 CHECK(discount>=0);
ALTER TABLE public.orders ADD COLUMN shipping_zone_id bigint REFERENCES public.shipping_zones(id) ON DELETE SET NULL;
ALTER TABLE public.customers ADD COLUMN email text;
ALTER TABLE public.customers ADD COLUMN identity_key text UNIQUE;
ALTER TABLE public.orders ADD COLUMN customer_id uuid REFERENCES public.customers(id);

-- Explicit persistent defaults are editable. Disabling the last row never
-- causes a static menu to reappear.
INSERT INTO public.navigation_menus(location,label,url,position) SELECT x.*
 FROM (VALUES ('header','Shop','/shop/',1),('header','Brands','/brands/',2),
 ('header','Chaska Boxes','/bundles/',3),('footer','All Snacks','/shop/',1),
 ('footer','Track Order','/track-order.html',2),('footer','Contact','/contact/',3),
 ('footer','Privacy','/privacy-policy/',4),('footer','Terms','/terms/',5),
 ('mobile','Shop','/shop/',1),('mobile','Brands','/brands/',2),
 ('mobile','Chaska Boxes','/bundles/',3)) x(location,label,url,position)
 WHERE NOT EXISTS(SELECT 1 FROM public.navigation_menus);

CREATE OR REPLACE FUNCTION public.admin_box_save(p_actor uuid,p_id bigint,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r text; old public.products; box public.products; item jsonb; component public.products;
 ids bigint[]='{}'; q int; retail int=0; n int=0; selling int; title text; vis text;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(20261011,5);
 SELECT role INTO r FROM public.admin_roles WHERE user_id=p_actor AND active FOR SHARE;
 IF r IS NULL OR r NOT IN('owner','manager','content') THEN RAISE EXCEPTION 'Active box staff required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text)>32768 THEN RAISE EXCEPTION 'Invalid box input'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_input) f WHERE f NOT IN
 ('title','slug','description','image_url','selling_price','visibility','items','expected_updated_at')) THEN RAISE EXCEPTION 'Unsupported box field'; END IF;
 IF p_id IS NOT NULL THEN
  SELECT * INTO old FROM public.products WHERE id=p_id AND is_bundle AND bundle_kind='curated' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Curated box not found'; END IF;
  IF p_input->>'expected_updated_at' IS NULL OR (p_input->>'expected_updated_at')::timestamptz IS DISTINCT FROM old.updated_at THEN RAISE EXCEPTION 'STALE_BOX'; END IF;
 END IF;
 title=coalesce(p_input->>'title',old.name); selling=coalesce((p_input->>'selling_price')::int,old.price);
 vis=coalesce(p_input->>'visibility',old.visibility,'draft');
 IF title IS NULL OR length(trim(title)) NOT BETWEEN 3 AND 160 OR selling IS NULL OR selling NOT BETWEEN 0 AND 10000000 THEN RAISE EXCEPTION 'Invalid box title/price'; END IF;
 IF p_input ? 'selling_price' AND (jsonb_typeof(p_input->'selling_price')<>'number' OR p_input->>'selling_price'!~'^[0-9]+$') THEN RAISE EXCEPTION 'Box price must be integer'; END IF;
 IF vis NOT IN('draft','hidden','visible') OR (r='content' AND vis='visible') THEN RAISE EXCEPTION 'Box publish not allowed' USING ERRCODE='42501'; END IF;
 IF p_input ? 'items' THEN
  IF jsonb_typeof(p_input->'items')<>'array' OR jsonb_array_length(p_input->'items') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Box needs 1..50 components'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_input->'items') ORDER BY (value->>'product_id')::bigint LOOP
   IF jsonb_typeof(item->'product_id')<>'number' OR jsonb_typeof(item->'quantity')<>'number' THEN RAISE EXCEPTION 'Component fields must be integers'; END IF;
   q=(item->>'quantity')::int;
   IF q NOT BETWEEN 1 AND 99 OR item->>'quantity'!~'^[0-9]+$' OR item->>'product_id'!~'^[0-9]+$' THEN RAISE EXCEPTION 'Invalid component'; END IF;
   IF (item->>'product_id')::bigint=ANY(ids) OR (item->>'product_id')::bigint=p_id THEN RAISE EXCEPTION 'Duplicate/self component'; END IF;
   SELECT * INTO component FROM public.products WHERE id=(item->>'product_id')::bigint
    AND visibility NOT IN('archived','draft') AND stock_state<>'unavailable' AND bundle_kind IS DISTINCT FROM 'curated' FOR SHARE;
   IF NOT FOUND OR (vis='visible' AND component.visibility<>'visible') THEN RAISE EXCEPTION 'Component unavailable'; END IF;
   ids=array_append(ids,component.id); retail=retail+component.price*q; n=n+1;
  END LOOP;
 ELSE
  IF p_id IS NULL THEN RAISE EXCEPTION 'Box components required'; END IF;
  SELECT coalesce(sum(p.price*i.quantity),0),count(*) INTO retail,n FROM public.bundle_items i
   JOIN public.products p ON p.id=i.component_product_id WHERE i.bundle_product_id=p_id;
  IF n=0 OR (vis='visible' AND EXISTS(SELECT 1 FROM public.bundle_items i JOIN public.products p ON p.id=i.component_product_id
   WHERE i.bundle_product_id=p_id AND (p.visibility<>'visible' OR p.stock_state='unavailable'))) THEN RAISE EXCEPTION 'Published components unavailable'; END IF;
 END IF;
 IF p_id IS NULL THEN
  INSERT INTO public.products(name,slug,price,old_price,category,pack,description,image_url,is_bundle,bundle_kind,visibility,stock_state,created_by,updated_by)
  VALUES(trim(title),coalesce(nullif(p_input->>'slug',''),trim(both '-' FROM regexp_replace(lower(title),'[^a-z0-9]+','-','g'))||'-'||substr(gen_random_uuid()::text,1,8)),
   selling,retail,'Chaska Boxes','Box of '||n||' components',coalesce(p_input->>'description',''),p_input->>'image_url',true,'curated',vis,'sourced_after_order',p_actor,p_actor) RETURNING * INTO box;
 ELSE
  UPDATE public.products SET name=trim(title),price=selling,old_price=retail,pack='Box of '||n||' components',
   description=coalesce(p_input->>'description',old.description),image_url=coalesce(p_input->>'image_url',old.image_url),
   visibility=vis,updated_by=p_actor WHERE id=p_id RETURNING * INTO box;
 END IF;
 IF p_input ? 'items' THEN
  DELETE FROM public.bundle_items WHERE bundle_product_id=box.id;
  INSERT INTO public.bundle_items(bundle_product_id,component_product_id,quantity)
   SELECT box.id,(value->>'product_id')::bigint,(value->>'quantity')::int FROM jsonb_array_elements(p_input->'items');
 END IF;
 INSERT INTO public.audit_log(actor_id,actor_role,action,entity_type,entity_id,before_data,after_data)
 VALUES(p_actor,r,CASE WHEN p_id IS NULL THEN 'bundle.created' WHEN vis='visible' AND old.visibility<>'visible' THEN 'bundle.published'
 WHEN vis<>'visible' AND old.visibility='visible' THEN 'bundle.unpublished' ELSE 'bundle.updated' END,'product',box.id::text,
 to_jsonb(old),jsonb_build_object('product',to_jsonb(box),'items',p_input->'items'));
 RETURN to_jsonb(box);
END $$;
REVOKE ALL ON FUNCTION public.admin_box_save(uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_box_save(uuid,bigint,jsonb) TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.bundle_items TO service_role;

CREATE OR REPLACE FUNCTION chaskabox_private.checkout_totals(p_order jsonb,p_consume boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item jsonb; p public.products; c public.coupons; z public.shipping_zones;
 sub int=0; fee int; dis int=0; method text=p_order->>'payment_method';
 city text=lower(trim(p_order#>>'{customer,city}')); v_code text=upper(trim(coalesce(p_order->>'coupon_code','')));
 threshold int; enabled boolean; q int;
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
  (city=ANY(SELECT lower(trim(x)) FROM unnest(cities) x) OR cardinality(cities)=0)
  ORDER BY (cardinality(cities)=0),position,id LIMIT 1 FOR SHARE;
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
 -- Threshold uses the discounted merchandise subtotal. COD is never free.
 IF method<>'cod' AND threshold IS NOT NULL AND sub-dis>=threshold THEN fee=0; END IF;
 IF fee<0 OR dis<0 THEN RAISE EXCEPTION 'Invalid pricing configuration'; END IF;
 RETURN jsonb_build_object('subtotal',sub,'discount',dis,'delivery_fee',fee,'total',sub-dis+fee,
 'coupon_code',nullif(v_code,''),'shipping_zone_id',z.id,'currency','PKR');
END $$;
REVOKE ALL ON FUNCTION chaskabox_private.checkout_totals(jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION chaskabox_private.checkout_totals(jsonb,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.checkout_quote(p_order jsonb) RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT chaskabox_private.checkout_totals(p_order,false) $$;
REVOKE ALL ON FUNCTION public.checkout_quote(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_quote(jsonb) TO service_role;

-- Stable directory rows are internal metadata; this does not link guest orders
-- to an account or change order ownership.
CREATE OR REPLACE FUNCTION chaskabox_private.order_customer_record() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k text;
BEGIN
 k=CASE WHEN NEW.user_id IS NOT NULL THEN 'u:'||NEW.user_id ELSE
  CASE WHEN nullif(trim(NEW.customer_email),'') IS NOT NULL THEN 'e:'||lower(trim(NEW.customer_email)) ELSE 'p:'||regexp_replace(NEW.customer_phone,'[^0-9]','','g') END END;
 INSERT INTO public.customers(identity_key,user_id,name,phone,email) VALUES(k,NEW.user_id,NEW.customer_name,NEW.customer_phone,lower(trim(NEW.customer_email)))
 ON CONFLICT(identity_key) DO UPDATE SET name=EXCLUDED.name,phone=EXCLUDED.phone,email=EXCLUDED.email
 RETURNING id INTO NEW.customer_id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION chaskabox_private.order_customer_record() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER order_customer_record BEFORE INSERT OR UPDATE OF user_id ON public.orders FOR EACH ROW EXECUTE FUNCTION chaskabox_private.order_customer_record();
-- Adopt existing account-directory records before filling guest records.
UPDATE public.customers SET identity_key='u:'||user_id WHERE user_id IS NOT NULL AND identity_key IS NULL;
INSERT INTO public.customers(identity_key,user_id,name,phone,email)
 SELECT DISTINCT ON(k) k,user_id,customer_name,customer_phone,lower(trim(customer_email))
 FROM (SELECT o.*,CASE WHEN user_id IS NOT NULL THEN 'u:'||user_id WHEN nullif(trim(customer_email),'') IS NOT NULL
 THEN 'e:'||lower(trim(customer_email)) ELSE 'p:'||regexp_replace(customer_phone,'[^0-9]','','g') END k FROM public.orders o) s
 ORDER BY k,created_at DESC,id DESC ON CONFLICT(identity_key) DO NOTHING;
UPDATE public.orders o SET customer_id=c.id FROM public.customers c WHERE c.identity_key=
 CASE WHEN o.user_id IS NOT NULL THEN 'u:'||o.user_id WHEN nullif(trim(o.customer_email),'') IS NOT NULL
 THEN 'e:'||lower(trim(o.customer_email)) ELSE 'p:'||regexp_replace(o.customer_phone,'[^0-9]','','g') END;

CREATE OR REPLACE FUNCTION public.customer_directory(p_q text DEFAULT '',p_id uuid DEFAULT NULL,p_limit int DEFAULT 25,p_offset int DEFAULT 0)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 WITH filtered AS (SELECT c.* FROM public.customers c WHERE (p_id IS NULL OR c.id=p_id)
 AND (p_q='' OR c.name ILIKE '%'||p_q||'%' OR c.phone ILIKE '%'||p_q||'%' OR c.email ILIKE '%'||p_q||'%')),
 page AS (SELECT * FROM filtered ORDER BY created_at DESC,id LIMIT least(greatest(p_limit,1),100) OFFSET greatest(p_offset,0)),
 enriched AS (SELECT p.*,s.* FROM page p LEFT JOIN LATERAL
 (SELECT count(*) order_count,coalesce(sum(total) FILTER(WHERE fulfilment_status<>'cancelled'),0) gross_order_value,
 coalesce(sum(total) FILTER(WHERE fulfilment_status<>'cancelled' AND payment_status<>'refunded'
 AND ((payment_method='cod' AND fulfilment_status='delivered') OR (payment_method<>'cod' AND payment_status='payment_verified'))),0) lifetime_spend,
 min(created_at) first_order_at,max(created_at) last_order_at FROM public.orders WHERE customer_id=p.id) s ON true)
 SELECT jsonb_build_object('customers',coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM enriched e),'[]'),
 'total',(SELECT count(*) FROM filtered)) $$;
REVOKE ALL ON FUNCTION public.customer_directory(text,uuid,int,int) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.customer_directory(text,uuid,int,int) TO service_role;

CREATE OR REPLACE FUNCTION public.review_summary(p_product bigint) RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('count',count(*),'avg_rating',coalesce(round(avg(rating),1),0)) FROM public.reviews
 WHERE product_id=p_product AND moderation_status='approved' $$;
CREATE OR REPLACE FUNCTION public.review_purchase(p_user uuid,p_product bigint) RETURNS uuid
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT o.id FROM public.orders o JOIN public.order_items i ON i.order_id=o.id
 WHERE o.user_id=p_user AND i.product_id=p_product AND o.fulfilment_status='delivered'
 AND o.payment_status<>'refunded' ORDER BY o.created_at DESC,o.id LIMIT 1 $$;
REVOKE ALL ON FUNCTION public.review_summary(bigint),public.review_purchase(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_summary(bigint),public.review_purchase(uuid,bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.create_order_atomic(p_order jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quote jsonb;
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
  PERFORM pg_advisory_xact_lock(hashtextextended(p_order->>'idempotency_key',5));
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
  v_quote := chaskabox_private.checkout_totals(p_order,true);
  v_delivery := (v_quote->>'delivery_fee')::int;
  v_total := (v_quote->>'total')::int;
  INSERT INTO orders(order_number,idempotency_key,user_id,customer_name,customer_phone,customer_email,customer_address,customer_city,payment_method,payment_status,fulfilment_status,subtotal,delivery_fee,total,transaction_reference,customer_note,coupon_code,discount,shipping_zone_id)
  VALUES(p_order->>'order_number',p_order->>'idempotency_key',v_user,p_order#>>'{customer,name}',p_order#>>'{customer,phone}',NULLIF(p_order#>>'{customer,email}',''),p_order#>>'{customer,address}',p_order#>>'{customer,city}',v_method,v_payment,'new',v_subtotal,v_delivery,v_total,NULLIF(p_order->>'transaction_reference',''),NULLIF(p_order->>'customer_note',''),v_quote->>'coupon_code',(v_quote->>'discount')::int,(v_quote->>'shipping_zone_id')::bigint) RETURNING * INTO v_order;
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
END $function$
;

REVOKE ALL ON FUNCTION public.create_order_atomic(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_cms_transaction(p_actor uuid,p_operations jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 v_role text; o jsonb; t text; op text; k text; id text; typ text;
 data jsonb; before_row jsonb; after_row jsonb; results jsonb='[]';
 fields text[]; allowed text[]; cols text; vals text; sets text;
 entity text; action text;
BEGIN
 IF jsonb_typeof(p_operations) IS DISTINCT FROM 'array' OR
  jsonb_array_length(p_operations) NOT BETWEEN 1 AND 250 OR
  octet_length(p_operations::text)>524288 THEN RAISE EXCEPTION 'Invalid CMS batch'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261011,4);
 SELECT role INTO v_role FROM public.admin_roles WHERE user_id=p_actor AND active FOR SHARE;
 IF v_role IS NULL OR v_role NOT IN('owner','manager','content') THEN
  RAISE EXCEPTION 'Active CMS staff required' USING ERRCODE='42501';
 END IF;
 FOR o IN SELECT value FROM jsonb_array_elements(p_operations) LOOP
  IF jsonb_typeof(o)<>'object' THEN RAISE EXCEPTION 'Invalid CMS operation'; END IF;
  t=o->>'table';op=o->>'op';id=o->>'id';data=coalesce(o->'data','{}');
  IF jsonb_typeof(data)<>'object' OR octet_length(data::text)>32768 THEN RAISE EXCEPTION 'Invalid CMS data'; END IF;
  k='id';typ='uuid';
  CASE t
   WHEN 'categories' THEN entity='category';allowed=ARRAY['name','slug','description','image_url','mobile_image_url','icon','seo_title','seo_description','box_style','link_destination','position','is_visible','show_on_homepage','hide_if_empty','product_assignment','assignment_rule','assignments_managed','updated_at'];
   WHEN 'category_products' THEN entity='category_assignment';k='category_id';allowed=ARRAY['category_id','product_id','position'];
   WHEN 'brands' THEN entity='brand';typ='bigint';allowed=ARRAY['name','slug','logo_url','description','hero_image_url','short_description','long_description','seo_title','seo_description','og_image_url','featured_product_ids','sort_order','is_visible','position','updated_at'];
   WHEN 'navigation_menus' THEN entity='navigation';allowed=ARRAY['location','label','url','parent_id','position','is_external','is_enabled'];
   WHEN 'homepage_sections' THEN entity='homepage';k='section_key';typ='text';allowed=ARRAY['section_key','enabled','position','heading','subheading','draft_config','config','updated_by','updated_at'];
   WHEN 'site_settings' THEN entity='settings';k='key';typ='text';allowed=ARRAY['key','value','updated_by'];
   WHEN 'theme_settings' THEN entity='theme';k='key';typ='text';allowed=ARRAY['key','value','updated_at'];
   WHEN 'notification_templates' THEN entity='template';typ='bigint';allowed=ARRAY['subject','body','is_active','updated_at'];
   WHEN 'products' THEN entity='product';typ='bigint';allowed=ARRAY['name','slug','price','old_price','brand','category','pack','description','badge','image_url','visibility','stock_state','tags','seo_title','seo_description','og_image','canonical_url','created_by','updated_by','is_bundle'];
   WHEN 'coupons' THEN entity='coupon';typ='bigint';allowed=ARRAY['code','discount_type','discount_value','min_order','max_uses','valid_from','valid_until','is_active'];
   WHEN 'shipping_zones' THEN entity='shipping_zone';typ='bigint';allowed=ARRAY['name','cities','fee','free_above','is_active','position'];
   WHEN 'reviews' THEN entity='review';typ='bigint';allowed=ARRAY['moderation_status','admin_reply'];
   ELSE RAISE EXCEPTION 'Unsupported CMS table';
  END CASE;
  IF op NOT IN('insert','update','upsert','delete','delete_assignments','publish') OR op IS NULL THEN RAISE EXCEPTION 'Unsupported CMS operation'; END IF;
  IF (t='site_settings' AND v_role<>'owner') OR
   (t IN('brands','theme_settings','notification_templates','coupons','shipping_zones') AND v_role NOT IN('owner','manager')) OR
   (op='delete' AND t IN('products','brands','coupons') AND v_role<>'owner') OR
   (op='delete' AND t='categories' AND v_role NOT IN('owner','manager')) OR
   (op='publish' AND v_role NOT IN('owner','manager')) THEN
   RAISE EXCEPTION 'Role not allowed for CMS action' USING ERRCODE='42501';
  END IF;
  IF (op='publish' AND t<>'homepage_sections') OR
   (op='delete_assignments' AND t<>'category_products') OR
   (op='upsert' AND t NOT IN('site_settings','theme_settings')) OR
   (t='category_products' AND op NOT IN('insert','delete_assignments')) OR
   (op='delete' AND t NOT IN('categories','brands','products','coupons','shipping_zones')) OR
   (op='insert' AND t IN('homepage_sections','notification_templates','site_settings','theme_settings')) THEN
   RAISE EXCEPTION 'Unsupported CMS action for table';
  END IF;
  SELECT array_agg(key ORDER BY key) INTO fields FROM jsonb_object_keys(data) key;
  IF EXISTS(SELECT 1 FROM unnest(fields) f WHERE NOT(f=ANY(allowed))) THEN RAISE EXCEPTION 'Unsupported CMS field'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(data) e WHERE e.key IN('is_visible','show_on_homepage','hide_if_empty','is_enabled','is_external','enabled','is_active','is_bundle','assignments_managed') AND jsonb_typeof(e.value)<>'boolean') THEN RAISE EXCEPTION 'CMS boolean must be a boolean'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(data) e WHERE e.key IN('price','old_price','position','sort_order','product_id','discount_value','min_order','max_uses','fee','free_above') AND e.value<>'null' AND (jsonb_typeof(e.value)<>'number' OR e.value::text!~'^-?[0-9]+$')) THEN RAISE EXCEPTION 'CMS integer must be an integer'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(data) e WHERE NOT(e.key=ANY(ARRAY['value','price','old_price','position','sort_order','product_id','discount_value','min_order','max_uses','fee','free_above','is_visible','show_on_homepage','hide_if_empty','is_enabled','is_external','enabled','is_active','is_bundle','assignments_managed','tags','cities','featured_product_ids','draft_config','config','assignment_rule'])) AND e.value<>'null' AND jsonb_typeof(e.value)<>'string') THEN RAISE EXCEPTION 'CMS text must be a string'; END IF;
  IF t='reviews' AND op<>'update' THEN RAISE EXCEPTION 'Only review moderation allowed'; END IF;
  IF data ? 'tags' AND (jsonb_typeof(data->'tags')<>'array' OR jsonb_array_length(data->'tags')>20 OR EXISTS(SELECT 1 FROM jsonb_array_elements(data->'tags') x WHERE jsonb_typeof(x)<>'string' OR length(x#>>'{}')>40)) THEN RAISE EXCEPTION 'Invalid product tags'; END IF;
  IF data ? 'url' AND (data->>'url'~'[[:cntrl:]]' OR data->>'url' !~ '^(https?://|mailto:|tel:|/[^/]|/$|#)') THEN RAISE EXCEPTION 'Unsafe navigation URL'; END IF;
  IF t='homepage_sections' AND op<>'publish' AND data ? 'config' THEN RAISE EXCEPTION 'Use explicit homepage publish'; END IF;
  IF t IN('site_settings','theme_settings') AND data->>k IS DISTINCT FROM id THEN RAISE EXCEPTION 'CMS key mismatch'; END IF;
  IF data ? 'updated_by' THEN data=jsonb_set(data,'{updated_by}',to_jsonb(p_actor)); END IF;
  IF data ? 'created_by' THEN data=jsonb_set(data,'{created_by}',to_jsonb(p_actor)); END IF;
  IF op='insert' THEN before_row=NULL;
  ELSIF op='delete_assignments' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(cp)),'[]') INTO before_row FROM public.category_products cp WHERE category_id=id::uuid;
  ELSE
   EXECUTE format('SELECT to_jsonb(r) FROM public.%I r WHERE %I=$1::%s FOR UPDATE',t,k,typ) INTO before_row USING id;
   IF before_row IS NULL AND op<>'upsert' THEN RAISE EXCEPTION 'CMS row not found'; END IF;
  END IF;
  IF t='products' AND op='update' AND to_regclass('public.product_versions') IS NOT NULL THEN
   EXECUTE 'INSERT INTO public.product_versions(product_id,snapshot,changed_by,change_type) VALUES($1,$2,$3,$4)' USING id::bigint,before_row,p_actor::text,'update';
  END IF;
  IF o ? 'expected_updated_at' AND before_row->>'updated_at' IS DISTINCT FROM o->>'expected_updated_at' THEN RAISE EXCEPTION 'CMS row changed; reload before saving'; END IF;
  IF op='publish' THEN
   IF before_row->'draft_config' IS NULL OR before_row->'draft_config'='null' THEN RAISE EXCEPTION 'Section has no draft to publish'; END IF;
   UPDATE public.homepage_sections SET config=draft_config,updated_by=p_actor,updated_at=now() WHERE section_key=id RETURNING to_jsonb(homepage_sections) INTO after_row;
  ELSIF op='delete_assignments' THEN
   DELETE FROM public.category_products WHERE category_id=id::uuid;after_row='[]';
  ELSIF op='delete' THEN
   IF t='products' THEN
    IF o->>'confirm' IS DISTINCT FROM before_row->>'name' THEN RAISE EXCEPTION 'Typed product confirmation required'; END IF;
    IF EXISTS(SELECT 1 FROM public.order_items WHERE product_id=id::bigint) OR EXISTS(SELECT 1 FROM public.bundle_items WHERE component_product_id=id::bigint) THEN RAISE EXCEPTION 'Referenced product cannot be deleted'; END IF;
   END IF;
   IF t='categories' AND coalesce((o->>'force')::boolean,false)=false AND EXISTS(SELECT 1 FROM public.category_products WHERE category_id=id::uuid) THEN RAISE EXCEPTION 'Category has products'; END IF;
   EXECUTE format('DELETE FROM public.%I WHERE %I=$1::%s',t,k,typ) USING id;after_row=NULL;
  ELSE
   IF fields IS NULL THEN RAISE EXCEPTION 'Empty CMS data'; END IF;
   SELECT string_agg(format('%I',f),','),string_agg(format('(jsonb_populate_record(NULL::public.%I,$1)).%I',t,f),','),string_agg(format('%I=(jsonb_populate_record(NULL::public.%I,$1)).%I',f,t,f),',') INTO cols,vals,sets FROM unnest(fields) f;
   IF op='insert' OR (op='upsert' AND before_row IS NULL) THEN
    EXECUTE format('INSERT INTO public.%I AS r(%s) SELECT %s RETURNING to_jsonb(r)',t,cols,vals) INTO after_row USING data;
   ELSE
    EXECUTE format('UPDATE public.%I AS r SET %s WHERE %I=$2::%s RETURNING to_jsonb(r)',t,sets,k,typ) INTO after_row USING data,id;
   END IF;
  END IF;
  action=entity||CASE WHEN op='publish' THEN '.published' WHEN op='insert' THEN '.created' WHEN op='delete' THEN '.deleted' ELSE '.updated' END;
  IF t='products' AND op='update' THEN
   IF data ? 'price' AND before_row->'price' IS DISTINCT FROM after_row->'price' THEN action='product.price_changed';
   ELSIF before_row->'visibility' IS DISTINCT FROM after_row->'visibility' THEN
    action=CASE WHEN after_row->>'visibility'='archived' THEN 'product.archived' WHEN before_row->>'visibility'='archived' AND after_row->>'visibility'='hidden' THEN 'product.restored' ELSE 'product.visibility_changed' END;
   END IF;
  END IF;
  IF t='products' AND op='delete' THEN action='product.deleted_permanent'; END IF;
  INSERT INTO public.audit_log(actor_id,actor_role,action,entity_type,entity_id,before_data,after_data)
   VALUES(p_actor,v_role,action,entity,coalesce(after_row->>k,id,'n/a'),before_row,after_row);
  results=results||jsonb_build_array(after_row);
 END LOOP;
 RETURN results;
END $$;

GRANT SELECT,INSERT,UPDATE,DELETE ON public.coupons,public.shipping_zones,public.reviews,public.customers TO service_role;
ALTER TABLE public.categories ADD COLUMN assignments_managed boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.storefront_manifest() RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 WITH cats AS (SELECT c.*,coalesce((SELECT jsonb_agg(p.id ORDER BY p.id) FROM public.products p WHERE p.visibility='visible' AND
 (CASE WHEN c.product_assignment='rule_tag' THEN p.tags && ARRAY[coalesce(c.assignment_rule->>'tag','')]
 WHEN c.product_assignment='rule_category' THEN p.category=coalesce(c.assignment_rule->>'category',c.name)
 WHEN c.assignments_managed THEN EXISTS(SELECT 1 FROM public.category_products x WHERE x.category_id=c.id AND x.product_id=p.id)
 ELSE p.category=c.name OR EXISTS(SELECT 1 FROM public.category_products x WHERE x.category_id=c.id AND x.product_id=p.id) END)),'[]') product_ids
 FROM public.categories c WHERE c.is_visible),
 visible_cats AS (SELECT * FROM cats WHERE NOT hide_if_empty OR jsonb_array_length(product_ids)>0)
 SELECT jsonb_build_object(
 'settings',coalesce((SELECT jsonb_object_agg(key,value) FROM public.public_site_settings),'{}'),
 'sections',coalesce((SELECT jsonb_agg(jsonb_build_object('section_key',section_key,'enabled',enabled,'position',position,'heading',heading,'subheading',subheading,'config',config) ORDER BY position,section_key) FROM public.homepage_sections),'[]'),
 'categories',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'slug',slug,'description',description,'image_url',image_url,'mobile_image_url',mobile_image_url,'seo_title',seo_title,'seo_description',seo_description,'link_destination',link_destination,'show_on_homepage',show_on_homepage,'product_ids',product_ids) ORDER BY position,id) FROM visible_cats),'[]'),
 'navigation',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'location',location,'label',label,'url',url,'position',position,'parent_id',parent_id,'is_external',is_external,'is_enabled',is_enabled) ORDER BY location,position,id) FROM public.navigation_menus),'[]'),
 'theme',coalesce((SELECT jsonb_object_agg(key,value) FROM public.theme_settings),'{}')) $$;
REVOKE ALL ON FUNCTION public.storefront_manifest() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.storefront_manifest() TO service_role;
CREATE OR REPLACE FUNCTION chaskabox_private.validate_commercial_setting() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='coupons' THEN
  IF NEW.code!~'^[A-Z0-9]{1,32}$' OR NEW.min_order<0 OR NEW.max_uses<1 OR
   (NEW.discount_type='percent' AND NEW.discount_value>90) OR
   (NEW.valid_until IS NOT NULL AND NEW.valid_from IS NOT NULL AND NEW.valid_until<=NEW.valid_from) THEN RAISE EXCEPTION 'Invalid coupon settings'; END IF;
 ELSE
  IF NEW.fee<0 OR NEW.free_above<0 OR NEW.name='' OR cardinality(NEW.cities)>200 THEN RAISE EXCEPTION 'Invalid shipping settings'; END IF;
 END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION chaskabox_private.validate_commercial_setting() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_coupon BEFORE INSERT OR UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION chaskabox_private.validate_commercial_setting();
CREATE TRIGGER validate_zone BEFORE INSERT OR UPDATE ON public.shipping_zones FOR EACH ROW EXECUTE FUNCTION chaskabox_private.validate_commercial_setting();
CREATE TABLE chaskabox_private.analytics_maintenance(id boolean PRIMARY KEY DEFAULT true CHECK(id),last_run_at timestamptz,counts jsonb);
INSERT INTO chaskabox_private.analytics_maintenance(id) VALUES(true);
GRANT SELECT,UPDATE ON chaskabox_private.analytics_maintenance TO service_role;
CREATE OR REPLACE FUNCTION public.analytics_retention_run() RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t text;n int;v_counts jsonb='{}';last timestamptz;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(20261011,19);
 SELECT last_run_at INTO last FROM chaskabox_private.analytics_maintenance WHERE id FOR UPDATE;
 IF last>now()-interval '50 minutes' THEN RETURN jsonb_build_object('skipped',true,'last_run_at',last);END IF;
 FOREACH t IN ARRAY ARRAY['funnel_events','filter_events','box_events','wishlist_events','search_logs'] LOOP
  EXECUTE format('DELETE FROM public.%I WHERE id IN(SELECT id FROM public.%I WHERE created_at<now()-interval ''30 days'' ORDER BY created_at,id LIMIT 1000)',t,t);
  GET DIAGNOSTICS n=ROW_COUNT;v_counts=v_counts||jsonb_build_object(t,n);
 END LOOP;
 DELETE FROM public.api_rate_limits WHERE bucket_key IN(SELECT bucket_key FROM public.api_rate_limits WHERE updated_at<now()-interval '1 day' LIMIT 1000);
 UPDATE chaskabox_private.analytics_maintenance SET last_run_at=now(),counts=v_counts WHERE id;
 RETURN jsonb_build_object('last_run_at',now(),'counts',v_counts);
END $$;
REVOKE ALL ON FUNCTION public.analytics_retention_run() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_retention_run() TO service_role;

CREATE OR REPLACE FUNCTION public.analytics_attention()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                WHERE p.bundle_kind='curated' AND p.visibility <> 'archived'
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
$function$
;
CREATE OR REPLACE FUNCTION public.analytics_boxes(p_from timestamptz,p_to timestamptz) RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.revenue DESC,x.box_id),'[]') FROM
 (SELECT b.id box_id,b.name box_name,count(DISTINCT o.id) orders,coalesce(sum(i.quantity),0) units,coalesce(sum(i.line_total),0) revenue
 FROM public.products b LEFT JOIN (public.order_items i JOIN public.orders o ON o.id=i.order_id
 AND o.created_at>=p_from AND o.created_at<p_to AND o.fulfilment_status<>'cancelled') ON i.product_id=b.id
 WHERE b.bundle_kind='curated' GROUP BY b.id,b.name)x $$;

CREATE OR REPLACE FUNCTION public.analytics_boxevents(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  BEGIN
    SELECT jsonb_build_object(
      'total_views', (SELECT COUNT(*)::bigint FROM box_events WHERE action='view' AND created_at>=p_from AND created_at<p_to),
      'total_adds', (SELECT COUNT(*)::bigint FROM box_events WHERE action='add_to_cart' AND created_at>=p_from AND created_at<p_to),
      'by_box', COALESCE((SELECT jsonb_agg(jsonb_build_object('box_name',box_name,'views',views,'adds',adds) ORDER BY views DESC)
        FROM (SELECT box_name, COUNT(*) FILTER (WHERE action='view')::bigint AS views, COUNT(*) FILTER (WHERE action='add_to_cart')::bigint AS adds
              FROM box_events WHERE created_at>=p_from AND created_at<p_to GROUP BY 1) t), '[]'::jsonb)
    ) INTO v_result;
  END;
  RETURN v_result;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.analytics_brands(p_from timestamptz,p_to timestamptz) RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('brands',coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.revenue DESC,x.name),'[]'),'currency','PKR','definition','Merchandise gross excludes delivery and coupon discounts. Orders are distinct within each group.') FROM
 (SELECT coalesce(nullif(p.brand,''),'Unclassified') name,coalesce(nullif(p.brand,''),'Unclassified') brand,
 count(DISTINCT o.id) orders,sum(i.quantity) units,sum(i.line_total) revenue,sum(i.line_total) gross_value,
 round(sum(i.line_total)::numeric/nullif(count(DISTINCT o.id),0)) aov,
 coalesce(sum(i.line_total) FILTER(WHERE o.payment_status<>'refunded' AND ((o.payment_method='cod' AND o.fulfilment_status='delivered') OR (o.payment_method<>'cod' AND o.payment_status='payment_verified'))),0) recognized_revenue
 FROM public.orders o JOIN public.order_items i ON i.order_id=o.id JOIN public.products p ON p.id=i.product_id
 WHERE o.created_at>=p_from AND o.created_at<p_to AND o.fulfilment_status<>'cancelled' GROUP BY coalesce(nullif(p.brand,''),'Unclassified'))x $$;

CREATE OR REPLACE FUNCTION public.analytics_categories(p_from timestamptz,p_to timestamptz) RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('categories',coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.revenue DESC,x.name),'[]'),'currency','PKR','definition','Merchandise gross excludes delivery and coupon discounts. Orders are distinct within each group.') FROM
 (SELECT coalesce(nullif(p.category,''),'Unclassified') name,coalesce(nullif(p.category,''),'Unclassified') category,
 count(DISTINCT o.id) orders,sum(i.quantity) units,sum(i.line_total) revenue,sum(i.line_total) gross_value,
 round(sum(i.line_total)::numeric/nullif(count(DISTINCT o.id),0)) aov,
 coalesce(sum(i.line_total) FILTER(WHERE o.payment_status<>'refunded' AND ((o.payment_method='cod' AND o.fulfilment_status='delivered') OR (o.payment_method<>'cod' AND o.payment_status='payment_verified'))),0) recognized_revenue
 FROM public.orders o JOIN public.order_items i ON i.order_id=o.id JOIN public.products p ON p.id=i.product_id
 WHERE o.created_at>=p_from AND o.created_at<p_to AND o.fulfilment_status<>'cancelled' GROUP BY coalesce(nullif(p.category,''),'Unclassified'))x $$;

CREATE OR REPLACE FUNCTION public.analytics_coupons(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN jsonb_build_object(
    'available', false,
    'reason', 'Coupon usage is not tracked on orders yet.',
    'coupons', '[]'::jsonb
  );
END;
$function$
;
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
           OR (o.payment_method = 'cod' AND o.fulfilment_status = 'delivered' AND o.payment_status<>'refunded')
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
$function$
;
CREATE OR REPLACE FUNCTION public.analytics_filters(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  BEGIN
    SELECT jsonb_build_object(
      'by_type', COALESCE((SELECT jsonb_agg(jsonb_build_object('type',filter_type,'uses',uses) ORDER BY uses DESC)
        FROM (SELECT filter_type, COUNT(*)::bigint AS uses FROM filter_events
              WHERE created_at>=p_from AND created_at<p_to GROUP BY 1) t), '[]'::jsonb),
      'by_value', COALESCE((SELECT jsonb_agg(jsonb_build_object('type',filter_type,'value',filter_value,'uses',uses) ORDER BY uses DESC)
        FROM (SELECT filter_type, filter_value, COUNT(*)::bigint AS uses FROM filter_events
              WHERE created_at>=p_from AND created_at<p_to GROUP BY 1,2 ORDER BY uses DESC LIMIT 20) t), '[]'::jsonb),
      'total_uses', (SELECT COUNT(*)::bigint FROM filter_events WHERE created_at>=p_from AND created_at<p_to)
    ) INTO v_result;
  END;
  RETURN v_result;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.analytics_geography(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'city', city,
      'orders', orders,
      'revenue', revenue,
      'cancelled', cancelled,
      'cancellation_rate', CASE WHEN (orders+cancelled)>0 THEN ROUND(100.0*cancelled/(orders+cancelled),1) ELSE 0 END
    ) ORDER BY revenue DESC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT customer_city AS city,
        COUNT(*) FILTER (WHERE fulfilment_status <> 'cancelled')::bigint AS orders,
        COALESCE(SUM(total) FILTER (WHERE fulfilment_status <> 'cancelled'),0)::bigint AS revenue,
        COUNT(*) FILTER (WHERE fulfilment_status = 'cancelled')::bigint AS cancelled
      FROM orders
      WHERE created_at >= p_from AND created_at < p_to
        AND customer_city IS NOT NULL AND btrim(customer_city) <> ''
      GROUP BY 1
    ) t;
  END;
  RETURN v_result;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.analytics_issues(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
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
  INTO v_ord, v_gov2, v_aov FROM orders WHERE created_at>=p_from AND created_at<p_to AND fulfilment_status<>'cancelled';
  SELECT COUNT(*) INTO v_can FROM orders WHERE created_at>=p_from AND created_at<p_to AND fulfilment_status='cancelled';

  -- New/repeat: simpler approach with NOT EXISTS
  BEGIN
    SELECT COUNT(*) INTO v_new FROM (
      SELECT DISTINCT customer_phone FROM orders
      WHERE created_at>=p_from AND created_at<p_to
      AND customer_phone IS NOT NULL AND btrim(customer_phone)<>''
      AND NOT EXISTS (
        SELECT 1 FROM orders o2
        WHERE o2.customer_phone = orders.customer_phone
        AND o2.created_at < p_from
      )
    ) t;
    SELECT COUNT(*) INTO v_repeat FROM (
      SELECT DISTINCT customer_phone FROM orders
      WHERE created_at>=p_from AND created_at<p_to
      AND customer_phone IS NOT NULL AND btrim(customer_phone)<>''
      AND EXISTS (
        SELECT 1 FROM orders o2
        WHERE o2.customer_phone = orders.customer_phone
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
    LEFT JOIN (SELECT date_trunc('day',created_at AT TIME ZONE 'Asia/Karachi') AS day, SUM(total)::bigint AS revenue, COUNT(*)::bigint AS orders FROM orders WHERE created_at>=p_from AND created_at<p_to AND fulfilment_status<>'cancelled' GROUP BY 1) s ON s.day=d.day;
  END;

  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('method',payment_method,'orders',orders,'gross_value',gross_value) ORDER BY gross_value DESC),'[]'::jsonb)
    INTO v_pay FROM (SELECT payment_method, COUNT(*)::bigint AS orders, SUM(total)::bigint AS gross_value FROM orders WHERE created_at>=p_from AND created_at<p_to AND fulfilment_status<>'cancelled' GROUP BY 1) t;
  END;

  BEGIN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('status',fulfilment_status,'orders',orders) ORDER BY CASE fulfilment_status WHEN 'new' THEN 1 WHEN 'sourcing' THEN 2 WHEN 'packed' THEN 3 WHEN 'dispatched' THEN 4 WHEN 'delivered' THEN 5 WHEN 'cancelled' THEN 6 ELSE 7 END),'[]'::jsonb)
    INTO v_funnel FROM (SELECT fulfilment_status, COUNT(*)::bigint AS orders FROM orders WHERE created_at>=p_from AND created_at<p_to GROUP BY 1) t;
  END;

  RETURN jsonb_build_object('cards',v_cards,'daily',v_daily,'payment_split',v_pay,'funnel',v_funnel);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.analytics_products(p_from timestamp with time zone, p_to timestamp with time zone, p_sort text, p_limit integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.analytics_refunds(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  BEGIN
    SELECT jsonb_build_object(
      'total_cases', COUNT(*)::bigint,
      'open_cases', COUNT(*) FILTER (WHERE status IN ('open','in_progress'))::bigint,
      'resolved_cases', COUNT(*) FILTER (WHERE status IN ('resolved'))::bigint,
      'total_refund', COALESCE(SUM(refund_amount) FILTER(WHERE status='resolved'),0)::bigint,
      'avg_resolution_hours', COALESCE(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) FILTER (WHERE resolved_at IS NOT NULL),0)::numeric,
      'by_reason', COALESCE((SELECT jsonb_agg(jsonb_build_object('reason',issue_type,'count',cnt) ORDER BY cnt DESC) FROM (SELECT issue_type, COUNT(*)::bigint AS cnt FROM resolution_cases WHERE created_at>=p_from AND created_at<p_to GROUP BY 1) r), '[]'::jsonb)
    ) INTO v_result FROM resolution_cases WHERE created_at>=p_from AND created_at<p_to;
  END;
  RETURN v_result;
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
    AND fulfilment_status = 'delivered' AND payment_status<>'refunded';

  SELECT COALESCE(SUM(total), 0) INTO v_pending_cod
  FROM orders
  WHERE created_at >= p_from AND created_at < p_to
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
CREATE OR REPLACE FUNCTION public.analytics_shipping(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.analytics_wishlist(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  BEGIN
    SELECT jsonb_build_object(
      'total_adds', (SELECT COUNT(*)::bigint FROM wishlist_events WHERE action='add' AND created_at>=p_from AND created_at<p_to),
      'total_removes', (SELECT COUNT(*)::bigint FROM wishlist_events WHERE action='remove' AND created_at>=p_from AND created_at<p_to),
      'to_cart', (SELECT COUNT(*)::bigint FROM wishlist_events WHERE action='to_cart' AND created_at>=p_from AND created_at<p_to),
      'top_products', COALESCE((SELECT jsonb_agg(jsonb_build_object('product_id',product_id,'adds',adds) ORDER BY adds DESC)
        FROM (SELECT product_id, COUNT(*)::bigint AS adds FROM wishlist_events
              WHERE action='add' AND created_at>=p_from AND created_at<p_to GROUP BY 1 ORDER BY adds DESC LIMIT 20) t), '[]'::jsonb)
    ) INTO v_result;
  END;
  RETURN v_result;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.analytics_search(p_from timestamptz,p_to timestamptz) RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 WITH logs AS (SELECT * FROM public.search_logs WHERE created_at>=p_from AND created_at<p_to),
 grouped AS(SELECT lower(query) query,count(*) FILTER(WHERE clicked_product_id IS NULL) count,
 count(*) FILTER(WHERE clicked_product_id IS NULL AND results_count=0) "noResult",count(*) FILTER(WHERE clicked_product_id IS NOT NULL) clicks FROM logs GROUP BY lower(query))
 SELECT jsonb_build_object('total_searches',(SELECT count(*) FROM logs WHERE clicked_product_id IS NULL),
 'total_clicks',(SELECT count(*) FROM logs WHERE clicked_product_id IS NOT NULL),
 'total_no_results',(SELECT count(*) FROM logs WHERE clicked_product_id IS NULL AND results_count=0),
 'top_queries',coalesce((SELECT jsonb_agg(to_jsonb(g)) FROM (SELECT * FROM grouped ORDER BY count DESC,query LIMIT 25)g),'[]'),
 'no_result_queries',coalesce((SELECT jsonb_agg(to_jsonb(g)) FROM (SELECT * FROM grouped WHERE "noResult">0 ORDER BY "noResult" DESC,query LIMIT 25)g),'[]')) $$;
CREATE OR REPLACE FUNCTION public.analytics_funnel(p_from timestamptz,p_to timestamptz) RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 WITH kinds AS(SELECT x,ord FROM unnest(ARRAY['product_view','add_to_cart','cart_viewed','checkout_started','order_created']) WITH ORDINALITY a(x,ord))
 SELECT jsonb_build_object('steps',jsonb_agg(jsonb_build_object('step',x,'label',initcap(replace(x,'_',' ')),'count',
 CASE WHEN x='order_created' THEN (SELECT count(*) FROM public.orders WHERE created_at>=p_from AND created_at<p_to)
 ELSE (SELECT count(*) FROM public.funnel_events WHERE event=x AND created_at>=p_from AND created_at<p_to) END) ORDER BY ord),
 'note','Event counts are not unique people. Order Created comes from committed orders; rates are indicative.') FROM kinds $$;
CREATE OR REPLACE FUNCTION public.analytics_coupons(p_from timestamptz,p_to timestamptz) RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('available',true,'coupons',coalesce(jsonb_agg(to_jsonb(c)),'[]'),'definition','Uses are committed orders in the range. Discount excludes cancelled orders.') FROM
 (SELECT coupon_code code,count(*) uses,coalesce(sum(discount) FILTER(WHERE fulfilment_status<>'cancelled'),0) discount FROM public.orders
 WHERE created_at>=p_from AND created_at<p_to AND coupon_code IS NOT NULL GROUP BY coupon_code ORDER BY count(*) DESC,coupon_code)c $$;
REVOKE ALL ON FUNCTION public.analytics_search(timestamptz,timestamptz),public.analytics_funnel(timestamptz,timestamptz),public.analytics_coupons(timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_search(timestamptz,timestamptz),public.analytics_funnel(timestamptz,timestamptz),public.analytics_coupons(timestamptz,timestamptz) TO service_role;

COMMIT;
