-- Phase 1+2 owner operations: service-only, owner-MFA API, no outbound actions.
-- Safe replay, does not touch checkout, payments, notifications or publishing.
BEGIN;

CREATE OR REPLACE FUNCTION public.agent_phase12_state()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
SELECT jsonb_build_object(
 'mode','observe_only',
 'scheduler','github_six_hour_cycle',
 'activation',COALESCE((
   SELECT jsonb_agg(jsonb_build_object('agent',s.agent_key,'enabled',s.enabled,
     'mode',s.mode,'updated_at',s.updated_at) ORDER BY s.agent_key)
   FROM chaskabox_agents.agent_settings s
 ),'[]'::jsonb),
 'observations',COALESCE((
   SELECT jsonb_agg(jsonb_build_object('agent',o.agent_key,
     'state',CASE WHEN o.detail->>'state' IN ('ok','attention','unknown') THEN o.detail->>'state' ELSE 'unknown' END,
     'checked_at',o.created_at,'alerts','[]'::jsonb) ORDER BY o.agent_key)
   FROM (
     SELECT DISTINCT ON (e.agent_key) e.agent_key,e.detail,e.created_at
     FROM chaskabox_agents.agent_events e WHERE e.event_type='completed'
     ORDER BY e.agent_key,e.created_at DESC,e.id DESC
   ) o
 ),'[]'::jsonb),
 'alerts',COALESCE((
   SELECT jsonb_agg(jsonb_build_object('agent',a.agent_key,'title',a.title,
     'severity',a.severity,'state',a.state,'id',a.id) ORDER BY a.created_at DESC)
   FROM (SELECT * FROM chaskabox_agents.agent_alerts WHERE state='open'
      ORDER BY created_at DESC LIMIT 30) a
 ),'[]'::jsonb)
);
$fn$;
REVOKE ALL ON FUNCTION public.agent_phase12_state() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_phase12_state() TO service_role;

CREATE OR REPLACE FUNCTION public.agent_phase12_activate(
 p_actor uuid,p_agent text,p_enabled boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE old_enabled boolean; agent_mode text;
BEGIN
 IF p_actor IS NULL OR p_enabled IS NULL OR
    p_agent IS NULL OR p_agent NOT IN
    ('orders','inventory','security','backups','support','seo','analytics') THEN
   RAISE EXCEPTION 'Unsupported observation control' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.admin_roles
     WHERE user_id=p_actor AND role='owner' AND active=true) THEN
   RAISE EXCEPTION 'Active owner required' USING ERRCODE='42501';
 END IF;
 SELECT s.enabled,s.mode INTO old_enabled,agent_mode
 FROM chaskabox_agents.agent_settings s WHERE s.agent_key=p_agent FOR UPDATE;
 IF NOT FOUND OR agent_mode<>'observe' THEN
   RAISE EXCEPTION 'Agent unavailable or unsafe mode' USING ERRCODE='42501';
 END IF;
 IF old_enabled IS DISTINCT FROM p_enabled THEN
   UPDATE chaskabox_agents.agent_settings SET enabled=p_enabled,updated_at=now()
     WHERE agent_key=p_agent;
   INSERT INTO public.audit_log(actor_id,actor_role,action,entity_type,entity_id,before_data,after_data)
     VALUES (p_actor,'owner','agent.observation_set','agent_setting',p_agent,
       jsonb_build_object('enabled',old_enabled,'mode','observe'),
       jsonb_build_object('enabled',p_enabled,'mode','observe'));
 END IF;
 RETURN jsonb_build_object('agent',p_agent,'enabled',p_enabled,
   'mode','observe','changed',old_enabled IS DISTINCT FROM p_enabled);
END;
$fn$;
REVOKE ALL ON FUNCTION public.agent_phase12_activate(uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_phase12_activate(uuid,text,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.agent_phase12_scan()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
 SELECT jsonb_build_object(
   'mode','read_only_no_receipt',
   'checked_at',now(),
   'orders',public.agent_m02_order_signals(),
   'inventory',public.agent_m02_inventory_signals(),
   'insights',public.agent_m03_insight_signals(),
   'status',public.agent_phase12_state()
 );
$fn$;
REVOKE ALL ON FUNCTION public.agent_phase12_scan() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_phase12_scan() TO service_role;
COMMIT;
