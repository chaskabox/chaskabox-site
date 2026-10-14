import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {summarizeM03} from '../functions/api/admin/_lib/agent-insights.js';
const script=await readFile(new URL('../database/migrations/20261014220000_m03_insight_signals.sql',import.meta.url),'utf8');
const sample={support:{ai_requests_7d:3,ai_failures_7d:1,scope:'all_ai_tasks_not_support_only'},seo:{visible_products:3,missing_seo_title:1,missing_seo_description:2,missing_product_image:0},analytics:{orders_30d:2,recognized_sales_pkr_30d:200,checkout_started_30d:3,product_views_30d:8}};
test('M03 aggregates alerts deterministically and ignores private injected data',()=>{
 const result=summarizeM03({...sample,private:'a@example.invalid'});
 assert.equal(result.state,'ok');
 assert.equal(result.agents.length,3);
 assert.equal(result.agents[0].status,'attention');
 assert.equal(result.agents[1].alerts.length,2);
 assert.equal(result.agents[2].signals.recognized_sales_pkr_30d,200);
 assert.doesNotMatch(JSON.stringify(result),/@|private/);
 assert.equal(summarizeM03({...sample,analytics:{...sample.analytics,orders_30d:-1}}).state,'unknown');
});
test('M03 SQL grants aggregate-only access to service_role and replays without loss',async()=>{
 const db=new PGlite();try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  await db.exec("CREATE TABLE ai_usage(created_at timestamptz,success boolean); CREATE TABLE products(visibility text,seo_title text,seo_description text,image_url text); CREATE TABLE orders(created_at timestamptz,fulfilment_status text,payment_status text,payment_method text,total integer,customer_email text); CREATE TABLE funnel_events(created_at timestamptz,event text,session_id text);");
  await db.exec("INSERT INTO products VALUES ('visible',NULL,'desc','/pic.webp'),('visible','title',NULL,'/pic.webp'); INSERT INTO ai_usage VALUES(now(),false); INSERT INTO orders VALUES(now(),'delivered','cod_due','cod',200,'private@example.invalid'); INSERT INTO funnel_events VALUES(now(),'checkout_started','session-secret');");
  await db.exec('GRANT SELECT ON public.ai_usage,public.products,public.orders,public.funnel_events TO service_role;');
  await db.exec(script);
  for(const user of ['anon','authenticated']){
   await db.exec('SET ROLE '+user);
   try{await assert.rejects(db.query('SELECT agent_m03_insight_signals()'),/permission denied/i)}
   finally{await db.exec('RESET ROLE')}
  }
  await db.exec('SET ROLE service_role');
  try{
   const res=(await db.query('SELECT agent_m03_insight_signals() x')).rows[0].x;
   assert.equal(res.seo.missing_seo_title,1);
   assert.equal(res.analytics.recognized_sales_pkr_30d,200);
   assert.equal(res.support.ai_failures_7d,1);
   assert.doesNotMatch(JSON.stringify(res),/private@example|session-secret/);
  }finally{await db.exec('RESET ROLE')}
  await db.exec(script);
 }finally{await db.close()}
});
