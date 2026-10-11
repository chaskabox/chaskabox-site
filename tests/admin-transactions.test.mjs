import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { getUser, requireMfa } from '../functions/api/admin/_lib/auth.js';

const migration=await readFile(new URL('../database/migrations/20261011073605_production_admin_transactions.sql',import.meta.url),'utf8');
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',content='00000000-0000-4000-8000-000000000003',oid='00000000-0000-4000-8000-000000000004';
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE TABLE public.admin_roles(user_id uuid PRIMARY KEY,role text,active boolean,granted_by uuid,granted_at timestamptz DEFAULT now());
 INSERT INTO admin_roles(user_id,role,active) VALUES('${owner}','owner',true),('${other}','owner',true),('${content}','content',true);
 CREATE TABLE public.orders(id uuid PRIMARY KEY,customer_name text DEFAULT 'Fixture Person',customer_phone text DEFAULT '03000000000',payment_method text DEFAULT 'cod',payment_status text DEFAULT 'cod_due',fulfilment_status text DEFAULT 'new',transaction_reference text,admin_notes text,total int DEFAULT 500,created_at timestamptz DEFAULT '2026-10-01T00:00Z',updated_at timestamptz DEFAULT '2026-10-01T00:00Z');
 INSERT INTO orders(id) VALUES('${oid}');
 CREATE TABLE public.audit_log(id serial,actor_id uuid,actor_role text,action text,entity_type text,entity_id text,before_data jsonb,after_data jsonb);
 GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;`);
 await db.exec(migration);return db;
}
async function mutate(db,action,value='',note='',expected=null,actor=owner){return (await db.query('select public.admin_order_mutate($1,$2,$3,$4,$5,$6) as result',[actor,oid,action,value,note,expected])).rows[0].result;}

test('locked order decisions enforce transitions, prepaid gates and fresh staff roles',async()=>{
 const db=await fixture();try{
  assert.equal((await mutate(db,'status','packed')).code,'INVALID_TRANSITION');
  assert.equal((await mutate(db,'status','sourcing')).order.fulfilment_status,'sourcing');
  await db.exec(`UPDATE orders SET payment_method='jazzcash',payment_status='payment_submitted',transaction_reference='fixture';`);
  assert.equal((await mutate(db,'status','packed')).code,'PAYMENT_NOT_CLEARED');
  assert.equal((await mutate(db,'payment','verified')).order.payment_status,'payment_verified');
  assert.equal((await mutate(db,'payment','rejected')).code,'ALREADY_DECIDED');
  assert.equal((await mutate(db,'status','packed')).order.fulfilment_status,'packed');
  assert.equal((await mutate(db,'status','dispatched','',null,content)).code,'FORBIDDEN_ROLE');
  await db.exec(`UPDATE admin_roles SET active=false WHERE user_id='${owner}';`);
  assert.equal((await mutate(db,'note','','denied')).code,'FORBIDDEN_ROLE');
 }finally{await db.close();}
});
test('stale updates and terminal transitions fail; sequential note append preserves both entries',async()=>{
 const db=await fixture();try{
  assert.equal((await mutate(db,'status','sourcing','','2026-09-01T00:00Z')).code,'STALE_ORDER');
  await mutate(db,'note','','first fixture');await mutate(db,'note','','second fixture');
  const notes=(await db.query('select admin_notes from orders')).rows[0].admin_notes;assert.match(notes,/first fixture/);assert.match(notes,/second fixture/);
  assert.equal((await mutate(db,'status','cancelled','no')).code,'CANCEL_REASON_REQUIRED');
  assert.equal((await mutate(db,'status','cancelled','fixture reason')).order.fulfilment_status,'cancelled');
  assert.equal((await mutate(db,'status','sourcing')).code,'INVALID_TRANSITION');
  assert.equal((await db.query('select count(*)::int as n from audit_log')).rows[0].n,3);
 }finally{await db.close();}
});
test('audit failure rolls back the primary order mutation',async()=>{
 const db=await fixture();try{
  await db.exec(`CREATE FUNCTION block_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fixture audit unavailable';END$$;
   CREATE TRIGGER block_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION block_audit();`);
  await assert.rejects(mutate(db,'status','sourcing'),/fixture audit unavailable/);
  assert.equal((await db.query('select fulfilment_status from orders')).rows[0].fulfilment_status,'new');
 }finally{await db.close();}
});
test('staff update protects the remaining owner and writes its audit atomically',async()=>{
 const db=await fixture();try{
  const call=async(actor,target,patch)=>(await db.query('select admin_staff_update($1,$2,$3) as result',[actor,target,patch])).rows[0].result;
  assert.equal((await call(owner,other,{role:'manager'})).staff.role,'manager');
  assert.equal((await call(owner,owner,{role:'content'})).code,'LAST_OWNER');
  assert.equal((await call(owner,owner,{active:false})).code,'SELF_LOCKOUT');
  assert.equal((await call(other,owner,{active:false})).code,'FORBIDDEN_ROLE');
  assert.equal((await call(owner,other,{active:'false'})).code,'INVALID_STAFF');
  assert.equal((await db.query('select count(*)::int as n from audit_log')).rows[0].n,1);
 }finally{await db.close();}
});
test('sensitive RPCs reject public callers and customer analytics executes with zero/real fixtures',async()=>{
 const db=await fixture();try{
  for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);await assert.rejects(db.query('select admin_staff_update($1,$2,$3)',[owner,other,{}]),/permission denied/);await assert.rejects(mutate(db,'note','','denied'),/permission denied/);await db.exec('RESET ROLE');}
  const empty=(await db.query("select analytics_customers('2099-01-01','2099-02-01') as result")).rows[0].result;assert.equal(empty.summary.distinct_customers,0);
  const filled=(await db.query("select analytics_customers('2026-10-01','2026-11-01') as result")).rows[0].result;assert.equal(filled.summary.distinct_customers,1);assert.equal(filled.summary.repeat_rate_pct,0);
 }finally{await db.close();}
});
test('AAL2 claims are accepted only for the identity verified by Auth',async()=>{
 const original=globalThis.fetch;const token=(sub,aal)=>'header.'+Buffer.from(JSON.stringify({sub,aal})).toString('base64url')+'.signature';
 const ctx=t=>({request:new Request('https://fixture.invalid',{headers:{Authorization:'Bearer '+t}}),env:{SUPABASE_URL:'https://auth.fixture.invalid',SUPABASE_ANON_KEY:'fixture'}});
 try{
  globalThis.fetch=async()=>new Response(JSON.stringify({id:owner}),{status:200});
  assert.equal((await getUser(ctx(token(owner,'aal2')))).aal,'aal2');
  assert.equal((await getUser(ctx(token(other,'aal2')))).aal,'aal1');
  let denied;try{requireMfa(await getUser(ctx(token(owner,'aal1'))));}catch(e){denied=e;}
  assert.equal(denied.status,403);assert.equal((await denied.json()).error.code,'MFA_REQUIRED');
  globalThis.fetch=async()=>new Response('{}',{status:401});assert.equal(await getUser(ctx(token(owner,'aal2'))),null);
 }finally{globalThis.fetch=original;}
});
