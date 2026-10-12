BEGIN;
CREATE TABLE public.product_versions(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 product_id bigint NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
 snapshot jsonb NOT NULL,after_snapshot jsonb,changed_by text,
 change_type text NOT NULL DEFAULT 'update',created_at timestamptz NOT NULL DEFAULT now(),
 reverted_at timestamptz);
CREATE INDEX product_versions_history ON public.product_versions(product_id,created_at DESC,id DESC);
ALTER TABLE public.product_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_versions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.product_versions TO service_role;
GRANT USAGE ON SEQUENCE public.product_versions_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.admin_product_draft_apply(p_actor uuid,p_id bigint,p_patch jsonb,p_expected timestamptz,p_confirm boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r text;old public.products;rows jsonb;v bigint;after_fields jsonb;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(20261011,4);
 SELECT role INTO r FROM public.admin_roles WHERE user_id=p_actor AND active FOR SHARE;
 IF r IS NULL OR r NOT IN('owner','manager','content') THEN RAISE EXCEPTION 'Active content staff required' USING ERRCODE='42501';END IF;
 IF p_confirm IS DISTINCT FROM true THEN RAISE EXCEPTION 'Explicit confirmation required';END IF;
 IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR p_patch='{}' OR octet_length(p_patch::text)>8192
 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN('description','seo_title','seo_description','tags','price','old_price')) THEN RAISE EXCEPTION 'Invalid draft fields';END IF;
 IF (p_patch?'price' OR p_patch?'old_price') AND r<>'owner' THEN RAISE EXCEPTION 'Owner price approval required' USING ERRCODE='42501';END IF;
 SELECT * INTO old FROM public.products WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product not found';END IF;
 IF p_expected IS NULL OR old.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'STALE_PRODUCT';END IF;
 rows=public.admin_cms_transaction(p_actor,jsonb_build_array(jsonb_build_object('table','products','op','update','id',p_id::text,'data',p_patch)));
 SELECT id INTO v FROM public.product_versions WHERE product_id=p_id ORDER BY id DESC LIMIT 1;
 SELECT jsonb_object_agg(k,rows->0->k) INTO after_fields FROM jsonb_object_keys(p_patch) k;
 UPDATE public.product_versions SET change_type='ai_apply',after_snapshot=after_fields WHERE id=v;
 INSERT INTO public.audit_log(actor_id,actor_role,action,entity_type,entity_id,before_data,after_data)
 VALUES(p_actor,r,'ai.applied','product',p_id::text,to_jsonb(old),jsonb_build_object('version_id',v,'fields',p_patch));
 RETURN jsonb_build_object('product',rows->0,'version_id',v);
