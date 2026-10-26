import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { checkNotificationProviders, providerHealthRecord, providerHealthView } from '../functions/api/_lib/notification-provider-health.js';
import { env, actor, fixture, activate, order, router } from './notification-fixture.mjs';
import worker from '../workers/notification-outbox.js';
import { onRequestGet } from '../functions/api/admin/notifications/index.js';

const targets=['owner_email','owner_whatsapp','customer_whatsapp'];
const healthy={email:{http_status:200,sender_domain_verified:true,owner_recipient_configured:true},whatsapp:{http_status:200,session_status:'WORKING',signed_receipts_configured:true}};

test('provider health distinguishes a restricted email key, disconnected WhatsApp and inactive channels',()=>{
  assert.equal(providerHealthRecord(healthy,targets).p_email_status,'ready');
  assert.equal(providerHealthRecord({email:{http_status:403},whatsapp:{http_status:200,session_status:'SCAN_QR_CODE'}},targets).p_email_status,'unknown');
  assert.equal(providerHealthRecord({whatsapp:{http_status:200,session_status:'SCAN_QR_CODE'}},targets).p_whatsapp_status,'unavailable');
  assert.equal(providerHealthRecord({email:{http_status:401},whatsapp:{request_failed:true}},targets).p_email_status,'unavailable');
  assert.equal(providerHealthRecord(healthy,[]).p_whatsapp_status,'disabled');
  assert.equal(providerHealthRecord({whatsapp:{http_status:200,session_status:'WORKING',signed_receipts_configured:false}},targets).p_whatsapp_status,'unavailable');
});

test('stale, future or missing checks never retain a ready label or old session evidence',()=>{
  const now=Date.now(),row={checked_at:new Date(now-60000).toISOString(),email_status:'ready',whatsapp_status:'ready',whatsapp_session_status:'WORKING',whatsapp_receipts_configured:true,private:'do not expose'};
  assert.equal(providerHealthView(row,targets,now).whatsapp.status,'ready');
  for(const snapshot of [null,{...row,checked_at:new Date(now-660000).toISOString()},{...row,checked_at:new Date(now+60000).toISOString()}]){
    const view=providerHealthView(snapshot,targets,now);
    assert.equal(view.stale,true);
    assert.equal(view.whatsapp.status,'unknown');
    assert.equal(view.whatsapp.session_status,'unknown');
    assert.equal(view.whatsapp.receipts_configured,null);
  }
  assert.equal(JSON.stringify(providerHealthView(row,targets,now)).includes('do not expose'),false);
});

test('scheduled readiness uses provider GETs and a sanitized database write without messages or queue mutations',async()=>{
  const calls=[];
  const e=env(new Date().toISOString());
  const result=await checkNotificationProviders(e,async(url,init={})=>{
    calls.push({url,init});
    if(url==='https://api.resend.com/domains'){
      assert.equal(init.method,undefined);
      return Response.json({data:[{name:'example.invalid',status:'verified',secret:'never persist'}]});
    }
    if(url==='https://waha.example.invalid/api/sessions/fixture'){
      assert.equal(init.method,undefined);
      return Response.json({status:'WORKING',config:{private_key:'never persist'}});
    }
    assert.equal(url,'https://db.example.invalid/rest/v1/rpc/notification_provider_health_record');
    assert.equal(init.method,'POST');
    const body=JSON.parse(init.body);
    assert.equal(body.p_whatsapp_status,'ready');
    assert.equal(Object.keys(body).length,6);
    assert.doesNotMatch(init.body,/never persist|synthetic.*key|recipient|@/);
    return new Response(null,{status:204});
  });
  assert.equal(result.status,'recorded');
  assert.equal(calls.length,3);
  assert.ok(calls.every(c=>!c.url.includes('sendText')&&!c.url.endsWith('/emails')&&!c.url.includes('notification_claim')));
});

test('health snapshot is service-only, typed and independent of orders and notification jobs',async()=>{
  const db=new PGlite();
  try{
    await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;');
    await db.exec(await readFile(new URL('../database/migrations/20261026050000_notification_provider_health.sql',import.meta.url),'utf8'));
    for(const role of ['anon','authenticated']){
      await db.exec('SET ROLE '+role);
      await assert.rejects(db.query('SELECT * FROM notification_provider_health'),/permission denied/);
      await assert.rejects(db.query("SELECT notification_provider_health_record('ready',200,'ready',200,'WORKING',true)"),/permission denied/);
      await db.exec('RESET ROLE');
    }
    await db.exec('SET ROLE service_role');
    await db.query("SELECT notification_provider_health_record('ready',200,'ready',200,'WORKING',true)");
    await db.query("SELECT notification_provider_health_record('unknown',403,'unavailable',503,'unknown',true)");
    assert.equal((await db.query('SELECT count(*)::int n FROM notification_provider_health')).rows[0].n,1);
    const row=(await db.query('SELECT * FROM notification_provider_health')).rows[0];
    assert.equal(row.email_status,'unknown');
    assert.equal(row.whatsapp_status,'unavailable');
    await assert.rejects(db.query("SELECT notification_provider_health_record('secret',200,'ready',200,'WORKING',true)"),/check constraint/);
  }finally{await db.close();}
});

