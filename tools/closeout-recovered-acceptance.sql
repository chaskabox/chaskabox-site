-- Native acceptance ONLY inside tools/recovery-drill.mjs's disposable offline clone.
-- No production credentials, real user impersonation, orders or provider calls.
BEGIN;
DO $guard$
BEGIN
 IF current_database()<>'chaskabox_recovery' THEN RAISE EXCEPTION 'Offline recovery database required'; END IF;
 IF current_setting('chaskabox.offline_closeout',true) IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'Offline container verification required'; END IF;
END $guard$;
SELECT set_config('chaskabox.qa_owner',gen_random_uuid()::text,true),
 set_config('chaskabox.qa_manager',gen_random_uuid()::text,true),
 set_config('chaskabox.qa_content',gen_random_uuid()::text,true),
 set_config('chaskabox.qa_fulfilment',gen_random_uuid()::text,true),
 set_config('chaskabox.qa_inactive',gen_random_uuid()::text,true),
 set_config('chaskabox.qa_page','closeout_'||replace(gen_random_uuid()::text,'-',''),true);
CREATE TEMP TABLE closeout_counts AS SELECT
 (SELECT count(*) FROM public.products) products,
 (SELECT count(*) FROM public.orders) orders,
 (SELECT count(*) FROM public.admin_roles) roles,
 (SELECT count(*) FROM auth.users) users,
 (SELECT count(*) FROM chaskabox_content.pages) pages,
 (SELECT count(*) FROM chaskabox_content.page_versions) versions,
 (SELECT count(*) FROM public.audit_log) audits,
 (SELECT count(*) FROM chaskabox_agents.agent_jobs) jobs,
 (SELECT count(*) FROM chaskabox_agents.agent_events) events,
 (SELECT count(*) FROM chaskabox_agents.agent_alerts) alerts;
INSERT INTO auth.users(id,email,aud,role,created_at,updated_at)
 SELECT current_setting('chaskabox.qa_'||r)::uuid,
 'offline-closeout-'||r||'-'||current_setting('chaskabox.qa_'||r)||'@example.invalid',
 'authenticated','authenticated',now(),now()
 FROM unnest(ARRAY['owner','manager','content','fulfilment','inactive']) r;
INSERT INTO public.admin_roles(user_id,role,active)
 SELECT current_setting('chaskabox.qa_'||r)::uuid,
 CASE WHEN r='inactive' THEN 'content' ELSE r END,r<>'inactive'
 FROM unnest(ARRAY['owner','manager','content','fulfilment','inactive']) r;
