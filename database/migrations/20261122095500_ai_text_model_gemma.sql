-- 2026-11-22: allow the new default text model in the AI budget gate.
-- Cloudflare retired @cf/meta/llama-3.2-3b-instruct and @cf/qwen/qwen3-30b-a3b-fp8
-- on 20 Nov 2026; the site code now defaults to @cf/google/gemma-4-26b-a4b-it.
-- ADDITIVE ONLY: the retired IDs stay in the list on purpose, so this migration
-- can be applied before or after the matching code deploy without breaking
-- either side. Remove them in a later cleanup migration once the code is live.
-- ONE STATEMENT: paste the whole file as a single run in the Supabase SQL Editor.
CREATE OR REPLACE FUNCTION public.ai_budget_reserve(p_id uuid,p_actor uuid,p_feature text,p_model text,p_units int,p_budget int)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d date=(now() AT TIME ZONE 'UTC')::date;used int;cap int;existing chaskabox_private.ai_requests;
BEGIN
 IF p_feature NOT IN('text','image','embedding') OR p_model NOT IN('@cf/google/gemma-4-26b-a4b-it','@cf/meta/llama-3.2-3b-instruct','@cf/meta/llama-3.1-8b-instruct-fp8-fast','@cf/qwen/qwen3-30b-a3b-fp8','@cf/qwen/qwen3-embedding-0.6b','@cf/black-forest-labs/flux-1-schnell')
 OR (p_feature='image' AND p_model<>'@cf/black-forest-labs/flux-1-schnell')
 OR (p_feature='embedding' AND p_model<>'@cf/qwen/qwen3-embedding-0.6b')
 OR (p_feature='text' AND p_model NOT IN('@cf/google/gemma-4-26b-a4b-it','@cf/meta/llama-3.2-3b-instruct','@cf/meta/llama-3.1-8b-instruct-fp8-fast','@cf/qwen/qwen3-30b-a3b-fp8'))
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
