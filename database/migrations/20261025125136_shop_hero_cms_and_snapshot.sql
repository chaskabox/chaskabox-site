-- Reuse the existing protected CMS and its atomic audited publish operation.
INSERT INTO public.homepage_sections(section_key,enabled,position,config,draft_config)
VALUES('shop_hero',true,1000,'{}'::jsonb,'{}'::jsonb)
ON CONFLICT(section_key) DO NOTHING;

-- One statement, one fresh snapshot, one network round trip. No price caching.
CREATE OR REPLACE FUNCTION public.shop_page_snapshot() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $function$
 SELECT jsonb_build_object(
  'products',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.public_products p),'[]'::jsonb),
  'bundle_items',coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM public.bundle_items b WHERE b.bundle_product_id IN (SELECT id FROM public.public_products WHERE is_bundle)),'[]'::jsonb),
  'manifest',public.storefront_manifest()
 )
$function$;
REVOKE ALL ON FUNCTION public.shop_page_snapshot() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shop_page_snapshot() TO service_role;
