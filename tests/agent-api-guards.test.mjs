import test from 'node:test';import assert from 'node:assert/strict';
import {onRequestGet as status} from '../functions/api/admin/agents/status.js';
import {onRequestGet as preview} from '../functions/api/admin/agents/preview.js';
import {onRequestGet as insights} from '../functions/api/admin/agents/insights.js';
import {onRequestGet as marketing,onRequestPost as decide} from '../functions/api/admin/agents/marketing.js';
const user='00000000-0000-4000-8000-000000000001',session='00000000-0000-4000-8000-000000000010';
const routes=[['status',status],['preview',preview],['insights',insights],['marketing',marketing]];
function context(path,{aal='aal2',anonymous=false,body}={}){
 const token='fixture.'+Buffer.from(JSON.stringify({sub:user,aal,session_id:session})).toString('base64url')+'.verified';
 return {env:{SUPABASE_URL:'https://db.example.invalid',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service'},request:new Request('https://site.example.invalid/api/admin/agents/'+path,{method:body?'POST':'GET',headers:anonymous?{}:{Authorization:'Bearer '+token},...(body?{body:JSON.stringify(body)}:{})})};
}
async function mocked({role='owner',live=true}={},run){
 const prior=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options={})=>{
  const path=new URL(url).pathname;calls.push(path);
  if(path==='/auth/v1/user')return Response.json({id:user});
  if(path==='/rest/v1/admin_roles')return Response.json([{role}]);
  if(path==='/rest/v1/rpc/admin_session_check')return Response.json(live);
  if(path==='/rest/v1/rpc/take_rate_limit_token')return Response.json([{allowed:true}]);
  if(path==='/rest/v1/rpc/agent_m01_health')return Response.json({agents:Array.from({length:8},()=>({enabled:false}))});
  throw Error('Unexpected protected I/O '+path);
 };
 try{await run(calls);}finally{globalThis.fetch=prior;}
}
test('all agent endpoints deny anonymous callers before any backend request',async()=>{
 await mocked({},async calls=>{for(const [path,handler] of routes)assert.equal((await handler(context(path,{anonymous:true}))).status,401);assert.equal((await decide(context('marketing',{anonymous:true,body:{operation:'propose',product_id:5,channel:'social'}}))).status,401);assert.equal(calls.length,0);});
});
test('actual agent GET handlers deny owner AAL1, nonowner and revoked sessions before RPC execution',async()=>{
 for(const opts of [{aal:'aal1'}, {role:'manager'}, {live:false}])await mocked(opts,async calls=>{
  for(const [path,handler] of routes)assert.equal((await handler(context(path,{aal:opts.aal||'aal2'}))).status,403);
  assert.equal(calls.some(p=>p.includes('/rpc/agent_m')),false);
 });
});
test('live MFA owner status returns private disabled-agent state with no caching',async()=>{
 await mocked({},async()=>{const r=await status(context('status'));assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');const d=await r.json();assert.equal(d.agents.length,8);assert.equal(d.agents.every(a=>!a.enabled),true);});
});
test('malformed draft UUID is rejected before calling the marketing RPC',async()=>{
 await mocked({},async calls=>{const r=await decide(context('marketing',{body:{operation:'decide',draft_id:'------------------------------------',decision:'approved'}}));assert.equal(r.status,400);assert.equal(calls.some(p=>p.includes('/rpc/agent_m04')),false);});
});
