import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withAdmin, readJson, audit, needsAdminMfa } from '../functions/api/admin/_lib/auth.js';
import { onRequestPatch as settings } from '../functions/api/admin/settings/index.js';

const id='00000000-0000-4000-8000-000000000001';
const session='00000000-0000-4000-8000-000000000010';
function ctx({aal='aal2',method='POST',path='/api/admin/categories',body={}}={}) {
 const token='fixture.'+Buffer.from(JSON.stringify({sub:id,aal,session_id:session})).toString('base64url')+'.verified-by-mock';
 return {env:{SUPABASE_URL:'https://db.example.invalid',SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'},request:new Request('https://site.example.invalid'+path,{method,headers:{Authorization:'Bearer '+token},...(!['GET','HEAD'].includes(method)?{body:JSON.stringify(body)}:{})})};
}
async function mock({role='owner',live=true,allowed=true},run){
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options={})=>{const path=new URL(url).pathname;calls.push({path,body:options.body?JSON.parse(options.body):null});
  if(path==='/auth/v1/user')return Response.json({id});
  if(path==='/rest/v1/admin_roles')return Response.json(role?[{role}]:[]);
  if(path==='/rest/v1/rpc/admin_session_check')return Response.json(live);
  if(path==='/rest/v1/rpc/take_rate_limit_token')return Response.json([{allowed}]);
  if(path==='/rest/v1/rpc/admin_cms_transaction')return Response.json(calls.at(-1).body.p_operations.map(o=>o.data));
  throw new Error('Unexpected I/O '+path);
 };
 try{return await run(calls);}finally{globalThis.fetch=original;}
}
test('all admin mutations and backup/order exports require MFA; read-only enrollment remains reachable',()=>{
 for(const method of ['POST','PATCH','PUT','DELETE'])assert.equal(needsAdminMfa(ctx({method}).request),true);
 for(const path of ['/api/admin/backup','/api/admin/orders/export.csv'])assert.equal(needsAdminMfa(ctx({method:'GET',path}).request),true);
 for(const path of ['/api/admin/me','/api/admin/staff','/api/admin/products'])assert.equal(needsAdminMfa(ctx({method:'GET',path}).request),false);
});
test('AAL1 denied before rate limiter or handler, and live AAL2 works for every staff role',async()=>{
 const route=withAdmin(['owner','manager','content','fulfilment'],()=>Response.json({ok:true}));
 await mock({},async calls=>{const r=await route(ctx({aal:'aal1'}));assert.equal(r.status,403);assert.equal((await r.json()).error.code,'MFA_REQUIRED');assert.equal(calls.length,2);});
 for(const role of ['owner','manager','content','fulfilment'])await mock({role},async()=>assert.equal((await route(ctx())).status,200));
});
test('revoked role, removed/expired session and rate denial cannot reach a privileged handler',async()=>{
 let executed=0;const route=withAdmin(['owner'],()=>{executed++;return Response.json({ok:true});});
 for(const opts of [{role:null},{role:'content'},{live:false},{allowed:false}])await mock(opts,async()=>assert.ok([403,429].includes((await route(ctx())).status)));
 assert.equal(executed,0);
});
test('settings validate the complete batch before one transaction and send no direct writes',async()=>{
 await mock({},async calls=>{const r=await settings(ctx({path:'/api/admin/settings',method:'PATCH',body:{settings:{cod_enabled:true,delivery_estimate:'2 days'}}}));assert.equal(r.status,200);const transaction=calls.filter(c=>c.path.endsWith('admin_cms_transaction'));assert.equal(transaction.length,1);assert.equal(transaction[0].body.p_operations.length,2);assert.ok(calls.every(c=>c.path.includes('/rpc/')||c.path==='/auth/v1/user'||c.path==='/rest/v1/admin_roles'));});
 await mock({},async calls=>{const r=await settings(ctx({method:'PATCH',body:{settings:{cod_enabled:true,jazzcash_enabled:'false'}}}));assert.equal(r.status,400);assert.ok(!calls.some(c=>c.path.endsWith('admin_cms_transaction')));});
});
test('JSON parser bounds streamed UTF-8 bytes and rejects non-object payloads',async()=>{
 for(const body of ['[]','null','"text"'])await assert.rejects(readJson(new Request('https://fixture.invalid',{method:'POST',body})),e=>e instanceof Response&&e.status===400);
 await assert.rejects(readJson(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({text:'é'.repeat(10)})}),15),e=>e instanceof Response&&e.status===413);
 assert.deepEqual(await readJson(new Request('https://fixture.invalid',{method:'POST',body:'{}'})),{});
});
test('nontransactional audit failure is visible and warns that external side effects may already exist',async()=>{
 const original=globalThis.fetch,log=console.error;globalThis.fetch=async()=>Response.json({message:'unavailable'},{status:503});console.error=()=>{};
 try{let error;try{await audit(ctx(),{actorId:id,actorRole:'owner',action:'media.uploaded',entityType:'media',entityId:'fixture'});}catch(e){error=e;}assert.equal(error.status,503);assert.equal((await error.json()).error.code,'AUDIT_UNAVAILABLE');}finally{globalThis.fetch=original;console.error=log;}
});
