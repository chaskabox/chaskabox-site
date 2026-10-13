import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateMediaAssignment,onRequestPost} from '../functions/api/admin/media/[id]/assign-product.js';

const uuid='00000000-0000-4000-8000-000000000001';
const user='00000000-0000-4000-8000-000000000002';
const session='00000000-0000-4000-8000-000000000003';
function context(pid=186,role='owner',aal='aal2'){
 const token='fixture.'+Buffer.from(JSON.stringify({sub:user,session_id:session,aal})).toString('base64url')+'.signature';
 return {params:{id:uuid},
  env:{SUPABASE_URL:'https://db.example.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'},
  request:new Request('https://site.example.invalid/api/admin/media/'+uuid+'/assign-product',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({product_id:pid})})
 };
}
async function mock(run,{role='owner',state='active',bucket='product-media',product=true,media=true}={}){
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url),path=u.pathname;const body=options.body?JSON.parse(options.body):null;
  calls.push({path,body});
  if(path==='/auth/v1/user')return Response.json({id:user});
  if(path==='/rest/v1/admin_roles')return Response.json(role?[{role}]:[]);
  if(path==='/rest/v1/rpc/admin_session_check')return Response.json(true);
  if(path==='/rest/v1/rpc/take_rate_limit_token')return Response.json([{allowed:true}]);
  if(path==='/rest/v1/media')return Response.json(media?[{id:uuid,bucket,object_path:'products/2026/10/'+uuid+'.webp',state}]:[]);
  if(path==='/rest/v1/products')return Response.json(product?[{id:186,name:'Fixture pack',pack:'100g',image_url:null,updated_at:'2026-10-13T00:00:00Z'}]:[]);
  if(path==='/rest/v1/rpc/admin_cms_transaction')return Response.json([{id:186,image_url:body.p_operations[0].data.image_url}]);
  throw Error('Unexpected route '+path);
 };
 try{await run(calls);}finally{globalThis.fetch=original;}
}
test('media assignment requires valid UUID and a positive integer product id',()=>{
 assert.deepEqual(validateMediaAssignment({mediaId:uuid,productId:186}),{mediaId:uuid,productId:186});
 for(const id of [-1,0,1.5,'186',null])assert.throws(()=>validateMediaAssignment({mediaId:uuid,productId:id}),e=>e instanceof Response&&e.status===400);
 assert.throws(()=>validateMediaAssignment({mediaId:'oops',productId:186}),e=>e instanceof Response&&e.status===400);
});
test('media assignment changes only primary image through audited single-product mutation',async()=>{
 await mock(async calls=>{
  const r=await onRequestPost(context());assert.equal(r.status,200);assert.equal((await r.json()).changed,true);
  const ops=calls.filter(x=>x.path==='/rest/v1/rpc/admin_cms_transaction');
  assert.equal(ops.length,1);
  const op=ops[0].body.p_operations[0];
  assert.equal(op.table,'products');assert.equal(op.id,'186');
  assert.equal(op.data.image_url,'https://db.example.invalid/storage/v1/object/public/product-media/products/2026/10/'+uuid+'.webp');
  assert.ok(op.expected_updated_at);
  assert.deepEqual(Object.keys(op.data).sort(),['image_url','updated_by']);
 });
});
test('unapproved image, missing product, AAL1 or nonstaff are all rejected without writes',async()=>{
 for(const opts of [{state:'deleting'},{bucket:'brand-assets'},{media:false},{product:false},{role:null},{role:'fulfilment'}]){
  await mock(async calls=>{
   const r=await onRequestPost(context());assert.ok(r.status>=400);
   assert.equal(calls.some(c=>c.path==='/rest/v1/rpc/admin_cms_transaction'),false);
  },opts);
 }
 await mock(async calls=>{
  const response=await onRequestPost(context(186,'owner','aal1'));
  assert.equal(response.status,403);assert.equal(calls.some(c=>c.path==='/rest/v1/rpc/admin_cms_transaction'),false);
 });
});
test('Admin UI requires evidence for payment review, supports customer search and homepage ordering',async()=>{
 const s=await readFile(new URL('../admin-live.js',import.meta.url),'utf8');
 for(const marker of ['Payment review recorded','askForOrderDecision(','transaction reference is required','data-home-move=','customerSearch','assign-product']){
  if(marker==='transaction reference is required')assert.ok(/transaction reference is required/i.test(s));
  else assert.ok(s.includes(marker),marker);
 }
 assert.ok(!s.includes("const reason=prompt('Cancellation reason (required):')"));
 assert.ok(s.includes("body:{decision,note,expected_updated_at:o.updated_at}"));
});
