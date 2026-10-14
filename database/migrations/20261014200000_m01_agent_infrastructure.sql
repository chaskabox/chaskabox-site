-- Chaskabox AI Agents M01: PRIVATE, opt-in orchestration state.
-- Apply only in the approved M0-M05 combined release; staging first.
-- No schedules, external messages, payments, or product mutations are activated.
BEGIN;

CREATE SCHEMA IF NOT EXISTS chaskabox_agents;
REVOKE ALL ON SCHEMA chaskabox_agents FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA chaskabox_agents TO service_role;

CREATE TABLE chaskabox_agents.agent_settings (
 agent_key text PRIMARY KEY CHECK (agent_key IN (
  'orders','inventory','security','backups','support','seo','marketing','analytics'
 )),
 enabled boolean NOT NULL DEFAULT false,
 mode text NOT NULL DEFAULT 'observe' CHECK (mode='observe'),
 rolling_24h_limit integer NOT NULL DEFAULT 100 CHECK (rolling_24h_limit BETWEEN 1 AND 1000),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO chaskabox_agents.agent_settings(agent_key) VALUES
 ('orders'),('inventory'),('security'),('backups'),('support'),
 ('seo'),('marketing'),('analytics')
ON CONFLICT(agent_key) DO NOTHING;

CREATE TABLE chaskabox_agents.agent_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 agent_key text NOT NULL REFERENCES chaskabox_agents.agent_settings(agent_key),
 action text NOT NULL CHECK(action IN ('scan','summarize','draft')),
 dedupe_key text NOT NULL CHECK(length(dedupe_key) BETWEEN 16 AND 200),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object' AND pg_column_size(metadata)<=2048),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','succeeded','retry','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 scheduled_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz,
 finished_at timestamptz,
 lease_until timestamptz,
 last_error_code text CHECK(last_error_code IS NULL OR length(last_error_code)<=64),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(agent_key,dedupe_key)
);
CREATE INDEX agent_jobs_ready_idx ON chaskabox_agents.agent_jobs(scheduled_at,created_at)
 WHERE status IN ('pending','retry');
CREATE INDEX agent_jobs_running_idx ON chaskabox_agents.agent_jobs(lease_until)
 WHERE status='running';

CREATE TABLE chaskabox_agents.agent_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 job_id uuid REFERENCES chaskabox_agents.agent_jobs(id),
 agent_key text NOT NULL REFERENCES chaskabox_agents.agent_settings(agent_key),
 event_type text NOT NULL CHECK(event_type IN
  ('queued','started','completed','retry','failed','alert','approval_requested','approved','rejected','disabled')),
 detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(detail)='object' AND pg_column_size(detail)<=2048),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_events_agent_time_idx ON chaskabox_agents.agent_events(agent_key,created_at DESC);

CREATE TABLE chaskabox_agents.agent_alerts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 agent_key text NOT NULL REFERENCES chaskabox_agents.agent_settings(agent_key),
 dedupe_key text NOT NULL CHECK(length(dedupe_key) BETWEEN 16 AND 200),
 severity text NOT NULL CHECK(severity IN ('low','medium','high','critical')),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','acknowledged','resolved')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(agent_key,dedupe_key)
);

