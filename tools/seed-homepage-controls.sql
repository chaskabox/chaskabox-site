-- Add controls for existing public sections. No new public content or permissions.
-- Normalize the untouched legacy order to the approved storefront layout once.
-- Any previously edited order is preserved. Re-running this file is idempotent.
BEGIN;
LOCK TABLE public.homepage_sections IN SHARE ROW EXCLUSIVE MODE;
WITH positions(section_key,old_position,new_position) AS (VALUES
 ('announcement_bar',0,-10),('hero',1,0),('categories',2,10),
 ('chatpata_picks',3,80),('chaska_picks',4,30),('how_it_works',5,100),
 ('new_items',6,50),('boxes',7,70),('faq',8,120)
), pristine AS (
 SELECT count(*)=9 AND bool_and(h.position=p.old_position) AS yes
 FROM positions p JOIN public.homepage_sections h USING(section_key)
)
UPDATE public.homepage_sections h SET position=p.new_position
FROM positions p WHERE h.section_key=p.section_key AND (SELECT yes FROM pristine);
INSERT INTO public.homepage_sections(section_key,position,enabled,config) VALUES
 ('deals',60,true,'{}'),('trust_bar',20,true,'{}'),('why_chaskabox',110,true,'{}'),
 ('promotions',40,true,'{}'),('box_spotlight',90,true,'{}')
ON CONFLICT(section_key) DO NOTHING;
-- Bring the fixed header links into the existing protected menu editor, but only
-- for the untouched three-link seed. An empty or customized menu is preserved.
LOCK TABLE public.navigation_menus IN SHARE ROW EXCLUSIVE MODE;
WITH locations(location) AS (VALUES ('header'),('mobile')),
pristine AS (
 SELECT l.location FROM locations l JOIN public.navigation_menus n USING(location)
 GROUP BY l.location HAVING count(*)=3 AND bool_and(n.is_enabled AND
  ((n.label='Shop' AND n.url='/shop/') OR (n.label='Brands' AND n.url='/brands/') OR (n.label='Chaska Boxes' AND n.url='/bundles/')))
), links(label,url,position) AS (VALUES
 ('Home','/',0),('Deals','/shop/?badge=Sale',4),('New Arrivals','/shop/?sort=new',5),('About Us','/about/',6),('Contact','/contact/',7)
)
INSERT INTO public.navigation_menus(location,label,url,position,is_enabled,is_external)
SELECT p.location,l.label,l.url,l.position,true,false FROM pristine p CROSS JOIN links l;
COMMIT;
