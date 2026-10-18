-- Additive public-copy CMS. Drafts/history have no browser grants or policies.
CREATE SCHEMA chaskabox_content;
REVOKE ALL ON SCHEMA chaskabox_content FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA chaskabox_content TO service_role;
CREATE TABLE chaskabox_content.pages(
 page_key text PRIMARY KEY CHECK(page_key~'^[a-z0-9_-]{1,100}$'),
 published jsonb NOT NULL DEFAULT '{"fields":{}}',draft jsonb,
 revision integer NOT NULL DEFAULT 0,updated_by uuid,updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(octet_length(published::text)<=64000),CHECK(draft IS NULL OR octet_length(draft::text)<=64000)
);
CREATE TABLE chaskabox_content.page_versions(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,page_key text NOT NULL REFERENCES chaskabox_content.pages(page_key),
 before_content jsonb NOT NULL,after_content jsonb NOT NULL,actor_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX page_versions_page_recent ON chaskabox_content.page_versions(page_key,id DESC);
ALTER TABLE chaskabox_content.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chaskabox_content.page_versions ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON chaskabox_content.pages TO service_role;
GRANT SELECT,INSERT ON chaskabox_content.page_versions TO service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA chaskabox_content TO service_role;

CREATE FUNCTION public.page_copy_read(p_keys text[]) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_object_agg(page_key,published),'{}') FROM chaskabox_content.pages WHERE page_key=ANY(p_keys)
$$;
CREATE FUNCTION public.admin_page_copy_list() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('key',page_key,'revision',revision,'has_draft',draft IS NOT NULL,'updated_at',updated_at)),'[]') FROM chaskabox_content.pages
$$;
CREATE FUNCTION public.admin_page_copy_get(p_key text) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('key',p_key,'revision',coalesce(p.revision,0),'published',coalesce(p.published,'{"fields":{}}'),
 'draft',p.draft,'updated_at',p.updated_at,'versions',coalesce((SELECT jsonb_agg(v) FROM
 (SELECT id,before_content,after_content,created_at FROM chaskabox_content.page_versions WHERE page_key=p_key ORDER BY id DESC LIMIT 10)v),'[]'))
 FROM (SELECT 1) one LEFT JOIN chaskabox_content.pages p ON p.page_key=p_key
$$;
CREATE FUNCTION public.admin_page_copy_mutate(p_actor uuid,p_key text,p_action text,p_expected integer,p_content jsonb DEFAULT NULL,p_version bigint DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r text;old chaskabox_content.pages;next_content jsonb;k text;v jsonb;new_version bigint;
BEGIN
 SELECT role INTO r FROM public.admin_roles WHERE user_id=p_actor AND active FOR SHARE;
 IF r IS NULL OR r NOT IN('owner','manager','content') THEN RAISE EXCEPTION 'Content staff required' USING ERRCODE='42501';END IF;
 IF p_key IS NULL OR p_key!~'^[a-z0-9_-]{1,100}$' OR p_action IS NULL OR p_action NOT IN('draft','publish','rollback') THEN RAISE EXCEPTION 'Invalid page action';END IF;
 IF p_action<>'draft' AND r NOT IN('owner','manager') THEN RAISE EXCEPTION 'Manager/owner required to publish' USING ERRCODE='42501';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('page-copy:'||p_key,0));
 INSERT INTO chaskabox_content.pages(page_key) VALUES(p_key) ON CONFLICT DO NOTHING;
 SELECT * INTO old FROM chaskabox_content.pages WHERE page_key=p_key FOR UPDATE;
 IF p_expected IS NULL OR old.revision<>p_expected THEN RAISE EXCEPTION 'STALE_PAGE';END IF;
 IF p_action='draft' THEN next_content=p_content;
 ELSIF p_action='publish' THEN next_content=old.draft;IF next_content IS NULL THEN RAISE EXCEPTION 'Save a draft first';END IF;
 ELSE
  SELECT before_content INTO next_content FROM chaskabox_content.page_versions WHERE id=p_version AND page_key=p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Version not found';END IF;
 END IF;
 IF next_content IS NULL OR jsonb_typeof(next_content)<>'object' OR octet_length(next_content::text)>64000 OR
 EXISTS(SELECT 1 FROM jsonb_object_keys(next_content) f WHERE f NOT IN('fields','seo_title','seo_description')) THEN RAISE EXCEPTION 'Invalid page content';END IF;
 IF next_content?'fields' AND jsonb_typeof(next_content->'fields')<>'object' THEN RAISE EXCEPTION 'Invalid text fields';END IF;
 FOR k,v IN SELECT * FROM jsonb_each(coalesce(next_content->'fields','{}')) LOOP
  IF k!~'^t_[0-9a-f]{8}$' OR jsonb_typeof(v)<>'string' OR length(v#>>'{}')>3000 OR (v#>>'{}')~'[<>]' THEN RAISE EXCEPTION 'Invalid text field';END IF;
 END LOOP;
 FOR k IN SELECT jsonb_object_keys(next_content) LOOP
  IF k IN('seo_title','seo_description') AND (jsonb_typeof(next_content->k)<>'string' OR length(next_content->>k)>CASE WHEN k='seo_title' THEN 70 ELSE 170 END OR (next_content->>k)~'[<>]') THEN RAISE EXCEPTION 'Invalid SEO text';END IF;
 END LOOP;
 IF p_action='draft' THEN
  UPDATE chaskabox_content.pages SET draft=next_content,revision=revision+1,updated_by=p_actor,updated_at=clock_timestamp() WHERE page_key=p_key;
 ELSE
  INSERT INTO chaskabox_content.page_versions(page_key,before_content,after_content,actor_id) VALUES(p_key,old.published,next_content,p_actor) RETURNING id INTO new_version;
  UPDATE chaskabox_content.pages SET published=next_content,draft=NULL,revision=revision+1,updated_by=p_actor,updated_at=clock_timestamp() WHERE page_key=p_key;
 END IF;
 INSERT INTO public.audit_log(actor_id,actor_role,action,entity_type,entity_id,before_data,after_data)
 VALUES(p_actor,r,'page_copy.'||p_action,'page_copy',p_key,jsonb_build_object('revision',old.revision),jsonb_build_object('revision',old.revision+1,'version_id',new_version));
 RETURN public.admin_page_copy_get(p_key);
END $$;
REVOKE ALL ON FUNCTION public.page_copy_read(text[]),public.admin_page_copy_list(),public.admin_page_copy_get(text),public.admin_page_copy_mutate(uuid,text,text,integer,jsonb,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.page_copy_read(text[]),public.admin_page_copy_list(),public.admin_page_copy_get(text),public.admin_page_copy_mutate(uuid,text,text,integer,jsonb,bigint) TO service_role;