CREATE TABLE chaskabox_agents.agent_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 job_id uuid NOT NULL UNIQUE REFERENCES chaskabox_agents.agent_jobs(id),
 action_summary text NOT NULL CHECK(length(action_summary) BETWEEN 1 AND 180),
 decision text NOT NULL DEFAULT 'pending' CHECK(decision IN ('pending','approved','rejected')),
 decided_by uuid,
 decided_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((decision='pending' AND decided_by IS NULL AND decided_at IS NULL)
     OR (decision<>'pending' AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
);

CREATE TABLE chaskabox_agents.agent_run_metrics (
 agent_key text NOT NULL REFERENCES chaskabox_agents.agent_settings(agent_key),
 date_utc date NOT NULL,
 runs integer NOT NULL DEFAULT 0 CHECK(runs>=0),
 succeeded integer NOT NULL DEFAULT 0 CHECK(succeeded>=0),
 failed integer NOT NULL DEFAULT 0 CHECK(failed>=0),
 ai_neurons_estimated numeric(14,3) NOT NULL DEFAULT 0 CHECK(ai_neurons_estimated>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(agent_key,date_utc),
 CHECK(succeeded+failed<=runs)
);

DO $rls$
DECLARE item text;
BEGIN
 FOREACH item IN ARRAY ARRAY[
  'agent_settings','agent_jobs','agent_events','agent_alerts','agent_approvals','agent_run_metrics'
 ] LOOP
  EXECUTE format('ALTER TABLE chaskabox_agents.%I ENABLE ROW LEVEL SECURITY',item);
  EXECUTE format('REVOKE ALL ON chaskabox_agents.%I FROM PUBLIC,anon,authenticated',item);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON chaskabox_agents.%I TO service_role',item);
 END LOOP;
END $rls$;
REVOKE ALL ON SEQUENCE chaskabox_agents.agent_events_id_seq FROM PUBLIC,anon,authenticated;
GRANT USAGE,SELECT ON SEQUENCE chaskabox_agents.agent_events_id_seq TO service_role;

-- This is the only M01 read RPC; it is not exposed to browser roles.
CREATE OR REPLACE FUNCTION public.agent_m01_health()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
 SELECT jsonb_build_object(
  'milestone','M01',
  'agents',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'key',s.agent_key,'enabled',s.enabled,'mode',s.mode,
    'rolling_24h_limit',s.rolling_24h_limit) ORDER BY s.agent_key)
   FROM chaskabox_agents.agent_settings s),'[]'::jsonb),
  'pending_jobs',(SELECT count(*) FROM chaskabox_agents.agent_jobs
   WHERE status IN ('pending','retry')),
  'pending_approvals',(SELECT count(*) FROM chaskabox_agents.agent_approvals
   WHERE decision='pending')
 );
$fn$;
REVOKE ALL ON FUNCTION public.agent_m01_health() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_m01_health() TO service_role;

-- Idempotent enqueue. Defaults deny every agent until reviewed activation.
-- No external send/write action is accepted in M01.
CREATE OR REPLACE FUNCTION public.agent_m01_enqueue(
 p_agent text,p_action text,p_dedupe_key text,p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE cfg chaskabox_agents.agent_settings; existing uuid; result_id uuid;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('scan','summarize','draft') THEN
  RAISE EXCEPTION 'M01 allows observation-only actions' USING ERRCODE='42501';
 END IF;
 IF p_dedupe_key IS NULL OR p_dedupe_key !~ '^[a-z0-9][a-z0-9:._-]{15,199}$' THEN
  RAISE EXCEPTION 'Invalid opaque dedupe key';
 END IF;
 IF p_metadata IS NULL OR jsonb_typeof(p_metadata)<>'object'
  OR pg_column_size(p_metadata)>2048
  OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_metadata) AS k(key)
   WHERE k.key NOT IN ('metric','count','result_count','severity','window',
    'source','category','status','summary','subject_hash','model','age_minutes'))
 THEN
  RAISE EXCEPTION 'Invalid safe metadata';
 END IF;

 -- Serializes activation/rate checks for this agent without locking the whole job table.
 SELECT * INTO cfg FROM chaskabox_agents.agent_settings
 WHERE agent_key=p_agent FOR UPDATE;
 IF NOT FOUND OR cfg.enabled IS NOT TRUE OR cfg.mode<>'observe' THEN
  RAISE EXCEPTION 'Agent not activated' USING ERRCODE='42501';
 END IF;

 SELECT id INTO existing FROM chaskabox_agents.agent_jobs
 WHERE agent_key=p_agent AND dedupe_key=p_dedupe_key;
 IF existing IS NOT NULL THEN RETURN existing; END IF;
 IF (SELECT count(*) FROM chaskabox_agents.agent_jobs
     WHERE agent_key=p_agent AND created_at>=now()-interval '24 hours')
    >=cfg.rolling_24h_limit THEN
   RAISE EXCEPTION 'Agent daily budget reached' USING ERRCODE='54000';
 END IF;
 INSERT INTO chaskabox_agents.agent_jobs(agent_key,action,dedupe_key,metadata)
 VALUES(p_agent,p_action,p_dedupe_key,p_metadata)
 ON CONFLICT(agent_key,dedupe_key) DO NOTHING RETURNING id INTO result_id;
 IF result_id IS NULL THEN
  SELECT id INTO result_id FROM chaskabox_agents.agent_jobs
  WHERE agent_key=p_agent AND dedupe_key=p_dedupe_key;
 END IF;
 RETURN result_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.agent_m01_enqueue(text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_m01_enqueue(text,text,text,jsonb) TO service_role;

COMMIT;
