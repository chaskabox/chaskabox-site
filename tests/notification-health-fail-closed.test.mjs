import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const js=readFileSync(new URL('../admin-live.js',import.meta.url),'utf8');
const start=js.indexOf('  async function loadNotifications(){');
const end=js.indexOf('    await loadNotificationHistory(1);\n  }',start);
assert.ok(start>0&&end>start,'notification loader must be present');
const loader=js.slice(start,end+'    await loadNotificationHistory(1);\n  }'.length);

function fixture(api){
  const ids=['notifServiceStatus','notifOutboxStats','notifFailures','refreshNotifStatus','refreshTemplates','refreshNotifHistory','notifHistoryView','notifHistoryTarget','notifHistoryPrev','notifHistoryNext'];
  const els=new Map(ids.map(id=>['#'+id,{
    innerHTML:'Previously healthy',textContent:'',disabled:false,value:'all',
    attributes:new Map(),setAttribute(name,value){this.attributes.set(name,value);},
    removeAttribute(name){this.attributes.delete(name);}
  }]));
  const messages=[];
  const ctx={
    api, $, esc:s=>String(s),fmtDate:s=>s,toast:s=>messages.push(s),
    loadTemplates:()=>{},loadNotificationHistory:async()=>{},
    console
  };
  function $(selector){return els.get(selector)||null;}
  vm.createContext(ctx);
  vm.runInContext(`let notificationStatusSeq=0;let notificationEnabledChannels=['owner_email'];let notificationChannelsVerified=true;let notificationHistoryPage=1;
    ${loader}
    globalThis.run=loadNotifications;
    globalThis.snapshot=()=>({enabled:notificationEnabledChannels.slice(),verified:notificationChannelsVerified});`,ctx);
  return {ctx,els,messages};
}

test('worker status query failure clears previously successful health and channel evidence',async()=>{
 const {ctx,els,messages}=fixture(async()=>{throw Error('Synthetic status outage');});
 await ctx.run();
 assert.match(els.get('#notifServiceStatus').innerHTML,/Notification status unavailable/);
 assert.match(els.get('#notifOutboxStats').innerHTML,/totals unavailable/);
 assert.match(els.get('#notifFailures').innerHTML,/records unavailable/);
 assert.equal(els.get('#notifServiceStatus').attributes.has('aria-busy'),false);
 assert.equal(ctx.snapshot().verified,false);
 assert.equal(ctx.snapshot().enabled.length,0);
 assert.equal(messages.length,1);
});

test('only latest notification response can restore live channel state',async()=>{
 const calls=[];
 const {ctx,els}=fixture(()=>new Promise(resolve=>calls.push(resolve)));
 const first=ctx.run();
 const second=ctx.run();
 const d=target=>({dispatch:{configured_targets:[target],last_completed_at:'2026-10-16T00:00:00Z'},worker_status:'active',owner_outbox:{pending:0},customer_outbox:{pending:0},provider_results:{accepted:1,delivered:0},recent_failures:[]});
 calls[1](d('owner_email'));
 await second;
 calls[0](d('owner_whatsapp'));
 await first;
 assert.equal(ctx.snapshot().verified,true);
 assert.deepEqual(Array.from(ctx.snapshot().enabled),['owner_email']);
 assert.match(els.get('#notifServiceStatus').innerHTML,/owner_email/);
 assert.doesNotMatch(els.get('#notifServiceStatus').innerHTML,/owner_whatsapp/);
 assert.equal(els.get('#notifServiceStatus').attributes.has('aria-busy'),false);
});

test('status loading never includes notification send, replay or channel activation',()=>{
 assert.match(loader,/await api\('\/api\/admin\/notifications'\)/);
 assert.doesNotMatch(loader,/method:\s*['"]POST['"]|\/retry|\/send|\/enable/);
 assert.match(loader,/if\(seq!==notificationStatusSeq\)return/);
 assert.match(loader,/No message was sent/);
});
