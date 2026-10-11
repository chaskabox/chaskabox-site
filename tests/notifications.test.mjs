import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fixture, activate, order, rpc, env, router, actor } from './notification-fixture.mjs';
import worker,{runNotifications} from '../workers/notification-outbox.js';
import { buildNotificationPayload,sendNotification,notificationConfig,notificationHealth,limitedText } from '../functions/api/_lib/notification-delivery.js';
import { handleNotificationReceipt,verifyResend,verifyWaha } from '../functions/api/_lib/notification-receipts.js';
import { onRequestGet as adminNotifications } from '../functions/api/admin/notifications/index.js';

async function claim(db,after,target='owner_email'){return (await rpc(db,'notification_claim',{p_after:after,p_targets:[target]}))[0];}
async function begin(db,job,after){await rpc(db,'notification_prepare',{p_id:job.id,p_token:job.lease_token,p_payload:{endpoint:'https://api.resend.com/emails',body:{text:'Frozen fixture'}}});return (await rpc(db,'notification_begin',{p_id:job.id,p_token:job.lease_token,p_after:after}))[0];}
async function finish(db,job,status='accepted',id='synthetic-ack'){return rpc(db,'notification_finish',{p_id:job.id,p_token:job.lease_token,p_status:status,p_provider_id:status==='accepted'?id:null});}
async function row(db,id){return (await db.query('select * from notification_deliveries where id=$1',[id])).rows[0];}
async function hmac(hash,key,body,format){const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash},false,['sign']);const sig=new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(body)));return format==='hex'?Array.from(sig,x=>x.toString(16).padStart(2,'0')).join(''):btoa(String.fromCharCode(...sig));}
const resendSecret='whsec_'+btoa('synthetic-webhook-signing-secret');
async function signedEmail(data,now=Date.now(),id='synthetic-receipt'){
 const body=JSON.stringify(data),ts=String(Math.floor(now/1000));
 const signature=await hmac('SHA-256',new TextEncoder().encode('synthetic-webhook-signing-secret'),id+'.'+ts+'.'+body);
 return new Request('https://worker.example.invalid/webhooks/resend',{method:'POST',body,headers:{'svix-id':id,'svix-timestamp':ts,'svix-signature':'v1,'+signature}});
}
async function signedWaha(data){const body=JSON.stringify(data),signature=await hmac('SHA-512',new TextEncoder().encode('fixture-hmac'),body,'hex');return new Request('https://worker.example.invalid/webhooks/waha',{method:'POST',body,headers:{'x-webhook-hmac':signature,'x-webhook-hmac-algorithm':'sha512'}});}

