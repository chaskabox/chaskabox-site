BEGIN;
-- Add the public update timestamp required by the checked sitemap SELECT.
-- Preserve the existing column order, visibility filter and invoker security.
CREATE OR REPLACE VIEW public.public_products WITH (security_invoker=true) AS
SELECT id,slug,name,brand,category,pack,price,old_price,description,badge,image_url,is_bundle,stock_state,tags,updated_at
FROM public.products WHERE visibility='visible';
COMMIT;
