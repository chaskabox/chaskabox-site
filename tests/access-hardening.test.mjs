import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../database/migrations/20261011060142_production_access_hardening.sql', import.meta.url), 'utf8');
const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';
const unconfirmed = '00000000-0000-4000-8000-000000000003';
const analytics = ['attention','boxes','boxevents','brands','categories','coupons','customers','filters','geography','issues','notifications','overview','products','refunds','revenue','shipping','wishlist'];

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz, is_anonymous boolean DEFAULT false);
    INSERT INTO auth.users VALUES
      ('${alice}', 'alice@recipient.invalid', now(), false),
      ('${bob}', 'bob@recipient.invalid', now(), false),
      ('${unconfirmed}', 'unconfirmed@recipient.invalid', null, false);
    CREATE TABLE public.products(id bigint PRIMARY KEY, visibility text);
    INSERT INTO public.products VALUES (1,'visible'),(2,'hidden');
    ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
    CREATE POLICY products_read ON public.products FOR SELECT TO anon, authenticated USING (visibility='visible');
    GRANT SELECT ON public.products TO anon, authenticated;
    CREATE TABLE public.categories(id integer PRIMARY KEY, is_visible boolean);
    INSERT INTO public.categories VALUES (1,true),(2,false);
    CREATE TABLE public.category_products(category_id integer, product_id bigint);
    INSERT INTO public.category_products VALUES (1,1),(1,2),(2,1);
    CREATE TABLE public.navigation_menus(id integer PRIMARY KEY, is_enabled boolean);
    INSERT INTO public.navigation_menus VALUES (1,true),(2,false);
    CREATE TABLE public.store_settings(key text PRIMARY KEY, value jsonb);
    CREATE TABLE public.orders(id integer PRIMARY KEY, user_id uuid, customer_email text, customer_phone text);
    INSERT INTO public.orders VALUES
      (1,null,' Alice@recipient.invalid ','03001111111'),
      (2,null,'bob@recipient.invalid','03002222222'),
      (3,null,null,'03002222222'),
      (4,'${bob}','alice@recipient.invalid','03001111111'),
      (5,null,'unconfirmed@recipient.invalid','03003333333');
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, phone text);
    INSERT INTO public.profiles VALUES ('${alice}','03002222222');
    CREATE TABLE public.audit_log(id integer);
    CREATE TABLE public.admin_roles(user_id uuid);
    CREATE TABLE public.reviews(id integer, user_id uuid, moderation_status text, verified_purchase boolean);
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
    ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.category_products ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.navigation_menus ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
    CREATE POLICY categories_admin_all ON public.categories FOR ALL USING(true) WITH CHECK(true);
    CREATE POLICY category_products_admin_all ON public.category_products FOR ALL USING(true) WITH CHECK(true);
    CREATE POLICY navigation_admin_all ON public.navigation_menus FOR ALL USING(true) WITH CHECK(true);
    CREATE POLICY store_settings_admin_all ON public.store_settings FOR ALL USING(true) WITH CHECK(true);
  `);
  for (const name of analytics) {
    const args = ['attention','notifications'].includes(name) ? '' : name === 'products'
      ? 'p_from timestamptz,p_to timestamptz,p_sort text,p_limit integer' : 'p_from timestamptz,p_to timestamptz';
    await db.exec(`CREATE FUNCTION public.analytics_${name}(${args}) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{"ok":true}'::jsonb $$; GRANT EXECUTE ON FUNCTION public.analytics_${name}(${args.replace(/p_\w+ /g,'')}) TO anon, authenticated, service_role;`);
  }
  await db.exec(migration);
  return db;
}
async function as(db, role, user, query) {
  await db.exec(`SET ROLE ${role}; SELECT set_config('request.jwt.claim.sub','${user || ''}',false);`);
  try { return await db.query(query); } finally { await db.exec('RESET ROLE'); }
}

test('public/catalog reads hide disabled categories, products and navigation', async () => {
  const db = await fixture();
  try {
    for (const role of ['anon','authenticated']) {
      assert.deepEqual((await as(db,role,alice,'SELECT * FROM categories')).rows,[{id:1,is_visible:true}]);
      assert.deepEqual((await as(db,role,alice,'SELECT * FROM category_products')).rows,[{category_id:1,product_id:1}]);
      assert.deepEqual((await as(db,role,alice,'SELECT * FROM navigation_menus')).rows,[{id:1,is_enabled:true}]);
      await assert.rejects(as(db,role,alice,'SELECT * FROM store_settings'), /permission denied/);
    }
  } finally { await db.close(); }
});

