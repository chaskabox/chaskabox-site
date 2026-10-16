import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {onRequestGet as wishlist} from '../functions/wishlist/index.js';
import {onRequestGet as bag} from '../functions/bag/index.js';
import {onRequestGet as cart} from '../functions/cart/index.js';
import {organizationSchema} from '../functions/api/_lib/storefront-html.js';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const shell=read('index.html');
const context=path=>({
  request:new Request('https://chaskabox.online'+path),
  env:{ASSETS:{fetch:async()=>new Response(shell,{status:200,headers:{'Content-Type':'text/html'}})}}
});

test('utility routes return noindex in first HTTP response and preserve SPA mount',async()=>{
 for(const [handler,path,mount] of [[wishlist,'/wishlist/','wishlist'],[cart,'/cart/','cart'],[bag,'/bag/','cart']]){
   const response=await handler(context(path)),html=await response.text();
   assert.equal(response.status,200,path);
   assert.equal(response.headers.get('X-Robots-Tag'),'noindex, follow',path);
   assert.match(html,/<meta name="robots" content="noindex,follow">/,path);
   assert.match(html,/<link rel="canonical" href="https:\/\/chaskabox.online\/(?:wishlist|cart)\/">/,path);
   assert.match(html,new RegExp('<div id="view-'+mount+'">'),path);
   assert.match(html,/<div id="view-home"[^>]*hidden/,path);
   assert.doesNotMatch(html,/<meta name="robots" content="index, follow">/,path);
 }
 assert.match(read('app.js'),/path === '\/cart\/' \|\| path === '\/bag\/'/);
});

test('static storefront shells do not advertise hidden Family Pack 269',()=>{
 const pages=['index.html','shop/index.html','bundles/index.html','brands/index.html','brand/index.html','faq/index.html','category/betel-nuts-and-pan-masala/index.html',
 'category/biscuits-and-wafers/index.html','category/bunties-and-cakes/index.html',
 'category/chews-and-gums/index.html','category/chocolates-and-candies/index.html',
 'category/imli-and-ice-lollies/index.html','category/jellies-and-marshmallow/index.html',
 'category/snacks-and-nimco/index.html'];
 for(const path of pages){
   const html=read(path);
   assert.doesNotMatch(html,/ChaskaBox Family Pack|\/product\/269\/|Rs\. 2,039/,path);
   assert.doesNotMatch(html,/>106 products</,path);
   assert.match(html,/<div id="view-shop"/,path);
 }
});

test('Ap brand migration is conservative and matches current public brand slug',()=>{
 const sql=read('database/migrations/20261016110000_ap_brand_discovery.sql');
 assert.match(sql,/INSERT INTO public\.brands\(name,slug,normalized_name,is_visible/);
 assert.match(sql,/SELECT 'Ap','ap','ap',true/);
 assert.match(sql,/WHERE NOT EXISTS/);
 assert.match(sql,/visibility='visible'/);
 const schema=organizationSchema();
 assert.equal(schema['@id'],'https://chaskabox.online/#organization');
 assert.equal(schema.currenciesAccepted,'PKR');
 assert.ok(!JSON.stringify(schema).includes('merchantReturnDays'));
});

test('LLM directory links to current products without fixed prices or stale Family Pack',()=>{
 const manifest=read('llms.txt');
 assert.match(manifest,/https:\/\/chaskabox.online\/api\/products/);
 assert.match(manifest,/not.*Google ranking signal/);
 assert.doesNotMatch(manifest,/ChaskaBox Family Pack|2,039/);
});
