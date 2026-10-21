BEGIN;
-- Service-only, explicit projections. Browser callers retain their existing RLS.
CREATE FUNCTION public.admin_account_directory(p_actor uuid,p_q text DEFAULT '',p_id uuid DEFAULT NULL,p_limit int DEFAULT 25,p_offset int DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; result jsonb;
BEGIN
 SELECT role INTO r FROM public.admin_roles WHERE user_id=p_actor AND active;
 IF r IS NULL OR r NOT IN('owner','manager') THEN RAISE EXCEPTION 'Account access denied' USING ERRCODE='42501';END IF;
 IF length(coalesce(p_q,''))>100 OR p_offset<0 OR p_offset>100000 THEN RAISE EXCEPTION 'Invalid account search';END IF;
 WITH filtered AS(
  SELECT u.id,u.email,u.email_confirmed_at IS NOT NULL email_confirmed,u.created_at,
   coalesce(p.name,u.raw_user_meta_data->>'name','') name,coalesce(p.phone,'') phone,p.updated_at
  FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id
  WHERE u.email IS NOT NULL AND (p_id IS NULL OR u.id=p_id)
  AND (coalesce(p_q,'')='' OR u.email ILIKE '%'||p_q||'%' OR p.name ILIKE '%'||p_q||'%' OR p.phone ILIKE '%'||p_q||'%')
 ), page AS(SELECT * FROM filtered ORDER BY created_at DESC,id LIMIT least(greatest(p_limit,1),100) OFFSET p_offset)
 SELECT jsonb_build_object('accounts',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC,a.id) FROM page a),'[]'),'total',(SELECT count(*) FROM filtered)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_account_directory(uuid,text,uuid,int,int) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_account_directory(uuid,text,uuid,int,int) TO service_role;

-- All owner edits and their before/after audit evidence commit together.
CREATE FUNCTION public.admin_account_mutate(p_actor uuid,p_user uuid,p_action text,p_id uuid DEFAULT NULL,p_expected timestamptz DEFAULT NULL,p_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;before_row jsonb;after_row jsonb;a public.addresses;pr public.profiles;entity text;item_id text;v_label text;v_city text;v_address text;
BEGIN
 SELECT role INTO r FROM public.admin_roles WHERE user_id=p_actor AND active FOR SHARE;
 IF r IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Owner account access required' USING ERRCODE='42501';END IF;
 IF p_user IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user) THEN RAISE EXCEPTION 'Account not found';END IF;
 IF p_action IS NULL OR p_action NOT IN('profile','address_create','address_update','address_delete','address_default') THEN RAISE EXCEPTION 'Invalid account action';END IF;
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR pg_column_size(p_data)>8192 THEN RAISE EXCEPTION 'Invalid account data';END IF;
 -- Same lock as customer_address_default: only one default survives concurrent edits.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,20261012));
 IF p_action='profile' THEN
  IF (p_data-ARRAY['name','phone'])<>'{}' OR jsonb_typeof(p_data->'name') IS DISTINCT FROM 'string' OR jsonb_typeof(p_data->'phone') IS DISTINCT FROM 'string'
   OR length(btrim(p_data->>'name')) NOT BETWEEN 2 AND 100
   OR ((p_data->>'phone')<>'' AND p_data->>'phone'!~'^[+0-9 ()-]{7,25}$') THEN RAISE EXCEPTION 'Invalid profile data';END IF;
  SELECT * INTO pr FROM public.profiles WHERE id=p_user FOR UPDATE;
  IF pr.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'STALE_ACCOUNT';END IF;
  before_row=CASE WHEN pr.id IS NULL THEN NULL ELSE to_jsonb(pr) END;
  IF pr.id IS NULL THEN
   INSERT INTO public.profiles(id,name,phone) VALUES(p_user,btrim(p_data->>'name'),btrim(p_data->>'phone')) RETURNING to_jsonb(profiles) INTO after_row;
  ELSE
   UPDATE public.profiles SET name=btrim(p_data->>'name'),phone=btrim(p_data->>'phone'),updated_at=clock_timestamp() WHERE id=p_user RETURNING to_jsonb(profiles) INTO after_row;
  END IF;
  entity='customer_profile';item_id=p_user::text;
 ELSE
  entity='customer_address';
  IF p_action<>'address_create' THEN
   SELECT * INTO a FROM public.addresses WHERE id=p_id AND user_id=p_user FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Address not found';END IF;
   IF a.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'STALE_ACCOUNT';END IF;
   before_row=to_jsonb(a);
  END IF;
  IF p_action IN('address_create','address_update') THEN
   IF (p_data-ARRAY['label','city','address'])<>'{}' OR jsonb_typeof(p_data->'label') IS DISTINCT FROM 'string' OR jsonb_typeof(p_data->'city') IS DISTINCT FROM 'string' OR jsonb_typeof(p_data->'address') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid address fields';END IF;
   v_label=btrim(p_data->>'label');v_city=btrim(p_data->>'city');v_address=btrim(p_data->>'address');
   IF length(v_label) NOT BETWEEN 1 AND 40 OR length(v_city) NOT BETWEEN 2 AND 100 OR length(v_address) NOT BETWEEN 5 AND 440 THEN RAISE EXCEPTION 'Invalid address data';END IF;
   IF p_action='address_create' THEN
    INSERT INTO public.addresses(user_id,label,city,address) VALUES(p_user,v_label,v_city,v_address) RETURNING * INTO a;
   ELSE UPDATE public.addresses SET label=v_label,city=v_city,address=v_address,updated_at=clock_timestamp() WHERE id=p_id AND user_id=p_user RETURNING * INTO a;END IF;
   after_row=to_jsonb(a);
  ELSIF p_action='address_delete' THEN
   IF p_data<>'{}' THEN RAISE EXCEPTION 'Unexpected address data';END IF;
   DELETE FROM public.addresses WHERE id=p_id AND user_id=p_user;after_row=NULL;
  ELSE
   IF p_data<>'{}' THEN RAISE EXCEPTION 'Unexpected address data';END IF;
   SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO before_row FROM public.addresses x WHERE user_id=p_user AND (is_default OR id=p_id);
   UPDATE public.addresses SET is_default=false,updated_at=clock_timestamp() WHERE user_id=p_user AND is_default AND id<>p_id;
   UPDATE public.addresses SET is_default=true,updated_at=clock_timestamp() WHERE id=p_id AND user_id=p_user RETURNING * INTO a;
   SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO after_row FROM public.addresses x WHERE user_id=p_user AND (id=p_id OR id IN(SELECT (v->>'id')::uuid FROM jsonb_array_elements(before_row) v));
  END IF;
  item_id=a.id::text;
 END IF;
 INSERT INTO public.audit_log(actor_id,actor_role,action,entity_type,entity_id,before_data,after_data)
 VALUES(p_actor,r,CASE WHEN p_action='address_delete' THEN 'delete' WHEN before_row IS NULL THEN 'create' ELSE 'update' END,entity,item_id,before_row,after_row);
 RETURN jsonb_build_object('saved',true,'record',after_row);
