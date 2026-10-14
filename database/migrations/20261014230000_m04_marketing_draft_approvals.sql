-- M04 marketing is owner-reviewed DRAFT ONLY: never publishes or sends.
-- Apply only during the ONE owner-approved M0-M05 release.
BEGIN;
CREATE TABLE chaskabox_agents.marketing_drafts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id bigint NOT NULL REFERENCES public.products(id),
 channel text NOT NULL CHECK(channel IN ('social','email','whatsapp')),
 headline text NOT NULL CHECK(length(headline) BETWEEN 1 AND 160),
 draft_text text NOT NULL CHECK(length(draft_text) BETWEEN 1 AND 350),
 product_updated_at timestamptz NOT NULL,
 decision text NOT NULL DEFAULT 'pending' CHECK(decision IN ('pending','approved','rejected')),
 decided_by uuid,
 decided_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(product_id,channel),
 CHECK((decision='pending' AND decided_by IS NULL AND decided_at IS NULL)
   OR (decision<>'pending' AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
ALTER TABLE chaskabox_agents.marketing_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON chaskabox_agents.marketing_drafts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON chaskabox_agents.marketing_drafts TO service_role;

-- Validation is repeated in each RPC; API also performs live owner AAL2 MFA.
CREATE FUNCTION public.agent_m04_propose(p_actor uuid,p_product_id bigint,p_channel text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE p public.products; d chaskabox_agents.marketing_drafts; clean_name text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_roles ar
    WHERE ar.user_id=p_actor AND ar.role='owner' AND ar.active IS TRUE)
 THEN RAISE EXCEPTION 'Owner role required' USING ERRCODE='42501'; END IF;
 IF p_product_id IS NULL OR p_channel NOT IN ('social','email','whatsapp')
 THEN RAISE EXCEPTION 'Invalid marketing proposal'; END IF;
 SELECT * INTO p FROM public.products
 WHERE id=p_product_id AND visibility='visible' AND stock_state IS DISTINCT FROM 'unavailable';
 IF NOT FOUND THEN RAISE EXCEPTION 'Only currently available-to-order public catalogue can be drafted'; END IF;
 clean_name:=left(regexp_replace(btrim(coalesce(p.name,'')),'[[:cntrl:]]',' ','g'),110);
 IF clean_name='' THEN RAISE EXCEPTION 'Product name unavailable'; END IF;
 INSERT INTO chaskabox_agents.marketing_drafts(
  product_id,channel,headline,draft_text,product_updated_at)
 VALUES(p.id,p_channel,left(clean_name||' | ChaskaBox',160),
  left('Explore '||clean_name||' at ChaskaBox. Check current details, price and availability at checkout.',350),
  p.updated_at)
 ON CONFLICT(product_id,channel) DO NOTHING;
 SELECT * INTO d FROM chaskabox_agents.marketing_drafts
  WHERE product_id=p.id AND channel=p_channel;
 IF d.product_updated_at<>p.updated_at THEN
  RAISE EXCEPTION 'Existing marketing draft is stale and requires review';
 END IF;
 INSERT INTO public.audit_log(actor_id,actor_role,action,entity_type,entity_id,after_data)
 VALUES(p_actor,'owner','agent.marketing_draft.proposed','agent_marketing_draft',d.id::text,
  jsonb_build_object('product_id',p.id,'channel',p_channel,'decision',d.decision));
 RETURN jsonb_build_object('id',d.id,'product_id',d.product_id,'channel',d.channel,
  'headline',d.headline,'draft_text',d.draft_text,'decision',d.decision);
END;
$fn$;

CREATE FUNCTION public.agent_m04_decide(p_actor uuid,p_draft uuid,p_decision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE d chaskabox_agents.marketing_drafts;p public.products;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_roles ar
   WHERE ar.user_id=p_actor AND ar.role='owner' AND ar.active IS TRUE)
 THEN RAISE EXCEPTION 'Owner role required' USING ERRCODE='42501';END IF;
 IF p_draft IS NULL OR p_decision NOT IN ('approved','rejected') THEN
  RAISE EXCEPTION 'Unsupported decision'; END IF;
 SELECT * INTO d FROM chaskabox_agents.marketing_drafts WHERE id=p_draft FOR UPDATE;
 IF NOT FOUND OR d.decision<>'pending' THEN RAISE EXCEPTION 'Draft not pending';END IF;
 SELECT * INTO p FROM public.products WHERE id=d.product_id;
 IF p.updated_at IS DISTINCT FROM d.product_updated_at
   OR p.visibility IS DISTINCT FROM 'visible'
   OR p.stock_state='unavailable' THEN
  RAISE EXCEPTION 'Draft stale or product unavailable'; END IF;
 UPDATE chaskabox_agents.marketing_drafts SET decision=p_decision,
    decided_by=p_actor,decided_at=now() WHERE id=d.id;
 INSERT INTO public.audit_log(actor_id,actor_role,action,entity_type,entity_id,before_data,after_data)
 VALUES(p_actor,'owner','agent.marketing_draft.decided','agent_marketing_draft',d.id::text,
  jsonb_build_object('decision','pending'),jsonb_build_object('decision',p_decision,'channel',d.channel));
 RETURN jsonb_build_object('id',d.id,'decision',p_decision,'published',false,'sent',false);
END;
$fn$;

CREATE FUNCTION public.agent_m04_list()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',d.id,'product_id',d.product_id,'channel',d.channel,
  'headline',d.headline,'draft_text',d.draft_text,'decision',d.decision,
  'created_at',d.created_at) ORDER BY d.created_at DESC),'[]'::jsonb)
 FROM (SELECT * FROM chaskabox_agents.marketing_drafts ORDER BY created_at DESC LIMIT 50)d;
$fn$;
REVOKE ALL ON FUNCTION public.agent_m04_propose(uuid,bigint,text),
 public.agent_m04_decide(uuid,uuid,text),public.agent_m04_list()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_m04_propose(uuid,bigint,text),
 public.agent_m04_decide(uuid,uuid,text),public.agent_m04_list() TO service_role;
COMMIT;
