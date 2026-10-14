import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {AGENTS,prepareAgentJob,shouldRunAgent} from '../functions/api/admin/_lib/agent-policy.js';

const sql=await readFile(new URL('../database/migrations/20261014200000_m01_agent_infrastructure.sql',import.meta.url),'utf8');
const key='event:abcdef0123456789abcdef0123456789';

test('M01 request guard permits only opaque, non-PII observation metadata',()=>{
 assert.equal(AGENTS.length,8);
 const prepared=prepareAgentJob({agentKey:'security',action:'scan',dedupeKey:key,metadata:{metric:'failed_checks',count:3}});
 assert.equal(prepared.p_agent,'security');
 assert.equal(prepared.p_metadata.count,3);
 for(const action of ['pay','publish','send','deploy','refund','delete'])
  assert.throws(()=>prepareAgentJob({agentKey:'orders',action,dedupeKey:key}));
 for(const metadata of [
  {phone:'03001111111'}, {email:'a@example.com'}, {summary:'contact a@example.com'},
  {summary:{nested:true}}, {summary:'Bearer abcdef'},
  {subject_hash:'not-hex'}, {count:Infinity}
 ]) assert.throws(()=>prepareAgentJob({agentKey:'security',action:'scan',dedupeKey:key,metadata}));
 assert.throws(()=>prepareAgentJob({agentKey:'unknown',action:'scan',dedupeKey:key}));
 assert.throws(()=>prepareAgentJob({agentKey:'security',action:'scan',dedupeKey:'email:a@example.com'}));
 assert.equal(shouldRunAgent({agent_key:'security',enabled:false,mode:'observe'},'security'),false);
 assert.equal(shouldRunAgent({agent_key:'security',enabled:true,mode:'observe'},'security'),true);
 assert.equal(shouldRunAgent({agent_key:'security',enabled:true,mode:'write'},'security'),false);
});

async function fixture(){
 const db=new PGlite();
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  await db.exec(sql);
  return db;
 }catch(e){await db.close();throw e;}
}
async function useRole(db,role,query,params=[]){
 await db.exec('SET ROLE '+role);
 try{return await db.query(query,params);}finally{await db.exec('RESET ROLE');}
}
test('M01 migration installs 8 disabled agents in a private schema',async()=>{
 const db=await fixture();
 try{
  const data=(await useRole(db,'service_role','SELECT public.agent_m01_health() AS health')).rows[0].health;
  assert.equal(data.agents.length,8);
  assert.equal(data.agents.every(a=>!a.enabled&&a.mode==='observe'),true);
  assert.equal(data.pending_jobs,0);
  assert.equal(data.pending_approvals,0);
  for(const role of ['anon','authenticated']){
   assert.equal((await db.query('SELECT has_schema_privilege($1,$2,$3) AS ok',[role,'chaskabox_agents','USAGE'])).rows[0].ok,false);
   await assert.rejects(useRole(db,role,'SELECT public.agent_m01_health()'),/permission denied/i);
   await assert.rejects(useRole(db,role,"SELECT public.agent_m01_enqueue('security','scan','event:abcdef0123456789abcdef0123456789','{}'::jsonb)"),/permission denied/i);
  }
  for(const table of ['agent_settings','agent_jobs','agent_events','agent_alerts','agent_approvals','agent_run_metrics']){
   const r=await db.query('SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass',['chaskabox_agents.'+table]);
   assert.equal(r.rows[0].relrowsecurity,true);
  }
 } finally{await db.close();}
});

test('M01 deny-by-default, idempotent enqueue, 24h cap, no side-effect action',async()=>{
 const db=await fixture();
 try{
  const query="SELECT public.agent_m01_enqueue($1,$2,$3,$4::jsonb) AS id";
  const args=['security','scan',key,'{"metric":"failed_checks","count":3}'];
  await assert.rejects(useRole(db,'service_role',query,args),/Agent not activated/);
  await db.exec("UPDATE chaskabox_agents.agent_settings SET enabled=true,rolling_24h_limit=1 WHERE agent_key='security'");
  const first=(await useRole(db,'service_role',query,args)).rows[0].id;
  const replay=(await useRole(db,'service_role',query,args)).rows[0].id;
  assert.equal(first,replay);
  await assert.rejects(useRole(db,'service_role',query,['security','scan','event:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','{}']),/budget reached/);
  await assert.rejects(useRole(db,'service_role',query,['security','publish','event:cccccccccccccccccccccccccccccccc','{}']),/observation-only/);
  await assert.rejects(useRole(db,'service_role',query,['security','scan','event:cccccccccccccccccccccccccccccccc','{"email":"a@example.com"}']),/Invalid safe metadata/);
  assert.equal((await db.query('SELECT count(*)::int n FROM chaskabox_agents.agent_jobs')).rows[0].n,1);
 }finally{await db.close();}
});
