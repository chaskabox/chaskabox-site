import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const migration=await readFile(new URL('../database/migrations/20261015123000_step3_rls_performance.sql',import.meta.url),'utf8');
const policies={
  addresses:['addresses_own_all'],
  admin_roles:['admin_roles_own_read'],
  customers:['customers_own_read'],
  orders:['orders_customer_read'],
  order_items:['order_items_customer_read'],
  reviews:['reviews_own_read'],
  media:['media_write'],
  profiles:['profiles_own_select','profiles_own_insert','profiles_own_update'],
};
const indexes=['step3_agent_events_job_idx','step3_category_products_product_idx','step3_customer_notification_outbox_order_idx','step3_navigation_menus_parent_idx','step3_orders_customer_idx','step3_orders_shipping_zone_idx','step3_products_brand_idx','step3_reviews_order_idx','step3_reviews_user_idx','step3_wishlists_product_idx'];

test('Step 3 RLS improvements replay twice without grants/role drift or policy removal',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE SCHEMA chaskabox_agents;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
      CREATE FUNCTION public.staff_role() RETURNS text LANGUAGE sql STABLE AS 'SELECT NULL::text';`);
    for(const name of Object.keys(policies)){
      const fields=name==='profiles'?'id uuid':name==='media'?'id uuid, uploaded_by uuid':name==='order_items'?'id integer, order_id integer':'id integer, user_id uuid';
      await db.exec(`CREATE TABLE public.${name}(${fields}); ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY;`);
    }
    await db.exec(`CREATE TABLE chaskabox_agents.agent_events(job_id uuid);
      CREATE TABLE public.category_products(product_id bigint);
      CREATE TABLE public.customer_notification_outbox(order_id bigint);
      CREATE TABLE public.navigation_menus(parent_id bigint);
      ALTER TABLE public.orders ADD COLUMN customer_id bigint, ADD COLUMN shipping_zone_id bigint;
      CREATE TABLE public.products(brand_id bigint);
      ALTER TABLE public.reviews ADD COLUMN order_id bigint;
      CREATE TABLE public.wishlists(product_id bigint);`);
    for(const [table,names] of Object.entries(policies)){
      for(const name of names){
        const cmd=name==='profiles_own_insert'?'INSERT':name==='profiles_own_update'?'UPDATE':name==='media_write'||name==='addresses_own_all'?'ALL':'SELECT';
        const using=cmd==='INSERT'?'':' USING (true)';
        const check=cmd==='INSERT'||cmd==='UPDATE'||cmd==='ALL'?' WITH CHECK (true)':'';
        await db.exec(`CREATE POLICY ${name} ON public.${table} FOR ${cmd} TO authenticated${using}${check};`);
      }
    }
    await db.exec(migration);await db.exec(migration);
    const found=(await db.query(`SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
      FROM pg_policies WHERE schemaname='public' AND policyname=ANY($1::text[]) ORDER BY policyname`,
      [Object.values(policies).flat()])).rows;
    assert.equal(found.length,10,'all ten named policies must survive the migration');
    for(const row of found){
      assert.deepEqual(row.roles,['authenticated'],row.policyname+' original access role');
      assert.match((row.qual||'')+' '+(row.with_check||''),/SELECT\s+auth\.uid\(\)|SELECT\s+staff_role\(\)/i,row.policyname+' helper must be cached');
      assert.doesNotMatch((row.qual||'')+' '+(row.with_check||''),/\bOR\s+true\b/i,'no widened allow expression');
    }
    const own=found.find(x=>x.policyname==='addresses_own_all');
    assert.match(own.with_check,/SELECT\s+auth\.uid\(\)/i);
    const media=found.find(x=>x.policyname==='media_write');
    assert.match(media.with_check,/uploaded_by/i);
    assert.match(media.with_check,/IS NULL/i);
    assert.equal(found.find(x=>x.policyname==='profiles_own_insert').cmd,'INSERT');
    assert.equal(found.find(x=>x.policyname==='profiles_own_update').cmd,'UPDATE');
    const indexed=(await db.query(`SELECT indexname FROM pg_indexes WHERE schemaname IN ('public','chaskabox_agents') AND indexname=ANY($1::text[])`,[indexes])).rows.map(x=>x.indexname);
    assert.deepEqual(indexed.sort(),[...indexes].sort(),'all ten FK-leading indexes are present');
  }finally{await db.close();}
});
