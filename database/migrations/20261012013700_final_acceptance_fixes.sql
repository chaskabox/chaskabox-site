BEGIN;
WITH ranked AS(SELECT id,row_number() OVER(PARTITION BY user_id ORDER BY created_at DESC,id DESC) n FROM public.addresses WHERE is_default)
UPDATE public.addresses a SET is_default=false FROM ranked r WHERE a.id=r.id AND r.n>1;
CREATE UNIQUE INDEX addresses_one_default ON public.addresses(user_id) WHERE is_default;
CREATE FUNCTION public.customer_address_default(p_address uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE who uuid=auth.uid();a public.addresses;
BEGIN
 IF who IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(who::text,20261012));
 SELECT * INTO a FROM public.addresses WHERE id=p_address AND user_id=who FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Address unavailable' USING ERRCODE='42501';END IF;
 UPDATE public.addresses SET is_default=false WHERE user_id=who AND is_default;
 UPDATE public.addresses SET is_default=true WHERE id=p_address AND user_id=who RETURNING * INTO a;
 RETURN to_jsonb(a);
END $$;
REVOKE ALL ON FUNCTION public.customer_address_default(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.customer_address_default(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.analytics_attention() RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 WITH counts AS(
  SELECT 'notification_failures'::text type,'high'::text severity,'Notification delivery issues'::text title,count(*) cnt,'/admin#notifications'::text link
   FROM public.notification_deliveries WHERE status IN('blocked','uncertain','dead') OR delivery_status IN('failed','complained')
  UNION ALL SELECT 'missing_images','medium','Products missing images',count(*),'/admin#products'
   FROM public.products WHERE visibility='visible' AND coalesce(btrim(image_url),'')=''
  UNION ALL SELECT 'stuck_orders','high','Orders stuck over 5 days',count(*),'/admin#orders'
   FROM public.orders WHERE fulfilment_status IN('new','sourcing','packed','dispatched') AND created_at<now()-interval '5 days'
  UNION ALL SELECT 'broken_boxes','high','Boxes without components',count(*),'/admin#boxes'
   FROM public.products p WHERE visibility<>'archived' AND bundle_kind='curated' AND NOT EXISTS(SELECT 1 FROM public.bundle_items b WHERE b.bundle_product_id=p.id)
  UNION ALL SELECT 'low_sellers_30d','low','No recognized sales in 30 days',count(*),'/admin#products'
   FROM public.products p WHERE visibility='visible' AND NOT is_bundle
    AND NOT EXISTS(SELECT 1 FROM public.order_items i JOIN public.orders o ON o.id=i.order_id
      WHERE i.product_id=p.id AND o.created_at>=now()-interval '30 days' AND o.fulfilment_status<>'cancelled'
      AND o.payment_status<>'refunded' AND ((o.payment_method='cod' AND o.fulfilment_status='delivered') OR (o.payment_method<>'cod' AND o.payment_status='payment_verified')))
 )
 SELECT jsonb_build_object('generated_at',now(),'items',coalesce(jsonb_agg(jsonb_build_object(
 'type',type,'severity',severity,'title',title,'count',cnt,'link',link,'detail',cnt::text||' matching record(s).')
 ORDER BY CASE severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,cnt DESC) FILTER(WHERE cnt>0),'[]')) FROM counts $$;
CREATE FUNCTION public.admin_attention_summary() RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 WITH needs AS(
  SELECT o.*,'payment_review'::text reason FROM public.orders o WHERE payment_status IN('payment_submitted','pending_verification') AND fulfilment_status<>'cancelled'
  UNION ALL SELECT o.*,'stale_new_order' FROM public.orders o WHERE fulfilment_status='new' AND created_at<=now()-interval '30 minutes'
  UNION ALL SELECT o.*,'notification_failed' FROM public.orders o WHERE EXISTS(
   SELECT 1 FROM public.notification_deliveries d WHERE d.order_id=o.id AND (d.status IN('blocked','uncertain','dead') OR d.delivery_status IN('failed','complained')))
 ),samples AS(SELECT id,order_number,customer_name,customer_phone,total,payment_method,payment_status,fulfilment_status,created_at,
  greatest(0,floor(extract(epoch FROM now()-created_at)/60))::int age_minutes,reason FROM needs ORDER BY created_at,id,reason LIMIT 60),
 stats AS(SELECT public.notification_summary() n)
 SELECT jsonb_build_object('generated_at',now(),'counts',jsonb_build_object(
 'new_orders',(SELECT count(*) FROM public.orders WHERE fulfilment_status='new'),
 'payment_review',(SELECT count(*) FROM needs WHERE reason='payment_review'),
 'stale_new_orders',(SELECT count(*) FROM needs WHERE reason='stale_new_order'),
 'notification_issues',n->'review_required','outbox',n->'owner_outbox','customer_outbox',n->'customer_outbox'),
 'needs_attention',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM samples s),'[]'),
 'needs_attention_total',(SELECT count(*) FROM needs),'sample_limit',60) FROM stats $$;
REVOKE ALL ON FUNCTION public.analytics_attention(),public.admin_attention_summary() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_attention(),public.admin_attention_summary() TO service_role;
CREATE FUNCTION public.admin_dashboard_metrics(p_days int) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
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
 INTO result FROM public.orders WHERE created_at>=now()-make_interval(days=>p_days);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_dashboard_metrics(int) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_metrics(int) TO service_role;

