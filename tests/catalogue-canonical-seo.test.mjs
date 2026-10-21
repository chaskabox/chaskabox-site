import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {onRequestGet as productSitemap} from '../functions/api/product-sitemap.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('duplicate product remains purchasable but is absent from canonical sitemap', async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(new URL(url).pathname.endsWith('/brands'))return Response.json([]);
  return Response.json([
   {id:171,brand:'Giggly',updated_at:'2026-10-21T15:00:00Z',canonical_url:null},
   {id:275,brand:'Giggly',updated_at:'2026-10-21T15:00:00Z',canonical_url:'https://chaskabox.online/product/171/'},
   {id:281,brand:'Hilal',canonical_url:''},
  ]);
 };
 try{
  const r=await productSitemap({env:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic'}});
  const xml=await r.text();
  assert.equal(r.status,200);
  assert.match(xml,/\/product\/171\//);
  assert.match(xml,/\/product\/281\//);
  assert.doesNotMatch(xml,/\/product\/275\//);
 }finally{globalThis.fetch=original;}
});

test('canonical stays on same site in server head and browser, while public API exposes safe fields',()=>{
 const ssr=read('functions/product/[[slug]].js');
 const app=read('app.js');
 const products=read('functions/api/products.js');
 const cataloguePage=read('functions/api/_lib/catalogue-page.js');
 assert.match(ssr,/canonical_url,og_image/);
 assert.ok(ssr.includes('https://chaskabox.online'));
 assert.match(ssr,/seoTitle:p\.seo_title/);
 assert.match(ssr,/canonicalUrl:canonical/);
 assert.match(app,/canonicalUrl:p\.canonical_url/);
 assert.match(app,/new URL\(canonical\)\.pathname/);
 assert.match(products,/canonicalUrl:p\.canonical_url/);
 assert.match(cataloguePage,/canonicalUrl:p\.canonical_url/);
});

test('secure public-products migration never un-hides products or changes permissions',()=>{
 const migration=read('database/migrations/20261021233000_public_products_seo_canonical.sql');
 assert.match(migration,/security_invoker=true/);
 assert.match(migration,/WHERE visibility='visible'/);
 assert.match(migration,/seo_title,seo_description,canonical_url/);
 assert.doesNotMatch(migration,/GRANT|UPDATE public\.products|ALTER TABLE/);
});

test('all 12 storefront routes invalidate cached SPA bundle after canonical release',()=>{
 const files=['index.html','shop/index.html','brands/index.html','bundles/index.html',...['betel-nuts-and-pan-masala','biscuits-and-wafers','bunties-and-cakes','chews-and-gums','chocolates-and-candies','imli-and-ice-lollies','jellies-and-marshmallow','snacks-and-nimco'].map(s=>'category/'+s+'/index.html')];
 for(const f of files)assert.match(read(f),/\/app\.js\?v=20261021-canonical1/,f);
});
