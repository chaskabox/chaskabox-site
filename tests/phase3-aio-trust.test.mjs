import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {aiDirectory} from '../functions/llms.txt.js';
import {organizationSchema} from '../functions/api/_lib/storefront-html.js';
import {storeFaqs} from '../functions/api/_lib/faq-content.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('llms directories are navigational, factual, non-sensitive and not ranking promises',()=>{
 const staticText=read('llms.txt');
 assert.match(staticText,/https:\/\/chaskabox\.online\/shop\//);
 assert.match(staticText,/https:\/\/chaskabox\.online\/refund-policy\//);
 assert.doesNotMatch(staticText,/operated by Rameez|bakery.*Bangalore/);
 assert.doesNotMatch(staticText,/COD delivery currently costs Rs\. 300/);
 const live=aiDirectory({cod_enabled:true,cod_advance_enabled:true,cod_advance_amount_pkr:500,cod_delivery_fee_pkr:300,prepaid_free_delivery_threshold_pkr:5000});
 assert.match(live,/up to Rs\. 500/);
 assert.match(live,/current product pages, policies and checkout totals take precedence/i);
 assert.doesNotMatch(live,/bakery in Bangalore/i);
 const paused=aiDirectory({cod_enabled:false,jazzcash_enabled:false,bank_transfer_enabled:false});
 assert.doesNotMatch(paused,/COD requires an advance|Prepaid delivery currently costs/);
 assert.match(paused,/check the live checkout/);
});

test('no invented refundable-return promise is advertised as Store structured data',()=>{
 const store=organizationSchema();
 assert.equal(store['@type'],'OnlineStore');
 assert.equal(store.hasMerchantReturnPolicy,undefined);
 assert.equal(store.url,'https://chaskabox.online/');
 assert.equal(store.contactPoint.telephone,'+92-332-0005381');
});

test('FAQ answers follow configurable COD and prepaid terms without invented guarantees',()=>{
 const enabled=storeFaqs({cod_enabled:true,cod_advance_enabled:true,cod_advance_amount_pkr:500,cod_delivery_fee_pkr:300,prepaid_free_delivery_threshold_pkr:5000});
 const cod=enabled.find(f=>f.q.includes('Cash on Delivery'));
 assert.match(cod.a,/Rs\. 500/);
 assert.match(cod.a,/capped at the order total/);
 const paused=storeFaqs({cod_enabled:false});
 assert.match(paused.find(f=>f.q.includes('Cash on Delivery')).a,/paused/);
});

test('guide pages expose visible navigation breadcrumbs matching JSON-LD canonical paths',()=>{
 const guides=[
 ['guides/index.html','/guides/',['Home','Guides']],
 ['guides/choosing-a-snack-box/index.html','/guides/choosing-a-snack-box/',['Home','Guides','How to compare snack packs']],
 ['guides/bachpan-snacks-pakistan/index.html','/guides/bachpan-snacks-pakistan/',['Home','Guides','Bachpan snacks in Pakistan']],
 ['guides/how-chaskabox-orders-work/index.html','/guides/how-chaskabox-orders-work/',['Home','Guides','How ChaskaBox orders work']],
 ['snack-boxes/index.html','/snack-boxes/',['Home','Snack occasions']]
 ];
 for(const [file,path,names]of guides){
  const html=read(file);
  const match=/<script type="application\/ld\+json" id="guide-navigation-schema">([^<]+)<\/script>/.exec(html);
  assert.ok(match,file+' lacks schema');
  const graph=JSON.parse(match[1])['@graph'];
  assert.equal(graph[0].url,'https://chaskabox.online'+path);
  assert.deepEqual(graph[1].itemListElement.map(c=>c.name),names);
  assert.equal((html.match(/aria-label="Breadcrumb"/g)||[]).length,1,file);
  assert.match(html,/aria-current="page"/);
  assert.match(html,/<a class="hdrop-btn" href="\/brands\/">Brands/);
  assert.match(html,/<a href="\/shop\/\?badge=Sale">Deals<\/a>/);
  assert.match(html,new RegExp('rel="canonical" href="https://chaskabox.online'+path.replace(/\//g,'\\/')+'"'));
 }
});

test('all static info/guides desktop nav uses existing real public routes',()=>{
 for(const file of ['about/index.html','contact/index.html','faq/index.html','guides/index.html','guides/choosing-a-snack-box/index.html','guides/bachpan-snacks-pakistan/index.html','guides/how-chaskabox-orders-work/index.html','snack-boxes/index.html','shipping-policy/index.html','refund-policy/index.html','privacy-policy/index.html','terms/index.html']){
  const html=read(file);
  assert.doesNotMatch(html,/<a class="hdrop-btn" href="\/shop\/">Brands/);
  assert.doesNotMatch(html,/<a href="\/shop\/">Deals<\/a>/);
 }
});

test('guide copy removes unverified social account prompt in both static HTML and CMS defaults',()=>{
 const html=read('guides/bachpan-snacks-pakistan/index.html');
 const defaults=read('page-copy-defaults.js');
 for(const content of [html,defaults]){
  assert.doesNotMatch(content,/tag ChaskaBox on Instagram/);
  assert.match(content,/photos are used only with permission/);
 }
});

test('FAQ remains visible content, not a promised Google FAQ-rich-result snippet',()=>{
 const code=read('functions/faq/index.js');
 assert.match(code,/<details><summary>/);
 assert.doesNotMatch(code,/'@type':'FAQPage'/);
});
