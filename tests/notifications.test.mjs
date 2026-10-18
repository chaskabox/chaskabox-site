import {syntheticTemplates} from './notification-fixture.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fixture, activate, order, rpc, env, router, actor } from './notification-fixture.mjs';
import worker,{runNotifications,runOwnerWahaCanary,configureWahaWebhookOnce,verifyWahaWebhookRecovery} from '../workers/notification-outbox.js';
import { buildNotificationPayload,previewNotificationTemplate,sendNotification,notificationConfig,notificationHealth,limitedText,privateRequest,providerReadiness,wahaAccessHeaders } from '../functions/api/_lib/notification-delivery.js';
import { handleNotificationReceipt,verifyResend,verifyWaha } from '../functions/api/_lib/notification-receipts.js';
import { onRequestGet as adminNotifications } from '../functions/api/admin/notifications/index.js';

async function claim(db,after,target='owner_email'){return (await rpc(db,'notification_claim',{p_after:after,p_targets:[target]}))[0];}
async function begin(db,job,after){await rpc(db,'notification_prepare',{p_id:job.id,p_token:job.lease_token,p_payload:{endpoint:'https://api.resend.com/emails',body:{text:'Frozen fixture'}}});return (await rpc(db,'notification_begin',{p_id:job.id,p_token:job.lease_token,p_after:after}))[0];}
async function finish(db,job,status='accepted',id='synthetic-ack'){return (await rpc(db,'notification_finish',{p_id:job.id,p_token:job.lease_token,p_status:status,p_provider_id:status==='accepted'?id:null})).saved;}
async function row(db,id){return (await db.query('select * from notification_deliveries where id=$1',[id])).rows[0];}
async function hmac(hash,key,body,format){const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash},false,['sign']);const sig=new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(body)));return format==='hex'?Array.from(sig,x=>x.toString(16).padStart(2,'0')).join(''):btoa(String.fromCharCode(...sig));}
const resendSecret='whsec_'+btoa('synthetic-webhook-signing-secret');
async function signedEmail(data,now=Date.now(),id='synthetic-receipt'){
 const body=JSON.stringify(data),ts=String(Math.floor(now/1000));
 const signature=await hmac('SHA-256',new TextEncoder().encode('synthetic-webhook-signing-secret'),id+'.'+ts+'.'+body);
 return new Request('https://worker.example.invalid/webhooks/resend',{method:'POST',body,headers:{'svix-id':id,'svix-timestamp':ts,'svix-signature':'v1,'+signature}});
}
async function signedWaha(data){const body=JSON.stringify(data),signature=await hmac('SHA-512',new TextEncoder().encode('fixture-hmac'),body,'hex');return new Request('https://worker.example.invalid/webhooks/waha',{method:'POST',body,headers:{'x-webhook-hmac':signature,'x-webhook-hmac-algorithm':'sha512'}});}
test('private database calls normalize pasted configuration and report bounded failures',async()=>{
 const e={SUPABASE_URL:' https://fixture.example.invalid/ \n',SUPABASE_SERVICE_ROLE_KEY:' fixture-secret \n'};
 assert.deepEqual(await privateRequest(e,'/rest/v1/rpc/test',{},async(url,init)=>{assert.equal(url,'https://fixture.example.invalid/rest/v1/rpc/test');assert.equal(init.headers.apikey,'fixture-secret');assert.equal(init.redirect,'manual');return Response.json({ok:true});}),{ok:true});
 await assert.rejects(privateRequest({...e,SUPABASE_SERVICE_ROLE_KEY:'bad\nkey'},'/rest/v1/rpc/test',{},async()=>{throw Error('must not send');}),/queue_key_invalid/);
 await assert.rejects(privateRequest(e,'/rest/v1/rpc/test',{},async()=>new Response('<html>private proxy message</html>')),/queue_response_invalid/);
 await assert.rejects(privateRequest(e,'/rest/v1/rpc/test',{},async()=>new Response(null,{status:302,headers:{Location:'https://untrusted.example.invalid/'}})),/queue_api_302/);
 await assert.rejects(privateRequest(e,'/rest/v1/rpc/test',{},async()=>{throw new Error('sensitive network detail');}),/queue_request_failed/);
});
test('provider diagnostics never send a WAHA credential to a temporary gateway',async()=>{
 const result=await providerReadiness({RESEND_API_KEY:'fixture-email',RESEND_FROM_EMAIL:'notify@example.invalid',WAHA_API_URL:'https://temporary.trycloudflare.com',WAHA_API_KEY:'fixture-private-key'},async url=>{assert.equal(url,'https://api.resend.com/domains');return Response.json({data:[{name:'example.invalid',status:'verified'}]});});
 assert.equal(result.whatsapp.check_blocked,true);assert.equal(result.email.sender_domain_verified,true);assert.doesNotMatch(JSON.stringify(result),/fixture-private-key/);
});
test('approved provider diagnostics distinguish missing sessions, unavailable tunnels and restricted email domain access',async()=>{
 const gateway='https://approved.trycloudflare.com',e={WAHA_API_URL:gateway,WAHA_APPROVED_GATEWAY_ORIGIN:gateway,WAHA_API_KEY:'fixture-private-key',WAHA_SESSION:'default'};
 const result=await providerReadiness(e,async(url,init)=>{assert.equal(init.redirect,'manual');if(url==='https://api.resend.com/domains')return Response.json({message:'restricted'},{status:401});assert.equal(init.headers['X-Api-Key'],'fixture-private-key');if(url.endsWith('?all=true'))return Response.json([{name:'configured-session',status:'WORKING',config:{private:'must not expose'}}]);return Response.json({message:'Session not found'},{status:404});});
 assert.equal(result.email.sender_domain_verified,null);assert.equal(result.email.domain_check_available,false);assert.deepEqual(result.whatsapp.available_sessions,[{name:'configured-session',status:'WORKING'}]);assert.doesNotMatch(JSON.stringify(result),/fixture-private-key|must not expose/);
 let gatewayCalls=0;const unavailable=await providerReadiness(e,async url=>{if(url==='https://api.resend.com/domains')return Response.json({data:[]});gatewayCalls++;return new Response('no tunnel here',{status:404});});assert.equal(gatewayCalls,1);assert.equal(unavailable.whatsapp.tunnel_unavailable,true);assert.equal(unavailable.whatsapp.response_kind,'text');
});

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
 const email={id:1,order_id:actor,target:'owner_email',event_type:'order_created'},wa={...email,target:'owner_whatsapp'};
 email.request_payload=buildNotificationPayload(e,o,email,syntheticTemplates);wa.request_payload=buildNotificationPayload(e,o,wa,syntheticTemplates);
 const response=(status,body,headers={})=>async()=>new Response(JSON.stringify(body),{status,headers});
 assert.equal((await sendNotification(e,email,response(200,{id:'provider-ack'}))).status,'accepted');
 const nestedId='true_923320005381@c.us_ABC123';
 const nestedResult=await sendNotification(e,wa,response(201,{id:{fromMe:true,remote:'923320005381@c.us',id:'ABC123',_serialized:nestedId}}));
 assert.equal(nestedResult.status,'accepted');
 assert.equal(nestedResult.provider_id,nestedId);
 assert.equal((await sendNotification(e,wa,response(200,{id:'plain-waha-id'}))).status,'accepted');
 assert.equal((await sendNotification(e,email,response(200,{id:{_serialized:nestedId}}))).status,'retry');
 assert.equal((await sendNotification(e,wa,response(200,{id:{id:'ABC123'}}))).status,'uncertain');
 assert.equal((await sendNotification(e,wa,response(200,{id:{_serialized:'   '}}))).status,'uncertain');
 assert.equal((await sendNotification(e,wa,response(200,{id:{_serialized:'x'.repeat(241)}}))).status,'uncertain');
 assert.equal((await sendNotification(e,email,response(200,{}))).status,'retry');assert.equal((await sendNotification(e,wa,response(200,{}))).status,'uncertain');
 assert.equal((await sendNotification(e,email,response(503,{}))).status,'retry');assert.equal((await sendNotification(e,wa,response(503,{}))).status,'uncertain');
 assert.equal((await sendNotification(e,email,response(400,{}))).status,'dead');assert.equal((await sendNotification(e,email,response(409,{name:'concurrent_idempotent_requests'}))).status,'retry');
 assert.equal((await sendNotification(e,wa,response(429,{}, {'Retry-After':'120'}))).retry_seconds,120);
 const timeout=async()=>{throw new Error('synthetic timeout')};assert.equal((await sendNotification(e,email,timeout)).status,'retry');assert.equal((await sendNotification(e,wa,timeout)).status,'uncertain');
 assert.equal((await sendNotification(e,{...email,order_id:undefined},()=>{throw new Error('Invalid identity must never send')})).status,'blocked');
});
test('stored templates are rendered; disabled/invalid templates block, immutable status snapshot beats current order',()=>{
 const e=env(new Date().toISOString()),o={id:'fixture',order_number:'FIX',customer_name:'Fixture',customer_phone:'+923000000000',fulfilment_status:'delivered',total:500};
 const job={target:'customer_whatsapp',event_type:'fulfilment_status',event_data:{new_status:'dispatched'}};
 const tpl={name:'status_update',channel:'whatsapp',is_active:true,body:'{{customer_name}}: {{status_text}} {{tracking_url}}'};
 assert.match(buildNotificationPayload(e,o,job,[tpl]).body.text,/on its way/);assert.throws(()=>buildNotificationPayload(e,o,job,[{...tpl,is_active:false}]),/disabled/);
 assert.throws(()=>buildNotificationPayload(e,o,job,[{...tpl,body:'{{unsupported}}'}]),/template_invalid/);
 assert.throws(()=>buildNotificationPayload(e,o,job,[{...tpl,body:''}]),/template_invalid/);
 assert.throws(()=>buildNotificationPayload(e,o,{...job,event_type:'order_created'},[]),/template_missing/);
});
test('consumer processes at most four jobs per tick, records heartbeat and never marks API acceptance delivered',async()=>{
 const db=await fixture();try{
  await order(db,'FIRST');await order(db,'SECOND');const after=await activate(db),e=env(after),mock=router(db);
  const result=await runNotifications(e,mock.fetcher);assert.equal(result.counts.claimed,4);assert.equal(result.counts.accepted,4);assert.ok(mock.calls.length<50);
  const s=await rpc(db,'notification_summary');assert.equal(s.provider_results.accepted,4);assert.equal(s.provider_results.delivered,0);assert.ok(s.dispatch.last_completed_at);
  const lastOrder=await order(db,'LAST-ATTEMPT'),lastJob=(await db.query("select * from notification_deliveries where order_id=$1 and target='owner_email'",[lastOrder.id])).rows[0];
  await db.query("update notification_deliveries set attempts=5,first_attempt_at=now()-interval '5 minutes',request_payload=$1 where id=$2",[buildNotificationPayload(e,lastOrder,lastJob,syntheticTemplates),lastJob.id]);
  const failing=router(db,()=>new Response('{}',{status:503}));
  const finalAttempt=await runNotifications({...e,NOTIFICATION_CHANNELS:'owner_email'},failing.fetcher);
  assert.equal(finalAttempt.counts.uncertain,1);assert.equal(finalAttempt.counts.retry,0); // Count the persisted final state, not the provider's retry suggestion.
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
 const blockedTest=await worker.fetch(new Request('https://worker.example.invalid/acceptance-email',{method:'POST',headers:{Authorization:'Bearer fixture-run-secret'},body:JSON.stringify({test_id:'00000000-0000-4000-8000-000000000001'})}),e);assert.equal(blockedTest.status,409);
 const badTest=await worker.fetch(new Request('https://worker.example.invalid/acceptance-email',{method:'POST',headers:{Authorization:'Bearer fixture-run-secret'},body:JSON.stringify({test_id:'00000000-0000-4000-8000-000000000001',to:'different@example.invalid'})}),{...e,OWNER_EMAIL_ACCEPTANCE_ENABLED:'true'});assert.equal(badTest.status,400);
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>new Response('sensitive provider response',{status:401});
 try {const health=await worker.fetch(new Request('https://worker.example.invalid/health',{headers:{Authorization:'Bearer fixture-run-secret'}}),e);assert.equal(health.status,503);assert.deepEqual(await health.json(),{ok:false,reasons:['queue_api_401']});}finally{globalThis.fetch=originalFetch;}
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
 const request=(aal='aal1')=>new Request('https://site.example.invalid/api/admin/notifications',{headers:{Authorization:'Bearer fixture.'+Buffer.from(JSON.stringify({sub:actor,aal,session_id:'00000000-0000-4000-8000-000000000010'})).toString('base64url')+'.verified'}});
 try{
  let role='content',databaseCalls=0;
  globalThis.fetch=async(url)=>{const path=new URL(url).pathname;
   if(path==='/auth/v1/user')return new Response(JSON.stringify({id:actor,email:'fixture@example.invalid'}));
   if(path==='/rest/v1/admin_roles')return new Response(JSON.stringify([{role}]));
   if(path==='/rest/v1/rpc/admin_session_check')return Response.json(true);
   databaseCalls++;return new Response(JSON.stringify({message:'synthetic queue unavailable'}),{status:503});
  };
  assert.equal((await adminNotifications({request:new Request('https://site.example.invalid/api/admin/notifications'),env:e})).status,401);
  assert.equal((await adminNotifications({request:request(),env:e})).status,403);assert.equal(databaseCalls,0);
  role='owner';assert.equal((await adminNotifications({request:request(),env:e})).status,403);
  const response=await adminNotifications({request:request('aal2'),env:e});assert.equal(response.status,502);assert.ok((await response.json()).error);
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

test('WAHA Access credentials are scoped to the trusted gateway and missing credentials fail closed', async () => {
 const endpoint = 'https://waha.chaskabox.online';
 const env = {WAHA_API_URL:endpoint,WAHA_API_KEY:'fixture-waha-key',WAHA_SESSION:'default',WAHA_CF_ACCESS_CLIENT_ID:'fixture-access-id',WAHA_CF_ACCESS_CLIENT_SECRET:'fixture-access-secret'};
 assert.deepEqual(wahaAccessHeaders(env),{'CF-Access-Client-Id':'fixture-access-id','CF-Access-Client-Secret':'fixture-access-secret'});
 assert.deepEqual(wahaAccessHeaders({...env,WAHA_API_URL:'https://untrusted.trycloudflare.com'}),{});
 const job={target:'owner_whatsapp',order_id:'00000000-0000-4000-8000-000000000001',request_payload:{endpoint:endpoint+'/api/sendText',body:{session:'default',chatId:'923001234567@c.us',text:'test',linkPreview:false}}};
 let sent=0;
 const accepted=await sendNotification(env,job,async(url,options)=>{
   sent++;assert.equal(url,endpoint+'/api/sendText');
   assert.equal(options.headers['CF-Access-Client-Id'],'fixture-access-id');
   assert.equal(options.headers['CF-Access-Client-Secret'],'fixture-access-secret');
   assert.equal(options.headers['X-Api-Key'],'fixture-waha-key');
   return Response.json({id:'fixture-provider-id'});
 });
 assert.equal(accepted.status,'accepted');assert.equal(sent,1);
 assert.equal((await sendNotification({...env,WAHA_CF_ACCESS_CLIENT_SECRET:''},job,()=>{throw new Error('must not send')})).status,'blocked');
 const readiness=await providerReadiness(env,async(url,options)=>{
   if(url==='https://api.resend.com/domains')return Response.json({data:[]});
   assert.equal(options.headers['CF-Access-Client-Id'],'fixture-access-id');
   assert.equal(options.headers['CF-Access-Client-Secret'],'fixture-access-secret');
   return Response.json({status:'WORKING'});
 });
 assert.equal(readiness.whatsapp.session_status,'WORKING');
 const missing=await providerReadiness({...env,WAHA_CF_ACCESS_CLIENT_ID:''},async url=>{
   if(url==='https://api.resend.com/domains')return Response.json({data:[]});
   throw new Error('WAHA readiness must not request protected gateway without credentials');
 });
 assert.equal(missing.whatsapp.check_blocked,true);
 assert.equal(missing.whatsapp.reason,'waha_access_configuration_missing');
});

test('owner-only WAHA canary atomically claims once and sends exactly one approved message', async () => {
 const env={WAHA_OWNER_CANARY_ENABLED:'true',SUPABASE_URL:'https://db.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-role',WAHA_API_URL:'https://waha.chaskabox.online',WAHA_API_KEY:'fixture-key',WAHA_SESSION:'default',OWNER_WHATSAPP:'923320005381',WAHA_CF_ACCESS_CLIENT_ID:'fixture.access',WAHA_CF_ACCESS_CLIENT_SECRET:'fixture-secret'};
 let claims=0, sends=0, saved=[];
 const fetcher=async (url,opts)=>{
   if(url.endsWith('/rpc/waha_owner_canary_claim'))return Response.json(claims++===0);
   if(url.endsWith('/rpc/waha_owner_canary_finish')){saved.push(JSON.parse(opts.body));return Response.json(true);}
   if(url.endsWith('/api/sessions/default')){assert.equal(opts.headers['CF-Access-Client-Id'],'fixture.access');return Response.json({status:'WORKING'});}
   if(url.endsWith('/api/sendText')){
     sends++;
     const data=JSON.parse(opts.body);
     assert.equal(data.chatId,'923320005381@c.us');
     assert.equal(data.session,'default');
     assert.match(data.text,/owner only/);
     assert.equal(opts.headers['CF-Access-Client-Secret'],'fixture-secret');
     return Response.json({id:'fixture-owner-only-ack'});
   }
   throw Error('Unexpected route '+url);
 };
 assert.equal((await runOwnerWahaCanary(env,fetcher)).status,'accepted');
 assert.equal((await runOwnerWahaCanary(env,fetcher)).status,'not_pending');
 assert.equal(sends,1);
 assert.deepEqual(saved.map(s=>s.p_status),['accepted']);
 assert.equal(saved[0].p_provider_id,'fixture-owner-only-ack');
 assert.equal((await runOwnerWahaCanary({...env,WAHA_OWNER_CANARY_ENABLED:'false'},fetcher)).status,'disabled');
});
test('owner-only WAHA canary never sends without a WORKING session', async () => {
 const env={WAHA_OWNER_CANARY_ENABLED:'true',SUPABASE_URL:'https://db.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-role',WAHA_API_URL:'https://waha.chaskabox.online',WAHA_API_KEY:'fixture-key',WAHA_SESSION:'default',OWNER_WHATSAPP:'923320005381',WAHA_CF_ACCESS_CLIENT_ID:'fixture.access',WAHA_CF_ACCESS_CLIENT_SECRET:'fixture-secret'};
 let sends=0;
 const fetcher=async(url,opts)=>{
  if(url.endsWith('/rpc/waha_owner_canary_claim'))return Response.json(true);
  if(url.endsWith('/rpc/waha_owner_canary_finish')){assert.equal(JSON.parse(opts.body).p_status,'blocked');return Response.json(true);}
  if(url.endsWith('/api/sessions/default'))return Response.json({status:'SCAN_QR_CODE'});
  if(url.endsWith('/api/sendText'))sends++;
  throw Error('Unexpected route '+url);
 };
 assert.equal((await runOwnerWahaCanary(env,fetcher)).status,'blocked');
 assert.equal(sends,0);
});

test('signed WAHA receipt webhook setup runs exactly once and preserves existing configuration',async()=>{
 const env={WAHA_WEBHOOK_SETUP_ENABLED:'true',SUPABASE_URL:'https://db.example.invalid',
   SUPABASE_SERVICE_ROLE_KEY:'fixture-role',WAHA_API_URL:'https://waha.chaskabox.online',
   WAHA_CF_ACCESS_CLIENT_ID:'fixture-client',WAHA_CF_ACCESS_CLIENT_SECRET:'fixture-access-secret',
   WAHA_API_KEY:'fixture-waha-key',WAHA_SESSION:'default',WAHA_WEBHOOK_SECRET:'s'.repeat(64)};
 let claims=0,puts=0,gets=0,finished=[],storedConfig=null;
 const fetcher=async(url,options)=>{
  if(url.endsWith('/rpc/waha_webhook_setup_claim'))return Response.json(claims++===0);
  if(url.endsWith('/rpc/waha_webhook_setup_finish')){finished.push(JSON.parse(options.body));return Response.json(true);}
  if(url.endsWith('/api/sessions/default')){
   assert.equal(options.headers['CF-Access-Client-Id'],'fixture-client');
   if(options.method==='GET'){
    gets++;
    return Response.json({name:'default',status:'WORKING',engine:{engine:'WEBJS'},
      config:storedConfig||{metadata:{original:'keep'},webjs:{other:true},webhooks:[]}});}
   if(options.method==='PUT'){
    puts++;storedConfig=JSON.parse(options.body).config;
    assert.equal(storedConfig.metadata.original,'keep');
    assert.equal(storedConfig.webjs.other,true);
    assert.equal(storedConfig.webjs.tagsEventsOn,true);
    assert.equal(storedConfig.webhooks.length,1);
    assert.deepEqual(storedConfig.webhooks[0].events,['message.ack']);
    assert.equal(storedConfig.webhooks[0].hmac.key,env.WAHA_WEBHOOK_SECRET);
    return Response.json({ok:true});
   }
  }
  throw new Error('Unexpected endpoint');
 };
 assert.equal((await configureWahaWebhookOnce(env,fetcher)).status,'configured');
 assert.equal((await configureWahaWebhookOnce(env,fetcher)).status,'not_pending');
 assert.equal(puts,1);
 assert.equal(gets,2);
 assert.equal(finished[0].p_status,'configured');
 assert.equal(finished[0].p_webhook_present,true);
 assert.equal((await configureWahaWebhookOnce({...env,WAHA_WEBHOOK_SETUP_ENABLED:'false'},fetcher)).status,'disabled');
});
test('signed WAHA webhook setup refuses disconnected sessions and never changes their config',async()=>{
 const env={WAHA_WEBHOOK_SETUP_ENABLED:'true',SUPABASE_URL:'https://db.example.invalid',
  SUPABASE_SERVICE_ROLE_KEY:'fixture-role',WAHA_API_URL:'https://waha.chaskabox.online',
  WAHA_CF_ACCESS_CLIENT_ID:'fixture-client',WAHA_CF_ACCESS_CLIENT_SECRET:'fixture-access-secret',
  WAHA_API_KEY:'fixture-waha-key',WAHA_SESSION:'default',WAHA_WEBHOOK_SECRET:'s'.repeat(64)};
 let finished=0,puts=0;
 const fetcher=async(url,options)=>{
  if(url.endsWith('/rpc/waha_webhook_setup_claim'))return Response.json(true);
  if(url.endsWith('/rpc/waha_webhook_setup_finish')){finished++;assert.equal(JSON.parse(options.body).p_status,'blocked');return Response.json(true);}
  if(options.method==='GET' && url.endsWith('/api/sessions/default'))return Response.json({status:'SCAN_QR_CODE',config:{webhooks:[]}});
  if(options.method==='PUT')puts++;
  throw new Error('Unexpected request');
 };
 assert.equal((await configureWahaWebhookOnce(env,fetcher)).status,'blocked');
 assert.equal(finished,1);assert.equal(puts,0);
});

test('read-only WAHA webhook verification records recovered WORKING session without PUT or sending',async()=>{
 const env={WAHA_WEBHOOK_VERIFY_ENABLED:'true',WAHA_API_URL:'https://waha.chaskabox.online',WAHA_SESSION:'default',
 WAHA_API_KEY:'test-key',WAHA_CF_ACCESS_CLIENT_ID:'test-id',WAHA_CF_ACCESS_CLIENT_SECRET:'test-secret',
 WAHA_WEBHOOK_SECRET:'test-webhook-secret',SUPABASE_URL:'https://db.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-role'};
 let gets=0,verified=0;
 const fetcher=async(url,opts)=>{
  if(url.endsWith('/api/sessions/default')){
   assert.equal(opts.method,'GET'); gets++;
   return Response.json({status:'WORKING',config:{webhooks:[{
     url:'https://notify.chaskabox.online/webhooks/waha',
     events:['message.ack'],hmac:{key:env.WAHA_WEBHOOK_SECRET},
   }]}});}
  if(url.endsWith('/rpc/waha_webhook_setup_verify')){
   assert.equal(opts.method,'POST');verified++;
   const body=JSON.parse(opts.body);assert.equal(body.p_session_status,'WORKING');
   return Response.json(true);
  }
  throw Error('No other endpoints permitted in read-only health check: '+url);
 };
 assert.equal((await verifyWahaWebhookRecovery(env,fetcher)).status,'configured');
 assert.equal(gets,1);assert.equal(verified,1);
 assert.equal((await verifyWahaWebhookRecovery({...env,WAHA_WEBHOOK_VERIFY_ENABLED:'false'},fetcher)).status,'disabled');
});
test('read-only WAHA webhook verification does not record disconnected sessions',async()=>{
 const env={WAHA_WEBHOOK_VERIFY_ENABLED:'true',WAHA_API_URL:'https://waha.chaskabox.online',WAHA_SESSION:'default',
 WAHA_API_KEY:'test-key',WAHA_CF_ACCESS_CLIENT_ID:'test-id',WAHA_CF_ACCESS_CLIENT_SECRET:'test-secret',
 WAHA_WEBHOOK_SECRET:'test-webhook-secret',SUPABASE_URL:'https://db.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-role'};
 let calls=0;
 const r=await verifyWahaWebhookRecovery(env,async(url,opts)=>{
  calls++;assert.equal(opts.method,'GET');
  return Response.json({status:'STARTING',config:{webhooks:[{url:'https://notify.chaskabox.online/webhooks/waha',events:['message.ack'] }]}});
 });
 assert.equal(r.status,'unverified');assert.equal(r.session_status,'STARTING');assert.equal(calls,1);
});

test('checkout cannot bypass the single notification worker and duplicate WhatsApp messages',async()=>{
 const source=await readFile(new URL('../functions/api/orders.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/sendOwnerWhatsApp\s*\(/);
 assert.doesNotMatch(source,/from\s+['"].*waha-notify\.js['"]/);
 assert.match(source,/create_order_atomic/);
});

test('customer WhatsApp consent defaults OFF and is explicit at checkout',async()=>{
 const html=await readFile(new URL('../checkout.html',import.meta.url),'utf8');
 const client=await readFile(new URL('../checkout.js',import.meta.url),'utf8');
 const order=await readFile(new URL('../functions/api/orders.js',import.meta.url),'utf8');
 const server=await readFile(new URL('../functions/api/_lib/validate.js',import.meta.url),'utf8');
 const worker=await readFile(new URL('../workers/notification-outbox.js',import.meta.url),'utf8');
 assert.match(html,/type="checkbox" id="f_whatsapp_optin"/);
 assert.match(client,/whatsapp_opt_in:\s*!!/);
 assert.match(client,/whatsapp_opt_in:payload\.whatsapp_opt_in===true/);
 assert.match(server,/body\.whatsapp_opt_in === true/);
 assert.match(order,/whatsapp_opt_in:\s*value\.whatsapp_opt_in === true/);
 assert.match(worker,/customer_whatsapp_opt_in_missing/);
 assert.match(worker,/whatsapp_before_activation/);
});
test('whatsapp targets fail closed without a recent activation cutoff and signed receipts',()=>{
 const e=env(new Date().toISOString());
 const unsafe=notificationConfig({...e,NOTIFICATION_CHANNELS:'owner_email,owner_whatsapp',WAHA_WEBHOOK_SECRET:'',NOTIFICATION_WHATSAPP_ACTIVATED_AFTER:''});
 assert.ok(unsafe.errors.includes('whatsapp_activation_cutoff_invalid'));
 assert.ok(unsafe.errors.includes('waha_signed_receipt_configuration_missing'));
 const safe=notificationConfig({...e,NOTIFICATION_CHANNELS:'owner_email,owner_whatsapp',
   WAHA_API_URL:'https://waha.chaskabox.online',WAHA_API_KEY:'synthetic',WAHA_SESSION:'default',
   WAHA_CF_ACCESS_CLIENT_ID:'id',WAHA_CF_ACCESS_CLIENT_SECRET:'secret',OWNER_WHATSAPP:'923320005381',
   WAHA_WEBHOOK_SECRET:'signed-fixture',NOTIFICATION_WHATSAPP_ACTIVATED_AFTER:'2026-10-17T07:30:00.000Z'});
 assert.equal(safe.errors.length,0);
});
test('signed WAHA receipt with nested serialized ID matches outgoing provider ID',async()=>{
 const e={WAHA_WEBHOOK_SECRET:'fixture-hmac',WAHA_SESSION:'default',SUPABASE_URL:'https://db.example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-role'};
 const id='true_923320005381@c.us_ABC123';
 let recorded;
 const fetcher=async(url,opts)=>{
  assert.match(url,/notification_record_receipt/);recorded=JSON.parse(opts.body);return Response.json(true);
 };
 const payload={event:'message.ack',session:'default',payload:{id:{_serialized:id},fromMe:true,ack:2}};
 assert.equal((await handleNotificationReceipt(await signedWaha(payload),e,'whatsapp',fetcher)).status,200);
 assert.equal(recorded.p_provider_id,id);
 assert.equal(recorded.p_status,'delivered');
});

test('professional WhatsApp templates show item quantities, line amounts, and truthful payment status',()=>{
 const template={
  name:'order_thankyou_customer',channel:'whatsapp',version:3,body:
  'ChaskaBox received {{order_number}}\n{{items_summary}}\nSubtotal Rs. {{subtotal_display}}\n'+
  'Delivery Rs. {{delivery_fee_display}}\nDiscount Rs. {{discount_display}}\nTotal Rs. {{total_display}}\n'+
  'Payment {{payment_method_label}} — {{payment_status_label}}\nCity {{customer_city}}\nTrack {{tracking_url}}',
 };
 const preview=previewNotificationTemplate(template);
 assert.match(preview.text,/Imli Candy \(200g\) × 2 — Rs. 1,000/);
 assert.match(preview.text,/Nimko Mix \(500g\) × 1 — Rs. 1,350/);
 assert.match(preview.text,/Subtotal Rs. 2,350/);
 assert.match(preview.text,/Delivery Rs. 100/);
 assert.match(preview.text,/Total Rs. 2,450/);
 assert.match(preview.text,/Payment Cash on Delivery — Payment on delivery/);
 assert.match(preview.text,/City Lahore/);
 assert.doesNotMatch(preview.text,/confirmed|will deliver in 4-7 days|{{|}}/i);
});
test('professional owner WhatsApp template includes address, item list and admin URL',()=>{
 const template={name:'order_received_owner_whatsapp',channel:'whatsapp',body:
  'New {{order_number}}\n{{customer_name}} {{customer_phone}}\n{{delivery_address}}\n{{items_summary}}\n'+
  'Rs. {{total_display}}\n{{payment_method_label}} {{payment_status_label}}\n{{admin_url}}'};
 const preview=previewNotificationTemplate(template);
 assert.match(preview.text,/House 12, Model Town, Lahore/);
 assert.match(preview.text,/Nimko Mix/);
 assert.match(preview.text,/\/admin\.html#order-/);
});
test('order item formatting bounds the preview output and sanitizes item names',()=>{
 const order={id:'00000000-0000-4000-8000-000000000001',order_number:'CB-TEST',customer_name:'A Customer',
 customer_phone:'03001234567',total:100,subtotal:100,delivery_fee:0,discount:0,payment_method:'cod',payment_status:'cod_due',
 items:[{product_name:'Snack\nInjected Heading',pack:'pack',quantity:2,unit_price:50}]};
 const template={name:'order_thankyou_customer',channel:'whatsapp',is_active:true,body:'{{items_summary}}'};
 const payload=buildNotificationPayload({WAHA_API_URL:'https://waha.example.invalid',WAHA_SESSION:'default'},order,
  {target:'customer_whatsapp',event_type:'order_created',event_data:{}},[template]);
 assert.match(payload.body.text,/Snack Injected Heading/);
 assert.doesNotMatch(payload.body.text,/Snack\nInjected/);
});

test('checkout WhatsApp consent is visible beside email, remains unchecked and is reflected in final review',async()=>{
 const html=await readFile(new URL('../checkout.html',import.meta.url),'utf8');
 const script=await readFile(new URL('../checkout.js',import.meta.url),'utf8');
 const css=await readFile(new URL('../checkout-ui.css',import.meta.url),'utf8');
 assert.equal((html.match(/id="f_whatsapp_optin"/g)||[]).length,1);
 const deliveryStart=html.indexOf('id="checkoutDeliveryStep"');
 const paymentStart=html.indexOf('id="checkoutPaymentStep"');
 const checkbox=html.indexOf('id="f_whatsapp_optin"');
 const email=html.indexOf('id="f_email"');
 assert.ok(deliveryStart>=0&&email>deliveryStart&&checkbox>email&&checkbox<paymentStart);
 assert.match(html,/id="f_whatsapp_optin"[^>]*name="whatsapp_opt_in"[^>]*value="true"/);
 assert.doesNotMatch(html.match(/<input[^>]*id="f_whatsapp_optin"[^>]*>/)?.[0]||'',/\bchecked\b/);
 assert.ok(html.includes('id="reviewWhatsapp"'));
 assert.ok(!html.includes('id="checkoutExtrasStep"'));
 assert.match(script,/reviewWhatsapp:\s*\$\('#f_whatsapp_optin'\)\?\.checked/);
 assert.match(script,/whatsapp_opt_in:\s*!!\$\('#f_whatsapp_optin'\)\?\.checked/);
 assert.match(css,/\.checkout-whatsapp-choice/);
 assert.match(html,/checkout-ui\.css\?v=20261017-checkout-compact-v3/);
 assert.match(html,/checkout\.js\?v=20261018-audit1/);
});
