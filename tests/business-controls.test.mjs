import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {readFile} from 'node:fs/promises';
import {replayPlan} from '../tools/schema-replay.mjs';
import {businessInput} from '../functions/api/admin/_lib/business-input.js';
import {parseRange} from '../functions/api/admin/analytics/_lib/helpers.js';
import {validateTheme} from '../theme-contract.js';
import {analyticsEvent} from '../functions/api/_lib/analytics-ingest.js';
import vm from 'node:vm';
const actor='00000000-0000-4000-8000-000000000001';
async function fixture(){
 const db=new PGlite({extensions:{vector,pgcrypto}});
 try{
  await db.exec(await readFile(new URL('fixtures/platform-schema.sql',import.meta.url),'utf8'));
  for(const f of (await replayPlan()).files)await db.exec(await readFile(f,'utf8'));
  await db.query("INSERT INTO auth.users(id,email) VALUES($1,'synthetic@example.invalid');",[actor]);
  await db.query("INSERT INTO admin_roles(user_id,role) VALUES($1,'owner')",[actor]);
  await db.exec("INSERT INTO products(id,name,slug,price,category,pack,visibility) VALUES(1,'Synthetic A','synthetic-a',1000,'Test','One','visible'),(2,'Synthetic B','synthetic-b',500,'Test','One','visible'); SELECT setval('products_id_seq',100); SET ROLE service_role; SELECT set_config('request.jwt.claim.role','service_role',false);");
  return db;
 }catch(e){await db.close();throw e;}
}
const input={title:'Synthetic box',selling_price:1200,items:[{product_id:1,quantity:1},{product_id:2,quantity:1}]};
test('box replacement and audit failures rollback all component and product changes',async()=>{
 const db=await fixture();try{
  const save=async(id,i)=>(await db.query('SELECT admin_box_save($1,$2,$3) box',[actor,id,i])).rows[0].box;
  const box=await save(null,input);assert.equal(box.old_price,1500);assert.equal(box.bundle_kind,'curated');
  await db.exec("RESET ROLE; CREATE FUNCTION synthetic_component_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.component_product_id=2 THEN RAISE EXCEPTION 'synthetic component failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER synthetic_failure BEFORE INSERT ON bundle_items FOR EACH ROW EXECUTE FUNCTION synthetic_component_failure(); SET ROLE service_role;");
  await assert.rejects(save(box.id,{...input,title:'Changed',expected_updated_at:box.updated_at}),/synthetic component failure/);
  assert.equal((await db.query('SELECT name FROM products WHERE id=$1',[box.id])).rows[0].name,'Synthetic box');
  assert.equal((await db.query('SELECT count(*) n FROM bundle_items WHERE bundle_product_id=$1',[box.id])).rows[0].n,2);
  await db.exec("RESET ROLE; DROP TRIGGER synthetic_failure ON bundle_items; CREATE FUNCTION synthetic_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$; CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION synthetic_audit_failure(); SET ROLE service_role;");
  await assert.rejects(save(box.id,{title:'Changed',expected_updated_at:box.updated_at}),/synthetic audit failure/);
  assert.equal((await db.query('SELECT name FROM products WHERE id=$1',[box.id])).rows[0].name,'Synthetic box');
 }finally{await db.close();}
});
test('quote and order share exact coupon/zone pricing, atomic usage and stable customer IDs',async()=>{
 const db=await fixture();try{
  await db.exec("INSERT INTO coupons(code,discount_type,discount_value,max_uses) VALUES('LAST','percent',10,1); INSERT INTO shipping_zones(name,cities,fee,free_above) VALUES('Synthetic city',ARRAY['karachi'],200,2000);");
  const order={order_number:'CB-SYNTHETIC-1',idempotency_key:'00000000-0000-4000-8000-000000000011',items:[{product_id:1,qty:2}],payment_method:'cod',coupon_code:'LAST',customer:{name:'Synthetic',phone:'03000000000',email:'buyer@example.invalid',city:'Karachi',country:'Pakistan',address:'Synthetic address'}};
  const q=(await db.query('SELECT checkout_quote($1) q',[order])).rows[0].q;
  assert.equal(q.total,2000);assert.equal(q.discount,200);assert.equal(q.delivery_fee,200);
  const o=(await db.query('SELECT create_order_atomic($1) o',[order])).rows[0].o;
  assert.equal(o.order.total,q.total);assert.equal(o.order.discount,200);assert.ok(o.order.customer_id);
  const replay=(await db.query('SELECT create_order_atomic($1) o',[order])).rows[0].o;assert.equal(replay.replay,true);
  assert.equal((await db.query("SELECT used_count FROM coupons WHERE code='LAST'")).rows[0].used_count,1);
  await assert.rejects(db.query('SELECT create_order_atomic($1)',[{...order,idempotency_key:'00000000-0000-4000-8000-000000000012',order_number:'CB-SYNTHETIC-2'}]),/COUPON_UNAVAILABLE/);
  assert.equal((await db.query('SELECT count(*) n FROM orders')).rows[0].n,1);
  const dir=(await db.query('SELECT customer_directory() d')).rows[0].d;assert.equal(dir.total,1);assert.equal(dir.customers[0].order_count,1);
  await assert.rejects(db.query('SELECT checkout_quote($1)',[{...order,coupon_code:null,customer:{...order.customer,country:'USA'}}]),/UNSUPPORTED_COUNTRY/);
 }finally{await db.close();}
});
test('review summaries count all approved rows and only delivered nonrefunded purchasers qualify',async()=>{
 const db=await fixture();try{
  await db.exec("INSERT INTO reviews(product_id,rating,review_text,moderation_status) SELECT 1,5,'Synthetic review','approved' FROM generate_series(1,125); INSERT INTO reviews(product_id,rating,review_text,moderation_status) VALUES(1,1,'Hidden synthetic','pending');");
  assert.deepEqual((await db.query('SELECT review_summary(1) s')).rows[0].s,{count:125,avg_rating:5});
  assert.equal((await db.query('SELECT review_purchase($1,1) id',[actor])).rows[0].id,null);
 }finally{await db.close();}
});
test('commercial controls reject coercive booleans, prices and unsupported fields',()=>{
 for(const b of [{is_active:'false'},{discount_value:'10'},{max_uses:-1},{used_count:0}])assert.throws(()=>businessInput(b,'coupon'),e=>e.status===400);
 assert.deepEqual(businessInput({cities:[' Karachi ','karachi'],fee:200},'zone'),{cities:['karachi'],fee:200});
});
test('all reporting RPCs execute against the full schema; refunds cannot count as delivered COD revenue',async()=>{
 const db=await fixture();try{
  const customer={name:'Synthetic',phone:'03000000000',email:'analytics@example.invalid',city:'Lahore',country:'Pakistan',address:'Synthetic address'};
  for(const [n,method] of [[1,'cod'],[2,'bank_transfer']]){
   await db.query('SELECT create_order_atomic($1)',[{customer,items:[{product_id:1,qty:1}],payment_method:method,transaction_reference:'SYNTHETIC',order_number:'CB-ANALYTICS-'+n,idempotency_key:'00000000-0000-4000-8000-00000000000'+n}]);
  }
  await db.exec("UPDATE orders SET fulfilment_status='delivered',payment_status='refunded' WHERE payment_method='cod'; UPDATE orders SET payment_status='payment_verified' WHERE payment_method='bank_transfer';");
  const from='2026-01-01T00:00:00Z',to='2030-01-01T00:00:00Z';
  const revenue=(await db.query('SELECT analytics_revenue($1,$2) r',[from,to])).rows[0].r;
  assert.equal(revenue.recognized_revenue,1300);assert.equal(revenue.delivered_cod,0);assert.equal(revenue.gross_order_value,2600);
  const functions=(await db.query("SELECT proname,pronargs FROM pg_proc JOIN pg_namespace n ON n.oid=pronamespace WHERE n.nspname='public' AND proname LIKE 'analytics_%'")).rows;
  assert.ok(functions.length>=20);
  for(const f of functions){
   const args=f.pronargs===0?[]:f.pronargs===4?[from,to,'revenue',25]:[from,to];
   try{await db.query('SELECT '+f.proname+'('+args.map((_,i)=>'$'+(i+1)).join(',')+')',args);}catch(e){assert.fail(f.proname+': '+e.message);}
  }
 }finally{await db.close();}
});
test('Pakistan reporting dates, accessible themes and bounded anonymous event contracts',()=>{
 const {from,to}=parseRange(new URL('https://fixture.invalid/?from=2026-10-11&to=2026-10-11'));
 assert.equal(from.toISOString(),'2026-10-10T19:00:00.000Z');assert.equal(to.toISOString(),'2026-10-11T19:00:00.000Z');
 assert.throws(()=>validateTheme({primary_color:'#ffffff'}),/contrast/);
 assert.throws(()=>validateTheme({font_family:'url(evil)'}),/font/);
 assert.throws(()=>analyticsEvent('funnel_events',{event:'order_created'}),e=>e.status===400);
 assert.throws(()=>analyticsEvent('filter_events',{filter_type:'category',filter_value:'a'.repeat(161)}),e=>e.status===400);
 assert.equal(analyticsEvent('search_logs',{query:'contact alice@example.invalid',clicked_product_id:1}).query,'contact [email]');
});
test('public manifest reflects an explicitly empty category, disabled menus and published configuration only',async()=>{
 const db=await fixture();try{
  await db.exec("INSERT INTO categories(name,slug,hide_if_empty,assignments_managed) VALUES('Test','test',false,true); INSERT INTO homepage_sections(section_key,enabled,config,draft_config) VALUES('hero',false,'{\"button_text\":\"Published\"}','{\"button_text\":\"Draft\"}'); UPDATE navigation_menus SET is_enabled=false;");
  const d=(await db.query('SELECT storefront_manifest() d')).rows[0].d;
  assert.equal(d.categories.length,1);assert.deepEqual(d.categories[0].product_ids,[]);
  assert.equal(d.sections[0].enabled,false);assert.equal(d.sections[0].config.button_text,'Published');assert.equal(d.sections[0].draft_config,undefined);
  assert.ok(d.navigation.length>0);assert.ok(d.navigation.every(n=>n.is_enabled===false));
 }finally{await db.close();}
});
test('admin analytics renders the actual array/object contracts without undefined money or dropoff helpers',async()=>{
 const source=await readFile(new URL('../admin-live.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('  function renderAnalyticsTable('),source.indexOf('  async function checkSeoHealth('));
 const ctx={esc:v=>String(v??''),money:v=>'Rs. '+Number(v||0)};vm.createContext(ctx);vm.runInContext(fn,ctx);
 const cases=[['products',{products:[{name:'Synthetic product',product_id:1,gross_value:100}]}],['categories',{categories:[{name:'Synthetic category',orders:1}]}],['geography',[{city:'Synthetic city',orders:1}]],['boxes',[{box_name:'Synthetic box',orders:1}]],['coupons',{coupons:[{code:'SYNTHETIC',uses:1}]}]];
 for(const [type,data] of cases)assert.match(ctx.renderAnalyticsTable(type,data),/Synthetic|SYNTHETIC/);
 assert.doesNotThrow(()=>ctx.renderAnalyticsTable('funnel',{steps:[{step:'product_view',label:'Views',count:2},{step:'order_created',label:'Orders',count:1}]}));
});

test('default owner shipping controls govern quote and prepaid free-delivery toggle',async()=>{
 const db=await fixture();try{
  const order=(method,qty,city='Lahore')=>({items:[{product_id:1,qty}],payment_method:method,customer:{name:'Buyer',phone:'03000000000',address:'Test street address',city,country:'Pakistan'}});
  const quote=async(method,qty,city)=> (await db.query('SELECT checkout_quote($1) q',[order(method,qty,city)])).rows[0].q;
  assert.equal((await quote('cod',5)).delivery_fee,300);
  assert.equal((await quote('jazzcash',4)).delivery_fee,300);
  assert.equal((await quote('jazzcash',5)).delivery_fee,0,'Exactly 5000 is free for prepaid');
  assert.equal((await quote('bank_transfer',6)).delivery_fee,0);
  await db.exec("UPDATE site_settings SET value='false'::jsonb WHERE key='prepaid_free_delivery_enabled'");
  assert.equal((await quote('jazzcash',5)).delivery_fee,300,'Owner can disable free delivery');
  await db.exec("INSERT INTO site_settings(key,value) VALUES ('prepaid_free_delivery_enabled','true'::jsonb),('prepaid_delivery_fee_pkr','450'::jsonb),('cod_delivery_fee_pkr','350'::jsonb),('prepaid_free_delivery_threshold_pkr','6000'::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  assert.equal((await quote('cod',6)).delivery_fee,350,'COD fee comes from owner settings');
  assert.equal((await quote('jazzcash',5)).delivery_fee,450,'Prepaid fee comes from owner settings');
  assert.equal((await quote('jazzcash',6)).delivery_fee,0,'Threshold updates are honored');
  await db.exec("INSERT INTO shipping_zones(name,cities,fee,free_above,position) VALUES('Multan special',ARRAY['Multan'],175,10000,0)");
  assert.equal((await quote('jazzcash',6,'Multan')).delivery_fee,175,'Specific-city overrides still work');
  assert.equal((await quote('jazzcash',6,'Lahore')).delivery_fee,0,'City override does not leak across cities');
  const rows=(await db.query("SELECT is_active FROM shipping_zones WHERE cardinality(cities)=0")).rows;
  assert.ok(rows.every(row=>row.is_active===false),'Legacy nationwide zone records are retired');
 }finally{await db.close();}
});

test('courier dispatch, expected COD settlement and partial receipts are atomic and auditable',async()=>{
 const db=await fixture();try{
  const save=async(id,name,days,deduction,active=true)=>(await db.query(
   'SELECT public.admin_courier_company_save($1,$2,$3,$4,$5,$6) result',
   [actor,id,name,days,deduction,active])).rows[0].result;
  const company=await save(null,'Synthetic Courier',5,75);
  assert.equal(company.courier.settlement_days,5);
  assert.equal(company.courier.deduction_per_order_pkr,75);
  assert.equal((await save(company.courier.id,'Synthetic Courier',7,75)).courier.settlement_days,7);
  const payload={idempotency_key:'00000000-0000-4000-8000-000000009211',
   order_number:'CB-COURIER-FIXTURE',payment_method:'cod',items:[{product_id:1,qty:1}],
   customer:{name:'Buyer',phone:'03000000000',address:'Fixture Street 124',city:'Lahore',country:'Pakistan'}};
  const created=(await db.query('SELECT create_order_atomic($1) result',[payload])).rows[0].result.order;
  const orderId=created.id;
  const dispatch=async(courier=company.courier.id,expected=null)=> (await db.query(
   'SELECT admin_courier_dispatch($1,$2,$3,$4,$5) result',
   [actor,orderId,courier,'COURIER-123',expected])).rows[0].result;
  assert.equal((await dispatch()).status,409,'Cannot assign courier before packing');
  assert.equal((await db.query('SELECT count(*)::int n FROM courier_order_shipments')).rows[0].n,0);
  for(const state of ['sourcing','packed'])await db.query(
    "SELECT admin_order_mutate($1,$2,'status',$3,'',NULL)",[actor,orderId,state]);
  assert.equal((await dispatch(999999)).status,400,'Unknown courier must not dispatch');
  assert.equal((await dispatch()).order.fulfilment_status,'dispatched');
  const assigned=(await db.query('SELECT * FROM courier_order_shipments WHERE order_id=$1',[orderId])).rows[0];
  assert.equal(assigned.settlement_days_snapshot,7,'Rule at dispatch gets snapshotted');
  assert.equal(assigned.deduction_snapshot_pkr,75);
  assert.equal((await save(company.courier.id,'Synthetic Courier',15,25)).courier.settlement_days,15);
  assert.equal((await db.query('SELECT settlement_days_snapshot FROM courier_order_shipments WHERE order_id=$1',[orderId])).rows[0].settlement_days_snapshot,7,'Later setting change does not rewrite existing shipment');
  const receipt=async(amount,ref)=>(await db.query('SELECT admin_courier_record_receipt($1,$2,$3,CURRENT_DATE,$4) result',[actor,orderId,amount,ref])).rows[0].result;
  assert.equal((await receipt(100,'BANK-A')).status,409,'Only delivered COD can receive remittance');
  await db.query("SELECT admin_order_mutate($1,$2,'status','delivered','',NULL)",[actor,orderId]);
  const ledger=(await db.query('SELECT * FROM courier_cod_ledger WHERE order_id=$1',[orderId])).rows[0];
  assert.equal(ledger.estimated_remittance_pkr,1225);
  assert.equal(ledger.outstanding_pkr,1225);
  assert.ok(ledger.expected_settlement_on,'Delivery creates due date automatically');
  assert.equal((await receipt(500,'BANK-A')).outstanding_pkr,725);
  assert.equal((await receipt(500,'BANK-A')).status,409,'Duplicate reference blocked');
  assert.equal((await receipt(800,'BANK-B')).status,409,'Over-receipt blocked');
  assert.equal((await receipt(725,'BANK-B')).outstanding_pkr,0,'Partial remittances reconcile exactly');
  assert.equal((await db.query('SELECT outstanding_pkr FROM courier_cod_ledger WHERE order_id=$1',[orderId])).rows[0].outstanding_pkr,0);
  assert.equal((await db.query("SELECT count(*)::int n FROM audit_log WHERE entity_id=$1 AND action='courier.cod_received'",[orderId])).rows[0].n,2);
  assert.equal((await db.query('SELECT count(*)::int n FROM courier_cod_receipts')).rows[0].n,2);
 }finally{await db.close();}
});

test('courier panel and dispatch form retain courier attribution and do not auto-confirm cash',async()=>{
 const admin=await readFile(new URL('../admin-live.js',import.meta.url),'utf8');
 const html=await readFile(new URL('../admin.html',import.meta.url),'utf8');
 const endpoint=await readFile(new URL('../functions/api/admin/orders/[id]/status.js',import.meta.url),'utf8');
 assert.match(html,/data-view="couriers"/);
 assert.match(html,/id="view-couriers"/);
 assert.match(admin,/chooseCourierForDispatch/);
 assert.match(admin,/courier_id=assignment\.courier_id/);
 assert.match(admin,/function loadCouriers\(/);
 assert.match(admin,/function recordCourierReceipt\(/);
 assert.match(endpoint,/admin_courier_dispatch/);
 assert.match(admin,/actual.*receipt|Receipt.*only|Recorded as actually received/i);
});


test('online JazzCash/bank reconciliation requires verified payment and reconciles actual payouts and fees',async()=>{
 const db=await fixture();
 try{
  const account=async(method,label,days,user=actor)=>(await db.query('SELECT admin_online_payment_account_save($1,$2,$3,$4) r',[user,method,label,days])).rows[0].r;
  assert.equal((await account('jazzcash','Business wallet',3)).account.settlement_days,3);
  assert.equal((await account('card','Fake Gateway',2)).status,400,'No card gateway can be enabled from ledger settings');
  const customer={name:'Synthetic',phone:'03000000000',address:'Synthetic address 100',city:'Multan',country:'Pakistan'};
  const make=async(method,n)=> (await db.query('SELECT create_order_atomic($1) r',[{
    customer,items:[{product_id:1,qty:1}],payment_method:method,transaction_reference:'REF-'+n,
    order_number:'CB-ONLINE-TEST-'+n,idempotency_key:'00000000-0000-4000-8000-00000000014'+n
  }])).rows[0].r.order;
  const jazz=await make('jazzcash',1),bank=await make('bank_transfer',2);
  const receipt=async(orderId,amount,fee,ref)=>(await db.query(
   'SELECT admin_online_payment_record_receipt($1,$2,$3,$4,CURRENT_DATE,$5) r',
   [actor,orderId,amount,fee,ref])).rows[0].r;
  assert.equal((await receipt(jazz.id,200,0,'WALLET-A')).status,409,'Unverified payment must never count as received');
  await db.query("UPDATE orders SET payment_status='payment_verified' WHERE id=$1",[jazz.id]);
  const before=(await db.query('SELECT * FROM online_payment_ledger WHERE order_id=$1',[jazz.id])).rows[0];
  assert.equal(before.verified_gross_pkr,1300);
  assert.equal(before.received_pkr,0);
  assert.equal(before.unreconciled_pkr,1300);
  assert.ok(before.expected_settlement_on,'Expected date follows actual verified event and owner setting');
  assert.equal((await receipt(jazz.id,500,25,'WALLET-A')).unreconciled_pkr,775);
  assert.equal((await receipt(jazz.id,10,0,'wallet-a')).status,409,'References must be case-insensitively unique');
  assert.equal((await receipt(jazz.id,800,0,'WALLET-B')).status,409,'Payout plus fees cannot exceed verified amount');
  assert.equal((await receipt(jazz.id,775,0,'WALLET-B')).unreconciled_pkr,0);
  const after=(await db.query('SELECT * FROM online_payment_ledger WHERE order_id=$1',[jazz.id])).rows[0];
  assert.equal(after.received_pkr,1275);
  assert.equal(after.processing_fees_pkr,25);
  assert.equal(after.unreconciled_pkr,0);
  const untouched=(await db.query('SELECT * FROM online_payment_ledger WHERE order_id=$1',[bank.id])).rows[0];
  assert.equal(untouched.verified_gross_pkr,0);
  assert.equal(untouched.received_pkr,0);
  assert.equal(untouched.expected_settlement_on,null,'Bank transfer delay is unknown until owner configures it');
  assert.equal((await db.query('SELECT count(*)::int n FROM online_payment_receipts')).rows[0].n,2);
  assert.equal((await db.query("SELECT count(*)::int n FROM audit_log WHERE entity_id=$1 AND action='payment.online_payout_received'",[jazz.id])).rows[0].n,2);
  assert.equal((await db.query("SELECT count(*)::int n FROM orders WHERE payment_method='card'")).rows[0].n,0);
 }finally{await db.close();}
});
test('COD and online panel shows separate verified, recorded and unreconciled figures; card not connected',async()=>{
 const html=await readFile(new URL('../admin.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../admin-live.js',import.meta.url),'utf8');
 const receipts=await readFile(new URL('../functions/api/admin/online-payments/receipts.js',import.meta.url),'utf8');
 assert.match(html,/Payments &amp; COD Ledger/);
 assert.match(html,/id="onlinePaymentSummary"/);
 assert.match(js,/function loadOnlinePayments\(/);
 assert.match(js,/function recordOnlineReceipt\(/);
 assert.match(js,/Card payments/);
 assert.match(js,/Not connected/);
 assert.match(js,/api\/admin\/online-payments\/receipts/);
 assert.match(receipts,/\['owner','manager'\]/);
 assert.doesNotMatch(js,/payment_method.*card.*create_order|saveCardNumber/);
});
