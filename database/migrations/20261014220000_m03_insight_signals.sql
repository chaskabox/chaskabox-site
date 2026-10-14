-- M03 non-PII read-only support, catalogue SEO and analytics metrics.
-- Deferred to one approved combined M0-M05 release.
BEGIN;
CREATE OR REPLACE FUNCTION public.agent_m03_insight_signals()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
 SELECT jsonb_build_object(
 'support', jsonb_build_object(
  'ai_requests_7d',(SELECT count(*) FROM public.ai_usage WHERE created_at>=now()-interval '7 days'),
  'ai_failures_7d',(SELECT count(*) FROM public.ai_usage WHERE created_at>=now()-interval '7 days' AND success IS FALSE),
  'scope','all_ai_tasks_not_support_only'),
 'seo', (SELECT jsonb_build_object(
  'visible_products',count(*),
  'missing_seo_title',count(*) FILTER (WHERE coalesce(btrim(seo_title),'')=''),
  'missing_seo_description',count(*) FILTER (WHERE coalesce(btrim(seo_description),'')=''),
  'missing_product_image',count(*) FILTER (WHERE coalesce(btrim(image_url),'')='')
 ) FROM public.products WHERE visibility='visible'),
 'analytics',jsonb_build_object(
  'orders_30d',(SELECT count(*) FROM public.orders WHERE created_at>=now()-interval '30 days'),
  'recognized_sales_pkr_30d',(
   SELECT coalesce(sum(total),0) FROM public.orders
   WHERE created_at>=now()-interval '30 days'
   AND fulfilment_status<>'cancelled' AND payment_status<>'refunded'
   AND ((payment_method='cod' AND fulfilment_status='delivered')
     OR (payment_method<>'cod' AND payment_status='payment_verified'))
  ),
  'checkout_started_30d',(SELECT count(*) FROM public.funnel_events
      WHERE created_at>=now()-interval '30 days' AND event='checkout_started'),
  'product_views_30d',(SELECT count(*) FROM public.funnel_events
      WHERE created_at>=now()-interval '30 days' AND event='product_view')
 )
 );
$fn$;
REVOKE ALL ON FUNCTION public.agent_m03_insight_signals() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agent_m03_insight_signals() TO service_role;
COMMIT;
