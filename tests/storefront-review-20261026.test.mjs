import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {renderBrandsDirectoryPage,renderBrandPage} from '../functions/api/_lib/catalogue-page.js';
import {utilityPage} from '../functions/api/_lib/utility-page.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shell=read('index.html');
const manifest={settings:{},categories:[],sections:[],navigation:[],theme:{}};
const context={request:new Request('https://chaskabox.online/brands/'),env:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic',ASSETS:{fetch:async()=>new Response(shell)}}};
test('Brands directory and detail render public content and hydration seeds before browser APIs',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{
  const u=new URL(typeof url==='string'?url:url.url);
  if(u.pathname.endsWith('/rpc/shop_page_snapshot'))return Response.json({products:[{id:39,name:'Mayfair sweet',brand:'Mayfair',price:100,visibility:'visible',image_url:null}],bundle_items:[],manifest});
  if(u.pathname.endsWith('/brands'))return Response.json([{id:1,name:'Mayfair',normalized_name:'Mayfair',slug:'mayfair',is_visible:true},{id:2,name:'No products',slug:'none',is_visible:true}]);
  throw Error('Unexpected dependency '+u.pathname);
 };
 try{
  const response=await renderBrandsDirectoryPage(context),html=await response.text();
  assert.equal(response.status,200);assert.match(html,/class="card brand-directory-card" href="\/brand\/mayfair\//);assert.doesNotMatch(html,/class="card brand-directory-card" href="\/brand\/none\//);
  assert.match(html,/id="current-brands"/);assert.match(html,/id="current-storefront-config"/);assert.match(html,/brand-directory-initials[^>]*[^<]*>M</);
  const detail=await renderBrandPage(context,'mayfair'),body=await detail.text();
  assert.equal(detail.status,200);assert.match(body,/id="brandTitle"[^>]*>Mayfair Snacks Online in Pakistan<\/h1>/);assert.match(body,/id="brandProdCount"[^>]*>1 product</);assert.match(body,/id="current-brand"/);assert.match(body,/"productIds":\[39\]/);
 }finally{globalThis.fetch=original;}
});
test('saved-list server shells keep useful content above the footer while data loads',async()=>{
 for(const view of ['cart','wishlist']){
  const r=await utilityPage(context,view,'/'+view+'/',view,'Saved snacks');const html=await r.text();
  assert.equal(r.status,200);assert.match(html,/class="section route-loading" role="status"/);assert.match(html,/Loading your saved snacks/);assert.equal(r.headers.get('X-Robots-Tag'),'noindex, follow');
 }
});
test('brand reads share one request, reuse SSR data and can retry an outage',async()=>{
 const source=read('app.js').slice(read('app.js').indexOf('let _brandsCache=null'),read('app.js').indexOf('function renderBrandsRoute'));
 let calls=0;const scope={document:{getElementById:()=>null},fetch:async()=>{calls++;if(calls===1)return{ok:false};return{ok:true,json:async()=>({brands:[{name:'Mayfair'}]})};}};
 vm.createContext(scope);vm.runInContext(source,scope);
 const first=await Promise.allSettled([scope.fetchBrands(),scope.fetchBrands()]);assert.equal(calls,1);assert.ok(first.every(r=>r.status==='rejected'));
 assert.equal((await scope.fetchBrands())[0].name,'Mayfair');assert.equal(calls,2);
 const seeded={document:{getElementById:()=>({textContent:'[{"name":"Seeded"}]'})},fetch:()=>{throw Error('No network expected');}};
 vm.createContext(seeded);vm.runInContext(source,seeded);assert.equal((await seeded.fetchBrands())[0].name,'Seeded');
});
