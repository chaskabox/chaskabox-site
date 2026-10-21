import {test} from 'node:test';
import assert from 'node:assert/strict';
import {notificationHistoryQuery,safeDeliveryRow} from '../functions/api/admin/notifications/history.js';

test('notification history validates filters and imposes a finite page limit',()=>{
  const path='https://chaskabox.online/api/admin/notifications/history';
  const parsed=notificationHistoryQuery(path+'?target=customer_whatsapp&view=review&page=2');
  const qs=new URLSearchParams(parsed.query);
  assert.equal(qs.get('target'),'eq.customer_whatsapp');
  assert.equal(qs.get('limit'),'20');
  assert.equal(qs.get('offset'),'20');
  assert.equal(qs.get('order'),'created_at.desc,id.desc');
  for(const query of ['?page=0','?page=101','?page=2a','?target=anything','?view=sent','?target=owner_email,customer_whatsapp']){
    assert.throws(()=>notificationHistoryQuery(path+query),(e)=>e instanceof Response&&e.status===400);
  }
});

test('history serializer retains delivery metadata and excludes message contents',()=>{
  const item=safeDeliveryRow({id:4,order_id:'test-order',status:'pending',target:'customer_whatsapp',attempts:0,last_error:'event_expired_review_required',request_payload:{text:'fixture content'},recipient:'fixture recipient'});
  assert.equal(item.error_code,'event_expired_review_required');
  assert.equal(item.status,'pending');
  assert.equal(item.attempts,0);
  assert.equal(Object.hasOwn(item,'request_payload'),false);
  assert.equal(Object.hasOwn(item,'recipient'),false);
  assert.equal(safeDeliveryRow({last_error:'Not safe to show'}).error_code,'review_required');
});

test('history rejects unauthenticated, wrong-role and owner without MFA before reading ledger',async()=>{
  const {onRequestGet}=await import('../functions/api/admin/notifications/history.js');
  const original=globalThis.fetch;
  const id='00000000-0000-4000-8000-000000000001';
  const session='00000000-0000-4000-8000-000000000002';
  let role='content',ledgerReads=0;
  const getRequest=(aal)=>new Request('https://chaskabox.online/api/admin/notifications/history',{headers:{
    Authorization:'Bearer fixture.'+Buffer.from(JSON.stringify({sub:id,aal,session_id:session})).toString('base64url')+'.verified'
  }});
  const ctx=request=>({request,env:{SUPABASE_URL:'https://db.example.invalid',SUPABASE_ANON_KEY:'public-fixture',SUPABASE_SERVICE_ROLE_KEY:'server-fixture'}});
  try{
    globalThis.fetch=async(address)=>{
      const path=new URL(address).pathname;
      if(path==='/auth/v1/user')return Response.json({id});
      if(path==='/rest/v1/admin_roles')return Response.json([{role}]);
      if(path==='/rest/v1/rpc/admin_session_check')return Response.json(true);
      if(path==='/rest/v1/notification_deliveries'){ledgerReads++;return new Response('[]',{headers:{'Content-Range':'*/0'}});}
      throw new Error('Unexpected fixture request');
    };
    assert.equal((await onRequestGet(ctx(new Request('https://chaskabox.online/api/admin/notifications/history')))).status,401);
    assert.equal((await onRequestGet(ctx(getRequest('aal2')))).status,403);
    role='owner';
    assert.equal((await onRequestGet(ctx(getRequest('aal1')))).status,403);
    const response=await onRequestGet(ctx(getRequest('aal2')));
    assert.equal(response.status,200);
    assert.equal((await response.json()).read_only,true);
    assert.equal(ledgerReads,1);
  }finally{globalThis.fetch=original;}
});

test('notification interface is wired to the ledger and does not expose a bulk replay control',async()=>{
  const {readFile}=await import('node:fs/promises');
  const html=await readFile(new URL('../admin.html',import.meta.url),'utf8');
  const client=await readFile(new URL('../admin-live.js',import.meta.url),'utf8');
  assert.match(html,/id="notifHistoryTarget"/);
  assert.match(html,/id="notifHistoryView"/);
  assert.match(html,/id="notifHistoryRows"/);
  assert.match(html,/<script src="\/admin-live\.js\?v=20\d{6}-[a-z0-9-]+" defer><\/script>/);
  assert.match(client,/async function loadNotificationHistory/);
  assert.match(client,/\/api\/admin\/notifications\/history\?/);
  assert.match(html,/No automatic replay/);
});
