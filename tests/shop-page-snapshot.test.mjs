import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {shopSnapshot} from '../functions/api/_lib/shop-snapshot.js';
const migration=readFileSync(new URL('../database/migrations/20261025125136_shop_hero_cms_and_snapshot.sql',import.meta.url),'utf8');
test('Shop snapshot reads current products, prices and publications in one request without caching',async()=>{
 const previous=globalThis.fetch;let price=100,heading='First publication',calls=0;
 globalThis.fetch=async(url,init)=>{assert.ok(url.endsWith('/rpc/shop_page_snapshot'));assert.equal(init.method,'POST');calls++;return Response.json({products:[{id:1,name:'Box',is_bundle:true,price:90},{id:2,name:'Sweet',price}],bundle_items:[{bundle_product_id:1,component_product_id:2,quantity:1}],manifest:{categories:[],sections:[{section_key:'shop_hero',config:{heading}}],theme:{}}});};
 try{let [rows,manifest]=await shopSnapshot({SUPABASE_URL:'https://snapshot.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'});assert.equal(rows[0].bundle_retail_value,100);assert.equal(manifest.sections[0].config.heading,'First publication');price=150;heading='Latest publication';[rows,manifest]=await shopSnapshot({SUPABASE_URL:'https://snapshot.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'});assert.equal(rows[0].bundle_retail_value,150);assert.equal(manifest.sections[0].config.heading,heading);assert.equal(calls,2);}finally{globalThis.fetch=previous;}
});
test('migration preserves existing content, excludes hidden products, is idempotent and denies public RPC execution',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
  CREATE TABLE public.homepage_sections(section_key text primary key,enabled boolean,position integer,config jsonb,draft_config jsonb);
  INSERT INTO public.homepage_sections VALUES('hero',true,1,'{"heading":"Original home"}','{}');
  CREATE TABLE public.products(id bigint primary key,is_bundle boolean,visibility text,price int);
  INSERT INTO public.products VALUES(1,true,'visible',90),(2,false,'visible',100),(269,true,'hidden',200);
  CREATE VIEW public.public_products WITH(security_invoker=true) AS SELECT * FROM public.products WHERE visibility='visible';
  CREATE TABLE public.bundle_items(bundle_product_id bigint,component_product_id bigint,quantity int);
  INSERT INTO public.bundle_items VALUES(1,2,1),(269,2,2);
  CREATE FUNCTION public.storefront_manifest() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('categories','[]'::jsonb,'sections',(SELECT jsonb_agg(jsonb_build_object('section_key',section_key,'config',config)) FROM public.homepage_sections)) $$;
  GRANT SELECT ON public.products,public.public_products,public.bundle_items,public.homepage_sections TO service_role;GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;`);
  await db.exec(migration);await db.exec(migration);
  await db.exec('SET ROLE service_role');const snapshot=(await db.query('SELECT public.shop_page_snapshot() AS data')).rows[0].data;
  assert.deepEqual(snapshot.products.map(p=>p.id),[1,2]);assert.equal(snapshot.bundle_items.length,1);assert.equal(snapshot.manifest.sections.find(s=>s.section_key==='hero').config.heading,'Original home');
  await db.exec('RESET ROLE');
  for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);await assert.rejects(db.query('SELECT public.shop_page_snapshot()'),/permission denied/);await db.exec('RESET ROLE');}
  assert.equal((await db.query("SELECT count(*)::int AS n FROM public.homepage_sections WHERE section_key='shop_hero'")).rows[0].n,1);
 }finally{await db.close();}
});
