import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderCataloguePage,renderBrandPage} from '../functions/api/_lib/catalogue-page.js';
import {bundleDetails} from '../functions/api/_lib/bundle-details.js';
import {onRequestGet as occasionPage} from '../functions/snack-boxes/[[slug]].js';
import {organizationSchema} from '../functions/api/_lib/storefront-html.js';
const shell=await readFile(new URL('../shop/index.html',import.meta.url),'utf8');
const occasion=await readFile(new URL('../snack-boxes/index.html',import.meta.url),'utf8');
const rows=[{id:69,name:'Fixture <sweet>',brand:'Fixture',category:'Chews & Gums',price:100,pack:'Pack of 12',image_url:'images/p69.webp',stock_state:'sourced_after_order'},{id:76,name:'Fixture fruity pack',brand:'Fixture',category:'Chews & Gums',price:200,pack:'Pack of 24',image_url:'images/p76.webp',stock_state:'sourced_after_order'}];
const env={SUPABASE_URL:'https://fixture.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',ASSETS:{fetch:async req=>{assert.ok(['/', '/about/'].includes(new URL(req.url).pathname),'SSR must read a static shell outside its own handled route');return new Response(new URL(req.url).pathname==='/about/'?occasion:shell);}}};
const context={env,request:new Request('https://chaskabox.online/shop/'),params:{}};
test('public collection HTML, aliases, missing brand, outage and incomplete occasion are truthful',async()=>{
 const original=globalThis.fetch;let outage=false;
 globalThis.fetch=async value=>{
  if(outage)return new Response('Unavailable',{status:503});
  const u=new URL(typeof value==='string'?value:value.url);
  if(u.pathname.endsWith('/public_products'))return Response.json(rows);
  if(u.pathname.endsWith('/rpc/storefront_manifest'))return Response.json({categories:[{name:'Chews & Gums',slug:'chews-gums',product_ids:[69,76]}]});
  if(u.pathname.endsWith('/brands'))return Response.json(u.searchParams.get('slug')==='eq.fixture'?[{name:'Fixture',slug:'fixture'}]:[]);
  if(u.pathname.endsWith('/bundle_items'))return Response.json([]);
  throw Error('Unexpected fixture request');
 };
 try{
  let r=await renderCataloguePage(context,'shop'),html=await r.text();assert.equal(r.status,200);assert.match(html,/Fixture &lt;sweet&gt;/);assert.match(html,/2 products/);assert.match(html,/"id":69/);assert.equal((html.match(/rel="canonical"/g)||[]).length,1);assert.doesNotMatch(html,/>249 products</);
  r=await renderCataloguePage(context,'category','chews-gums');assert.equal(r.status,301);assert.equal(r.headers.get('location'),'https://chaskabox.online/category/chews-and-gums/');
  r=await renderCataloguePage(context,'category','unknown');assert.equal(r.status,404);
  r=await renderBrandPage(context,'missing');assert.equal(r.status,404);r=await renderBrandPage(context,'fixture');assert.equal(r.status,200);assert.match(await r.text(),/Fixture Snacks Online/);
  r=await occasionPage({...context,params:{slug:'bachpan'}});html=await r.text();assert.equal(r.status,200);assert.match(html,/id="addOccasion" disabled/);assert.match(html,/Rs\. 300/);assert.doesNotMatch(html,/additional bundle discount is promised\.<\/p>/);
  outage=true;r=await renderCataloguePage(context,'shop');assert.equal(r.status,503);assert.match(await r.text(),/noindex/);
 }finally{globalThis.fetch=original;}
});
test('bundle details use public components and current prices without a fixed discount claim',()=>{
 const products=[{id:1,name:'Box',is_bundle:true,price:250},{id:2,name:'Pack A',pack:'Pack of 12',price:100},{id:3,name:'Pack B',pack:'Pack of 24',price:200}];
 const links=[{bundle_product_id:1,component_product_id:2,quantity:1},{bundle_product_id:1,component_product_id:3,quantity:1}];
 let p=bundleDetails(products,links)[0];assert.equal(p.bundle_retail_value,300);assert.equal(p.bundle_savings,50);assert.equal(p.bundle_contents[1].pack,'Pack of 24');
 p=bundleDetails(products.map(p=>p.id===1?{...p,price:400}:p),links)[0];assert.equal(p.bundle_savings,0);
 p=bundleDetails(products,links.concat({bundle_product_id:1,component_product_id:999,quantity:1}))[0];assert.equal(p.bundle_contents.length,0);assert.match(p.bundle_warning,/checked/);
});
test('organization return information refers to the actual policy without inventing a blanket return window',()=>{
 const p=organizationSchema().hasMerchantReturnPolicy;assert.equal(p.merchantReturnLink,'https://chaskabox.online/refund-policy/');assert.equal(p.merchantReturnDays,undefined);
});
