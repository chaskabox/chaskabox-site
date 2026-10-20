-- Reviewed maintenance data patch, not a schema migration.
-- User authorization: finalize the two reported product SEO gaps, 20 October 2026.
-- No assumed staff identity; product_versions records the maintenance origin.
BEGIN;
DO $closeout$
DECLARE p public.products; revised public.products; seo_heading text; seo_copy text; seen integer:=0;
BEGIN
 FOR p IN SELECT * FROM public.products WHERE id IN (14,67) ORDER BY id FOR UPDATE LOOP
  seen:=seen+1;
  IF p.id=14 THEN
   seo_heading:='Mayfair Cafe Biscuit — Pack of 24 | ChaskaBox';
   seo_copy:='Shop Mayfair Cafe Biscuit in a Pack of 24 at ChaskaBox Pakistan. Check current availability and delivery details before placing your snack order.';
   IF p.name IS DISTINCT FROM 'Mayfair | Cafe Biscuit' OR p.pack IS DISTINCT FROM 'Pack of 24' THEN RAISE EXCEPTION 'Product 14 facts changed'; END IF;
  ELSE
   seo_heading:='Giggly Big Tinkle Kacha Mango Candy — Pack of 50 | ChaskaBox';
   seo_copy:='Explore Giggly Big Tinkle Kacha Mango Candy Jar, Pack of 50, at ChaskaBox Pakistan. View current availability, pack details and delivery information.';
   IF p.name IS DISTINCT FROM 'Giggly | Big Tinkle Kacha Mango Candy Jar' OR p.pack IS DISTINCT FROM 'Pack of 50' THEN RAISE EXCEPTION 'Product 67 facts changed'; END IF;
  END IF;
  IF p.seo_title=seo_heading AND p.seo_description=seo_copy THEN CONTINUE; END IF;
  IF p.visibility IS DISTINCT FROM 'visible' OR p.updated_at IS DISTINCT FROM '2026-10-20T07:13:19.88527+00:00'::timestamptz
   OR NULLIF(btrim(p.seo_title),'') IS NOT NULL OR NULLIF(btrim(p.seo_description),'') IS NOT NULL THEN
   RAISE EXCEPTION 'SEO closeout refused: source changed for product %',p.id;
  END IF;
  UPDATE public.products SET seo_title=seo_heading,seo_description=seo_copy WHERE id=p.id RETURNING * INTO revised;
  IF (to_jsonb(p)-ARRAY['seo_title','seo_description','updated_at']) IS DISTINCT FROM (to_jsonb(revised)-ARRAY['seo_title','seo_description','updated_at']) THEN
   RAISE EXCEPTION 'Unexpected non-SEO change for product %',p.id;
  END IF;
  INSERT INTO public.product_versions(product_id,snapshot,after_snapshot,changed_by,change_type)
   VALUES(p.id,to_jsonb(p),jsonb_build_object('seo_title',seo_heading,'seo_description',seo_copy),
    'codex:authorized-pending-closeout-20261020','seo_metadata_closeout');
 END LOOP;
 IF seen<>2 THEN RAISE EXCEPTION 'SEO closeout requires both reviewed products'; END IF;
END $closeout$;
COMMIT;
