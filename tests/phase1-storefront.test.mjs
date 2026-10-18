import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {productPageTitle} from '../functions/api/_lib/seo.js';
import {catalogueCard} from '../functions/api/_lib/catalogue-page.js';
import {previewCatalogueAllowed,previewRead,previewManifest} from '../functions/api/_lib/preview-catalogue-fixtures.js';
import {sbRequest,rpc} from '../functions/api/_lib/db.js';

const src=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const topPops={id:233,name:'ChaskaBox | Top Pops Chicken (Red) — Pack of 10',pack:'Pack of 10',category:'Snacks & Nimco',price:750,old_price:800,stock_state:'sourced_after_order'};

test('derive a clean Top Pops SEO title without mutating product names or packs',()=>{
 assert.equal(productPageTitle(topPops),'ChaskaBox | Top Pops Chicken (Red) — Pack of 10');
 assert.equal(productPageTitle({...topPops,seo_title:'Top Pops — Pack of 10 — Pack of 10 | ChaskaBox | ChaskaBox'}),'Top Pops — Pack of 10 | ChaskaBox');
 assert.equal(topPops.name,'ChaskaBox | Top Pops Chicken (Red) — Pack of 10');
});

test('server-rendered catalogue cards show genuine comparison savings only',()=>{
 const sale=catalogueCard(topPops);
 assert.match(sale,/Rs\. 750/);
 assert.match(sale,/class="oldprice">Rs\. 800/);
 assert.match(sale,/Save 6%/);
 const regular=catalogueCard({...topPops,old_price:700});
 assert.doesNotMatch(regular,/class="oldprice"/);
 assert.doesNotMatch(regular,/Save \d+%/);
});

test('sale listing heading and accurate singular counts are built from filtered catalogue',()=>{
 const code=src('functions/api/_lib/catalogue-page.js');
 assert.match(code,/name:'Snack Deals'/);
 assert.match(code,/rows\.length===1\?'product':'products'/);
 const client=src('app.js');
 assert.match(client,/list\.length===1\?'product':'products'/);
 assert.match(client,/href="\/shop\/\?badge=Sale" onclick="goBadge\('Sale'\)/);
});

test('public storefront copies no longer expose an admin footer link',()=>{
 const paths=['index.html','shop/index.html','bundles/index.html','brands/index.html','brand/index.html','category/biscuits-and-wafers/index.html','category/bunties-and-cakes/index.html','category/chews-and-gums/index.html','category/chocolates-and-candies/index.html','category/imli-and-ice-lollies/index.html','category/jellies-and-marshmallow/index.html','category/snacks-and-nimco/index.html','category/betel-nuts-and-pan-masala/index.html'];
 for(const path of paths){
  const html=src(path);
  assert.doesNotMatch(html,/href="\/admin\/" class="footer-admin"/,path);
  assert.match(html,/href="\/brands\/">Brands/,path);
 }
});

test('track order keeps noindex and existing read-only lookup field identifiers',()=>{
 const html=src('track-order.html');
 assert.match(html,/name="robots" content="noindex,follow"/);
 assert.match(html,/id="track-form"/);
 assert.match(html,/id="order"/);
 assert.match(html,/id="phone"/);
 assert.match(html,/id="result"/);
 assert.match(html,/aria-labelledby="track-title"/);
 assert.match(html,/id="track-title"/);
 assert.match(html,/prefers-reduced-motion:reduce/);
});

test('server product breadcrumbs are driven by real category; not placeholders',()=>{
 const handler=src('functions/product/[[slug]].js');
 assert.match(handler,/CATEGORY_PATHS\[p\.category\]/);
 assert.match(handler,/pdCrumbCat/);
 assert.match(handler,/pdCrumbName/);
 assert.match(handler,/old_price/);
});

test('isolated preview mode is opt-in AND refuses production credentials',async()=>{
 const env={CHASKABOX_PREVIEW_CATALOGUE:'read-only'};
 assert.equal(previewCatalogueAllowed(env),true);
 assert.equal(previewCatalogueAllowed({...env,SUPABASE_URL:'https://example.supabase.co'}),false);
 assert.equal(previewCatalogueAllowed({...env,SUPABASE_SERVICE_ROLE_KEY:'prod-key'}),false);
 assert.equal(previewCatalogueAllowed({}),false);
 const product=await sbRequest(env,'/products',{query:'?select=*&id=eq.233&visibility=eq.visible&limit=1'});
 assert.equal(product.length,1);
 assert.equal(product[0].price,750);
 assert.equal(product[0].old_price,800);
 assert.equal(previewRead('/products',{query:'?id=eq.269'}).length,0,'Hidden product is excluded from isolated mock');
 assert.throws(()=>previewRead('/orders',{}),/not allowed/);
 assert.throws(()=>previewRead('/public_products',{method:'POST'}),/refuse writes/);
 await assert.rejects(sbRequest(env,'/products',{method:'POST'}),/refuse writes/);
 await assert.rejects(sbRequest(env,'/orders',{query:'?select=*'}),/not allowed/);
 await assert.rejects(rpc(env,'place_order',{}),/not allowed/);
 const manifest=await rpc(env,'storefront_manifest',{});
 assert.ok(manifest.categories.length>0);
 assert.ok((await sbRequest(env,'/brands',{query:'?is_visible=eq.true'})).length>0);
 const hilal=previewRead('/brands',{query:'?slug=eq.hilal'})[0];
 const brandRows=previewRead('/products',{query:'?brand_id=eq.'+hilal.id+'&visibility=eq.visible'});
 assert.ok(brandRows.length>0);
 assert.ok(brandRows.every(p=>p.brand==='Hilal'), 'Preview mock must never mix unrelated brands');
});
