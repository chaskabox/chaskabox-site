import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {replayPlan} from '../tools/schema-replay.mjs';
import {PORTAL_DEFAULTS,portalConfig,profileInput,addressInput,reorderCart} from '../account-portal-contract.js';
import {onRequestPatch as editAccount,onRequestGet as readAccount} from '../functions/api/admin/customer-accounts/[id].js';
import {onRequestPatch as editPortal} from '../functions/api/admin/account-portal/index.js';
import {onRequestGet as publicPortal} from '../functions/api/account-portal.js';

const owner='00000000-0000-4000-8000-000000000001',customer='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003',manager='00000000-0000-4000-8000-000000000004';
const session='00000000-0000-4000-8000-000000000005',stamp='2026-10-21T00:00:00+00:00';
test('portal inputs and re-order respect limits, availability and existing cart quantities',()=>{
 assert.deepEqual(portalConfig(),PORTAL_DEFAULTS);
 assert.throws(()=>portalConfig({show_reorder:'false'},true));
 assert.throws(()=>portalConfig({staff_role:'owner'},true));
 assert.deepEqual(profileInput({name:' Test Customer ',phone:'+92 300 1234567'}),{name:'Test Customer',phone:'+92 300 1234567'});
 for(const name of ['', 'x','x'.repeat(101)])assert.throws(()=>profileInput({name,phone:''}));
 assert.throws(()=>profileInput({name:'Customer',phone:'not-a-number'}));
 assert.throws(()=>addressInput({city:'K',address:'short'}));
 assert.throws(()=>addressInput({label:'Home',city:'Karachi',address:'x'.repeat(441)}));
 const next=reorderCart({'5':98,'8':'2',evil:9},[{product_id:5,quantity:5},{product_id:8,quantity:3},{product_id:9,quantity:1},{product_id:10,quantity:1}],[
  {id:5,visibility:'visible',stock_state:'sourced_after_order'},{id:8,visibility:'visible',stock_state:'unavailable'},{id:9,visibility:'hidden',stock_state:'sourced_after_order'},
 ]);
 assert.deepEqual(next,{cart:{5:99},added:1,skipped:3});
});
async function fixture(){
 const db=new PGlite({extensions:{vector,pgcrypto}});
 try{
  await db.exec(await readFile('tests/fixtures/platform-schema.sql','utf8'));
  for(const file of (await replayPlan()).files)await db.exec(await readFile(file,'utf8'));
  await db.query("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'owner@example.invalid',now()),($2,'customer@example.invalid',now()),($3,'other@example.invalid',now()),($4,'manager@example.invalid',now())",[owner,customer,other,manager]);
  await db.query("INSERT INTO admin_roles(user_id,role,active) VALUES($1,'owner',true),($2,'manager',true)",[owner,manager]);
  await db.query("INSERT INTO profiles(id,name,phone,updated_at) VALUES($1,'Synthetic Customer','03001234567',$2),($3,'Other Customer','03007654321',$2) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,phone=EXCLUDED.phone,updated_at=EXCLUDED.updated_at",[customer,stamp,other]);
  return db;
 }catch(e){await db.close();throw e;}
}
async function service(db,sql,values=[]){await db.exec('SET ROLE service_role');try{return(await db.query(sql,values)).rows;}finally{await db.exec('RESET ROLE');}}
const mutate=(db,actor,user,action,id=null,expected=null,data={})=>service(db,'SELECT admin_account_mutate($1,$2,$3,$4,$5,$6) r',[actor,user,action,id,expected,data]);
test('complete-schema account workflows isolate customers, require owners, detect conflicts and commit audit evidence atomically',async()=>{
 const db=await fixture();
 try{
  const list=(await service(db,'SELECT admin_account_directory($1,$2,NULL,25,0) r',[manager,'customer@example.invalid']))[0].r;
  assert.equal(list.total,1);assert.equal(list.accounts[0].id,customer);assert.equal('raw_user_meta_data' in list.accounts[0],false);
  const directory=(await service(db,"SELECT admin_account_directory($1,'',NULL,25,0) r",[owner]))[0].r;
  assert.equal(directory.total,4,'registered users with no orders are included');
  for(const role of ['anon','authenticated']){
   await db.exec('SET ROLE '+role);
   await assert.rejects(db.query("SELECT admin_account_directory($1,'',NULL,25,0)",[owner]),/permission denied/);
   await assert.rejects(db.query("SELECT admin_account_mutate($1,$2,'profile',NULL,NULL,'{}')",[owner,customer]),/permission denied/);
   await assert.rejects(db.query("SELECT admin_account_portal_settings($1,NULL,$2)",[owner,PORTAL_DEFAULTS]),/permission denied/);
   await db.exec('RESET ROLE');
  }
  await assert.rejects(mutate(db,manager,customer,'profile',null,stamp,{name:'Manager edit',phone:''}),/Owner/);
  await mutate(db,owner,customer,'profile',null,stamp,{name:'Saved Customer',phone:'03005556666'});
  assert.equal((await db.query('SELECT name FROM profiles WHERE id=$1',[customer])).rows[0].name,'Saved Customer');
  assert.equal((await db.query('SELECT name FROM profiles WHERE id=$1',[other])).rows[0].name,'Other Customer');
  await assert.rejects(mutate(db,owner,customer,'profile',null,stamp,{name:'Stale overwrite',phone:''}),/STALE_ACCOUNT/);
  const create=await mutate(db,owner,customer,'address_create',null,null,{label:'Home',city:'Karachi',address:'Synthetic street 10'});
  const first=create[0].r.record,second=(await mutate(db,owner,customer,'address_create',null,null,{label:'Work',city:'Lahore',address:'Synthetic office 20'}))[0].r.record;
  const foreign=(await mutate(db,owner,other,'address_create',null,null,{label:'Other',city:'Lahore',address:'Other synthetic street'}))[0].r.record;
  await assert.rejects(mutate(db,owner,customer,'address_default',foreign.id,foreign.updated_at),/Address not found/);
  await mutate(db,owner,customer,'address_default',first.id,first.updated_at);
  await mutate(db,owner,customer,'address_default',second.id,second.updated_at);
  assert.deepEqual((await db.query('SELECT id FROM addresses WHERE user_id=$1 AND is_default',[customer])).rows.map(r=>r.id),[second.id]);
  const edited=(await db.query('SELECT updated_at FROM addresses WHERE id=$1',[second.id])).rows[0].updated_at;
  await mutate(db,owner,customer,'address_update',second.id,edited,{label:'Office',city:'Lahore',address:'Updated synthetic street'});
  await assert.rejects(mutate(db,owner,customer,'address_delete',second.id,edited),/STALE_ACCOUNT/);
  const now=(await db.query('SELECT updated_at FROM profiles WHERE id=$1',[customer])).rows[0].updated_at;
  await db.exec("CREATE FUNCTION account_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure';END $$;CREATE TRIGGER account_audit_failure BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION account_audit_failure();");
  await assert.rejects(mutate(db,owner,customer,'profile',null,now,{name:'Must roll back',phone:''}),/synthetic audit failure/);
  assert.equal((await db.query('SELECT name FROM profiles WHERE id=$1',[customer])).rows[0].name,'Saved Customer');
  await db.exec('DROP TRIGGER account_audit_failure ON audit_log;');
  const profileAudit=(await db.query("SELECT before_data,after_data FROM audit_log WHERE entity_type='customer_profile'")).rows;
  assert.equal(profileAudit.length,1);assert.equal(profileAudit[0].before_data.name,'Synthetic Customer');assert.equal(profileAudit[0].after_data.name,'Saved Customer');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[customer]);await db.exec('SET ROLE authenticated;');
  assert.deepEqual((await db.query('SELECT id FROM profiles')).rows.map(r=>r.id),[customer]);
  assert.equal((await db.query('SELECT count(*)::int n FROM addresses WHERE user_id=$1',[other])).rows[0].n,0);
  await assert.rejects(db.query("INSERT INTO profiles(id,name) VALUES($1,'Intruder')",[owner]),/row-level security/);
  await db.exec('RESET ROLE');
  const saved=(await service(db,'SELECT admin_account_portal_settings($1,NULL,$2) r',[owner,{...PORTAL_DEFAULTS,show_reorder:false}]))[0].r;
  assert.equal(saved.portal.show_reorder,false);
  await assert.rejects(service(db,'SELECT admin_account_portal_settings($1,NULL,$2)',[owner,PORTAL_DEFAULTS]),/STALE_ACCOUNT/);
  await assert.rejects(service(db,'SELECT admin_account_portal_settings($1,$2,$3)',[manager,saved.updated_at,PORTAL_DEFAULTS]),/Owner/);
  await assert.rejects(service(db,'SELECT admin_account_portal_settings($1,$2,$3)',[owner,saved.updated_at,{...PORTAL_DEFAULTS,show_addresses:'yes'}]),/Invalid portal/);
  assert.equal((await db.query("SELECT count(*)::int n FROM audit_log WHERE entity_id='account_portal'")).rows[0].n,1);
 }finally{await db.close();}
});
function context(body,role='owner',aal='aal2'){
 const token='fixture.'+Buffer.from(JSON.stringify({sub:owner,session_id:session,aal})).toString('base64url')+'.signature';
 return {params:{id:customer},env:{SUPABASE_URL:'https://db.example.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'},request:new Request('https://shop.example.invalid/api/admin/customer-accounts/'+customer,{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)})};
}
async function mock(run,{role='owner',conflict=false}={}){
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url),body=options.body?JSON.parse(options.body):null;calls.push({path:u.pathname,body,url:u});
  if(u.pathname==='/auth/v1/user')return Response.json({id:owner});
  if(u.pathname==='/rest/v1/admin_roles')return Response.json(role?[{role}]:[]);
  if(u.pathname.endsWith('/admin_session_check'))return Response.json(true);
  if(u.pathname.endsWith('/take_rate_limit_token'))return Response.json([{allowed:true}]);
  if(u.pathname.endsWith('/admin_account_mutate')||u.pathname.endsWith('/admin_account_portal_settings'))return conflict?Response.json({message:'STALE_ACCOUNT'},{status:400}):Response.json({saved:true,record:{id:customer}});
  if(u.pathname==='/rest/v1/site_settings')return Response.json([{key:'account_portal',value:{...PORTAL_DEFAULTS,show_wishlist:false}},{key:'support_email',value:'support@example.invalid'}]);
  throw Error('Unexpected request '+u.pathname);
 };
 try{await run(calls);}finally{globalThis.fetch=original;}
}
test('account APIs enforce owner/MFA, validate fields, return conflicts and expose only public portal data',async()=>{
 const body={action:'profile',expected_updated_at:stamp,data:{name:'Synthetic Customer',phone:'03001234567'}};
 await mock(async calls=>{assert.equal((await editAccount(context(body))).status,200);const call=calls.find(c=>c.path.endsWith('/admin_account_mutate'));assert.equal(call.body.p_actor,owner);assert.equal(call.body.p_user,customer);assert.equal(call.body.p_action,'profile');assert.deepEqual(call.body.p_data,body.data);});
 for(const role of ['manager','content','fulfilment',null])await mock(async calls=>{assert.ok((await editAccount(context(body))).status>=400);assert.equal(calls.some(c=>c.path.endsWith('/admin_account_mutate')),false);},{role});
 await mock(async calls=>{assert.equal((await editAccount(context(body,'owner','aal1'))).status,403);assert.equal(calls.some(c=>c.path.endsWith('/admin_account_mutate')),false);});
 for(const invalid of [{...body,data:{name:'x',phone:''}},{...body,role:'owner'},{...body,data:{...body.data,email:'other@example.invalid'}},{...body,action:'delete_account'},{...body,expected_updated_at:'wrong'}])await mock(async calls=>{assert.equal((await editAccount(context(invalid))).status,422);assert.equal(calls.some(c=>c.path.endsWith('/admin_account_mutate')),false);});
 await mock(async()=>assert.equal((await editAccount(context(body))).status,409),{conflict:true});
 await mock(async calls=>{const r=await publicPortal({env:context(body).env});assert.equal(r.status,200);const data=await r.json();assert.deepEqual(Object.keys(data).sort(),['portal','support_email']);assert.equal(data.portal.show_wishlist,false);assert.equal(calls[0].url.searchParams.get('key'),'in.(account_portal,support_email)');});
 await mock(async calls=>{assert.equal((await editPortal(context({portal:{...PORTAL_DEFAULTS,show_reorder:'false'},expected_updated_at:null}))).status,422);assert.equal(calls.some(c=>c.path.endsWith('/admin_account_portal_settings')),false);});
});
