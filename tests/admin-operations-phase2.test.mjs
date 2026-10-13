import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { validateCaseCreate,validateCasePatch } from '../functions/api/admin/_lib/resolution-input.js';

const bad=(fn,payload)=>assert.throws(()=>fn(payload),e=>e instanceof Response && e.status===400);

test('resolution-case creation validates issue details and does not declare refunds',()=>{
 const valid=validateCaseCreate({issue_type:'damaged',description:'Broken package',order_number:'CB-TEST-1'});
 assert.equal(valid.status,'open');assert.equal(valid.refund_amount,0);
 assert.equal(valid.order_number,'CB-TEST-1');
 for(const input of [
  {issue_type:'fake',description:'Broken package'},
  {issue_type:'refund',description:'x'},
  {issue_type:'refund',description:'Broken pack',refund_amount:5},
  {issue_type:'refund',description:'Broken pack',status:'resolved'},
  {issue_type:'refund',description:'Broken pack',order_id:'not-a-uuid'},
 ])bad(validateCaseCreate,input);
});

test('case resolution must include notes and an integer nonnegative refund record',()=>{
 const resolved=validateCasePatch({status:'resolved',resolution:'Store credit provided',refund_amount:0});
 assert.equal(resolved.status,'resolved');assert.equal(resolved.refund_amount,0);
 assert.ok(resolved.resolved_at);
 assert.equal(validateCasePatch({status:'in_progress'}).resolved_at,null);
 for(const input of [
  {status:'resolved',refund_amount:50},
  {status:'resolved',resolution:'done',refund_amount:-1},
  {status:'resolved',resolution:'done',refund_amount:1.1},
  {status:'rejected',refund_amount:5},
  {status:'fake'}, {},{status:'resolved',resolution:''},
  {status:'resolved',resolution:'ok',refund_amount:10,paid:true},
 ])bad(validateCasePatch,input);
});

test('admin coupon/zone/case form builder normalizes typed data and blocks invalid values',async()=>{
 const source=await readFile(new URL('../admin-operations-forms.js',import.meta.url),'utf8');
 const window={};
 vm.runInNewContext(source,{window});
 const {build}=window.chaskaAdminOpsForms;
 const c=build('coupon',{code:' chaska10 ',discount_type:'percent',discount_value:'10',min_order:'0',max_uses:'',valid_from:'2026-10-13',valid_until:'2026-10-14',is_active:true});
 assert.equal(c.code,'CHASKA10');assert.equal(c.max_uses,null);
 assert.equal(c.valid_until,'2026-10-14T23:59:59.999Z');
 assert.throws(()=>build('coupon',{code:'X',discount_type:'percent',discount_value:'91',min_order:'0'}));
 assert.throws(()=>build('coupon',{code:'X',discount_type:'fixed',discount_value:'9',min_order:'0',valid_from:'2026-11-01',valid_until:'2026-10-13'}));
 const z=build('zone',{name:'Central',fee:'300',free_above:'',cities:' Lahore, karachi, lahore ',is_active:true});
 assert.equal(z.cities.join(','),'lahore,karachi');assert.equal(z.free_above,null);
 assert.throws(()=>build('zone',{name:'Central',fee:'-4'}));
 const res=build('resolution',{issue_type:'complaint',description:'Late delivery',order_number:''});
 assert.equal(res.order_number,null);
 assert.equal(build('resolve',{resolution:'Replacement sent',refund_amount:'0'}).refund_amount,0);
 assert.throws(()=>build('resolve',{resolution:'Replacement sent',refund_amount:'foo'}));
});

test('coupon delete is owner-only, shipping edits use forms, errors caught',async()=>{
 const script=await readFile(new URL('../admin-live.js',import.meta.url),'utf8');
 const html=await readFile(new URL('../admin.html',import.meta.url),'utf8');
 assert.ok(html.indexOf('/admin-operations-forms.js')<html.indexOf('/admin-live.js'));
 for(const token of ["openAdminOperation('coupon'","openAdminOperation('zone'","openAdminOperation('resolution'","'resolve','/api/admin/resolutions/'"])assert.ok(script.includes(token),token);
 assert.ok(script.includes('roleAllows("owner")?'));
 assert.ok(script.includes("Coupon update failed: "));
 assert.ok(!script.includes("const code=prompt('Coupon code"));
 assert.ok(!script.includes("const fee=prompt('Delivery fee in PKR:"));
});
