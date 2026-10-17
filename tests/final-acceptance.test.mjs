import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {replayPlan} from '../tools/schema-replay.mjs';
import {readableTheme,validateTheme} from '../theme-contract.js';
import {onRequestGet as storefront} from '../functions/api/storefront-config.js';
import {onRequestGet as adminMe} from '../functions/api/admin/me/index.js';
const actor='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
async function fixture(){
 const db=new PGlite({extensions:{vector,pgcrypto}});
 try{
  await db.exec(await readFile(new URL('fixtures/platform-schema.sql',import.meta.url),'utf8'));
  for(const f of (await replayPlan()).files)await db.exec(await readFile(f,'utf8'));
  await db.query("INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,'synthetic@example.invalid',now()),($2,'other@example.invalid',now())",[actor,other]);
  return db;
 }catch(e){await db.close();throw e;}
}
test('legacy theme recovery preserves commerce while strict new writes reject invalid and prototype tokens',async(t)=>{
 const invalid={font_family:'Uninstalled legacy font',primary_color:'#ffff00',logo_url:'javascript:alert(1)',border_radius:'10'};
 assert.deepEqual(readableTheme(invalid),{border_radius:'10'});assert.throws(()=>validateTheme(invalid));assert.throws(()=>validateTheme({constructor:'unsafe'}),/Unsupported/);
 const old=globalThis.fetch;globalThis.fetch=async()=>Response.json({settings:{cod_enabled:true},theme:invalid,navigation:[{label:'Shop',url:'/shop/'}]});t.after(()=>{globalThis.fetch=old;});
 const response=await storefront({env:{SUPABASE_URL:'https://fixture.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'}});
 assert.equal(response.status,200);const data=await response.json();assert.equal(data.settings.cod_enabled,true);assert.equal(data.navigation.length,1);assert.deepEqual(data.theme,{border_radius:'10'});
});
test('temporary Auth outages return 503 while invalid credentials remain 401',async(t)=>{
 const old=globalThis.fetch;let status=503,roleReads=0;
 globalThis.fetch=async url=>{if(!new URL(url).pathname.startsWith('/auth/'))roleReads++;return Response.json({error:'synthetic unavailable'},{status});};t.after(()=>{globalThis.fetch=old;});
 const context={env:{SUPABASE_URL:'https://fixture.example.invalid',SUPABASE_ANON_KEY:'fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture'},request:new Request('https://site.example.invalid/api/admin/me',{headers:{Authorization:'Bearer synthetic-token'}})};
 assert.equal((await adminMe(context)).status,503);assert.equal(roleReads,0);status=401;assert.equal((await adminMe(context)).status,401);
});
test('default-address ownership is checked before clearing defaults and later failures roll back the switch',async()=>{
 const db=await fixture();try{
  const first=crypto.randomUUID(),second=crypto.randomUUID(),foreign=crypto.randomUUID();
  await db.query("INSERT INTO addresses(id,user_id,label,address,city,is_default) VALUES($1,$4,'Synthetic A','Synthetic address','Karachi',true),($2,$4,'Synthetic B','Synthetic address','Karachi',false),($3,$5,'Other','Synthetic address','Lahore',true)",[first,second,foreign,actor,other]);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[actor]);await db.exec('SET ROLE authenticated;');
  assert.equal((await db.query('SELECT customer_address_default($1) r',[second])).rows[0].r.id,second);
  await assert.rejects(db.query('SELECT customer_address_default($1)',[foreign]),/Address unavailable/);
  assert.equal((await db.query('SELECT id FROM addresses WHERE is_default')).rows[0].id,second);
  await assert.rejects(db.query("INSERT INTO addresses(user_id,address,city,is_default) VALUES($1,'Synthetic duplicate','Karachi',true)",[actor]),/unique/);
  await db.exec("RESET ROLE;CREATE FUNCTION fail_address_default() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.label='Synthetic A' AND NEW.is_default THEN RAISE EXCEPTION 'synthetic default failure';END IF;RETURN NEW;END $$;CREATE TRIGGER fail_address_default BEFORE UPDATE ON addresses FOR EACH ROW EXECUTE FUNCTION fail_address_default();SET ROLE authenticated;");
  await assert.rejects(db.query('SELECT customer_address_default($1)',[first]),/synthetic default failure/);
  assert.equal((await db.query('SELECT id FROM addresses WHERE is_default')).rows[0].id,second);
  await db.exec('RESET ROLE;SET ROLE anon;');await assert.rejects(db.query('SELECT customer_address_default($1)',[first]),/permission denied/);
 }finally{await db.close();}
});
test('full attention counts exceed samples and recognized sales exclude refunds and unpaid orders',async()=>{
 const db=await fixture();try{
  await db.exec("INSERT INTO products(id,name,slug,category,pack,price,visibility) SELECT n,'Synthetic '||n,'synthetic-'||n,'Test','One',100,'visible' FROM generate_series(1,9)n;");
  await db.exec("INSERT INTO products(id,name,slug,category,pack,price,visibility,bundle_kind) SELECT n,'Synthetic box '||n,'synthetic-box-'||n,'Bundles','One',100,'visible','curated' FROM generate_series(10,16)n;");
  await db.exec("UPDATE site_settings SET value='false'::jsonb WHERE key='cod_advance_enabled'");
  await db.exec("INSERT INTO orders(order_number,idempotency_key,customer_name,customer_phone,customer_address,customer_city,payment_method,payment_status,subtotal,delivery_fee,total,created_at) SELECT 'CB-SYNTHETIC-'||n,gen_random_uuid(),'Synthetic','03000000000','Synthetic address','Karachi','cod','cod_due',100,0,100,now()-interval '6 days' FROM generate_series(1,171)n;");
  await db.exec("UPDATE orders SET fulfilment_status='delivered' WHERE order_number='CB-SYNTHETIC-1';UPDATE orders SET payment_method='bank_transfer',payment_status='payment_verified',transaction_reference='SYNTHETIC-REFERENCE' WHERE order_number='CB-SYNTHETIC-2';UPDATE orders SET fulfilment_status='delivered',payment_status='refunded' WHERE order_number='CB-SYNTHETIC-3';SET ROLE service_role;");
  const attention=(await db.query('SELECT analytics_attention() r')).rows[0].r;
  assert.equal(attention.items.find(i=>i.type==='missing_images').count,16);assert.equal(attention.items.find(i=>i.type==='broken_boxes').count,7);assert.equal(attention.items.find(i=>i.type==='stuck_orders').count,169);
  const dashboard=(await db.query('SELECT admin_attention_summary() r')).rows[0].r;
  assert.equal(dashboard.counts.new_orders,169);assert.equal(dashboard.needs_attention.length,60);assert.ok(dashboard.needs_attention_total>=169);
  const metrics=(await db.query('SELECT admin_dashboard_metrics(30) r')).rows[0].r;
  assert.equal(metrics.orders,171);assert.equal(metrics.recognized_sales_pkr,200);assert.equal(metrics.verified_prepaid_sales_pkr,100);
  await db.exec('RESET ROLE;SET ROLE authenticated;');await assert.rejects(db.query('SELECT admin_dashboard_metrics(30)'),/permission denied/);
 }finally{await db.close();}
});
test('QR registration rechecks the current owner and preserves PNG metadata',async()=>{
 const db=await fixture();try{
  await db.query("INSERT INTO admin_roles(user_id,role) VALUES($1,'owner'),($2,'manager')",[actor,other]);
  await db.exec("SET ROLE service_role;UPDATE site_settings SET value='true' WHERE key='media_upload_enabled';");
  await assert.rejects(db.query("SELECT media_upload_reserve($1,$2,'product-media','qr')",[other,crypto.randomUUID()]),/Invalid media reservation/);
  const id=crypto.randomUUID(),op=(await db.query("SELECT media_upload_reserve($1,$2,'product-media','qr') r",[actor,id])).rows[0].r;
  assert.match(op.object_path,/^qr\/\d{4}\/\d{2}\/[a-f0-9-]{36}\.png$/);
  await db.query("UPDATE admin_roles SET role='owner' WHERE user_id=$1",[other]);await db.query("UPDATE admin_roles SET role='manager' WHERE user_id=$1",[actor]);
  await assert.rejects(db.query('SELECT media_upload_register($1,$2,120,500,500)',[actor,id]),/Active authorized media staff required/);
  assert.equal((await db.query('SELECT count(*)::int n FROM media')).rows[0].n,0);
  await db.query("UPDATE admin_roles SET role='owner' WHERE user_id=$1",[actor]);
  const media=(await db.query('SELECT media_upload_register($1,$2,120,500,500) r',[actor,id])).rows[0].r;
  assert.equal(media.mime_type,'image/png');assert.equal(media.object_path,op.object_path);
  assert.equal((await db.query('SELECT media_delete_reserve($1,$2) r',[actor,id])).rows[0].r.object_path,op.object_path);
 }finally{await db.close();}
});
