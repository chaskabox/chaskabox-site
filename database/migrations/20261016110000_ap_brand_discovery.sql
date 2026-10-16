-- Restore discovery for the three public Ap products without changing product visibility.
DO $ap_brand$
BEGIN
  IF EXISTS (SELECT 1 FROM public.brands WHERE slug='ap' AND name<>'Ap') OR
     EXISTS (SELECT 1 FROM public.brands WHERE name='Ap' AND slug<>'ap') THEN
    RAISE EXCEPTION 'Conflicting existing Ap brand row';
  END IF;
  INSERT INTO public.brands(name,slug,normalized_name,is_visible,position,sort_order,short_description)
  SELECT 'Ap','ap','ap',true,0,0,'Browse current Ap snack packs at ChaskaBox.'
  WHERE NOT EXISTS (SELECT 1 FROM public.brands WHERE slug='ap');
  IF (SELECT count(*) FROM public.products WHERE brand='Ap' AND visibility='visible') <> 3 THEN
    RAISE EXCEPTION 'Unexpected public Ap product count';
  END IF;
END $ap_brand$;
