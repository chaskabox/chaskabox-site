import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AGENTS,cycleKey,assess,evaluateRun,completionSql} from '../tools/agent-observe-cycle.mjs';

const when=new Date('2026-10-15T13:30:00Z');
test('six-hour dedupe, all eight allowed agents and deny invalid identities',()=>{
 assert.equal(AGENTS.length,8);
 assert.equal(new Set(AGENTS).size,8);
 assert.equal(cycleKey('orders',when),'observe:orders:2026-10-15:12');
 for(const key of AGENTS)assert.match(cycleKey(key,when),/^[a-z0-9][a-z0-9:._-]{15,199}$/);
 assert.throws(()=>cycleKey('payments',when));
});
test('unknown and missing signals never become healthy',()=>{
 const result=assess({orders:{stale_new_orders:0}}, {});
 assert.equal(result.orders,'unknown');
 assert.equal(result.security,'unknown');
 assert.equal(result.backups,'unknown');
 assert.equal(result.analytics,'unknown');
 assert.equal(result.marketing,'unknown');
 const aggregates={
  orders:{stale_new_orders:0,payment_reviews:1,overdue_open_orders:0,notification_failures:0},
  inventory:{visible_unavailable:0,visible_sourced_after_order:2,visible_unknown_stock:0,visible_products:15},
  insights:{
   support:{ai_requests_7d:0,ai_failures_7d:0},
   seo:{visible_products:15,missing_seo_title:1,missing_seo_description:0,missing_product_image:0},
   analytics:{orders_30d:0,recognized_sales_pkr_30d:0,checkout_started_30d:0,product_views_30d:0}
  },pending_drafts:0
 };
 const status=assess(aggregates,{security:'ok',backups:'unknown'});
 assert.equal(status.orders,'attention');
 assert.equal(status.inventory,'ok');
 assert.equal(status.seo,'attention');
 assert.equal(status.marketing,'ok');
 assert.equal(status.backups,'unknown');
});
test('GitHub status requires recent completed success',()=>{
 const run={status:'completed',conclusion:'success',created_at:when.toISOString()};
 assert.equal(evaluateRun(run,48,when.getTime()),'ok');
 assert.equal(evaluateRun({...run,conclusion:'failure'},48,when.getTime()),'attention');
 assert.equal(evaluateRun({...run,created_at:'2026-10-01T00:00:00Z'},48,when.getTime()),'unknown');
 assert.equal(evaluateRun(null,48,when.getTime()),'unknown');
});
test('generated SQL only enqueues/records private observation receipts',()=>{
 const text=completionSql('seo','unknown',when);
 assert.match(text,/public\.agent_m01_enqueue/);
 assert.match(text,/status='succeeded'/);
 assert.match(text,/chaskabox_agents\.agent_events/);
 assert.match(text,/observe:seo:2026-10-15:12/);
 assert.doesNotMatch(text,/INSERT INTO public\.|UPDATE public\.|DROP TABLE|DELETE FROM|TRUNCATE/i);
 assert.throws(()=>completionSql('seo','approved',when));
});
test('scheduled runner cannot activate disabled agents or auto-publish',async()=>{
 const workflow=await readFile(new URL('../.github/workflows/ai-agent-observation.yml',import.meta.url),'utf8');
 const code=await readFile(new URL('../tools/agent-observe-cycle.mjs',import.meta.url),'utf8');
 assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
 assert.match(workflow,/secrets\.SUPABASE_DB_URL/);
 assert.match(workflow,/workflow_dispatch/);
 assert.match(workflow,/--commit-observations/);
 assert.match(code,/s\.enabled===true&&s\.mode==='observe'/);
 assert.doesNotMatch(code,/WAHA_API_KEY|RESEND_API_KEY|publishProduct|chargePayment|supabase\.auth/);
});

test('disposable PGlite M01 replay: enabled observation succeeds once; disabled denied',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');
 const db=new PGlite();
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  const migration=await readFile(new URL('../database/migrations/20261014200000_m01_agent_infrastructure.sql',import.meta.url),'utf8');
  await db.exec(migration);
  await db.exec('SET ROLE service_role');
  try{
   await assert.rejects(db.exec(completionSql('orders','ok',when)),/Agent not activated/i);
   // Failed statements leave explicit BEGIN transactions aborted; reset the disposable database.
   await db.exec('ROLLBACK;');
   await db.exec("UPDATE chaskabox_agents.agent_settings SET enabled=true WHERE agent_key='orders'");
   await db.exec(completionSql('orders','attention',when));
   await db.exec(completionSql('orders','attention',when));
   const jobs=await db.query("SELECT status,attempts,metadata FROM chaskabox_agents.agent_jobs WHERE agent_key='orders'");
   assert.equal(jobs.rows.length,1);
   assert.equal(jobs.rows[0].status,'succeeded');
   assert.equal(jobs.rows[0].attempts,1);
   const events=await db.query("SELECT event_type FROM chaskabox_agents.agent_events WHERE agent_key='orders'");
   assert.deepEqual(events.rows.map(x=>x.event_type),['started','completed']);
   const metric=await db.query("SELECT runs,succeeded FROM chaskabox_agents.agent_run_metrics WHERE agent_key='orders'");
   assert.equal(metric.rows[0].runs,1);assert.equal(metric.rows[0].succeeded,1);
  }finally{await db.exec('RESET ROLE');}
 }finally{await db.close();}
});
