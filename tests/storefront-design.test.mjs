import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { onRequestGet } from '../functions/product/[[slug]].js';
import { LOCAL_PHOTOS } from '../functions/api/_lib/local-photos.js';
const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const shell=await readFile(new URL('../index.html',import.meta.url),'utf8');
const retention=await readFile(new URL('../retention.js',import.meta.url),'utf8');
function browser({reduced=false,observer=false}={}){
 const nodes=new Map(),listeners={},media={matches:reduced,addEventListener(type,fn){this.changed=fn}},history=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',hidden:false,style:{removeProperty(){},setProperty(){}},classList:{s:new Set(),add(x){this.s.add(x)},remove(x){this.s.delete(x)},contains(x){return this.s.has(x)},toggle(){}},querySelectorAll(){return[];},closest(){return null;},setAttribute(){},removeAttribute(){},focus(){},remove(){nodes.delete(id);}});return nodes.get(id);};
 const doc={hidden:false,body:node('body'),documentElement:node('html'),activeElement:null,getElementById:node,querySelector:s=>s.startsWith('#')?node(s.slice(1)):null,querySelectorAll:s=>s.includes('.reveal')?[node('reveal')]:[],addEventListener(type,fn){(listeners[type]??=[]).push(fn);}};
 const ctx={console,URL,URLSearchParams,setTimeout:()=>0,clearTimeout(){},matchMedia:()=>media,location:{pathname:'/shop/',origin:'https://fixture.invalid',search:'',hash:''},history:{pushState(a,b,url){history.push(url)},replaceState(a,b,url){history.push(url)}},document:doc,localStorage:{getItem(){return null}},CHASKABOX_LOCAL_PHOTOS:[...LOCAL_PHOTOS],addEventListener(){},scrollTo(){}};
 if(observer)ctx.IntersectionObserver=class{constructor(fn){this.callback=fn;}observe(){}unobserve(){}disconnect(){ctx.disconnected=true;}};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,node,media,listeners,history,run:s=>vm.runInContext(s,ctx)};
}
test('hero candidates and cards accept existing photos and reject absent local paths',()=>{
 const b=browser();assert.equal(b.run("hasPhoto({img:'images/p27.webp'})"),true);assert.equal(b.run("hasPhoto({img:'images/p999999.webp'})"),false);assert.equal(b.run("hasPhoto({img:'https://fixture.invalid/upload.png'})"),true);
 assert.match(b.run("cardHTML({id:1,name:'Fixture',price:1,img:'images/p999999.webp'})"),/Photo<br>coming soon/);
});
test('reveal content remains visible without an observer and when motion preference changes',()=>{
 const fallback=browser();fallback.run('initReveals();observeReveals();');assert.ok(fallback.node('reveal').classList.contains('in'));assert.equal(fallback.node('html').classList.contains('motion-reveals'),false);
 const b=browser({observer:true});b.run('initReveals();');assert.equal(b.node('html').classList.contains('motion-reveals'),true);b.node('heroCollage').style.transform='rotateX(2deg)';b.media.matches=true;b.media.changed();assert.ok(b.ctx.disconnected);assert.ok(b.node('reveal').classList.contains('in'));assert.equal(b.node('heroCollage').style.transform,'');
 b.media.matches=false;b.media.changed();assert.ok(b.node('reveal').classList.contains('in'));
});
test('SPA navigation preserves query filters and document/modified clicks stay native',()=>{
 const b=browser();b.run('route=()=>{};navigate("/shop/?q=imli&brand=Mayfair");');assert.equal(b.history.at(-1),'/shop/?q=imli&brand=Mayfair');
 const handler=b.listeners.click.at(-1);let prevented=0;
 const event=(href,extra={})=>({button:0,target:{closest:()=>({getAttribute:()=>href,hasAttribute:()=>false,target:''})},preventDefault(){prevented++},...extra});
 handler(event('/track-order.html'));handler(event('/admin/'));handler(event('/#faq',{ctrlKey:true}));assert.equal(prevented,0);
 handler(event('/shop/?q=jelly'));assert.equal(prevented,1);assert.equal(b.history.at(-1),'/shop/?q=jelly');
});
test('submitted and edited searches survive refresh and clearing removes stale query filters',()=>{
 const b=browser();b.run('route=()=>{};');
 b.node('headerSearch').value='bubble & gum';b.run('submitHeaderSearch();');assert.equal(b.history.at(-1),'/shop/?q=bubble%20%26%20gum');
 b.node('homeSearch').value='imli?';b.run('submitHomeSearch();');assert.equal(b.history.at(-1),'/shop/?q=imli%3F');
 b.ctx.location.search='?brand=Candyland&q=old';b.ctx.location.hash='#results';b.run("queueShopSearch('Bubble');");assert.equal(b.history.at(-1),'/shop/?brand=Candyland&q=Bubble#results');
 b.run('renderShopContent=()=>{};clearAllFilters();');assert.equal(b.history.at(-1),'/shop/#results');
});
test('late retention initialization preserves the photo-eligible native weekly-pick link',()=>{
 const b=browser();b.run("PRODUCTS=[{id:5,name:'Missing photo',category:'Snacks',price:1,img:'images/p5.webp',badge:'Bestseller'},{id:27,name:'Fixture snack',category:'Snacks',price:10,img:'images/p27.webp'}];renderHomeContent();");
 const before=b.node('weeklyPick').innerHTML;assert.match(before,/href="\/product\/27\/"/);assert.ok(!before.includes('showProductDetail'));
 vm.runInContext(retention,b.ctx);assert.equal(b.node('weeklyPick').innerHTML,before);
});
test('navigating away and back preserves the server-rendered homepage hero',()=>{
 const b=browser();
 b.node('view-home').innerHTML='<section class="hero"><h1>Bachpan Ka Zaiqa</h1></section>';
 b.run('closeFilters=()=>{};closeMnav=()=>{};showView("shop");showView("home");');
 assert.match(b.node('view-home').innerHTML,/Bachpan Ka Zaiqa/);
});
test('leaving a product route clears its schema and updates share metadata',()=>{
 const b=browser();let removed=false;
 b.ctx.document.querySelector=s=>b.node(s);b.node('product-schema').remove=()=>{removed=true};b.node('brandBreadcrumbSchema').remove=()=>{};
 b.run('setPageMeta("Fixture product","/product/272/",false,"Product description");');assert.equal(removed,false);
 b.run('setPageMeta("Shop Pakistani Snacks","/shop/",false,"Browse current snacks");');assert.equal(removed,true);
 assert.equal(b.node('meta[property="og:title"]').content,'Shop Pakistani Snacks');assert.equal(b.node('meta[name="twitter:title"]').content,'Shop Pakistani Snacks');assert.equal(b.node('meta[property="og:type"]').content,'website');assert.equal(b.node('meta[property="og:description"]').content,'Browse current snacks');
});
const product={id:272,visibility:'visible',name:'Fixture </script><script>alert(1)</script> Snack',price:650,category:'Snacks & Nimco',pack:'Fixture pack',image_url:'https://fixture.invalid/photo.png',description:'Fixture <b>description</b>'};
function context(slug='272'){return {params:{slug:[slug]},request:new Request('https://fixture.invalid/product/'+slug+'/'),env:{SUPABASE_URL:'https://db.fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',ASSETS:{fetch:async()=>new Response(shell)}}};}
test('new database products receive one canonical, safe SEO JSON and the shared site shell',async()=>{
 const original=globalThis.fetch;try{globalThis.fetch=async url=>{assert.match(String(url),/visibility=eq.visible/);return new Response(JSON.stringify([product]));};const r=await onRequestGet(context());assert.equal(r.status,200);const html=await r.text();assert.match(html,/id="view-product">/);assert.match(html,/id="view-home" style="display:none" hidden inert aria-hidden="true"/);assert.match(html,/Rs. 650/);assert.match(html,/id="current-product"/);assert.equal((html.match(/rel="canonical"/g)||[]).length,1);assert.ok(!html.includes('</script><script>alert(1)</script>'));const json=html.match(/<script type="application\/ld\+json" id="product-schema">([\s\S]*?)<\/script>/)[1];assert.equal(JSON.parse(json).name,product.name);assert.equal(JSON.parse(json).offers.priceCurrency,'PKR');assert.ok(!('aggregateRating' in JSON.parse(json)));}finally{globalThis.fetch=original;}
});
test('hidden, missing and invalid product routes fail closed with actual 404 responses',async()=>{
 const original=globalThis.fetch;try{globalThis.fetch=async()=>new Response(JSON.stringify([{...product,visibility:'hidden'}]));assert.equal((await onRequestGet(context())).status,404);globalThis.fetch=async()=>new Response('[]');assert.equal((await onRequestGet(context())).status,404);globalThis.fetch=async()=>{throw Error('Invalid id must not query');};assert.equal((await onRequestGet(context('not-an-id'))).status,404);}finally{globalThis.fetch=original;}
});
test('product backend outage returns 503 instead of stale success or hidden-product leakage',async()=>{
 const original=globalThis.fetch;try{globalThis.fetch=async()=>new Response('{}',{status:503});const r=await onRequestGet(context());assert.equal(r.status,503);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.match(await r.text(),/temporarily unavailable/);}finally{globalThis.fetch=original;}
});