test('probe ticks reserve request capacity while the independent consumer still processes orders',async()=>{
  const db=await fixture(),original=globalThis.fetch,log=console.log;
  const pending=[];
  try{
    await db.exec(await readFile(new URL('../database/migrations/20261026050000_notification_provider_health.sql',import.meta.url),'utf8'));
    const after=await activate(db),e={...env(after),NOTIFICATION_CHANNELS:'owner_email'};
    for(let n=0;n<5;n++)await order(db,'BUDGET-FIXTURE-'+n);
    const {fetcher,calls}=router(db,(url)=>{
      if(url.href==='https://api.resend.com/domains')return Response.json({data:[{name:'example.invalid',status:'verified'}]});
      if(url.pathname.includes('/sessions/'))return Response.json({status:'WORKING'});
      return Response.json({id:'synthetic-'+crypto.randomUUID()});
    });
    globalThis.fetch=fetcher;console.log=()=>{};
    await worker.scheduled({scheduledTime:Date.parse('2026-10-26T05:00:00Z')},e,{waitUntil(p){pending.push(p);}});
    await Promise.all(pending);
    assert.equal((await db.query("SELECT count(*)::int n FROM notification_deliveries WHERE target='owner_email' AND status='accepted'")).rows[0].n,3);
    assert.equal((await db.query("SELECT count(*)::int n FROM notification_deliveries WHERE target='owner_email' AND status='pending'")).rows[0].n,2);
    assert.equal((await db.query('SELECT email_status FROM notification_provider_health')).rows[0].email_status,'ready');
    assert.ok(calls.length<50);
    assert.equal(calls.filter(c=>c.url.includes('/sendText')).length,0);
  }finally{globalThis.fetch=original;console.log=log;await db.close();}
});

test('admin combines real-order evidence with current provider health and preserves queue data if the probe read fails',async()=>{
  const original=globalThis.fetch;
  let probeFails=false,failuresQuery;
  const e={...env(new Date().toISOString()),SUPABASE_ANON_KEY:'public-fixture'};
  const request=()=>new Request('https://chaskabox.online/api/admin/notifications',{headers:{Authorization:'Bearer fixture.'+Buffer.from(JSON.stringify({sub:actor,aal:'aal2',session_id:'00000000-0000-4000-8000-000000000010'})).toString('base64url')+'.verified'}});
  try{
    globalThis.fetch=async address=>{
      const u=new URL(address),path=u.pathname;
      if(path==='/auth/v1/user')return Response.json({id:actor});
      if(path==='/rest/v1/admin_roles')return Response.json([{role:'owner'}]);
      if(path==='/rest/v1/rpc/admin_session_check')return Response.json(true);
      if(path==='/rest/v1/rpc/notification_summary')return Response.json({dispatch:{enabled:true,last_completed_at:new Date().toISOString(),configured_targets:targets},eligible_due:0,provider_results:{delivered:1}});
      if(path==='/rest/v1/notification_deliveries'){failuresQuery=u.searchParams;return Response.json([{order_id:'fixture',target:'customer_whatsapp',status:'blocked',last_error:'customer_whatsapp_opt_in_missing',orders:{order_number:'CB-FIXTURE',is_test:false,secret:'never expose'}}]);}
      if(path==='/rest/v1/notification_provider_health'){
        if(probeFails)return Response.json({message:'synthetic outage'},{status:503});
        return Response.json([{checked_at:new Date().toISOString(),email_status:'ready',whatsapp_status:'unavailable',whatsapp_session_status:'SCAN_QR_CODE',whatsapp_http_status:200,whatsapp_receipts_configured:true}]);
      }
      throw new Error('Unexpected fixture request');
    };
    let response=await onRequestGet({request:request(),env:e});
    let data=await response.json();
    assert.equal(response.status,200);
    assert.equal(failuresQuery.get('orders.is_test'),'eq.false');
    assert.equal(data.worker_status,'degraded');
    assert.equal(data.providers.whatsapp.session_status,'SCAN_QR_CODE');
    assert.equal(data.recent_failures[0].order_number,'CB-FIXTURE');
    assert.doesNotMatch(JSON.stringify(data),/never expose|request_payload|customer_phone/);
    probeFails=true;
    response=await onRequestGet({request:request(),env:e});data=await response.json();
    assert.equal(data.providers.whatsapp.status,'unknown');
    assert.equal(data.provider_results.delivered,1);
    assert.equal(data.eligible_due,0);
  }finally{globalThis.fetch=original;}
});
