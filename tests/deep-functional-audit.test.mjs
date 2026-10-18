import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {buildHomepageDraft,validateHomepageConfig,safeHomepageLink} from '../homepage-config.js';
import {aiDirectory,onRequestGet as aiDirectoryRoute} from '../functions/llms.txt.js';
import {filterCatalogueRows,renderBrandPage} from '../functions/api/_lib/catalogue-page.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('saving an untouched automatic shelf does not publish an empty product list',()=>{
 assert.deepEqual(buildHomepageDraft('chaska_picks',{}, {automaticProducts:true}),{});
 assert.deepEqual(buildHomepageDraft('chaska_picks',{}, {automaticProducts:false,productIds:''}),{product_ids:[]});
 assert.deepEqual(buildHomepageDraft('deals',{}, {automaticProducts:false,productIds:'233,235'}),{product_ids:[233,235]});
 assert.throws(()=>buildHomepageDraft('deals',{}, {productIds:'233,wrong'}));
 assert.throws(()=>buildHomepageDraft('deals',{}, {productIds:'233,233'}));
 const cfg=buildHomepageDraft('hero',{other:'keep'}, {automaticProducts:true,buttonText:'Explore',buttonUrl:'/shop/?badge=Sale',slides:'[{"heading":"Hello","href":"/bundles/"}]'});
 assert.equal(cfg.other,'keep');assert.equal(cfg.slides[0].heading,'Hello');
});
test('homepage server validation rejects unsafe links, oversized slides and malformed FAQ before writes',()=>{
 for(const url of ['//evil.example','/\\evil.example','https://user:pass@example.com','javascript:alert(1)','/a" onclick="x'])assert.equal(safeHomepageLink(url),false);
 for(const url of ['/','/shop/?badge=Sale','https://example.com/path'])assert.equal(safeHomepageLink(url),true);
 for(const config of [{slides:[{href:'//evil.example'}]},{slides:[{html:'<script>'}]},{slides:[{heading:'x'.repeat(161)}]},{slides:[{},{},{},{}]}])assert.throws(()=>validateHomepageConfig('hero',config));
 assert.throws(()=>validateHomepageConfig('faq',{items:[{q:'Missing answer'}]}));
 assert.equal(validateHomepageConfig('faq',{items:[]}).items.length,0);
 assert.equal(buildHomepageDraft('faq',{items:[]},{faq:''}).items,undefined);
});
test('homepage controls seed preserves published content, custom order, and is idempotent',async()=>{
 const db=new PGlite();
 try{
  await db.exec("CREATE TABLE navigation_menus(id serial primary key,location text,label text,url text,position int,is_enabled boolean,is_external boolean); INSERT INTO navigation_menus(location,label,url,position,is_enabled,is_external) VALUES('header','Shop','/shop/',1,true,false),('header','Brands','/brands/',2,true,false),('header','Chaska Boxes','/bundles/',3,true,false); CREATE TABLE homepage_sections(section_key text primary key,position int,enabled boolean default true,config jsonb default '{}',heading text); INSERT INTO homepage_sections(section_key,position,heading) VALUES('announcement_bar',0,null),('hero',1,'Keep me'),('categories',2,null),('chatpata_picks',3,null),('chaska_picks',4,null),('how_it_works',5,null),('new_items',6,null),('boxes',7,null),('faq',8,null);");
  const sql=read('tools/seed-homepage-controls.sql');await db.exec(sql);
  let rows=(await db.query('select * from homepage_sections order by position')).rows;
  assert.equal(rows.length,14);assert.equal((await db.query("select count(*)::int n from navigation_menus where location='header'")).rows[0].n,8);assert.equal((await db.query("select count(*)::int n from navigation_menus where location='mobile'")).rows[0].n,0);assert.equal(rows.find(r=>r.section_key==='hero').heading,'Keep me');
  assert.equal(rows[0].section_key,'announcement_bar');assert.equal(rows[1].section_key,'hero');
  await db.exec(sql);assert.deepEqual((await db.query('select * from homepage_sections order by position')).rows,rows);
  await db.exec("update homepage_sections set position=333 where section_key='hero'");await db.exec(sql);
  assert.equal((await db.query("select position from homepage_sections where section_key='hero'")).rows[0].position,333);
 }finally{await db.close();}
});
test('AI directory follows live advance, delivery, contact and availability switches',async()=>{
 const text=aiDirectory({cod_advance_amount_pkr:750,cod_delivery_fee_pkr:350,prepaid_delivery_fee_pkr:200,prepaid_free_delivery_enabled:false,support_email:'support@example.com'});
 assert.match(text,/up to Rs\. 750/);assert.match(text,/COD delivery currently costs Rs\. 350/);assert.match(text,/free prepaid delivery is disabled/);assert.match(text,/support@example\.com/);
 const disabled=aiDirectory({cod_enabled:false,jazzcash_enabled:false,bank_transfer_enabled:false});
 assert.doesNotMatch(disabled,/COD requires an advance|Enabled prepaid orders/);
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response('unavailable',{status:503});
 try{const r=await aiDirectoryRoute({env:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'}});assert.equal(r.status,503);assert.equal(r.headers.get('cache-control'),'no-store');assert.doesNotMatch(await r.text(),/Rs\./);}finally{globalThis.fetch=old;}
});
test('cart disclosures respect free-delivery switch and cap advance at the total',()=>{
 const source=read('app.js'),start=source.indexOf('function settingNum('),end=source.indexOf('function sectionConfig(',start);
 const ctx={STORE_CONFIG:{settings:{}},fmt:n=>'Rs. '+n,esc:s=>s};vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
 assert.match(ctx.codAdvanceCopy(399),/Rs\. 399 advance/);assert.equal(ctx.prepaidThreshold(),5000);
 ctx.STORE_CONFIG.settings={prepaid_free_delivery_enabled:false,cod_advance_enabled:false};
 assert.equal(ctx.prepaidThreshold(),null);assert.doesNotMatch(ctx.deliveryFeeCopy(),/free|FREE/);assert.equal(ctx.codAdvanceNote(),'');
 assert.match(source,/codAdvanceNote\(sub\+settingNum/);assert.match(source,/codAdvanceNote\(subtotal\+settingNum/);
});
test('COD option still discloses advance while another payment method is selected',()=>{
 const source=read('checkout.js'),a=source.indexOf('function updateCodAdvanceDisplay('),b=source.indexOf('\nfunction setPay(',a),elements={};
 const ctx={PAY:'jazzcash',COD_ADVANCE_ENABLED:true,COD_ADVANCE_AMOUNT:500,DELIVERY_FEE:300,cartSubtotal:()=>1500,deliveryFee:()=>300,fmt:n=>'Rs. '+n,$:selector=>elements[selector]??=( {style:{}} )};
 vm.createContext(ctx);vm.runInContext(source.slice(a,b),ctx);ctx.updateCodAdvanceDisplay();
 assert.match(elements['#codAdvancePayHint'].textContent,/Rs\. 500 advance/);assert.equal(elements['#codAdvanceSummary'].style.display,'none');
});
test('server-rendered deals and new arrivals match URL filters without exposing other products',()=>{
 const rows=[{id:1,name:'A',price:100,old_price:100},{id:2,name:'B',price:100,old_price:150},{id:3,name:'C',price:90,old_price:null}];
 assert.deepEqual(filterCatalogueRows(rows,new URLSearchParams('badge=Sale')).map(p=>p.id),[2]);
 assert.deepEqual(filterCatalogueRows(rows,new URLSearchParams('sort=new')).map(p=>p.id),[3,2,1]);
});
test('brand HTML includes the owner-saved SEO and matching text before JavaScript runs',async()=>{
 const prior=globalThis.fetch;
 globalThis.fetch=async value=>{const u=new URL(value);if(u.pathname.endsWith('/public_products'))return Response.json([{id:5,name:'Product',brand:'fixture',price:100,category:'Snacks',image_url:'images/p5.webp'}]);if(u.pathname.endsWith('/bundle_items'))return Response.json([]);if(u.pathname.endsWith('/brands'))return Response.json([{name:'Fixture',slug:'fixture',seo_title:'Owner title <safe>',seo_description:'Owner description',long_description:'Owner intro'}]);throw Error(u.pathname);};
 try{
  const response=await renderBrandPage({request:new Request('https://chaskabox.online/brand/fixture/'),env:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',ASSETS:{fetch:async()=>new Response(read('index.html'))}}},'fixture');
  const html=await response.text();assert.equal(response.status,200);assert.match(html,/<title>Owner title &lt;safe&gt;<\/title>/);assert.match(html,/content="Owner description"/);assert.match(html,/Owner intro/);assert.match(html,/"@type":"BreadcrumbList"/);
 }finally{globalThis.fetch=prior;}
});
