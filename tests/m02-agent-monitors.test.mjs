import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {observeOrders,observeInventory,observeGitHub} from '../functions/api/admin/_lib/agent-monitors.js';
const migration=await readFile(new URL('../database/migrations/20261014210000_m02_monitoring_snapshots.sql',import.meta.url),'utf8');
const now=Date.parse('2026-10-14T20:00:00Z');
const time=h=>new Date(now-h*3600000).toISOString();
function run(id,age,result='success',event='schedule',status='completed'){
 return {id,created_at:time(age),conclusion:result,event,status};
}
const respond=data=>({ok:true,json:async()=>data});
function github({quality=[run(21,1)],jobs=[{name:'secrets',status:'completed',conclusion:'success'}],backups=[run(3,20)],recovery=[run(4,16,'success','workflow_dispatch')],fail=''}={}){
 return async url=>{
  if(fail&&url.includes(fail))return {ok:false,status:403};
  if(url.includes('quality-checks.yml/runs'))return respond({workflow_runs:quality});
  if(url.includes('chaskabox-nightly-backup.yml/runs'))return respond({workflow_runs:backups});
  if(url.includes('isolated-recovery.yml/runs'))return respond({workflow_runs:recovery});
  if(url.includes('/actions/runs/21/jobs'))return respond({jobs});
  throw Error('Unexpected GitHub endpoint');
 };
}
test('M02 order monitor returns safe fixed counters only',()=>{
 const o=observeOrders({stale_new_orders:2,payment_reviews:1,overdue_open_orders:0,notification_failures:3,customer_email:'private@example.invalid'});
 assert.equal(o.state,'attention');
 assert.deepEqual(o.alerts.map(x=>x.code),['stale_new_orders','payment_reviews','notification_failures']);
 assert.doesNotMatch(JSON.stringify(o),/private@example.invalid/);
 assert.equal(observeOrders({stale_new_orders:0,payment_reviews:0,overdue_open_orders:0,notification_failures:0}).state,'ok');
 assert.equal(observeOrders({stale_new_orders:-1,payment_reviews:0,overdue_open_orders:0,notification_failures:0}).state,'unknown');
});
test('M02 inventory tracks stock states only; quantity not invented',()=>{
 const i=observeInventory({visible_unavailable:1,visible_sourced_after_order:230,visible_unknown_stock:0,visible_products:231,customer_phone:'03001111111'});
 assert.equal(i.state,'attention');
 assert.equal(i.signals.quantity_tracking_available,false);
 assert.deepEqual(i.alerts.map(x=>x.code),['visible_unavailable']);
 assert.doesNotMatch(JSON.stringify(i),/03001111111/);
});
test('M02 GitHub requires completed CI secrets, scheduled backup and isolated recovery',async()=>{
 const d=await observeGitHub(github(),now);
 assert.equal(d.security.state,'ok');
 assert.equal(d.backups.state,'ok');
 assert.equal(d.backups.signals.recent_isolated_recovery_passed,true);
});
test('M02 skipped restore is NOT success and failed backup is critical',async()=>{
 const d=await observeGitHub(github({backups:[run(3,2,'failure')],recovery:[run(4,2,'skipped','pull_request')]}),now);
 assert.equal(d.backups.state,'attention');
 assert.equal(d.backups.signals.recent_isolated_recovery_passed,false);
 assert.ok(d.backups.alerts.some(x=>x.code==='scheduled_backup_not_successful'));
 assert.ok(d.backups.alerts.some(x=>x.code==='recent_recovery_not_verified'));
});
test('M02 failed scanner alerts; incomplete scans and GitHub outages never show green',async()=>{
 const failure=await observeGitHub(github({jobs:[{name:'secrets',status:'completed',conclusion:'failure'}]}),now);
 assert.equal(failure.security.state,'attention');
 assert.deepEqual(failure.security.alerts.map(x=>x.code),['secrets_scan_failed']);
 const pending=await observeGitHub(github({quality:[run(21,1,null,'push','in_progress')]}),now);
 assert.equal(pending.security.state,'unknown');
 const outage=await observeGitHub(github({fail:'quality-checks.yml'}),now);
 assert.equal(outage.security.state,'unknown');
 const old=await observeGitHub(github({backups:[run(3,60)]}),now);
 assert.ok(old.backups.alerts.some(x=>x.code==='scheduled_backup_missing'));
});
async function fixture(){
 const db=new PGlite();
 try{
  await db.exec([
   'CREATE ROLE anon;',
   'CREATE ROLE authenticated;',
   'CREATE ROLE service_role BYPASSRLS;',
   'CREATE TABLE public.orders(created_at timestamptz,payment_status text,fulfilment_status text,customer_email text);',
   'CREATE TABLE public.products(visibility text,stock_state text);',
   'CREATE TABLE public.notification_deliveries(status text,delivery_status text);',
   'GRANT SELECT ON public.orders,public.products,public.notification_deliveries TO service_role;',
   "INSERT INTO public.orders VALUES(now()-interval '40 minutes','cod_due','new','private@example.invalid'),(now()-interval '6 days','payment_submitted','sourcing','second@example.invalid');",
   "INSERT INTO public.notification_deliveries VALUES('dead','failed');",
   "INSERT INTO public.products VALUES('visible','unavailable'),('visible','sourced_after_order');"
  ].join('\n'));
  await db.exec(migration);
  return db;
 }catch(e){await db.close();throw e;}
}
async function asRole(db,actor,sql){
 await db.exec('SET ROLE '+actor);
 try{return await db.query(sql);}
 finally{await db.exec('RESET ROLE');}
}
test('M02 SQL outputs only aggregate counts, denies browser roles, replays safely',async()=>{
 const db=await fixture();
 try{
  for(const actor of ['anon','authenticated']){
   await assert.rejects(asRole(db,actor,'SELECT public.agent_m02_order_signals()'),/permission denied/i);
   await assert.rejects(asRole(db,actor,'SELECT public.agent_m02_inventory_signals()'),/permission denied/i);
  }
  const order=(await asRole(db,'service_role','SELECT public.agent_m02_order_signals() AS signal')).rows[0].signal;
  assert.equal(order.stale_new_orders,1);
  assert.equal(order.payment_reviews,1);
  assert.equal(order.overdue_open_orders,1);
  assert.equal(order.notification_failures,1);
  assert.doesNotMatch(JSON.stringify(order),/example.invalid/);
  const inv=(await asRole(db,'service_role','SELECT public.agent_m02_inventory_signals() AS signal')).rows[0].signal;
  assert.equal(inv.visible_unavailable,1);
  assert.equal(inv.quantity_tracking_available,false);
  await db.exec(migration);
 }finally{await db.close();}
});
