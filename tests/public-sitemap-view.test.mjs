import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
import {onRequestGet} from '../functions/api/product-sitemap.js';
const sql=await readFile(new URL('../database/migrations/20261015013934_public_product_sitemap_timestamp.sql',import.meta.url),'utf8');
const seoMigration=await readFile(new URL('../database/migrations/20261021233000_public_products_seo_canonical.sql',import.meta.url),'utf8');
test('sitemap SELECT works on the actual public view contract after additive timestamp migration',async()=>{
 const db=new PGlite(),originalFetch=globalThis.fetch;
 try{
  await db.exec("CREATE ROLE anon;CREATE TABLE public.products(id bigint,slug text,name text,brand text,category text,pack text,price integer,old_price integer,description text,badge text,image_url text,is_bundle boolean,stock_state text,tags text[],updated_at timestamptz,visibility text,seo_title text,seo_description text,canonical_url text);INSERT INTO public.products(id,name,brand,pack,price,stock_state,updated_at,visibility) VALUES(39,'Public snack','Listed','Pack of 6',499,'sourced_after_order','2026-10-15T00:00:00Z','visible'),(179,'Hidden snack','Listed','Pack of 12',199,'unavailable','2026-10-15T00:00:00Z','hidden');");
  const oldColumns='id,slug,name,brand,category,pack,price,old_price,description,badge,image_url,is_bundle,stock_state,tags';
  await db.exec('CREATE VIEW public.public_products WITH(security_invoker=true) AS SELECT '+oldColumns+" FROM public.products WHERE visibility='visible';GRANT SELECT ON public.public_products TO anon;");
  globalThis.fetch=async url=>{
   const u=new URL(url);if(u.pathname.endsWith('/brands'))return Response.json([{name:'Listed',slug:'listed'},{name:'Empty',slug:'empty'}]);
   assert.ok(u.pathname.endsWith('/public_products'));
   const select=u.searchParams.get('select');assert.match(select,/^[a-z_,]+$/);
   try{return Response.json((await db.query('SELECT '+select+' FROM public.public_products ORDER BY id LIMIT $1 OFFSET $2',[Number(u.searchParams.get('limit')),Number(u.searchParams.get('offset'))])).rows);}
   catch(e){return Response.json({code:e.code,message:e.message},{status:400});}
  };
  const ctx={env:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic'}};
  assert.equal((await onRequestGet(ctx)).status,503,'missing view column must reproduce the production failure');
  await db.exec(sql);
  assert.equal((await onRequestGet(ctx)).status,503,'updated sitemap also requires canonical metadata');
  await db.exec(seoMigration);
  const response=await onRequestGet(ctx),xml=await response.text();assert.equal(response.status,200);assert.match(xml,/\/product\/39\//);assert.match(xml,/<lastmod>2026-10-15<\/lastmod>/);assert.doesNotMatch(xml,/\/product\/179\/|\/brand\/empty\//);
  const columns=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='public_products' ORDER BY ordinal_position")).rows.map(r=>r.column_name);
  assert.deepEqual(columns,[...oldColumns.split(','),'updated_at','seo_title','seo_description','canonical_url']);
  assert.equal((await db.query("SELECT 'security_invoker=true'=any(reloptions) invoker FROM pg_class WHERE oid='public.public_products'::regclass")).rows[0].invoker,true);
  assert.equal((await db.query("SELECT has_table_privilege('anon','public.public_products','SELECT') allowed")).rows[0].allowed,true,'existing view grants must be preserved');
  await db.exec(seoMigration);assert.equal((await db.query('SELECT count(*)::int n FROM public.public_products')).rows[0].n,1);
 }finally{globalThis.fetch=originalFetch;await db.close();}
});