-- QR admission is owner-only and the output preserves the source pixel grid.
CREATE OR REPLACE FUNCTION public.media_upload_reserve(p_actor uuid,p_id uuid,p_bucket text,p_kind text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r text;op chaskabox_private.media_operations;cap int;BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(20261011,7);r=chaskabox_private.media_staff(p_actor);
 IF p_id IS NULL OR p_bucket NOT IN('product-media','brand-assets') OR
 (p_bucket='product-media' AND (p_kind NOT IN('products','qr') OR (p_kind='qr' AND r<>'owner'))) OR (p_bucket='brand-assets' AND (p_kind NOT IN('logo','hero') OR r='content')) THEN RAISE EXCEPTION 'Invalid media reservation';END IF;
 IF coalesce((SELECT value='true' FROM public.site_settings WHERE key='media_upload_enabled'),false) IS NOT TRUE THEN RAISE EXCEPTION 'MEDIA_UPLOAD_DISABLED';END IF;
 cap=least(coalesce((SELECT (value#>>'{}')::int FROM public.site_settings WHERE key='media_monthly_transform_limit'),1000),1000);
 IF (SELECT count(*) FROM chaskabox_private.media_operations WHERE kind='upload' AND created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')>=cap THEN RAISE EXCEPTION 'MEDIA_MONTHLY_LIMIT';END IF;
 INSERT INTO chaskabox_private.media_operations(id,actor_id,kind,bucket,object_path,state)
 VALUES(p_id,p_actor,'upload',p_bucket,p_kind||'/'||to_char(now() AT TIME ZONE 'UTC','YYYY/MM')||'/'||p_id::text||CASE WHEN p_kind='qr' THEN '.png' ELSE '.webp' END,'reserved') RETURNING * INTO op;
 RETURN to_jsonb(op);
END $$;
CREATE OR REPLACE FUNCTION public.media_upload_register(p_actor uuid,p_id uuid,p_size int,p_width int,p_height int) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r text;op chaskabox_private.media_operations;m public.media;BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(20261011,7);r=chaskabox_private.media_staff(p_actor);
 SELECT * INTO op FROM chaskabox_private.media_operations WHERE id=p_id AND actor_id=p_actor AND kind='upload' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MEDIA_OPERATION_CONFLICT';END IF;
 IF (op.bucket='brand-assets' AND r='content') OR (op.object_path LIKE 'qr/%' AND r<>'owner') THEN RAISE EXCEPTION 'Active authorized media staff required' USING ERRCODE='42501';END IF;
 IF op.state='registered' THEN SELECT * INTO m FROM public.media WHERE id=op.media_id;RETURN to_jsonb(m);END IF;
 IF op.state<>'reserved' THEN RAISE EXCEPTION 'MEDIA_OPERATION_CONFLICT';END IF;
 IF p_size IS NULL OR p_size NOT BETWEEN 1 AND 2097152 OR p_width IS NULL OR p_height IS NULL OR p_width NOT BETWEEN 1 AND 1024 OR p_height NOT BETWEEN 1 AND 1024 THEN RAISE EXCEPTION 'Invalid normalized image';END IF;
 INSERT INTO public.media(id,bucket,object_path,mime_type,size_bytes,uploaded_by,width,height)
 VALUES(op.id,op.bucket,op.object_path,CASE WHEN op.object_path LIKE 'qr/%' THEN 'image/png' ELSE 'image/webp' END,p_size,p_actor,p_width,p_height) RETURNING * INTO m;
 INSERT INTO public.audit_log(actor_id,actor_role,action,entity_type,entity_id,after_data)
 VALUES(p_actor,r,'media.uploaded','media',m.id::text,to_jsonb(m));
 UPDATE chaskabox_private.media_operations SET media_id=m.id,state='registered',updated_at=now() WHERE id=p_id;
 RETURN to_jsonb(m);
END $$;
CREATE OR REPLACE FUNCTION public.media_delete_reserve(p_actor uuid,p_media uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r text;m public.media;op chaskabox_private.media_operations;BEGIN
 -- CMS -> media -> row: the same lock order used by reference writes.
 PERFORM pg_catalog.pg_advisory_xact_lock(20261011,4);
 PERFORM pg_catalog.pg_advisory_xact_lock(20261011,7);r=chaskabox_private.media_staff(p_actor);
 SELECT * INTO m FROM public.media WHERE id=p_media FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MEDIA_UNAVAILABLE';END IF;
 IF m.state IN('deleting','deleted') THEN
 SELECT * INTO op FROM chaskabox_private.media_operations WHERE media_id=p_media AND kind='delete' ORDER BY created_at DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'MEDIA_OPERATION_CONFLICT';END IF;RETURN to_jsonb(op);END IF;
 IF chaskabox_private.media_referenced(m.object_path) THEN RAISE EXCEPTION 'MEDIA_REFERENCED';END IF;
 IF m.object_path!~'^(products|logo|hero|qr)/[0-9]{4}/[0-9]{2}/[a-f0-9-]{36}\.(png|jpg|jpeg|webp|avif)$' THEN RAISE EXCEPTION 'MEDIA_OPERATION_CONFLICT';END IF;
 UPDATE public.media SET state='deleting' WHERE id=p_media;
 INSERT INTO chaskabox_private.media_operations(id,actor_id,kind,media_id,bucket,object_path,state)
 VALUES(gen_random_uuid(),p_actor,'delete',m.id,m.bucket,m.object_path,'delete_pending') RETURNING * INTO op;
 INSERT INTO public.audit_log(actor_id,actor_role,action,entity_type,entity_id,before_data,after_data)
 VALUES(p_actor,r,'media.delete_requested','media',m.id::text,to_jsonb(m),jsonb_build_object('operation_id',op.id,'state','deleting'));
 RETURN to_jsonb(op);
END $$;

COMMIT;
