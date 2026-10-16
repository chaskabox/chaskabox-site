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
