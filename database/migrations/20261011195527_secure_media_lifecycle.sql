-- Package 7: private operation ledger, conservative monthly admission, atomic media audit,
-- deletion tombstones and reference fencing. No Storage bytes are changed by this migration.
ALTER TABLE public.media ADD COLUMN bucket text NOT NULL DEFAULT 'product-media' CHECK(bucket IN('product-media','brand-assets'));
ALTER TABLE public.media ADD COLUMN width int CHECK(width BETWEEN 1 AND 1024);
ALTER TABLE public.media ADD COLUMN height int CHECK(height BETWEEN 1 AND 1024);
ALTER TABLE public.media ADD COLUMN state text NOT NULL DEFAULT 'active' CHECK(state IN('active','deleting','deleted'));
CREATE TABLE chaskabox_private.media_operations(
 id uuid PRIMARY KEY,actor_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('upload','delete')),
 media_id uuid,bucket text NOT NULL CHECK(bucket IN('product-media','brand-assets')),object_path text NOT NULL,
 state text NOT NULL CHECK(state IN('reserved','registered','aborting','cleaned','cleanup_failed','delete_pending','deleted')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_operations_review ON chaskabox_private.media_operations(state,created_at);
CREATE INDEX media_operations_budget ON chaskabox_private.media_operations(created_at) WHERE kind='upload';
REVOKE ALL ON chaskabox_private.media_operations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON chaskabox_private.media_operations TO service_role;
INSERT INTO public.site_settings(key,value) VALUES('media_upload_enabled','false'),('media_monthly_transform_limit','1000') ON CONFLICT(key) DO NOTHING;

CREATE FUNCTION chaskabox_private.media_staff(p_actor uuid,p_manage boolean DEFAULT false) RETURNS text
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r text;BEGIN
 SELECT role INTO r FROM public.admin_roles WHERE user_id=p_actor AND active FOR SHARE;
 IF r IS NULL OR r NOT IN('owner','manager','content') OR (p_manage AND r='content') THEN
 RAISE EXCEPTION 'Active media staff required' USING ERRCODE='42501';END IF;RETURN r;
END $$;
CREATE FUNCTION chaskabox_private.media_setting_validate() RETURNS trigger
 LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.key='media_upload_enabled' AND jsonb_typeof(NEW.value) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Media enabled must be boolean';END IF;
 IF NEW.key='media_monthly_transform_limit' AND (jsonb_typeof(NEW.value) IS DISTINCT FROM 'number' OR NEW.value::text!~'^[0-9]+$' OR (NEW.value#>>'{}')::numeric NOT BETWEEN 1 AND 1000) THEN RAISE EXCEPTION 'Media limit must be 1..1000';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER media_setting_validate BEFORE INSERT OR UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION chaskabox_private.media_setting_validate();

CREATE FUNCTION public.media_upload_reserve(p_actor uuid,p_id uuid,p_bucket text,p_kind text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r text;op chaskabox_private.media_operations;cap int;BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(20261011,7);r=chaskabox_private.media_staff(p_actor);
 IF p_id IS NULL OR p_bucket NOT IN('product-media','brand-assets') OR
 (p_bucket='product-media' AND p_kind<>'products') OR (p_bucket='brand-assets' AND (p_kind NOT IN('logo','hero') OR r='content')) THEN RAISE EXCEPTION 'Invalid media reservation';END IF;
 IF coalesce((SELECT value='true' FROM public.site_settings WHERE key='media_upload_enabled'),false) IS NOT TRUE THEN RAISE EXCEPTION 'MEDIA_UPLOAD_DISABLED';END IF;
 cap=least(coalesce((SELECT (value#>>'{}')::int FROM public.site_settings WHERE key='media_monthly_transform_limit'),1000),1000);
 IF (SELECT count(*) FROM chaskabox_private.media_operations WHERE kind='upload' AND created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')>=cap THEN RAISE EXCEPTION 'MEDIA_MONTHLY_LIMIT';END IF;
 INSERT INTO chaskabox_private.media_operations(id,actor_id,kind,bucket,object_path,state)
 VALUES(p_id,p_actor,'upload',p_bucket,p_kind||'/'||to_char(now() AT TIME ZONE 'UTC','YYYY/MM')||'/'||p_id::text||'.webp','reserved') RETURNING * INTO op;
 RETURN to_jsonb(op);
END $$;
CREATE FUNCTION public.media_upload_register(p_actor uuid,p_id uuid,p_size int,p_width int,p_height int) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r text;op chaskabox_private.media_operations;m public.media;BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(20261011,7);r=chaskabox_private.media_staff(p_actor);
 SELECT * INTO op FROM chaskabox_private.media_operations WHERE id=p_id AND actor_id=p_actor AND kind='upload' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MEDIA_OPERATION_CONFLICT';END IF;
 IF op.state='registered' THEN SELECT * INTO m FROM public.media WHERE id=op.media_id;RETURN to_jsonb(m);END IF;
 IF op.state<>'reserved' THEN RAISE EXCEPTION 'MEDIA_OPERATION_CONFLICT';END IF;
 IF p_size IS NULL OR p_size NOT BETWEEN 1 AND 2097152 OR p_width IS NULL OR p_height IS NULL OR p_width NOT BETWEEN 1 AND 1024 OR p_height NOT BETWEEN 1 AND 1024 THEN RAISE EXCEPTION 'Invalid normalized image';END IF;
 INSERT INTO public.media(id,bucket,object_path,mime_type,size_bytes,uploaded_by,width,height)
 VALUES(op.id,op.bucket,op.object_path,'image/webp',p_size,p_actor,p_width,p_height) RETURNING * INTO m;
 INSERT INTO public.audit_log(actor_id,actor_role,action,entity_type,entity_id,after_data)
 VALUES(p_actor,r,'media.uploaded','media',m.id::text,to_jsonb(m));
 UPDATE chaskabox_private.media_operations SET media_id=m.id,state='registered',updated_at=now() WHERE id=p_id;
 RETURN to_jsonb(m);
END $$;
CREATE FUNCTION public.media_upload_abort(p_actor uuid,p_id uuid,p_recovery boolean DEFAULT false) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r text;op chaskabox_private.media_operations;m public.media;BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(20261011,7);r=chaskabox_private.media_staff(p_actor,p_recovery);
 SELECT * INTO op FROM chaskabox_private.media_operations WHERE id=p_id AND kind='upload' FOR UPDATE;
 IF NOT FOUND OR (op.actor_id<>p_actor AND r='content') THEN RAISE EXCEPTION 'MEDIA_OPERATION_CONFLICT';END IF;
 IF op.state='registered' THEN SELECT * INTO m FROM public.media WHERE id=op.media_id;RETURN jsonb_build_object('media',to_jsonb(m));END IF;
 IF (p_recovery OR op.actor_id<>p_actor) AND op.created_at>now()-interval '15 minutes' THEN RAISE EXCEPTION 'MEDIA_OPERATION_CONFLICT';END IF;
 IF op.state NOT IN('reserved','aborting','cleaned','cleanup_failed') THEN RAISE EXCEPTION 'MEDIA_OPERATION_CONFLICT';END IF;
 UPDATE chaskabox_private.media_operations SET state='aborting',updated_at=now() WHERE id=p_id RETURNING * INTO op;
 RETURN to_jsonb(op);
END $$;
CREATE FUNCTION public.media_upload_cleanup_finish(p_actor uuid,p_id uuid,p_cleaned boolean) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r text;op chaskabox_private.media_operations;BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(20261011,7);r=chaskabox_private.media_staff(p_actor);
 SELECT * INTO op FROM chaskabox_private.media_operations WHERE id=p_id AND kind='upload' FOR UPDATE;
 IF NOT FOUND OR (op.actor_id<>p_actor AND r='content') OR op.state<>'aborting' OR p_cleaned IS NULL THEN RAISE EXCEPTION 'MEDIA_OPERATION_CONFLICT';END IF;
 UPDATE chaskabox_private.media_operations SET state=CASE WHEN p_cleaned THEN 'cleaned' ELSE 'cleanup_failed' END,updated_at=now() WHERE id=p_id RETURNING * INTO op;
 INSERT INTO public.audit_log(actor_id,actor_role,action,entity_type,entity_id,after_data)
 VALUES(p_actor,r,'media.upload_cleanup','media_operation',p_id::text,jsonb_build_object('state',op.state,'object_path',op.object_path));
 RETURN to_jsonb(op);
END $$;
CREATE FUNCTION chaskabox_private.media_referenced(p_path text) RETURNS boolean
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM (
  SELECT to_jsonb(p)::text doc FROM public.products p
  UNION ALL SELECT to_jsonb(b)::text FROM public.brands b
  UNION ALL SELECT to_jsonb(c)::text FROM public.categories c
  UNION ALL SELECT to_jsonb(h)::text FROM public.homepage_sections h
  UNION ALL SELECT to_jsonb(t)::text FROM public.theme_settings t
  UNION ALL SELECT to_jsonb(s)::text FROM public.site_settings s
  UNION ALL SELECT to_jsonb(n)::text FROM public.navigation_menus n
  UNION ALL SELECT to_jsonb(v)::text FROM public.product_versions v
 ) refs WHERE strpos(refs.doc,p_path)>0) $$;
CREATE FUNCTION chaskabox_private.media_reference_fence() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(20261011,7);
 IF EXISTS(SELECT 1 FROM public.media m WHERE m.state IN('deleting','deleted') AND strpos(to_jsonb(NEW)::text,m.object_path)>0) THEN RAISE EXCEPTION 'MEDIA_UNAVAILABLE';END IF;
 RETURN NEW;
END $$;
DO $$
DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['products','brands','categories','homepage_sections','theme_settings','site_settings','navigation_menus','product_versions'] LOOP
 EXECUTE format('CREATE TRIGGER media_reference_fence BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION chaskabox_private.media_reference_fence()',t);
 END LOOP;
END $$;
CREATE FUNCTION public.media_delete_reserve(p_actor uuid,p_media uuid) RETURNS jsonb
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
 IF m.object_path!~'^(products|logo|hero)/[0-9]{4}/[0-9]{2}/[a-f0-9-]{36}\.(png|jpg|jpeg|webp|avif)$' THEN RAISE EXCEPTION 'MEDIA_OPERATION_CONFLICT';END IF;
 UPDATE public.media SET state='deleting' WHERE id=p_media;
 INSERT INTO chaskabox_private.media_operations(id,actor_id,kind,media_id,bucket,object_path,state)
 VALUES(gen_random_uuid(),p_actor,'delete',m.id,m.bucket,m.object_path,'delete_pending') RETURNING * INTO op;
 INSERT INTO public.audit_log(actor_id,actor_role,action,entity_type,entity_id,before_data,after_data)
 VALUES(p_actor,r,'media.delete_requested','media',m.id::text,to_jsonb(m),jsonb_build_object('operation_id',op.id,'state','deleting'));
 RETURN to_jsonb(op);
END $$;
CREATE FUNCTION public.media_delete_finish(p_actor uuid,p_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r text;op chaskabox_private.media_operations;m public.media;BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(20261011,7);r=chaskabox_private.media_staff(p_actor);
 SELECT * INTO op FROM chaskabox_private.media_operations WHERE id=p_id AND kind='delete' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'MEDIA_OPERATION_CONFLICT';END IF;
 IF op.state='deleted' THEN RETURN to_jsonb(op);END IF;
 IF op.state<>'delete_pending' THEN RAISE EXCEPTION 'MEDIA_OPERATION_CONFLICT';END IF;
 UPDATE public.media SET state='deleted' WHERE id=op.media_id AND state='deleting' RETURNING * INTO m;
 IF NOT FOUND THEN RAISE EXCEPTION 'MEDIA_OPERATION_CONFLICT';END IF;
 UPDATE chaskabox_private.media_operations SET state='deleted',updated_at=now() WHERE id=p_id RETURNING * INTO op;
 INSERT INTO public.audit_log(actor_id,actor_role,action,entity_type,entity_id,before_data,after_data)
 VALUES(p_actor,r,'media.deleted','media',m.id::text,jsonb_build_object('object_path',m.object_path),jsonb_build_object('state','deleted'));
 RETURN to_jsonb(op);
END $$;
CREATE FUNCTION public.media_operation_review(p_actor uuid,p_page int DEFAULT 1) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE rows jsonb;n int;BEGIN
 PERFORM chaskabox_private.media_staff(p_actor,true);
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Invalid page';END IF;
 SELECT count(*) INTO n FROM chaskabox_private.media_operations WHERE state IN('reserved','aborting','cleanup_failed','delete_pending');
 SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO rows FROM(SELECT * FROM chaskabox_private.media_operations WHERE state IN('reserved','aborting','cleanup_failed','delete_pending') ORDER BY created_at,id LIMIT 25 OFFSET (p_page-1)*25) q;
 RETURN jsonb_build_object('operations',rows,'page',p_page,'per_page',25,'total',n,'total_pages',ceil(n/25.0));
END $$;
CREATE FUNCTION public.media_operation_get(p_actor uuid,p_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE op chaskabox_private.media_operations;BEGIN
 PERFORM chaskabox_private.media_staff(p_actor,true);
 SELECT * INTO op FROM chaskabox_private.media_operations WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'MEDIA_OPERATION_CONFLICT';END IF;
 RETURN to_jsonb(op);
END $$;
REVOKE ALL ON FUNCTION chaskabox_private.media_staff(uuid,boolean),chaskabox_private.media_referenced(text),chaskabox_private.media_reference_fence(),chaskabox_private.media_setting_validate(),
 public.media_upload_reserve(uuid,uuid,text,text),public.media_upload_register(uuid,uuid,int,int,int),
 public.media_upload_abort(uuid,uuid,boolean),public.media_upload_cleanup_finish(uuid,uuid,boolean),public.media_delete_reserve(uuid,uuid),
 public.media_delete_finish(uuid,uuid),public.media_operation_review(uuid,int),public.media_operation_get(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION chaskabox_private.media_staff(uuid,boolean),chaskabox_private.media_referenced(text),chaskabox_private.media_reference_fence(),chaskabox_private.media_setting_validate(),
 public.media_upload_reserve(uuid,uuid,text,text),public.media_upload_register(uuid,uuid,int,int,int),
 public.media_upload_abort(uuid,uuid,boolean),public.media_upload_cleanup_finish(uuid,uuid,boolean),public.media_delete_reserve(uuid,uuid),
 public.media_delete_finish(uuid,uuid),public.media_operation_review(uuid,int),public.media_operation_get(uuid,uuid) TO service_role;
-- These dormant templates have no implemented consent or reward/abandonment pipeline.
UPDATE public.notification_templates SET is_active=false,updated_at=now() WHERE name IN('abandoned_cart','birthday_greeting');
