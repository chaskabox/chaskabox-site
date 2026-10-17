import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { replayPlan, isolatedURL } from '../tools/schema-replay.mjs';

const actor='00000000-0000-4000-8000-000000000001',content='00000000-0000-4000-8000-000000000003';
const files=['tests/fixtures/platform-schema.sql',...(await replayPlan()).files];
async function fixture(){
 const db=new PGlite({extensions:{vector,pgcrypto}});
 try{
  for(const file of files){try{await db.exec(await readFile(new URL('../'+file,import.meta.url),'utf8'));}catch(e){throw new Error(file+': '+e.message);}}
  await db.query("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'owner@example.invalid',now()),($2,'content@example.invalid',now())",[actor,content]);
  await db.query("INSERT INTO admin_roles(user_id,role,active) VALUES($1,'owner',true),($2,'content',true)",[actor,content]);
  return db;
 }catch(e){await db.close();throw e;}
}
async function cms(db,operations,user=actor){await db.exec('SET ROLE service_role');try{return (await db.query('SELECT admin_cms_transaction($1,$2) result',[user,operations])).rows[0].result;}finally{await db.exec('RESET ROLE');}}
test('schema plan verifies its baseline and rejects production hosts or libpq host overrides',async()=>{
 const plan=await replayPlan();assert.equal(plan.manifest.baseline.public_tables,34);assert.equal(plan.files.length,1+plan.manifest.replay_migrations.length);
 for(const url of ['postgresql://postgres@db.jtvswuvnasqqzrjysgfd.supabase.co/postgres','postgresql://postgres@localhost/test?host=production.invalid','postgresql://postgres@localhost/test?hostaddr=8.8.8.8','https://localhost/test'])assert.throws(()=>isolatedURL(url));
 assert.equal(isolatedURL('postgresql://postgres@127.0.0.1:5433/test?sslmode=disable').hostname,'127.0.0.1');
});
test('complete captured schema and final-batch migrations replay into an empty isolated database',async()=>{
 const db=await fixture();try{
  assert.equal((await db.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n,46);
  assert.equal((await db.query("SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prorettype='trigger'::regtype AND p.proconfig IS NULL")).rows[0].n,0);
  for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);await assert.rejects(db.query('SELECT admin_cms_transaction($1,$2)',[actor,[]]),/permission denied/);await assert.rejects(db.query('SELECT handle_new_user()'),/permission denied/);await db.exec('RESET ROLE');}
  const baseline=await readFile(new URL('../database/baseline/20261011_public.sql',import.meta.url),'utf8');await assert.rejects(db.exec(baseline),/Baseline requires an empty public schema/);await db.exec('ROLLBACK');
 }finally{await db.close();}
});
test('CMS batches enforce live roles, bounded fields and rollback on any later failure or audit failure',async()=>{
 const db=await fixture();try{
  const [row]=await cms(db,[{table:'categories',op:'insert',data:{name:'Synthetic',slug:'synthetic'}}],content);
  await assert.rejects(cms(db,[{table:'site_settings',op:'upsert',id:'cod_enabled',data:{key:'cod_enabled',value:true}}],content),/Role not allowed/);
  await assert.rejects(cms(db,[{table:'categories',op:'update',id:row.id,data:{name:'Changed'}},{table:'categories',op:'update',id:row.id,data:{unexpected:'unsafe'}}]),/Unsupported CMS field/);
  assert.equal((await db.query('SELECT name FROM categories WHERE id=$1',[row.id])).rows[0].name,'Synthetic');
  await db.exec("CREATE FUNCTION fixture_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failed'; END $$; CREATE TRIGGER fixture_audit_fail BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION fixture_audit_fail();");
  await assert.rejects(cms(db,[{table:'categories',op:'update',id:row.id,data:{name:'Audit change'}}]),/synthetic audit failed/);
  assert.equal((await db.query('SELECT name FROM categories WHERE id=$1',[row.id])).rows[0].name,'Synthetic');
  await db.exec('DROP TRIGGER fixture_audit_fail ON audit_log;');
  await db.query('UPDATE admin_roles SET active=false WHERE user_id=$1',[content]);await assert.rejects(cms(db,[{table:'categories',op:'update',id:row.id,data:{name:'Revoked'}}],content),/Active CMS staff/);
 }finally{await db.close();}
});
test('category assignments and explicit homepage publish rollback as complete batches',async()=>{
 const db=await fixture();try{
  const [row]=await cms(db,[{table:'categories',op:'insert',data:{name:'Synthetic',slug:'synthetic'}}]);
  await assert.rejects(cms(db,[{table:'categories',op:'update',id:row.id,data:{name:'Assignment change'}},{table:'category_products',op:'delete_assignments',id:row.id},{table:'category_products',op:'insert',data:{category_id:row.id,product_id:999999,position:0}}]),/foreign key/);
  assert.equal((await db.query('SELECT name FROM categories')).rows[0].name,'Synthetic');
  await db.exec("INSERT INTO homepage_sections(section_key,config,draft_config) VALUES('hero','{}','{\"heading\":\"Synthetic\"}'),('faq','{}',NULL);");
  await assert.rejects(cms(db,[{table:'homepage_sections',op:'publish',id:'hero'},{table:'homepage_sections',op:'publish',id:'faq'}]),/no draft/);
  assert.deepEqual((await db.query("SELECT config FROM homepage_sections WHERE section_key='hero'")).rows[0].config,{});
  await assert.rejects(cms(db,[{table:'homepage_sections',op:'publish',id:'hero'}],content),/Role not allowed/);
  assert.equal((await cms(db,[{table:'homepage_sections',op:'publish',id:'hero'}]))[0].config.heading,'Synthetic');
 }finally{await db.close();}
});
test('live MFA requires the matching unexpired session and a still-verified factor',async()=>{
 const db=await fixture(),f='00000000-0000-4000-8000-000000000020',s='00000000-0000-4000-8000-000000000010';try{
  await db.query("INSERT INTO auth.mfa_factors(id,user_id,status) VALUES($1,$2,'verified')",[f,actor]);
  await db.query("INSERT INTO auth.sessions(id,user_id,factor_id,aal) VALUES($1,$2,$3,'aal2')",[s,actor,f]);
  const check=async who=>(await db.query('SELECT admin_session_check($1,$2) ok',[who||actor,s])).rows[0].ok;
  assert.equal(await check(),true);assert.equal(await check(content),false);
  await db.exec("UPDATE auth.mfa_factors SET status='unverified'");assert.equal(await check(),false);
  await db.exec("UPDATE auth.mfa_factors SET status='verified'; UPDATE auth.sessions SET not_after=now()-interval '1 minute'");assert.equal(await check(),false);
  await db.exec('DELETE FROM auth.sessions');assert.equal(await check(),false);
 }finally{await db.close();}
});