END $$;
REVOKE ALL ON FUNCTION public.admin_account_mutate(uuid,uuid,text,uuid,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_account_mutate(uuid,uuid,text,uuid,timestamptz,jsonb) TO service_role;

CREATE FUNCTION public.admin_account_portal_settings(p_actor uuid,p_expected timestamptz,p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE before_row jsonb;after_row jsonb;r text;k text;
BEGIN
 SELECT role INTO r FROM public.admin_roles WHERE user_id=p_actor AND active FOR SHARE;
 IF r IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Owner portal access required' USING ERRCODE='42501';END IF;
 IF p_value IS NULL OR jsonb_typeof(p_value)<>'object' OR (p_value-ARRAY['heading','message','show_addresses','show_wishlist','show_reviews','show_reorder','show_link_orders'])<>'{}' THEN RAISE EXCEPTION 'Invalid portal options';END IF;
 IF jsonb_typeof(p_value->'heading') IS DISTINCT FROM 'string' OR length(btrim(p_value->>'heading')) NOT BETWEEN 1 AND 90
 OR jsonb_typeof(p_value->'message') IS DISTINCT FROM 'string' OR length(btrim(p_value->>'message')) NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'Invalid portal copy';END IF;
 FOREACH k IN ARRAY ARRAY['show_addresses','show_wishlist','show_reviews','show_reorder','show_link_orders'] LOOP
  IF jsonb_typeof(p_value->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid portal flag';END IF;
 END LOOP;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('account_portal',20261021));
 SELECT to_jsonb(s) INTO before_row FROM public.site_settings s WHERE key='account_portal' FOR UPDATE;
 IF (before_row->>'updated_at')::timestamptz IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'STALE_ACCOUNT';END IF;
 INSERT INTO public.site_settings(key,value,updated_by) VALUES('account_portal',p_value,p_actor)
 ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=p_actor,updated_at=clock_timestamp()
 RETURNING to_jsonb(site_settings) INTO after_row;
 INSERT INTO public.audit_log(actor_id,actor_role,action,entity_type,entity_id,before_data,after_data)
 VALUES(p_actor,r,'update','settings','account_portal',before_row,after_row);
 RETURN jsonb_build_object('portal',after_row->'value','updated_at',after_row->'updated_at');
END $$;
REVOKE ALL ON FUNCTION public.admin_account_portal_settings(uuid,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_account_portal_settings(uuid,timestamptz,jsonb) TO service_role;
COMMIT;