END $$;
CREATE OR REPLACE FUNCTION public.admin_product_revert(p_actor uuid,p_id bigint,p_version bigint,p_expected timestamptz,p_confirm boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r text;old public.products;v public.product_versions;patch jsonb;rows jsonb;current_fields jsonb;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(20261011,4);
 SELECT role INTO r FROM public.admin_roles WHERE user_id=p_actor AND active FOR SHARE;
 IF r IS NULL OR r NOT IN('owner','manager') THEN RAISE EXCEPTION 'Manager/owner required' USING ERRCODE='42501';END IF;
 IF p_confirm IS DISTINCT FROM true THEN RAISE EXCEPTION 'Explicit revert confirmation required';END IF;
 SELECT * INTO old FROM public.products WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR p_expected IS NULL OR old.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'STALE_PRODUCT';END IF;
 SELECT * INTO v FROM public.product_versions WHERE id=p_version AND product_id=p_id FOR UPDATE;
 IF NOT FOUND OR v.reverted_at IS NOT NULL THEN RAISE EXCEPTION 'Version unavailable';END IF;
 IF v.after_snapshot IS NOT NULL THEN
  SELECT jsonb_object_agg(k,to_jsonb(old)->k) INTO current_fields FROM jsonb_object_keys(v.after_snapshot) k;
  IF current_fields IS DISTINCT FROM v.after_snapshot THEN RAISE EXCEPTION 'UNDO_CONFLICT';END IF;
 END IF;
 SELECT coalesce(jsonb_object_agg(key,value),'{}') INTO patch FROM jsonb_each(v.snapshot)
 WHERE key IN('name','slug','description','category','brand','pack','badge','image_url','stock_state','visibility',
 'seo_title','seo_description','og_image','canonical_url','tags','price','old_price')
 AND (v.after_snapshot IS NULL OR v.after_snapshot?key) AND value IS DISTINCT FROM to_jsonb(old)->key;
 IF (patch?'price' OR patch?'old_price') AND r<>'owner' THEN RAISE EXCEPTION 'Owner required to revert prices' USING ERRCODE='42501';END IF;
 IF patch='{}' THEN RAISE EXCEPTION 'Version has no changed fields';END IF;
 rows=public.admin_cms_transaction(p_actor,jsonb_build_array(jsonb_build_object('table','products','op','update','id',p_id::text,'data',patch)));
 UPDATE public.product_versions SET reverted_at=now() WHERE id=p_version;
 INSERT INTO public.audit_log(actor_id,actor_role,action,entity_type,entity_id,before_data,after_data)
 VALUES(p_actor,r,'product.reverted','product',p_id::text,to_jsonb(old),jsonb_build_object('version_id',p_version,'patch',patch));
 RETURN jsonb_build_object('product',rows->0,'reverted_version_id',p_version);
END $$;
REVOKE ALL ON FUNCTION public.admin_product_draft_apply(uuid,bigint,jsonb,timestamptz,boolean),public.admin_product_revert(uuid,bigint,bigint,timestamptz,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_product_draft_apply(uuid,bigint,jsonb,timestamptz,boolean),public.admin_product_revert(uuid,bigint,bigint,timestamptz,boolean) TO service_role;

CREATE TABLE chaskabox_private.ai_days(day date PRIMARY KEY,accounted_neuron_estimate int NOT NULL DEFAULT 0 CHECK(accounted_neuron_estimate>=0));
CREATE TABLE chaskabox_private.ai_requests(id uuid PRIMARY KEY,day date NOT NULL REFERENCES chaskabox_private.ai_days(day),
 actor_id uuid,feature text NOT NULL,model text NOT NULL,reserved int NOT NULL,accounted int NOT NULL,
 status text NOT NULL DEFAULT 'reserved',reported_usage jsonb,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz);
CREATE TABLE chaskabox_private.ai_cache(key text PRIMARY KEY CHECK(key~'^[0-9a-f]{64}$'),result jsonb NOT NULL,expires_at timestamptz NOT NULL,
 CHECK(octet_length(result::text)<=300000));
CREATE INDEX ai_requests_day ON chaskabox_private.ai_requests(day);
CREATE INDEX ai_requests_retention ON chaskabox_private.ai_requests(created_at);
CREATE INDEX ai_image_actor_rate ON chaskabox_private.ai_requests(actor_id,created_at) WHERE feature='image';
CREATE INDEX ai_cache_expiry ON chaskabox_private.ai_cache(expires_at);
GRANT SELECT,INSERT,UPDATE,DELETE ON chaskabox_private.ai_days,chaskabox_private.ai_requests,chaskabox_private.ai_cache TO service_role;
INSERT INTO public.site_settings(key,value) VALUES('ai_enabled','false'),('ai_text_enabled','true'),('ai_images_enabled','false'),('ai_embeddings_enabled','true'),('ai_daily_budget_neurons','8000')
 ON CONFLICT(key) DO NOTHING;
CREATE OR REPLACE FUNCTION public.ai_budget_state() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('enabled',coalesce((SELECT value='true' FROM public.site_settings WHERE key='ai_enabled'),false),
 'features',jsonb_build_object('text',coalesce((SELECT value='true' FROM public.site_settings WHERE key='ai_text_enabled'),false),
 'image',coalesce((SELECT value='true' FROM public.site_settings WHERE key='ai_images_enabled'),false),
 'embedding',coalesce((SELECT value='true' FROM public.site_settings WHERE key='ai_embeddings_enabled'),false)),
 'accounted_neuron_estimate',coalesce((SELECT accounted_neuron_estimate FROM chaskabox_private.ai_days WHERE day=(now() AT TIME ZONE 'UTC')::date),0),
 'requests_today',(SELECT count(*) FROM chaskabox_private.ai_requests WHERE day=(now() AT TIME ZONE 'UTC')::date),
 'policy_budget',coalesce((SELECT (value#>>'{}')::int FROM public.site_settings WHERE key='ai_daily_budget_neurons'),8000),
 'measurement','Conservative app reservations and estimates; not Cloudflare account billing',
 'reset_timezone','UTC') $$;
CREATE OR REPLACE FUNCTION public.ai_budget_reserve(p_id uuid,p_actor uuid,p_feature text,p_model text,p_units int,p_budget int)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d date=(now() AT TIME ZONE 'UTC')::date;used int;cap int;existing chaskabox_private.ai_requests;
BEGIN
 IF p_feature NOT IN('text','image','embedding') OR p_model NOT IN('@cf/meta/llama-3.2-3b-instruct','@cf/meta/llama-3.1-8b-instruct-fp8-fast','@cf/qwen/qwen3-30b-a3b-fp8','@cf/qwen/qwen3-embedding-0.6b','@cf/black-forest-labs/flux-1-schnell')
 OR (p_feature='image' AND p_model<>'@cf/black-forest-labs/flux-1-schnell')
 OR (p_feature='embedding' AND p_model<>'@cf/qwen/qwen3-embedding-0.6b')
 OR (p_feature='text' AND p_model NOT IN('@cf/meta/llama-3.2-3b-instruct','@cf/meta/llama-3.1-8b-instruct-fp8-fast','@cf/qwen/qwen3-30b-a3b-fp8'))
 OR p_units NOT BETWEEN 1 AND 8000 OR p_budget NOT BETWEEN 1 AND 8000 THEN RAISE EXCEPTION 'Invalid AI reservation';END IF;
 IF coalesce((SELECT value='true' FROM public.site_settings WHERE key='ai_enabled'),false) IS NOT TRUE OR
 coalesce((SELECT value='true' FROM public.site_settings WHERE key=CASE p_feature WHEN 'image' THEN 'ai_images_enabled' WHEN 'embedding' THEN 'ai_embeddings_enabled' ELSE 'ai_text_enabled' END),false) IS NOT TRUE THEN
 RETURN jsonb_build_object('allowed',false,'reason','disabled');END IF;
 cap=least(p_budget,coalesce((SELECT (value#>>'{}')::int FROM public.site_settings WHERE key='ai_daily_budget_neurons'),8000),8000);
 IF p_feature='image' THEN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ai-image:'||coalesce(p_actor::text,'anonymous'),0));
  IF (SELECT count(*) FROM chaskabox_private.ai_requests WHERE feature='image' AND actor_id IS NOT DISTINCT FROM p_actor AND created_at>now()-interval '1 hour')>=10 THEN
   RETURN jsonb_build_object('allowed',false,'reason','image_rate_limited');END IF;
 END IF;
 INSERT INTO chaskabox_private.ai_days(day) VALUES(d) ON CONFLICT DO NOTHING;
 SELECT accounted_neuron_estimate INTO used FROM chaskabox_private.ai_days WHERE day=d FOR UPDATE;
 SELECT * INTO existing FROM chaskabox_private.ai_requests WHERE id=p_id;
 IF FOUND THEN RETURN jsonb_build_object('allowed',false,'reason','request_already_reserved');END IF;
 IF used+p_units>cap THEN RETURN jsonb_build_object('allowed',false,'reason','budget_exhausted','accounted_neuron_estimate',used);END IF;
 INSERT INTO chaskabox_private.ai_requests(id,day,actor_id,feature,model,reserved,accounted) VALUES(p_id,d,p_actor,p_feature,p_model,p_units,p_units);
 UPDATE chaskabox_private.ai_days SET accounted_neuron_estimate=accounted_neuron_estimate+p_units WHERE day=d;
 RETURN jsonb_build_object('allowed',true,'request_id',p_id,'reserved_neuron_estimate',p_units);
END $$;
CREATE OR REPLACE FUNCTION public.ai_budget_finish(p_id uuid,p_success boolean,p_usage jsonb,p_estimate int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r chaskabox_private.ai_requests;n int;
BEGIN
 -- Lock the day before the request, as reservation does, to avoid lock inversion.
 SELECT * INTO r FROM chaskabox_private.ai_requests WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'AI reservation missing';END IF;
 PERFORM 1 FROM chaskabox_private.ai_days WHERE day=r.day FOR UPDATE;
 SELECT * INTO r FROM chaskabox_private.ai_requests WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AI reservation missing';END IF;
 IF r.status<>'reserved' THEN RETURN public.ai_budget_state();END IF;
 n=CASE WHEN p_success AND p_estimate IS NOT NULL THEN greatest(1,p_estimate) ELSE r.reserved END;
 IF octet_length(coalesce(p_usage,'{}')::text)>1024 THEN RAISE EXCEPTION 'Invalid usage metadata';END IF;
 UPDATE chaskabox_private.ai_days SET accounted_neuron_estimate=accounted_neuron_estimate+n-r.accounted WHERE day=r.day;
 UPDATE chaskabox_private.ai_requests SET status=CASE WHEN p_success THEN 'completed' ELSE 'failed_or_unknown' END,
 accounted=n,reported_usage=p_usage,finished_at=now() WHERE id=p_id;
 RETURN public.ai_budget_state();
END $$;
CREATE OR REPLACE FUNCTION public.ai_cache_get(p_key text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT result FROM chaskabox_private.ai_cache WHERE key=p_key AND expires_at>now()
 AND coalesce((SELECT value='true' FROM public.site_settings WHERE key='ai_enabled'),false) $$;
CREATE OR REPLACE FUNCTION public.ai_cache_put(p_key text,p_result jsonb,p_seconds int) RETURNS void
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 DELETE FROM chaskabox_private.ai_cache WHERE key IN(SELECT key FROM chaskabox_private.ai_cache WHERE expires_at<now() LIMIT 100);
 INSERT INTO chaskabox_private.ai_cache(key,result,expires_at) VALUES(p_key,p_result,now()+make_interval(secs=>least(greatest(p_seconds,1),3600)))
 ON CONFLICT(key) DO UPDATE SET result=EXCLUDED.result,expires_at=EXCLUDED.expires_at;
END $$;
REVOKE ALL ON FUNCTION public.ai_budget_state(),public.ai_budget_reserve(uuid,uuid,text,text,int,int),public.ai_budget_finish(uuid,boolean,jsonb,int),public.ai_cache_get(text),public.ai_cache_put(text,jsonb,int) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_budget_state(),public.ai_budget_reserve(uuid,uuid,text,text,int,int),public.ai_budget_finish(uuid,boolean,jsonb,int),public.ai_cache_get(text),public.ai_cache_put(text,jsonb,int) TO service_role;

ALTER TABLE public.products ADD COLUMN ai_embedding_model text;
ALTER TABLE public.products ADD COLUMN ai_embedding_hash text;
CREATE OR REPLACE FUNCTION public.product_index_text(p public.products) RETURNS text
 LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT left('Name: '||coalesce(p.name,'')||E'\nBrand: '||coalesce(p.brand,'')||E'\nCategory: '||coalesce(p.category,'')||
 E'\nPack: '||coalesce(p.pack,'')||E'\nDescription: '||coalesce(p.description,'')||E'\nTags: '||coalesce(array_to_string(p.tags,', '),''),6000) $$;
REVOKE ALL ON FUNCTION public.product_index_text(public.products) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.product_index_text(public.products) TO service_role;
CREATE OR REPLACE FUNCTION public.ai_index_status(p_model text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('visible',count(*),'current',count(*) FILTER(WHERE ai_embedding IS NOT NULL AND ai_embedding_model=p_model
 AND ai_embedding_text=public.product_index_text(p) AND ai_embedding_hash=md5(public.product_index_text(p))),
 'remaining',count(*) FILTER(WHERE ai_embedding IS NULL OR ai_embedding_model IS DISTINCT FROM p_model OR ai_embedding_text IS DISTINCT FROM public.product_index_text(p)
 OR ai_embedding_hash IS DISTINCT FROM md5(public.product_index_text(p)))) FROM public.products p WHERE visibility='visible' AND stock_state<>'unavailable' $$;
CREATE OR REPLACE FUNCTION public.ai_index_batch(p_model text,p_limit int DEFAULT 12) RETURNS SETOF public.products
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM public.products p WHERE visibility='visible' AND stock_state<>'unavailable' AND (ai_embedding IS NULL
 OR ai_embedding_model IS DISTINCT FROM p_model OR ai_embedding_text IS DISTINCT FROM public.product_index_text(p)
 OR ai_embedding_hash IS DISTINCT FROM md5(public.product_index_text(p))) ORDER BY id LIMIT least(greatest(p_limit,1),12) $$;
CREATE OR REPLACE FUNCTION public.set_product_ai_embeddings(p_rows jsonb) RETURNS integer
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item jsonb;p public.products;changed int=0;
BEGIN
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)>12 OR octet_length(p_rows::text)>1048576 THEN RAISE EXCEPTION 'Invalid embedding batch';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_rows) ORDER BY (value->>'id')::bigint LOOP
  IF item->>'model'<>'@cf/qwen/qwen3-embedding-0.6b' THEN RAISE EXCEPTION 'Unsupported embedding model';END IF;
  SELECT * INTO p FROM public.products WHERE id=(item->>'id')::bigint AND visibility='visible' AND stock_state<>'unavailable' FOR UPDATE;
  IF NOT FOUND OR p.updated_at IS DISTINCT FROM (item->>'expected_updated_at')::timestamptz OR public.product_index_text(p) IS DISTINCT FROM item->>'text' THEN CONTINUE;END IF;
  IF extensions.vector_dims((item->>'embedding')::extensions.vector)<>1024 THEN RAISE EXCEPTION 'Embedding dimension mismatch';END IF;
  UPDATE public.products SET ai_embedding=(item->>'embedding')::extensions.vector,ai_embedding_text=item->>'text',
   ai_embedding_model=item->>'model',ai_embedding_hash=md5(item->>'text'),ai_embedding_updated_at=now() WHERE id=p.id;
  changed=changed+1;
 END LOOP;RETURN changed;
END $$;
CREATE OR REPLACE FUNCTION public.match_indexed_products(p_model text,p_query_embedding text,p_match_count int DEFAULT 8,p_match_threshold real DEFAULT .4)
RETURNS TABLE(id bigint,slug text,name text,brand text,category text,pack text,price int,old_price int,description text,badge text,image_url text,is_bundle boolean,similarity real)
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,extensions AS $$
 SELECT p.id,p.slug,p.name,p.brand,p.category,p.pack,p.price,p.old_price,p.description,p.badge,p.image_url,p.is_bundle,
 (1-(p.ai_embedding<=>p_query_embedding::extensions.vector))::real FROM public.products p WHERE p.visibility='visible' AND p.stock_state<>'unavailable'
 AND p.ai_embedding IS NOT NULL AND p.ai_embedding_model=p_model AND p.ai_embedding_hash=md5(public.product_index_text(p))
 AND p.ai_embedding_text=public.product_index_text(p) AND 1-(p.ai_embedding<=>p_query_embedding::extensions.vector)>=greatest(.4,p_match_threshold)
 ORDER BY p.ai_embedding<=>p_query_embedding::extensions.vector,p.id LIMIT least(greatest(p_match_count,1),20) $$;
REVOKE ALL ON FUNCTION public.ai_index_status(text),public.ai_index_batch(text,int),public.set_product_ai_embeddings(jsonb),public.match_indexed_products(text,text,int,real),public.match_public_products(text,int,real) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_index_status(text),public.ai_index_batch(text,int),public.set_product_ai_embeddings(jsonb),public.match_indexed_products(text,text,int,real) TO service_role;

CREATE OR REPLACE FUNCTION public.ai_catalogue_snapshot() RETURNS jsonb
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('total',count(*),'visible',count(*) FILTER(WHERE visibility='visible'),
 'draft',count(*) FILTER(WHERE visibility='draft'),'hidden',count(*) FILTER(WHERE visibility='hidden'),
 'archived',count(*) FILTER(WHERE visibility='archived'),'limited',count(*) FILTER(WHERE stock_state='limited'),
 'unavailable',count(*) FILTER(WHERE stock_state='unavailable'),'missing_photo',count(*) FILTER(WHERE nullif(btrim(image_url),'') IS NULL))
 FROM public.products $$;
CREATE OR REPLACE FUNCTION public.ai_attention_snapshot() RETURNS jsonb
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('new_orders',count(*) FILTER(WHERE fulfilment_status='new'),
 'payment_review',count(*) FILTER(WHERE payment_status='payment_submitted'),
 'stale_new',count(*) FILTER(WHERE fulfilment_status='new' AND created_at<now()-interval '30 minutes'),
 'notification_review',public.notification_summary()->'review_required')
 FROM public.orders $$;
REVOKE ALL ON FUNCTION public.ai_catalogue_snapshot(),public.ai_attention_snapshot() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_catalogue_snapshot(),public.ai_attention_snapshot() TO service_role;

ALTER TABLE public.notification_templates ADD COLUMN version int NOT NULL DEFAULT 1 CHECK(version>0);
CREATE TABLE chaskabox_private.notification_template_versions(
 template_id bigint NOT NULL REFERENCES public.notification_templates(id),version int NOT NULL,
 subject text,body text NOT NULL,is_active boolean NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(template_id,version));
GRANT SELECT,INSERT ON chaskabox_private.notification_template_versions TO service_role;
INSERT INTO chaskabox_private.notification_template_versions(template_id,version,subject,body,is_active)
 SELECT id,version,subject,body,is_active FROM public.notification_templates;
CREATE OR REPLACE FUNCTION public.validate_notification_template() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE content text;placeholder text[];
BEGIN
 IF NEW.body IS NULL OR length(btrim(NEW.body))=0 OR length(NEW.body)>7000 OR length(coalesce(NEW.subject,''))>200 THEN RAISE EXCEPTION 'Invalid notification template length';END IF;
 content=coalesce(NEW.subject,'')||E'\n'||NEW.body;
 FOR placeholder IN SELECT regexp_matches(content,'\{\{\s*(\w+)\s*\}\}','g') LOOP
  IF placeholder[1] NOT IN('order_number','customer_name','customer_phone','total','payment_method','payment_status','tracking_url','admin_url','status_text','delivery_estimate','support_email','support_whatsapp') THEN
   RAISE EXCEPTION 'Unknown notification placeholder: %',placeholder[1];END IF;
 END LOOP;
 IF regexp_replace(content,'\{\{\s*(\w+)\s*\}\}','','g')~'\{\{|\}\}' THEN RAISE EXCEPTION 'Malformed notification placeholder';END IF;
 IF TG_OP='UPDATE' THEN
  NEW.version=OLD.version+CASE WHEN ROW(NEW.subject,NEW.body,NEW.is_active) IS DISTINCT FROM ROW(OLD.subject,OLD.body,OLD.is_active) THEN 1 ELSE 0 END;
 ELSE NEW.version=1;END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.record_notification_template() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 INSERT INTO chaskabox_private.notification_template_versions(template_id,version,subject,body,is_active)
 VALUES(NEW.id,NEW.version,NEW.subject,NEW.body,NEW.is_active) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER notification_template_validate BEFORE INSERT OR UPDATE ON public.notification_templates FOR EACH ROW EXECUTE FUNCTION public.validate_notification_template();
CREATE TRIGGER notification_template_record AFTER INSERT OR UPDATE ON public.notification_templates FOR EACH ROW EXECUTE FUNCTION public.record_notification_template();
REVOKE ALL ON FUNCTION public.validate_notification_template(),public.record_notification_template() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_notification_template(),public.record_notification_template() TO service_role;
CREATE OR REPLACE FUNCTION public.admin_template_save(p_actor uuid,p_id bigint,p_patch jsonb,p_expected timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r text;t public.notification_templates;rows jsonb;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(20261011,4);
 SELECT role INTO r FROM public.admin_roles WHERE user_id=p_actor AND active FOR SHARE;
 IF r IS NULL OR r NOT IN('owner','manager') THEN RAISE EXCEPTION 'Owner/manager required' USING ERRCODE='42501';END IF;
 SELECT * INTO t FROM public.notification_templates WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR p_expected IS NULL OR t.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'STALE_TEMPLATE';END IF;
 IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR p_patch='{}' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_patch) k WHERE k NOT IN('subject','body','is_active')) THEN RAISE EXCEPTION 'Invalid template patch';END IF;
 rows=public.admin_cms_transaction(p_actor,jsonb_build_array(jsonb_build_object('table','notification_templates','op','update','id',p_id::text,'data',p_patch||jsonb_build_object('updated_at',now()))));
 RETURN rows->0;
END $$;
REVOKE ALL ON FUNCTION public.admin_template_save(uuid,bigint,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_template_save(uuid,bigint,jsonb,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.validate_site_setting()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  n numeric;
  s text;
BEGIN
  IF NEW.key IN ('cod_enabled','jazzcash_enabled','bank_transfer_enabled','ai_customer_assistant_enabled','ai_semantic_search_enabled','ai_enabled','ai_text_enabled','ai_images_enabled','ai_embeddings_enabled') THEN
    IF jsonb_typeof(NEW.value) <> 'boolean' THEN RAISE EXCEPTION '% must be boolean', NEW.key; END IF;
  ELSIF NEW.key IN ('cod_delivery_fee_pkr','prepaid_delivery_fee_pkr','prepaid_free_delivery_threshold_pkr') THEN
    IF jsonb_typeof(NEW.value) <> 'number' THEN RAISE EXCEPTION '% must be a number', NEW.key; END IF;
    n := (NEW.value #>> '{}')::numeric;
    IF NEW.key = 'prepaid_free_delivery_threshold_pkr' THEN
      IF n < 0 OR n > 1000000 OR n <> trunc(n) THEN RAISE EXCEPTION '% out of range', NEW.key; END IF;
    ELSE
      IF n < 0 OR n > 100000 OR n <> trunc(n) THEN RAISE EXCEPTION '% out of range', NEW.key; END IF;
    END IF;
  ELSIF NEW.key = 'ai_daily_budget_neurons' THEN
    IF jsonb_typeof(NEW.value) <> 'number' THEN RAISE EXCEPTION 'AI budget must be integer'; END IF;
    n := (NEW.value #>> '{}')::numeric;
    IF n < 1 OR n > 8000 OR n <> trunc(n) THEN RAISE EXCEPTION 'AI budget must be 1..8000'; END IF;
  ELSIF NEW.key = 'delivery_estimate' THEN
    IF jsonb_typeof(NEW.value) <> 'string' THEN RAISE EXCEPTION 'delivery_estimate must be text'; END IF;
    s := NEW.value #>> '{}'; IF length(btrim(s)) < 2 OR length(s) > 80 THEN RAISE EXCEPTION 'delivery_estimate invalid'; END IF;
  ELSIF NEW.key = 'support_email' THEN
    IF jsonb_typeof(NEW.value) <> 'string' THEN RAISE EXCEPTION 'support_email must be text'; END IF;
    s := NEW.value #>> '{}'; IF length(s) > 254 OR s !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RAISE EXCEPTION 'support_email invalid'; END IF;
  ELSIF NEW.key = 'support_whatsapp' THEN
    IF jsonb_typeof(NEW.value) <> 'string' THEN RAISE EXCEPTION 'support_whatsapp must be text'; END IF;
    s := NEW.value #>> '{}'; IF length(s) > 25 OR s !~ '^[+0-9 ()-]{7,25}$' THEN RAISE EXCEPTION 'support_whatsapp invalid'; END IF;
  ELSIF NEW.key = 'store_address' THEN
    IF jsonb_typeof(NEW.value) <> 'string' THEN RAISE EXCEPTION 'store_address must be text'; END IF;
    s := NEW.value #>> '{}'; IF length(btrim(s)) < 3 OR length(s) > 300 THEN RAISE EXCEPTION 'store_address invalid'; END IF;
  ELSIF NEW.key = 'jazzcash_till_id' THEN
    IF jsonb_typeof(NEW.value) <> 'string' THEN RAISE EXCEPTION 'jazzcash_till_id must be text'; END IF;
    s := NEW.value #>> '{}'; IF length(s) > 40 OR s !~ '^[A-Za-z0-9 -]{3,40}$' THEN RAISE EXCEPTION 'jazzcash_till_id invalid'; END IF;
  ELSIF NEW.key = 'jazzcash_qr_url' THEN
    IF jsonb_typeof(NEW.value) <> 'string' THEN RAISE EXCEPTION 'jazzcash_qr_url must be text'; END IF;
    s := NEW.value #>> '{}'; IF length(s) > 500 OR s !~ '^(https://|/)[^[:space:]]+$' THEN RAISE EXCEPTION 'jazzcash_qr_url invalid'; END IF;
  ELSIF NEW.key = 'promo_text' THEN
    IF jsonb_typeof(NEW.value) <> 'string' THEN RAISE EXCEPTION 'promo_text must be text'; END IF;
    s := NEW.value #>> '{}'; IF length(btrim(s)) < 1 OR length(s) > 180 THEN RAISE EXCEPTION 'promo_text invalid'; END IF;
  ELSIF NEW.key = 'bank_transfer_details' THEN
    IF jsonb_typeof(NEW.value) <> 'object' OR pg_column_size(NEW.value) > 4096 THEN RAISE EXCEPTION 'bank_transfer_details invalid'; END IF;
    IF length(btrim(COALESCE(NEW.value->>'bank',''))) < 2 OR length(COALESCE(NEW.value->>'bank','')) > 100 THEN RAISE EXCEPTION 'bank name invalid'; END IF;
    IF length(btrim(COALESCE(NEW.value->>'account_title',''))) < 2 OR length(COALESCE(NEW.value->>'account_title','')) > 120 THEN RAISE EXCEPTION 'account title invalid'; END IF;
    IF length(btrim(COALESCE(NEW.value->>'account_number',''))) < 4 OR length(COALESCE(NEW.value->>'account_number','')) > 80 THEN RAISE EXCEPTION 'account number invalid'; END IF;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE VIEW public.public_products WITH(security_invoker=true) AS
 SELECT id,slug,name,brand,category,pack,price,old_price,description,badge,image_url,is_bundle,stock_state,tags
 FROM public.products WHERE visibility='visible';
-- Only the unedited legacy default is replaced; custom approved copy is retained.
UPDATE public.notification_templates
 SET body=E'ChaskaBox — Shukriya {{customer_name}}!\nOrder {{order_number}} (Rs. {{total}}) has been received.\nPayment: {{payment_status}}\nDelivery estimate: {{delivery_estimate}}\nTrack: {{tracking_url}}',
 variables=ARRAY['customer_name','order_number','total','payment_status','delivery_estimate','tracking_url'],updated_at=now()
 WHERE name='order_thankyou_customer'
 AND replace(replace(body,E'\\n',E'\n'),'has been received.','is confirmed!')=E'🍬 *ChaskaBox* — Shukriya {{customer_name}}!\n\nYour order *{{order_number}}* (Rs. {{total}}) is confirmed!\n\nWe''ll source your snacks fresh and deliver in 4-7 days.\nTrack: {{tracking_url}}';
-- A new owner WhatsApp template requires review/enable before dispatch.
INSERT INTO public.notification_templates(name,channel,body,variables,is_active)
 VALUES('order_received_owner_whatsapp','whatsapp',E'New ChaskaBox order {{order_number}}\nCustomer: {{customer_name}} ({{customer_phone}})\nTotal: Rs. {{total}}\nPayment: {{payment_method}} ({{payment_status}})\nView: {{admin_url}}',ARRAY['order_number','customer_name','customer_phone','total','payment_method','payment_status','admin_url'],false)
 ON CONFLICT(name) DO NOTHING;
CREATE OR REPLACE FUNCTION public.ai_maintenance_run() RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE requests int;days int;caches int;
BEGIN
 DELETE FROM chaskabox_private.ai_requests WHERE id IN(SELECT id FROM chaskabox_private.ai_requests WHERE created_at<now()-interval '30 days' ORDER BY created_at LIMIT 1000);
 GET DIAGNOSTICS requests=ROW_COUNT;
 DELETE FROM chaskabox_private.ai_days WHERE day IN(SELECT d.day FROM chaskabox_private.ai_days d WHERE d.day<(now() AT TIME ZONE 'UTC')::date-30 AND NOT EXISTS(SELECT 1 FROM chaskabox_private.ai_requests r WHERE r.day=d.day) ORDER BY day LIMIT 1000);
 GET DIAGNOSTICS days=ROW_COUNT;
 DELETE FROM chaskabox_private.ai_cache WHERE key IN(SELECT key FROM chaskabox_private.ai_cache WHERE expires_at<now() ORDER BY expires_at LIMIT 1000);
 GET DIAGNOSTICS caches=ROW_COUNT;
 RETURN jsonb_build_object('requests_deleted',requests,'days_deleted',days,'expired_cache_deleted',caches,'retention_days',30);
END $$;
REVOKE ALL ON FUNCTION public.ai_maintenance_run() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_maintenance_run() TO service_role;
COMMIT;
