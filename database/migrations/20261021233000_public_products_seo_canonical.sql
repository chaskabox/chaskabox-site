BEGIN;
-- Add only customer-visible SEO metadata to the visibility-fenced public catalogue.
-- Preserve existing column order, security-invoker mode and all grants.
CREATE OR REPLACE VIEW public.public_products WITH (security_invoker=true) AS
SELECT id,slug,name,brand,category,pack,price,old_price,description,badge,image_url,
       is_bundle,stock_state,tags,updated_at,seo_title,seo_description,canonical_url
FROM public.products
WHERE visibility='visible';
COMMIT;
