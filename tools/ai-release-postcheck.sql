-- M00-M05 post-migration acceptance, READ ONLY, staging FIRST.
WITH agent_state AS (
 SELECT COUNT(*) AS total,COUNT(*) FILTER(WHERE enabled) AS enabled,
 COUNT(*) FILTER(WHERE mode<>'observe') AS unexpected_modes
 FROM chaskabox_agents.agent_settings
), private_tables AS (
 SELECT COUNT(*) AS present,COUNT(*) FILTER(WHERE c.relrowsecurity) AS rls_on
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='chaskabox_agents' AND c.relkind='r'
   AND c.relname IN('agent_settings','agent_jobs','agent_events',
   'agent_alerts','agent_approvals','agent_run_metrics','marketing_drafts')
), expected_functions AS (
 SELECT unnest(ARRAY[
  'public.agent_m01_health()',
  'public.agent_m01_enqueue(text,text,text,jsonb)',
  'public.agent_m02_order_signals()',
  'public.agent_m02_inventory_signals()',
  'public.agent_m03_insight_signals()',
  'public.agent_m04_propose(uuid,bigint,text)',
  'public.agent_m04_decide(uuid,uuid,text)',
  'public.agent_m04_list()'
 ]) AS signature
), rpc_checks AS (
 SELECT f.signature,to_regprocedure(f.signature) AS rpc FROM expected_functions f
)
SELECT jsonb_build_object(
 'agents_configured',a.total,
 'agents_enabled',a.enabled,
 'unexpected_modes',a.unexpected_modes,
 'private_tables_present',p.present,
 'private_tables_with_rls',p.rls_on,
 'service_only_rpcs',COUNT(*) FILTER(
   WHERE r.rpc IS NOT NULL AND NOT has_function_privilege('anon',r.rpc,'EXECUTE')
   AND NOT has_function_privilege('authenticated',r.rpc,'EXECUTE')
   AND has_function_privilege('service_role',r.rpc,'EXECUTE')),
 'expected_rpc_count',COUNT(*),
 'ready_for_owner_mfa_acceptance',(
   a.total=8 AND a.enabled=0 AND a.unexpected_modes=0
   AND p.present=7 AND p.rls_on=7 AND COUNT(*)=8
   AND COUNT(*) FILTER(WHERE r.rpc IS NOT NULL
     AND NOT has_function_privilege('anon',r.rpc,'EXECUTE')
     AND NOT has_function_privilege('authenticated',r.rpc,'EXECUTE')
     AND has_function_privilege('service_role',r.rpc,'EXECUTE'))=8),
 'production_release_authorized',false
) AS agent_security_postcheck
FROM agent_state a CROSS JOIN private_tables p CROSS JOIN rpc_checks r
GROUP BY a.total,a.enabled,a.unexpected_modes,p.present,p.rls_on;
