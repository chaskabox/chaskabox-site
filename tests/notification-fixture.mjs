import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
export const actor = '00000000-0000-4000-8000-000000000001';
export const oldOrder = '00000000-0000-4000-8000-000000000010';
export const migrationFiles = ['012_order_status_events.sql','013_notification_outbox.sql','017_customer_notification_outbox.sql','024_notification_templates.sql','20261011142641_notification_delivery_pipeline.sql'];
export async function notificationSQL() {
  return await readFile(new URL('./fixtures/notification-schema.sql', import.meta.url),'utf8') + '\n' +
    (await Promise.all(migrationFiles.map(f=>readFile(new URL('../database/migrations/'+f,import.meta.url),'utf8')))).join('\n');
}
export async function fixture() {
  const db=new PGlite();
  await db.exec(await readFile(new URL('./fixtures/notification-schema.sql',import.meta.url),'utf8'));
  for(const file of migrationFiles.slice(0,-1))await db.exec(await readFile(new URL('../database/migrations/'+file,import.meta.url),'utf8'));
  await db.exec(`INSERT INTO orders(id,order_number,created_at) VALUES('${oldOrder}','LEGACY-FIXTURE',now()-interval '2 days');
    INSERT INTO notification_outbox(order_id,status) SELECT 'legacy-'||n,case when n<3 then 'retry' else 'pending' end FROM generate_series(1,3)n;
    INSERT INTO customer_notification_outbox(order_id,event_type,event_key,message) SELECT '${oldOrder}','order_status','legacy-customer-'||n,'Synthetic old message' FROM generate_series(1,16)n;`);
  await db.exec(await readFile(new URL('../database/migrations/'+migrationFiles.at(-1),import.meta.url),'utf8'));
  return db;
}
export async function activate(db) {
  await db.exec("UPDATE notification_dispatch_state SET enabled=true,activated_after=now()-interval '1 hour',configured_targets=ARRAY['owner_email','owner_whatsapp','customer_whatsapp'];");
  return (await db.query('select activated_after from notification_dispatch_state')).rows[0].activated_after.toISOString();
}
export async function order(db, number='NEW-FIXTURE') {
  return (await db.query('insert into orders(order_number) values($1) returning *',[number])).rows[0];
}
export async function rpc(db,name,params={}) {
  const keys=Object.keys(params), placeholders=keys.map((k,i)=>k+'=>$'+(i+1)).join(',');
  if(['notification_claim','notification_begin'].includes(name)) return (await db.query('select * from public.'+name+'('+placeholders+')',Object.values(params))).rows;
  return (await db.query('select public.'+name+'('+placeholders+') as value',Object.values(params))).rows[0].value;
}
export function env(after) {return {SUPABASE_URL:'https://db.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-key',NOTIFICATION_DISPATCH_ENABLED:'true',NOTIFICATION_DISPATCH_AFTER:after,NOTIFICATION_CHANNELS:'owner_email,owner_whatsapp,customer_whatsapp',RESEND_API_KEY:'synthetic-resend-key',RESEND_FROM_EMAIL:'Fixture <from@example.invalid>',OWNER_ORDER_EMAIL:'owner@example.invalid',WAHA_API_URL:'https://waha.example.invalid',WAHA_API_KEY:'synthetic-waha-key',WAHA_SESSION:'fixture',OWNER_WHATSAPP:'+923111111111'};}
export function router(db,provider=()=>new Response(JSON.stringify({id:'synthetic-provider-'+crypto.randomUUID()}))) {
  const calls=[];
  const fetcher=async(url,init={})=>{
    calls.push({url:String(url),...init});const u=new URL(url);
    if(u.host!=='db.example.invalid') return provider(u,init);
    let data;
    if(u.pathname.startsWith('/rest/v1/rpc/'))data=await rpc(db,u.pathname.split('/').at(-1),JSON.parse(init.body||'{}'));
    else if(u.pathname==='/rest/v1/orders')data=(await db.query('select * from orders where id=$1',[u.searchParams.get('id').slice(3)])).rows;
    else if(u.pathname==='/rest/v1/order_items')data=(await db.query('select product_name,pack,quantity,unit_price from order_items where order_id=$1',[u.searchParams.get('order_id').slice(3)])).rows;
    else if(u.pathname==='/rest/v1/notification_templates')data=(await db.query('select name,channel,subject,body,is_active from notification_templates')).rows;
    else throw new Error('Unexpected synthetic route');
    return new Response(data===null?null:JSON.stringify(data));
  };
  return {fetcher,calls};
}
