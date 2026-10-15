import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {MIGRATION_ORDER} from '../tools/ai-release-preflight.mjs';

// Disposable in-memory Postgres fixture. Zero Supabase/Cloudflare credentials,
// no network, no customer data, no owner sessions, no production writes.
const owner='00000000-0000-4000-8000-000000000001';
const source=async name=>readFile(new URL('../database/migrations/'+name,import.meta.url),'utf8');
async function disposable(){
 const db=new PGlite();
 try{
  await db.exec([
   'CREATE ROLE anon;',
   'CREATE ROLE authenticated;',
   'CREATE ROLE service_role BYPASSRLS;',
   'CREATE TABLE public.api_rate_limits(id bigint);',
   'CREATE TABLE public.customer_notification_outbox(id bigint);',
   'CREATE TABLE public.notification_outbox(id bigint);',
   'CREATE TABLE public.order_status_events(id bigint);',
   'CREATE TABLE public.product_versions(id bigint);',
   'CREATE TABLE public.notification_deliveries(status text,delivery_status text);',
   'CREATE TABLE public.ai_usage(created_at timestamptz,success boolean);',
   'CREATE TABLE public.funnel_events(created_at timestamptz,event text);',
   'CREATE TABLE public.orders(created_at timestamptz,payment_status text,fulfilment_status text,payment_method text,total integer);',
   'CREATE TABLE public.products(id bigint PRIMARY KEY,name text,visibility text,stock_state text,updated_at timestamptz,seo_title text,seo_description text,image_url text);',
   'CREATE TABLE public.admin_roles(user_id uuid,role text,active boolean);',
   'CREATE TABLE public.audit_log(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id uuid,actor_role text,action text,entity_type text,entity_id text,before_data jsonb,after_data jsonb,created_at timestamptz DEFAULT now());',
   "INSERT INTO public.admin_roles(user_id,role,active) VALUES('"+owner+"','owner',true);",
   "INSERT INTO public.products(id,name,visibility,stock_state,updated_at) VALUES(5,'Synthetic snack','visible','sourced_after_order',now());",
   'GRANT SELECT ON public.products,public.orders,public.notification_deliveries,public.ai_usage,public.funnel_events,public.admin_roles TO service_role;',
   'GRANT INSERT ON public.audit_log TO service_role;',
  ].join('\n'));
  for(const migration of MIGRATION_ORDER)await db.exec(await source(migration));
  return db;
 }catch(error){await db.close();throw error;}
}
test('isolated M00–M04 stack replays in documented order and keeps all eight disabled',async()=>{
 const db=await disposable();
 try{
  const rows=(await db.query('SELECT agent_key,enabled,mode FROM chaskabox_agents.agent_settings ORDER BY agent_key')).rows;
  assert.deepEqual(rows.map(x=>x.agent_key),['analytics','backups','inventory','marketing','orders','security','seo','support']);
  assert.equal(rows.every(x=>x.enabled===false&&x.mode==='observe'),true);
  const postcheck=await readFile(new URL('../tools/ai-release-postcheck.sql',import.meta.url),'utf8');
  const outcome=(await db.query(postcheck)).rows[0].agent_security_postcheck;
  assert.equal(outcome.agents_configured,8);
  assert.equal(outcome.agents_enabled,0);
  assert.equal(outcome.private_tables_present,7);
  assert.equal(outcome.private_tables_with_rls,7);
  assert.equal(outcome.expected_rpc_count,8);
  assert.equal(outcome.service_only_rpcs,8);
  assert.equal(outcome.ready_for_owner_mfa_acceptance,true);
  assert.equal(outcome.production_release_authorized,false);
  const disabled=(await db.query('SELECT COUNT(*)::int n FROM chaskabox_agents.agent_jobs')).rows[0].n;
  assert.equal(disabled,0);
  assert.equal((await db.query('SELECT COUNT(*)::int n FROM chaskabox_agents.marketing_drafts')).rows[0].n,0);
 }finally{await db.close();}
});
test('combined migration grants cannot be bypassed by anon/authenticated and cannot enqueue while disabled',async()=>{
 const db=await disposable();
 try{
  for(const role of ['anon','authenticated']){
   await db.exec('SET ROLE '+role);
   try{
    for(const query of [
     'SELECT public.agent_m01_health()',
     'SELECT public.agent_m02_order_signals()',
     'SELECT public.agent_m03_insight_signals()',
     'SELECT public.agent_m04_list()'
    ])await assert.rejects(db.query(query),/permission denied/i,role+' '+query);
   }finally{await db.exec('RESET ROLE');}
  }
  await db.exec('SET ROLE service_role');
  try{
   await assert.rejects(
    db.query("SELECT public.agent_m01_enqueue('orders','scan','event:1234567890abcdef1234567890abcdef','{}'::jsonb)"),
    /Agent not activated/);
   const health=(await db.query('SELECT public.agent_m01_health() health')).rows[0].health;
   assert.equal(health.agents.length,8);
   assert.equal(health.agents.every(x=>x.enabled===false),true);
  }finally{await db.exec('RESET ROLE');}
 }finally{await db.close();}
});