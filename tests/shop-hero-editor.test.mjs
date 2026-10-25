import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultShopHero,validateShopHero,shopHeroFromManifest} from '../shop-hero-config.js';
import {renderShopHero,renderShopHeroHead,heroUsesLayers} from '../shop-hero-render.js';
import {onRequestGet,onRequestPatch,onRequestPost} from '../functions/api/admin/shop-hero/index.js';
const actor='00000000-0000-4000-8000-000000000001',session='00000000-0000-4000-8000-000000000010';
const version='2026-10-25T00:00:00Z';
function context(method='GET',body,aal='aal2'){
 const token='fixture.'+Buffer.from(JSON.stringify({sub:actor,session_id:session,aal})).toString('base64url')+'.fixture';
 return {env:{SUPABASE_URL:'https://hero-fixture.invalid',SUPABASE_ANON_KEY:'fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture'},request:new Request('https://shop.invalid/api/admin/shop-hero',{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})};
}
async function fixture(role,run){
 const prior=globalThis.fetch,calls=[];let row={section_key:'shop_hero',config:{},draft_config:{},updated_at:version};
 globalThis.fetch=async(url,init={})=>{
  const path=new URL(url).pathname,body=init.body?JSON.parse(init.body):null;calls.push({path,body});
  if(path==='/auth/v1/user')return Response.json({id:actor});
  if(path==='/rest/v1/admin_roles')return Response.json(role?[{role}]:[]);
  if(path==='/rest/v1/rpc/admin_session_check')return Response.json(true);
  if(path==='/rest/v1/rpc/take_rate_limit_token')return Response.json([{allowed:true}]);
  if(path==='/rest/v1/homepage_sections')return Response.json([row]);
  if(path==='/rest/v1/rpc/admin_cms_transaction'){
   for(const op of body.p_operations){assert.equal(op.id,'shop_hero');assert.equal(op.expected_updated_at,row.updated_at);if(op.op==='publish')row={...row,config:row.draft_config};else row={...row,...op.data};row.updated_at='2026-10-25T00:00:01Z';}
   return Response.json([row]);
  }
  throw Error('Unexpected request '+path);
 };
 try{await run(calls,()=>row);}finally{globalThis.fetch=prior;}
}
test('hero editor defaults retain the approved content and three-second interval',()=>{
 const c=validateShopHero({});assert.equal(c.heading,'Bachpan ka Zaiqa.');assert.equal(c.animation.interval,3);
 const html=renderShopHero(c);assert.match(html,/reference-heading|CBShopHeading/);assert.equal((html.match(/class="cb-mobile-packet/g)||[]).length,6);assert.equal((html.match(/<button[^>]*data-slide/g)||[]).length,3);assert.equal(heroUsesLayers(c),false);
 assert.equal(shopHeroFromManifest({sections:[{section_key:'shop_hero',config:{heading:'Fresh sweets'}}]}).heading,'Fresh sweets');
 assert.equal(renderShopHero({enabled:false}),'');assert.equal(renderShopHeroHead({enabled:false}),'');
});
test('reject executable URLs, injected CSS, invalid timing, unknown fields and malformed product positions',()=>{
 const bad=[{primary:{url:'javascript:alert(1)'}},{artwork:{desktopUrl:'data:image/svg+xml,evil'}},{artwork:{mobileUrl:'//evil.invalid/image.png'}},{colors:{navy:'#fff;display:none'}},{animation:{interval:0}},{layout:{mobileHeight:50000}},{type:{headingFont:'url(evil)'}},{phrases:['<img onerror=evil>']},{heading:'<script>evil</script>'},{__unexpected:true},{products:defaultShopHero().products.map((p,i)=>i? p:{...p,mobile:{x:'10px; color:red'}})}];
 for(const c of bad)assert.throws(()=>validateShopHero(c));
});
test('configurable copy is escaped; dollar signs are literal and never replacement syntax',()=>{
 const html=renderShopHero({heading:'$& Sweet & sour',description:'First line\nSecond & line',primary:{label:'Save $&',url:'/shop/?q=sweet&pack=12'}});
 assert.match(html,/>\$&amp; Sweet &amp; sour<\/h2>/);assert.match(html,/First line<br>Second &amp; line/);assert.match(html,/Save \$&amp;/);assert.match(html,/q=sweet&amp;pack=12/);
 assert.match(html,/CBShopRounded/);
});
test('each product can be moved, hidden and replaced without changing another slot',()=>{
 const c=defaultShopHero();c.products[0].url='/images/replacement.webp';c.products[1].visible=false;c.products[2].desktop.x=18;c.products[2].mobile.y=270;
 const html=renderShopHero(c);assert.equal(heroUsesLayers(c),true);assert.match(html,/cb-desktop-products/);assert.equal((html.match(/class="cb-custom-product"/g)||[]).length,2);assert.doesNotMatch(html,/class="cb-(?:desktop|mobile)-packet cb-packet-fruit/);assert.match(html,/cb-packet-masala\{left:18%/);assert.match(html,/top:270px/);
});
test('responsive artwork is preloaded early with matching image selection and smaller bytes',()=>{
 const head=renderShopHeroHead({}),html=renderShopHero({});assert.match(head,/imagesrcset=/);assert.match(head,/min-width:785px/);assert.match(head,/max-width:784px/);assert.match(html,/type="image\/avif"/);
 for(const [newPath,oldPath]of [['reference-clean-1800-v27.avif','reference-clean-1800-v19.webp'],['mobile-products-v27.avif','mobile-products-1140-v20.webp']])assert.ok(readFileSync(new URL('../shop-hero-assets/'+newPath,import.meta.url)).length<readFileSync(new URL('../shop-hero-assets/'+oldPath,import.meta.url)).length*.7);
});
test('owner can save a draft then publish only shop_hero with an audited atomic CMS operation',async()=>fixture('owner',async(calls,row)=>{
 assert.equal((await onRequestGet(context())).status,200);
 let response=await onRequestPatch(context('PATCH',{config:{heading:'Updated hero'},expected_updated_at:version}));assert.equal(response.status,200);assert.equal(row().config.heading,undefined);assert.equal(row().draft_config.heading,'Updated hero');
 response=await onRequestPost(context('POST',{expected_updated_at:row().updated_at}));assert.equal(response.status,200);assert.equal(row().config.heading,'Updated hero');
 const mutations=calls.filter(c=>c.path.endsWith('/admin_cms_transaction'));assert.equal(mutations.length,2);assert.ok(mutations.every(c=>c.body.p_actor===actor&&c.body.p_operations.length===1));
}));
test('staff content can draft but cannot publish; fulfilment and nonstaff cannot access the editor',async()=>{
 await fixture('content',async()=>{assert.equal((await onRequestPatch(context('PATCH',{config:{},expected_updated_at:version}))).status,200);assert.equal((await onRequestPost(context('POST',{expected_updated_at:version}))).status,403);});
 for(const role of ['fulfilment',null])await fixture(role,async calls=>{assert.equal((await onRequestGet(context())).status,403);assert.equal((await onRequestPatch(context('PATCH',{config:{},expected_updated_at:version}))).status,403);assert.ok(!calls.some(c=>c.path.endsWith('/admin_cms_transaction')));});
});
test('expired MFA, stale versions and invalid config fail before any mutation',async()=>fixture('owner',async calls=>{
 assert.equal((await onRequestPatch(context('PATCH',{config:{},expected_updated_at:version},'aal1'))).status,403);
 assert.equal((await onRequestPatch(context('PATCH',{config:{},expected_updated_at:'old'}))).status,409);
 assert.equal((await onRequestPatch(context('PATCH',{config:{animation:{interval:-1}},expected_updated_at:version}))).status,400);
 assert.ok(!calls.some(c=>c.path.endsWith('/admin_cms_transaction')));
}));