test('anon and ordinary signed-in customers cannot mutate CMS, orders, audit, staff or reviews', async () => {
  const db = await fixture();
  try {
    const cases = [
      ['categories','INSERT INTO categories VALUES(3,true)','UPDATE categories SET is_visible=false','DELETE FROM categories'],
      ['category_products','INSERT INTO category_products VALUES(1,1)','UPDATE category_products SET product_id=2','DELETE FROM category_products'],
      ['navigation_menus','INSERT INTO navigation_menus VALUES(3,true)','UPDATE navigation_menus SET is_enabled=false','DELETE FROM navigation_menus'],
      ['store_settings',`INSERT INTO store_settings VALUES('unsafe','true')`,`UPDATE store_settings SET value='true'`,'DELETE FROM store_settings'],
      ['orders',`INSERT INTO orders VALUES(6,'${alice}',null,null)`,`UPDATE orders SET user_id='${alice}'`,'DELETE FROM orders'],
      ['audit_log','INSERT INTO audit_log VALUES(1)','UPDATE audit_log SET id=2','DELETE FROM audit_log'],
      ['admin_roles',`INSERT INTO admin_roles VALUES('${alice}')`,`UPDATE admin_roles SET user_id='${bob}'`,'DELETE FROM admin_roles'],
      ['reviews',`INSERT INTO reviews VALUES(1,'${bob}','approved',true)`,`UPDATE reviews SET verified_purchase=true`,'DELETE FROM reviews'],
    ];
    for (const role of ['anon','authenticated']) for (const [table,...queries] of cases) {
      for (const query of [...queries,`TRUNCATE ${table}`]) await assert.rejects(as(db,role,alice,query), /permission denied/);
    }
  } finally { await db.close(); }
});

test('authorized server retains CMS writes and all 17 analytics functions', async () => {
  const db = await fixture();
  try {
    await as(db,'service_role',null,'INSERT INTO categories VALUES(3,false)');
    await as(db,'service_role',null,'UPDATE categories SET is_visible=true WHERE id=3');
    await as(db,'service_role',null,'DELETE FROM categories WHERE id=3');
    for (const name of analytics) {
      const args = ['attention','notifications'].includes(name) ? '' : name === 'products'
        ? "'2099-01-01','2099-01-02','revenue',10" : "'2099-01-01','2099-01-02'";
      for (const role of ['anon','authenticated']) await assert.rejects(as(db,role,alice,`SELECT analytics_${name}(${args})`), /permission denied/);
      assert.equal((await as(db,'service_role',null,`SELECT analytics_${name}(${args}) AS value`)).rows[0].value.ok,true);
    }
  } finally { await db.close(); }
});

test('editing a profile phone cannot claim another recipient or no-email legacy orders', async () => {
  const db = await fixture();
  try {
    const result = await as(db,'authenticated',alice,'SELECT link_guest_orders() AS result');
    assert.equal(result.rows[0].result.linked,1);
    const rows = (await db.query('SELECT id,user_id FROM orders ORDER BY id')).rows;
    assert.equal(rows.find(x=>x.id===1).user_id,alice);
    assert.equal(rows.find(x=>x.id===2).user_id,null);
    assert.equal(rows.find(x=>x.id===3).user_id,null);
    assert.equal(rows.find(x=>x.id===4).user_id,bob);
  } finally { await db.close(); }
});

test('valid confirmed identity links once; replay and another account do not take ownership', async () => {
  const db = await fixture();
  try {
    assert.equal((await as(db,'authenticated',alice,'SELECT link_guest_orders() AS result')).rows[0].result.linked,1);
    assert.equal((await as(db,'authenticated',alice,'SELECT link_guest_orders() AS result')).rows[0].result.linked,0);
    assert.equal((await as(db,'authenticated',bob,'SELECT link_guest_orders() AS result')).rows[0].result.linked,1);
    assert.equal((await db.query('SELECT user_id FROM orders WHERE id=1')).rows[0].user_id,alice);
  } finally { await db.close(); }
});

test('anonymous, missing user, and unconfirmed email claims are denied', async () => {
  const db = await fixture();
  try {
    await assert.rejects(as(db,'anon',null,'SELECT link_guest_orders()'), /permission denied/);
    await assert.rejects(as(db,'authenticated',null,'SELECT link_guest_orders()'), /Authentication required/);
    await assert.rejects(as(db,'authenticated',unconfirmed,'SELECT link_guest_orders()'), /Confirm your account email/);
  } finally { await db.close(); }
});

test('the migration can safely be applied twice', async () => {
  const db = await fixture();
  try { await db.exec(migration); } finally { await db.close(); }
});