test('migration retains 20 legacy jobs without replay; new order creates three unique channel jobs atomically',async()=>{
 const db=await fixture();try{
  const s=await rpc(db,'notification_summary');assert.deepEqual(s.legacy_owner,{pending:2,retry:2});assert.equal(s.legacy_customer.pending,16);assert.deepEqual(s.owner_outbox,{});
  const o=await order(db);assert.equal((await db.query('select count(*)::int n from notification_deliveries')).rows[0].n,3);
  await assert.rejects(db.query('insert into orders(id,order_number) values($1,$2)',[o.id,'duplicate']),/duplicate key/);
  assert.equal((await db.query('select count(*)::int n from notification_deliveries')).rows[0].n,3);
  await db.exec("CREATE FUNCTION fixture_queue_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic queue failure';END$$;CREATE TRIGGER fixture_queue_failure BEFORE INSERT ON notification_deliveries FOR EACH ROW EXECUTE FUNCTION fixture_queue_failure();");
  await assert.rejects(order(db,'ROLLBACK-FIXTURE'),/synthetic queue failure/);
  assert.equal((await db.query("select count(*)::int n from orders where order_number='ROLLBACK-FIXTURE'")).rows[0].n,0);
 }finally{await db.close();}
});
test('status events have unique occurrence keys; no-op updates enqueue nothing and queue failure rolls back status',async()=>{
 const db=await fixture();try{
  const o=await order(db);
  await db.query("update orders set fulfilment_status='sourcing' where id=$1",[o.id]);
  await db.query("update orders set fulfilment_status='packed' where id=$1",[o.id]);
  await db.query("update orders set fulfilment_status='sourcing' where id=$1",[o.id]);
  await db.query("update orders set fulfilment_status='sourcing' where id=$1",[o.id]);
  assert.equal((await db.query("select count(*)::int n from notification_deliveries where event_type='fulfilment_status'")).rows[0].n,3);
  await db.exec("CREATE FUNCTION fixture_queue_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic queue failure';END$$;CREATE TRIGGER fixture_queue_failure BEFORE INSERT ON notification_deliveries FOR EACH ROW EXECUTE FUNCTION fixture_queue_failure();");
  await assert.rejects(db.query("update orders set fulfilment_status='packed' where id=$1",[o.id]),/synthetic queue failure/);
  assert.equal((await db.query('select fulfilment_status from orders where id=$1',[o.id])).rows[0].fulfilment_status,'sourcing');
 }finally{await db.close();}
});
test('public roles cannot read private ledger or execute sending RPCs; service role can enqueue',async()=>{
 const db=await fixture();try{
  for(const role of ['anon','authenticated']){
   await db.exec('SET ROLE '+role);
   for(const sql of ['select * from notification_deliveries','select notification_summary()','select notification_claim(now(),ARRAY[\'owner_email\'])'])await assert.rejects(db.query(sql),/permission denied/);
   await db.exec('RESET ROLE');
  }
  await db.exec('SET ROLE service_role');await order(db,'SERVICE-FIXTURE');assert.equal((await rpc(db,'notification_summary')).owner_outbox.pending,2);await db.exec('RESET ROLE');
  const flags=(await db.query("select prosecdef from pg_proc where proname like 'notification_%'")).rows;assert.ok(flags.every(f=>!f.prosecdef));
 }finally{await db.close();}
});
test('dispatch requires matching database switch and cutoff; historical ledger rows are never claimed',async()=>{
 const db=await fixture();try{
  await order(db);const after=await activate(db);
  await db.exec('UPDATE notification_dispatch_state SET enabled=false');assert.equal(await claim(db,after),undefined);
  await db.exec('UPDATE notification_dispatch_state SET enabled=true');assert.equal(await claim(db,new Date().toISOString()),undefined);
  await db.query('UPDATE notification_dispatch_state SET activated_after=$1',[new Date(Date.now()+60000).toISOString()]);
  const future=(await db.query('select activated_after from notification_dispatch_state')).rows[0].activated_after.toISOString();
  assert.equal(await claim(db,future),undefined);assert.equal((await rpc(db,'notification_summary')).excluded_before_cutoff,3);
 }finally{await db.close();}
});
test('claim tokens protect finish and freeze payload; one accepted channel cannot erase another success flag',async()=>{
 const db=await fixture();try{
  const o=await order(db),after=await activate(db),job=await claim(db,after);
  assert.equal(await claim(db,after),undefined);
  const first=await rpc(db,'notification_prepare',{p_id:job.id,p_token:job.lease_token,p_payload:{text:'immutable'}});
  assert.deepEqual(await rpc(db,'notification_prepare',{p_id:job.id,p_token:job.lease_token,p_payload:{text:'changed'}}),first);
  const begun=(await rpc(db,'notification_begin',{p_id:job.id,p_token:job.lease_token,p_after:after}))[0];assert.equal(begun.attempts,1);
  assert.deepEqual(await rpc(db,'notification_begin',{p_id:job.id,p_token:job.lease_token,p_after:after}),[]);
  assert.equal(await finish(db,{...job,lease_token:crypto.randomUUID()}),false);
  await db.query('update orders set whatsapp_sent=true where id=$1',[o.id]);assert.equal(await finish(db,job),true);assert.equal(await finish(db,job),false);
  const flags=(await db.query('select email_sent,whatsapp_sent from orders where id=$1',[o.id])).rows[0];assert.deepEqual(flags,{email_sent:true,whatsapp_sent:true});
  assert.equal((await row(db,job.id)).delivery_status,'unknown');
 }finally{await db.close();}
});
test('customer updates cannot overtake an earlier processing, retrying or uncertain event for the same order',async()=>{
 const db=await fixture();try{
  const o=await order(db),after=await activate(db);
  await db.query("update orders set fulfilment_status='packed' where id=$1",[o.id]);
  await db.query("update orders set fulfilment_status='dispatched' where id=$1",[o.id]);
  const first=await claim(db,after,'customer_whatsapp');assert.equal(first.event_type,'order_created');
  assert.equal(await claim(db,after,'customer_whatsapp'),undefined);
  await begin(db,first,after);await finish(db,first,'retry');assert.equal(await claim(db,after,'customer_whatsapp'),undefined);
  await db.query("update notification_deliveries set status='uncertain' where id=$1",[first.id]);assert.equal(await claim(db,after,'customer_whatsapp'),undefined);
  await db.query("update notification_deliveries set status='accepted' where id=$1",[first.id]);const next=await claim(db,after,'customer_whatsapp');assert.equal(next.event_data.new_status,'packed');
 }finally{await db.close();}
});
test('stale pre-send lease can recover; post-send WhatsApp lease is uncertain and expired email key is parked',async()=>{
 const db=await fixture();try{
  await order(db);const after=await activate(db),first=await claim(db,after);
  await db.query("update notification_deliveries set lease_expires_at=now()-interval '1 minute' where id=$1",[first.id]);
  const retry=await claim(db,after);assert.equal(retry.id,first.id);assert.notEqual(retry.lease_token,first.lease_token);assert.equal(await finish(db,first),false);
  await begin(db,retry,after);await db.query("update notification_deliveries set lease_expires_at=now()-interval '1 minute',first_attempt_at=now()-interval '24 hours' where id=$1",[retry.id]);
  const wa=await claim(db,after,'owner_whatsapp');assert.equal((await row(db,retry.id)).status,'uncertain');await begin(db,wa,after);
  await db.query("update notification_deliveries set lease_expires_at=now()-interval '1 minute' where id=$1",[wa.id]);
  assert.equal(await claim(db,after,'owner_whatsapp'),undefined);assert.equal((await row(db,wa.id)).status,'uncertain');
 }finally{await db.close();}
});
test('six-attempt ceiling and 24h event expiry stop infinite retry; inactive channels are visible',async()=>{
 const db=await fixture();try{
  await order(db);const after=await activate(db),job=await claim(db,after);await begin(db,job,after);
  await db.query('update notification_deliveries set attempts=6 where id=$1',[job.id]);await finish(db,job,'retry');assert.equal((await row(db,job.id)).status,'uncertain');
  await db.exec("update notification_dispatch_state set activated_after=now()-interval '3 days',configured_targets=ARRAY['owner_email'];update notification_deliveries set created_at=now()-interval '2 days' where target='customer_whatsapp';");
  const older=(await db.query('select activated_after from notification_dispatch_state')).rows[0].activated_after.toISOString();await claim(db,older);
  const s=await rpc(db,'notification_summary');assert.equal(s.customer_outbox.blocked,1);assert.equal(s.inactive_channel_pending,1);
 }finally{await db.close();}
});
test('manual retry cannot replay accepted, processing, uncertain, dead, expired or historical jobs; audit is atomic',async()=>{
 const db=await fixture();try{
  const o=await order(db);await activate(db);await db.query("update notification_deliveries set status=case target when 'owner_email' then 'blocked' when 'owner_whatsapp' then 'uncertain' else 'accepted' end where order_id=$1",[o.id]);
  const r=await rpc(db,'notification_retry_order',{p_order_id:o.id,p_actor:actor});assert.equal(r.queued,1);assert.equal(r.historical_replay,false);
  await db.query("update notification_deliveries set status='blocked' where target='owner_email'");
  await db.exec("CREATE FUNCTION fixture_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic audit failure';END$$;CREATE TRIGGER fixture_audit_failure BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION fixture_audit_failure();");
  await assert.rejects(rpc(db,'notification_retry_order',{p_order_id:o.id,p_actor:actor}),/synthetic audit failure/);
  assert.equal((await db.query("select status from notification_deliveries where target='owner_email'")).rows[0].status,'blocked');
 }finally{await db.close();}
});
test('verified receipts before/after acceptance, duplicates and out-of-order events produce truthful counts',async()=>{
 const db=await fixture();try{
  await order(db);const after=await activate(db),job=await claim(db,after);await begin(db,job,after);
  const now=new Date().toISOString(),early=new Date(Date.now()-60000).toISOString();
  const params={p_channel:'email',p_event_key:'event-1',p_provider_id:'receipt-ack',p_status:'delivered',p_occurred_at:now};
  await rpc(db,'notification_record_receipt',params);await finish(db,job,'accepted','receipt-ack');assert.equal((await row(db,job.id)).delivery_status,'delivered');
  await rpc(db,'notification_record_receipt',params);assert.equal((await db.query('select count(*)::int n from notification_receipts')).rows[0].n,1);
  await rpc(db,'notification_record_receipt',{...params,p_event_key:'older-failure',p_status:'failed',p_occurred_at:early});assert.equal((await row(db,job.id)).delivery_status,'delivered');
  const s=await rpc(db,'notification_summary');assert.equal(s.provider_results.accepted,1);assert.equal(s.provider_results.delivered,1);assert.equal(s.provider_results.unconfirmed,0);
  await rpc(db,'notification_record_receipt',{...params,p_event_key:'complaint',p_status:'complained',p_occurred_at:new Date(Date.now()+1000).toISOString()});
  const complaint=await rpc(db,'notification_summary');assert.equal(complaint.provider_results.complaints,1);assert.equal(complaint.provider_results.delivered,1);assert.equal(complaint.provider_results.delivery_failed,1);
  assert.equal((await row(db,job.id)).delivery_status,'complained'); // Prior verified delivery/failure facts remain counted.
 }finally{await db.close();}
});
test('periodic reconciliation recovers a racing receipt; WhatsApp delivered cannot be undone by an error replay',async()=>{
 const db=await fixture();try{
  await order(db);const after=await activate(db),job=await claim(db,after,'owner_whatsapp');await begin(db,job,after);await finish(db,job,'accepted','wa-ack');
  await db.query("insert into notification_receipts values('whatsapp','race','wa-ack','delivered',now(),now())");await rpc(db,'notification_reconcile_receipts');assert.equal((await row(db,job.id)).delivery_status,'delivered');
  await rpc(db,'notification_record_receipt',{p_channel:'whatsapp',p_event_key:'error-replay',p_provider_id:'wa-ack',p_status:'failed',p_occurred_at:new Date(Date.now()+1000).toISOString()});
  await rpc(db,'notification_reconcile_receipts');assert.equal((await row(db,job.id)).delivery_status,'delivered');
 }finally{await db.close();}
});
test('provider outcomes distinguish acceptance, rejected retries, permanent failures and unknown WAHA results',async()=>{
 const e=env(new Date().toISOString()),o={id:'fixture',order_number:'FIX',customer_phone:'+923000000000',total:500,items:[]};
 const email={id:1,target:'owner_email',event_type:'order_created'},wa={...email,target:'owner_whatsapp'};
 email.request_payload=buildNotificationPayload(e,o,email);wa.request_payload=buildNotificationPayload(e,o,wa);
 const response=(status,body,headers={})=>async()=>new Response(JSON.stringify(body),{status,headers});
 assert.equal((await sendNotification(e,email,response(200,{id:'provider-ack'}))).status,'accepted');
 assert.equal((await sendNotification(e,email,response(200,{}))).status,'retry');assert.equal((await sendNotification(e,wa,response(200,{}))).status,'uncertain');
 assert.equal((await sendNotification(e,email,response(503,{}))).status,'retry');assert.equal((await sendNotification(e,wa,response(503,{}))).status,'uncertain');
 assert.equal((await sendNotification(e,email,response(400,{}))).status,'dead');assert.equal((await sendNotification(e,email,response(409,{name:'concurrent_idempotent_requests'}))).status,'retry');
 assert.equal((await sendNotification(e,wa,response(429,{}, {'Retry-After':'120'}))).retry_seconds,120);
 const timeout=async()=>{throw new Error('synthetic timeout')};assert.equal((await sendNotification(e,email,timeout)).status,'retry');assert.equal((await sendNotification(e,wa,timeout)).status,'uncertain');
});
test('stored templates are rendered; disabled/invalid templates block, immutable status snapshot beats current order',()=>{
 const e=env(new Date().toISOString()),o={id:'fixture',order_number:'FIX',customer_name:'Fixture',customer_phone:'+923000000000',fulfilment_status:'delivered',total:500};
 const job={target:'customer_whatsapp',event_type:'fulfilment_status',event_data:{new_status:'dispatched'}};
 const tpl={name:'status_update',channel:'whatsapp',is_active:true,body:'{{customer_name}}: {{status_text}} {{tracking_url}}'};
 assert.match(buildNotificationPayload(e,o,job,[tpl]).body.text,/on its way/);assert.throws(()=>buildNotificationPayload(e,o,job,[{...tpl,is_active:false}]),/disabled/);
 assert.throws(()=>buildNotificationPayload(e,o,job,[{...tpl,body:'{{unsupported}}'}]),/template_invalid/);
 assert.throws(()=>buildNotificationPayload(e,o,job,[{...tpl,body:''}]),/template_invalid/);
 assert.match(buildNotificationPayload(e,o,{...job,event_type:'order_created'},[]).body.text,/has been received/);
});
test('consumer processes at most four jobs per tick, records heartbeat and never marks API acceptance delivered',async()=>{
 const db=await fixture();try{
  await order(db,'FIRST');await order(db,'SECOND');const after=await activate(db),e=env(after),mock=router(db);
  const result=await runNotifications(e,mock.fetcher);assert.equal(result.counts.claimed,4);assert.equal(result.counts.accepted,4);assert.ok(mock.calls.length<50);
  const s=await rpc(db,'notification_summary');assert.equal(s.provider_results.accepted,4);assert.equal(s.provider_results.delivered,0);assert.ok(s.dispatch.last_completed_at);
  let calls=0;assert.equal((await runNotifications({...e,NOTIFICATION_DISPATCH_ENABLED:'false'},()=>{calls++;throw new Error()})).paused,true);assert.equal(calls,0);
  await assert.rejects(runNotifications({...e,WAHA_API_KEY:''},()=>{calls++;throw new Error()}),/configuration_invalid/);assert.equal(calls,0);
 }finally{await db.close();}
});
test('email acknowledgement-save crash retries identical payload/key, with no extra logical provider message',async()=>{
 const db=await fixture();try{
  await order(db);const after=await activate(db),e={...env(after),NOTIFICATION_CHANNELS:'owner_email'},requests=[];
  const mock=router(db,(_u,init)=>{requests.push(init);return new Response(JSON.stringify({id:'same-provider-ack'}));});let fail=true;
  const fetcher=async(url,init)=>{if(String(url).endsWith('/notification_finish')&&fail){fail=false;return new Response(null,{status:503});}return mock.fetcher(url,init)};
  await assert.rejects(runNotifications(e,fetcher),/queue_api_503/);
  await db.exec("update notification_deliveries set lease_expires_at=now()-interval '1 minute' where status='processing';update notification_templates set body='Changed after send' where name='order_received_owner';update orders set total=999;");
  await runNotifications(e,fetcher);assert.equal(requests.length,2);assert.equal(requests[0].body,requests[1].body);assert.equal(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key']);
  assert.equal((await rpc(db,'notification_summary')).provider_results.accepted,1);
 }finally{await db.close();}
});
test('WAHA acknowledgement-save crash is quarantined and never resent on the next tick',async()=>{
 const db=await fixture();try{
  await order(db);const after=await activate(db),e={...env(after),NOTIFICATION_CHANNELS:'owner_whatsapp'},sends=[];
  const mock=router(db,(_u,init)=>{sends.push(init);return new Response(JSON.stringify({id:'wa-provider-ack'}));});let fail=true;
  const fetcher=async(url,init)=>{if(String(url).endsWith('/notification_finish')&&fail){fail=false;return new Response(null,{status:503});}return mock.fetcher(url,init)};
  await assert.rejects(runNotifications(e,fetcher),/queue_api_503/);await db.exec("update notification_deliveries set lease_expires_at=now()-interval '1 minute' where status='processing';");
  await runNotifications(e,fetcher);assert.equal(sends.length,1);assert.equal((await rpc(db,'notification_summary')).owner_outbox.uncertain,1);
 }finally{await db.close();}
});
test('signed Resend receipts verify raw body and freshness; tampered signatures cannot write delivery state',async()=>{
 const data={type:'email.delivered',created_at:new Date().toISOString(),data:{email_id:'signed-ack'}},request=await signedEmail(data),body=await request.clone().text();
 assert.equal(await verifyResend(request,body,resendSecret),true);assert.equal(await verifyResend(request,body+' ',resendSecret),false);assert.equal(await verifyResend(request,body,resendSecret,Date.now()+600000),false);
 let writes=0;const fetcher=async()=>{writes++;return new Response('true')},e={...env(new Date().toISOString()),RESEND_WEBHOOK_SECRET:resendSecret};
 assert.equal((await handleNotificationReceipt(await signedEmail(data),e,'email',fetcher)).status,200);assert.equal(writes,1);
 const bad=new Request(request,{body:body+' '});assert.equal((await handleNotificationReceipt(bad,e,'email',fetcher)).status,401);assert.equal(writes,1);
});
test('WAHA HMAC matches documented vector; only outgoing DEVICE/READ acknowledgements count as delivered',async()=>{
 const vector='{"event":"message","session":"default","engine":"WEBJS"}';
 const r=new Request('https://worker.example.invalid',{method:'POST',body:vector,headers:{'x-webhook-hmac-algorithm':'sha512','x-webhook-hmac':'208f8a55dde9e05519e898b10b89bf0d0b3b0fdf11fdbf09b6b90476301b98d8097c462b2b17a6ce93b6b47a136cf2e78a33a63f6752c2c1631777076153fa89'}});
 assert.equal(await verifyWaha(r,vector,'my-secret-key'),true);
 let calls=0;const records=[],fetcher=async(_url,init)=>{calls++;records.push(JSON.parse(init.body));return new Response('true')},e={...env(new Date().toISOString()),WAHA_WEBHOOK_SECRET:'fixture-hmac'};
 const data={event:'message.ack',session:'fixture',payload:{id:'signed-wa',fromMe:true,ack:1}};
 assert.equal((await handleNotificationReceipt(await signedWaha(data),e,'whatsapp',fetcher)).status,202);assert.equal(calls,0);
 assert.equal((await handleNotificationReceipt(await signedWaha({...data,payload:{...data.payload,ack:2}}),e,'whatsapp',fetcher)).status,200);assert.equal(records[0].p_status,'delivered');
 assert.equal((await handleNotificationReceipt(await signedWaha({...data,session:'wrong'}),e,'whatsapp',fetcher)).status,202);
});
test('bounded bodies, permanent DB failures and protected run/health endpoints fail visibly without provider sends',async()=>{
 await assert.rejects(limitedText(new Response('x'.repeat(32769))),/too_large/);
 const e={...env(new Date().toISOString()),RESEND_WEBHOOK_SECRET:resendSecret,OUTBOX_RUN_SECRET:'fixture-run-secret'};
 assert.equal((await worker.fetch(new Request('https://worker.example.invalid/run'),e)).status,401);
 assert.equal((await worker.fetch(new Request('https://worker.example.invalid/run',{headers:{Authorization:'Bearer fixture-run-secret'}}),e)).status,405);
 const data={type:'email.delivered',created_at:new Date().toISOString(),data:{email_id:'signed-ack'}};
 assert.equal((await handleNotificationReceipt(await signedEmail(data),e,'email',async()=>new Response(null,{status:503}))).status,503);
});
test('health cannot be green when paused, stale, unconfigured, backlogged or awaiting uncertain-job review',()=>{
 const e=env(new Date().toISOString()),config=notificationConfig(e),summary={dispatch:{enabled:true,activated_after:e.NOTIFICATION_DISPATCH_AFTER,last_completed_at:new Date().toISOString()},provider_results:{accepted:1,delivered:0,unconfirmed:1}};
 assert.equal(notificationHealth(config,summary).ok,true);
 for(const patch of [{enabled:false},{last_completed_at:null},{last_error:'failed'}])assert.equal(notificationHealth(config,{...summary,dispatch:{...summary.dispatch,...patch}}).ok,false);
 for(const key of ['review_required','inactive_channel_pending','overdue'])assert.equal(notificationHealth(config,{...summary,[key]:1}).ok,false);
 assert.equal(notificationHealth(notificationConfig({...e,RESEND_API_KEY:''}),summary).ok,false);
 assert.equal(notificationHealth(config,{...summary,dispatch:{...summary.dispatch,activated_after:e.NOTIFICATION_DISPATCH_AFTER.replace('Z','001Z')}}).ok,false);
 assert.ok(notificationConfig({...e,NOTIFICATION_DISPATCH_AFTER:'2026-02-30T00:00:00Z'}).errors.includes('activation_cutoff_invalid'));
});
test('checkout and admin mutations contain no provider sends or second queue path; admin uses acceptance labels',async()=>{
 for(const file of ['functions/api/orders.js','functions/api/admin/orders/[id]/status.js','functions/api/admin/orders/[id]/payment/verify.js'])assert.doesNotMatch(await readFile(new URL('../'+file,import.meta.url),'utf8'),/notifyOwner|notifyCustomer|sendStatusUpdate|enqueueCustomerNotification|notification_outbox/);
 const ui=await readFile(new URL('../admin-live.js',import.meta.url),'utf8');assert.match(ui,/confirmed delivered/);assert.match(ui,/awaiting confirmation/);assert.doesNotMatch(ui,/No failures\. 🎉/);
});

test('consumer plus signed receipt handlers update the real synthetic database; forged receipts cannot increment delivery',async()=>{
 const db=await fixture();try{
  await order(db);const after=await activate(db),e={...env(after),RESEND_WEBHOOK_SECRET:resendSecret,WAHA_WEBHOOK_SECRET:'fixture-hmac'},mock=router(db);
  await runNotifications(e,mock.fetcher);
  const jobs=(await db.query("select * from notification_deliveries where status='accepted' order by id")).rows;
  const email=jobs.find(j=>j.target==='owner_email'),wa=jobs.find(j=>j.target==='customer_whatsapp');
  const data={type:'email.delivered',created_at:new Date().toISOString(),data:{email_id:email.provider_id}};
  assert.equal((await handleNotificationReceipt(await signedEmail(data),e,'email',mock.fetcher)).status,200);
  assert.equal((await handleNotificationReceipt(await signedWaha({event:'message.ack',session:'fixture',payload:{id:wa.provider_id,fromMe:true,ack:2}}),e,'whatsapp',mock.fetcher)).status,200);
  const forged=new Request('https://worker.example.invalid/webhooks/resend',{method:'POST',body:JSON.stringify({...data,data:{email_id:jobs.find(j=>j.target==='owner_whatsapp').provider_id}})});
  assert.equal((await handleNotificationReceipt(forged,e,'email',mock.fetcher)).status,401);
  const s=await rpc(db,'notification_summary');assert.deepEqual(s.provider_results,{accepted:3,delivered:2,delivery_failed:0,complaints:0,unconfirmed:1});
 }finally{await db.close();}
});
test('admin notification center enforces staff roles and reports an unavailable queue as an error',async()=>{
 const e={...env(new Date().toISOString()),SUPABASE_ANON_KEY:'synthetic-anon-key'},original=globalThis.fetch;
 const request=()=>new Request('https://site.example.invalid/api/admin/notifications',{headers:{Authorization:'Bearer synthetic-staff-token'}});
 try{
  let role='content',databaseCalls=0;
  globalThis.fetch=async(url)=>{const path=new URL(url).pathname;
   if(path==='/auth/v1/user')return new Response(JSON.stringify({id:actor,email:'fixture@example.invalid'}));
   if(path==='/rest/v1/admin_roles')return new Response(JSON.stringify([{role}]));
   databaseCalls++;return new Response(JSON.stringify({message:'synthetic queue unavailable'}),{status:503});
  };
  assert.equal((await adminNotifications({request:new Request('https://site.example.invalid/api/admin/notifications'),env:e})).status,401);
  assert.equal((await adminNotifications({request:request(),env:e})).status,403);assert.equal(databaseCalls,0);
  role='owner';const response=await adminNotifications({request:request(),env:e});assert.equal(response.status,502);assert.ok((await response.json()).error);
 }finally{globalThis.fetch=original;}
});
test('paused manual run and scheduled handler perform no external I/O and return explicit paused state',async()=>{
 const original=globalThis.fetch,log=console.log;let calls=0,pending,logs=[];
 const e={...env(new Date().toISOString()),NOTIFICATION_DISPATCH_ENABLED:'false',OUTBOX_RUN_SECRET:'fixture-run-secret'};
 try{
  globalThis.fetch=async()=>{calls++;throw new Error('External I/O forbidden in paused fixture')};console.log=value=>logs.push(JSON.parse(value));
  const response=await worker.fetch(new Request('https://worker.example.invalid/run',{method:'POST',headers:{Authorization:'Bearer fixture-run-secret'}}),e);
  assert.equal(response.status,503);assert.equal((await response.json()).paused,true);
  await worker.scheduled({},e,{waitUntil(p){pending=p}});await pending;
  assert.equal(calls,0);assert.equal(logs[0].paused,true);
 }finally{globalThis.fetch=original;console.log=log;}
});
