-- Item 4. Apply only in the coordinated final release after a verified backup.
BEGIN;
-- Production inspection found no product FK on category assignments and zero
-- current orphans. New and existing rows must reference a real product; if data
-- has drifted before release, validation stops the migration without deleting it.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.category_products'::regclass AND conname='category_products_product_id_fkey') THEN
  ALTER TABLE public.category_products ADD CONSTRAINT category_products_product_id_fkey
   FOREIGN KEY(product_id) REFERENCES public.products(id) ON DELETE CASCADE NOT VALID;
 END IF;
END $$;
ALTER TABLE public.category_products VALIDATE CONSTRAINT category_products_product_id_fkey;
CREATE SCHEMA IF NOT EXISTS chaskabox_private;
REVOKE ALL ON SCHEMA chaskabox_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA chaskabox_private TO service_role;

-- Minimal privileged lookup: auth.sessions is intentionally not granted to the
-- service API. An authenticated UID, if present, must match the verified actor.
CREATE OR REPLACE FUNCTION chaskabox_private.session_mfa_valid(p_actor uuid,p_session uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (auth.uid() IS NULL OR auth.uid()=p_actor) AND EXISTS(
  SELECT 1 FROM auth.sessions s JOIN auth.mfa_factors f
   ON f.id=s.factor_id AND f.user_id=s.user_id
  WHERE s.id=p_session AND s.user_id=p_actor AND s.aal::text='aal2'
   AND (s.not_after IS NULL OR s.not_after>now()) AND f.status::text='verified'
 );
$$;
REVOKE ALL ON FUNCTION chaskabox_private.session_mfa_valid(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION chaskabox_private.session_mfa_valid(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.admin_session_check(p_actor uuid,p_session uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT chaskabox_private.session_mfa_valid(p_actor,p_session);
$$;
REVOKE ALL ON FUNCTION public.admin_session_check(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_session_check(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN NEW.updated_at=now();RETURN NEW;END $$;
ALTER FUNCTION public.mark_product_ai_embedding_stale() SET search_path='';
CREATE OR REPLACE FUNCTION public.assert_bundle_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=NEW.bundle_product_id AND is_bundle) THEN
  RAISE EXCEPTION 'bundle_product_id % is not flagged is_bundle',NEW.bundle_product_id;
 END IF;
 RETURN NEW;
END $$;

-- Trigger functions have no public RPC contract. Existing triggers retain their
-- execution behavior; browser callers cannot invoke privileged helpers.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND p.prorettype='pg_catalog.trigger'::regtype LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 END LOOP;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON
 public.public_products,public.public_site_settings,public.public_reviews,
 public.public_homepage_sections FROM PUBLIC,anon,authenticated;

-- Narrow server-only CMS transaction. No arbitrary SQL/table/field input. The
-- actor's database role is locked and rechecked; all operations and audit rows
-- commit together. Batch serialization prevents cross-operation lock inversion.
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
   WHEN 'categories' THEN entity='category';allowed=ARRAY['name','slug','description','image_url','mobile_image_url','icon','seo_title','seo_description','box_style','link_destination','position','is_visible','show_on_homepage','hide_if_empty','product_assignment','assignment_rule','updated_at'];
   WHEN 'category_products' THEN entity='category_assignment';k='category_id';allowed=ARRAY['category_id','product_id','position'];
   WHEN 'brands' THEN entity='brand';typ='bigint';allowed=ARRAY['name','slug','logo_url','description','hero_image_url','short_description','long_description','seo_title','seo_description','og_image_url','featured_product_ids','sort_order','is_visible','position','updated_at'];
   WHEN 'navigation_menus' THEN entity='navigation';allowed=ARRAY['location','label','url','parent_id','position','is_external','is_enabled'];
   WHEN 'homepage_sections' THEN entity='homepage';k='section_key';typ='text';allowed=ARRAY['section_key','enabled','position','heading','subheading','draft_config','config','updated_by','updated_at'];
   WHEN 'site_settings' THEN entity='settings';k='key';typ='text';allowed=ARRAY['key','value','updated_by'];
   WHEN 'theme_settings' THEN entity='theme';k='key';typ='text';allowed=ARRAY['key','value','updated_at'];
   WHEN 'notification_templates' THEN entity='template';typ='bigint';allowed=ARRAY['subject','body','is_active','updated_at'];
   WHEN 'products' THEN entity='product';typ='bigint';allowed=ARRAY['name','slug','price','old_price','brand','category','pack','description','badge','image_url','visibility','stock_state','tags','seo_title','seo_description','og_image','canonical_url','created_by','updated_by','is_bundle'];
   ELSE RAISE EXCEPTION 'Unsupported CMS table';
  END CASE;
  IF op NOT IN('insert','update','upsert','delete','delete_assignments','publish') OR op IS NULL THEN RAISE EXCEPTION 'Unsupported CMS operation'; END IF;
  IF (t='site_settings' AND v_role<>'owner') OR
   (t IN('brands','theme_settings','notification_templates') AND v_role NOT IN('owner','manager')) OR
   (op='delete' AND t IN('products','brands') AND v_role<>'owner') OR
   (op='delete' AND t='categories' AND v_role NOT IN('owner','manager')) OR
   (op='publish' AND v_role NOT IN('owner','manager')) THEN
   RAISE EXCEPTION 'Role not allowed for CMS action' USING ERRCODE='42501';
  END IF;
  IF (op='publish' AND t<>'homepage_sections') OR
   (op='delete_assignments' AND t<>'category_products') OR
   (op='upsert' AND t NOT IN('site_settings','theme_settings')) OR
   (t='category_products' AND op NOT IN('insert','delete_assignments')) OR
   (op='delete' AND t NOT IN('categories','brands','products')) OR
   (op='insert' AND t IN('homepage_sections','notification_templates','site_settings','theme_settings')) THEN
   RAISE EXCEPTION 'Unsupported CMS action for table';
  END IF;
  SELECT array_agg(key ORDER BY key) INTO fields FROM jsonb_object_keys(data) key;
  IF EXISTS(SELECT 1 FROM unnest(fields) f WHERE NOT(f=ANY(allowed))) THEN RAISE EXCEPTION 'Unsupported CMS field'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(data) e WHERE e.key IN('is_visible','show_on_homepage','hide_if_empty','is_enabled','is_external','enabled','is_active','is_bundle') AND jsonb_typeof(e.value)<>'boolean') THEN RAISE EXCEPTION 'CMS boolean must be a boolean'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(data) e WHERE e.key IN('price','old_price','position','sort_order','product_id') AND e.value<>'null' AND (jsonb_typeof(e.value)<>'number' OR e.value::text!~'^-?[0-9]+$')) THEN RAISE EXCEPTION 'CMS integer must be an integer'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(data) e WHERE NOT(e.key=ANY(ARRAY['value','price','old_price','position','sort_order','product_id','is_visible','show_on_homepage','hide_if_empty','is_enabled','is_external','enabled','is_active','is_bundle','tags','featured_product_ids','draft_config','config','assignment_rule'])) AND e.value<>'null' AND jsonb_typeof(e.value)<>'string') THEN RAISE EXCEPTION 'CMS text must be a string'; END IF;
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
REVOKE ALL ON FUNCTION public.admin_cms_transaction(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cms_transaction(uuid,jsonb) TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.categories,public.category_products,public.brands,
 public.navigation_menus,public.homepage_sections,public.site_settings,public.theme_settings,
 public.notification_templates,public.products TO service_role;
GRANT SELECT ON public.admin_roles,public.order_items,public.bundle_items TO service_role;
GRANT INSERT ON public.audit_log TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;
CREATE OR REPLACE FUNCTION public.admin_staff_assign(p_actor uuid,p_target uuid,p_role text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE assigned public.admin_roles%ROWTYPE; existing boolean;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(20261011,3);
 IF NOT EXISTS(SELECT 1 FROM public.admin_roles WHERE user_id=p_actor AND role='owner' AND active) THEN
  RAISE EXCEPTION 'Active owner required' USING ERRCODE='42501';
 END IF;
 IF p_role IS NULL OR p_role NOT IN('owner','manager','fulfilment','content') THEN RAISE EXCEPTION 'Invalid staff role'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.admin_roles WHERE user_id=p_target) INTO existing;
 IF existing THEN RETURN public.admin_staff_update(p_actor,p_target,jsonb_build_object('role',p_role,'active',true)); END IF;
 INSERT INTO public.admin_roles(user_id,role,active,granted_by) VALUES(p_target,p_role,true,p_actor) RETURNING * INTO assigned;
 INSERT INTO public.audit_log(actor_id,actor_role,action,entity_type,entity_id,after_data)
 VALUES(p_actor,'owner','role.assigned','role',p_target::text,to_jsonb(assigned));
 RETURN jsonb_build_object('staff',to_jsonb(assigned));
END $$;
REVOKE ALL ON FUNCTION public.admin_staff_assign(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_staff_assign(uuid,uuid,text) TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.admin_roles TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