SET LOCAL ROLE service_role;
DO $acceptance$
DECLARE k text:=current_setting('chaskabox.qa_page'); p jsonb; published jsonb; state jsonb; scan jsonb;
BEGIN
 p:=public.admin_page_copy_mutate(current_setting('chaskabox.qa_content')::uuid,k,'draft',0,
 '{"fields":{"t_deadbeef":"Offline recovered-schema acceptance"}}'::jsonb,NULL);
 IF (p->>'revision')::int IS DISTINCT FROM 1 OR p->'published' IS DISTINCT FROM '{"fields":{}}'::jsonb OR p->'draft'->'fields'->>'t_deadbeef' IS DISTINCT FROM 'Offline recovered-schema acceptance' THEN RAISE EXCEPTION 'Draft readback failed'; END IF;
 BEGIN
  PERFORM public.admin_page_copy_mutate(current_setting('chaskabox.qa_content')::uuid,k,'publish',1,NULL,NULL);
  RAISE EXCEPTION 'Content publication unexpectedly permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.admin_page_copy_mutate(current_setting('chaskabox.qa_fulfilment')::uuid,k,'draft',1,'{"fields":{}}'::jsonb,NULL);
  RAISE EXCEPTION 'Fulfilment copy mutation unexpectedly permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.admin_page_copy_mutate(current_setting('chaskabox.qa_inactive')::uuid,k,'draft',1,'{"fields":{}}'::jsonb,NULL);
  RAISE EXCEPTION 'Inactive staff unexpectedly permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 published:=public.admin_page_copy_mutate(current_setting('chaskabox.qa_manager')::uuid,k,'publish',1,NULL,NULL);
 IF (published->>'revision')::int IS DISTINCT FROM 2 OR published->'draft' IS DISTINCT FROM 'null'::jsonb OR jsonb_array_length(published->'versions') IS DISTINCT FROM 1 OR public.page_copy_read(ARRAY[k])->k->'fields'->>'t_deadbeef' IS DISTINCT FROM 'Offline recovered-schema acceptance' THEN RAISE EXCEPTION 'Published readback failed'; END IF;
 BEGIN
  PERFORM public.admin_page_copy_mutate(current_setting('chaskabox.qa_owner')::uuid,k,'draft',1,'{"fields":{}}'::jsonb,NULL);
  RAISE EXCEPTION 'Stale revision unexpectedly accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'STALE_PAGE' THEN RAISE; END IF; END;
 p:=public.admin_page_copy_mutate(current_setting('chaskabox.qa_owner')::uuid,k,'rollback',2,NULL,(published->'versions'->0->>'id')::bigint);
 IF (p->>'revision')::int IS DISTINCT FROM 3 OR p->'published' IS DISTINCT FROM '{"fields":{}}'::jsonb OR jsonb_array_length(p->'versions') IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'Versioned rollback failed'; END IF;
 state:=public.agent_phase12_state(); scan:=public.agent_phase12_scan();
 IF state->>'mode' IS DISTINCT FROM 'observe_only' OR jsonb_array_length(state->'activation') IS DISTINCT FROM 8 OR
 EXISTS(SELECT 1 FROM jsonb_array_elements(state->'activation') a WHERE a->>'mode' IS DISTINCT FROM 'observe') OR
 scan->>'mode' IS DISTINCT FROM 'read_only_no_receipt' THEN RAISE EXCEPTION 'Recovered agent RPC contract failed'; END IF;
END $acceptance$;
RESET ROLE;
DO $verification$
DECLARE c closeout_counts; n integer;
BEGIN
 SELECT * INTO c FROM closeout_counts;
 IF c.products<>(SELECT count(*) FROM public.products) OR c.orders<>(SELECT count(*) FROM public.orders) OR
 c.jobs<>(SELECT count(*) FROM chaskabox_agents.agent_jobs) OR c.events<>(SELECT count(*) FROM chaskabox_agents.agent_events) OR
 c.alerts<>(SELECT count(*) FROM chaskabox_agents.agent_alerts) THEN RAISE EXCEPTION 'Read-only business/agent counts changed'; END IF;
 IF c.audits+3<>(SELECT count(*) FROM public.audit_log) OR c.pages+1<>(SELECT count(*) FROM chaskabox_content.pages) OR
 c.versions+2<>(SELECT count(*) FROM chaskabox_content.page_versions) THEN RAISE EXCEPTION 'CMS version/audit contract failed'; END IF;
 SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace
 WHERE s.nspname IN('chaskabox_content','chaskabox_agents') AND c.relkind='r';
 IF n<9 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace
 WHERE s.nspname IN('chaskabox_content','chaskabox_agents') AND c.relkind='r' AND
 (NOT c.relrowsecurity OR has_table_privilege('anon',c.oid,'SELECT') OR has_table_privilege('authenticated',c.oid,'SELECT')))
 THEN RAISE EXCEPTION 'Private table access boundary failed'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
 CROSS JOIN (VALUES('anon'),('authenticated')) r(role)
 WHERE s.nspname='public' AND (p.proname LIKE 'agent_%' OR p.proname IN('page_copy_read','admin_page_copy_list','admin_page_copy_get','admin_page_copy_mutate')) AND
 has_function_privilege(r.role,p.oid,'EXECUTE')) THEN RAISE EXCEPTION 'Client access to service-only RPC found'; END IF;
END $verification$;
ROLLBACK;
