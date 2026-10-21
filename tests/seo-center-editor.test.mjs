import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateSeoPatch} from '../admin-seo-center.js';
import {onRequestPatch} from '../functions/api/admin/products/[id].js';

const user='00000000-0000-4000-8000-000000000002';
const session='00000000-0000-4000-8000-000000000003';
const current={id:155,name:'Winner | Dakar Chatni Balls - Pack Of 25',visibility:'visible',price:250,stock_state:'available',image_url:'/images/product.webp',description:'Existing actual product description',seo_title:'',seo_description:'',og_image:'',canonical_url:'',updated_at:'2026-10-21T08:00:00Z'};

const patch={seo_title:'Dakar Chatni Balls Pack of 25 | ChaskaBox',seo_description:'Shop Winner Dakar Chatni Balls pack of 25 from ChaskaBox with Pakistan-wide delivery.',og_image:'/images/product.webp',canonical_url:'https://chaskabox.online/product/155/'};

test('SEO editor rejects invalid titles, description lengths, canonical hosts and unsafe image URLs',()=>{
 assert.deepEqual(validateSeoPatch(patch),patch);
 for(const bad of [
  {...patch,seo_title:''},{...patch,seo_title:'a'.repeat(61)},
  {...patch,seo_description:''},{...patch,seo_description:'b'.repeat(156)},
  {...patch,og_image:'javascript:alert(1)'},{...patch,og_image:'//evil.test/preview'},
  {...patch,canonical_url:'https://evil.test/product/155/'},
  {...patch,canonical_url:'http://chaskabox.online/product/155/'},
  {...patch,canonical_url:'https://chaskabox.online/product/155/?utm=secret'},
 ]){
  assert.throws(()=>validateSeoPatch(bad));
 }
 assert.equal(validateSeoPatch({...patch,canonical_url:'/product/155/'}).canonical_url,'/product/155/');
});

function makeContext(role='owner',aal='aal2',body=patch){
 const jwt='fixture.'+Buffer.from(JSON.stringify({sub:user,aal,session_id:session})).toString('base64url')+'.verified';
 return {params:{id:'155'},env:{SUPABASE_URL:'https://db.example.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'},
 request:new Request('https://site.example.invalid/api/admin/products/155',{method:'PATCH',headers:{Authorization:'Bearer '+jwt,'Content-Type':'application/json'},body:JSON.stringify(body)})};
}
async function withStub(run,{role='owner'}={}){
 const prior=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url),path=u.pathname,body=options.body?JSON.parse(options.body):null;
  calls.push({path,body});
  if(path==='/auth/v1/user')return Response.json({id:user});
  if(path==='/rest/v1/admin_roles')return Response.json([{role}]);
  if(path==='/rest/v1/rpc/admin_session_check')return Response.json(true);
  if(path==='/rest/v1/rpc/take_rate_limit_token')return Response.json([{allowed:true}]);
  if(path==='/rest/v1/products')return Response.json([current]);
  if(path==='/rest/v1/rpc/admin_cms_transaction')return Response.json([{...current,...body.p_operations[0].data}]);
  throw Error('Unexpected request '+path);
 };
 try{await run(calls);}finally{globalThis.fetch=prior;}
}

test('authenticated SEO save updates only metadata; no price, stock or image changes',async()=>{
 await withStub(async calls=>{
  const r=await onRequestPatch(makeContext());assert.equal(r.status,200);
  const result=await r.json();
  assert.equal(result.product.seo_title,patch.seo_title);
  assert.equal(result.product.price,current.price);
  const writes=calls.filter(c=>c.path==='/rest/v1/rpc/admin_cms_transaction');
  assert.equal(writes.length,1);
  const op=writes[0].body.p_operations[0];
  assert.equal(op.table,'products');assert.equal(op.id,'155');assert.ok(op.expected_updated_at);
  assert.deepEqual(Object.keys(op.data).sort(),['canonical_url','og_image','seo_description','seo_title','updated_by'].sort());
  assert.equal(op.data.image_url,undefined);
  assert.equal(op.data.price,undefined);
 });
});

test('SEO changes require current MFA and a permitted role',async()=>{
 await withStub(async calls=>{
  const r=await onRequestPatch(makeContext('owner','aal1'));
  assert.equal(r.status,403);
  assert.equal(calls.some(c=>c.path==='/rest/v1/rpc/admin_cms_transaction'),false);
 });
 await withStub(async calls=>{
  const r=await onRequestPatch(makeContext('fulfilment','aal2'));
  assert.equal(r.status,403);
  assert.equal(calls.some(c=>c.path==='/rest/v1/rpc/admin_cms_transaction'),false);
 },{role:'fulfilment'});
});

test('SEO AI is draft-only and manual metadata save remains available when AI is paused',async()=>{
 const center=await readFile(new URL('../admin-seo-center.js',import.meta.url),'utf8');
 const live=await readFile(new URL('../admin-live.js',import.meta.url),'utf8');
 const html=await readFile(new URL('../admin.html',import.meta.url),'utf8');
 const mount=live.slice(live.indexOf("if(name==='seo')"),live.indexOf("if(name==='homepage'"));
 assert.ok(mount.includes('mountSeoCenter'));
 assert.ok(!mount.includes('openLiveProduct(id)'));
 assert.match(center,/api\('\/api\/admin\/ai-status'\)/);
 assert.match(center,/task:'seo_meta',context:\{product_id:id\}/);
 assert.match(center,/aiButton\.disabled=!aiReady/);
 assert.match(center,/status\.enabled===true/);
 assert.match(center,/method:'PATCH',body:patch/);
 assert.match(center,/metadata readback could not be verified/i);
 assert.ok(html.includes('admin-seo-center.css?v=20261021-seo-ai-1'));
 assert.ok(html.includes('admin-live.js?v=20261021-seo-ai-1'));
});
