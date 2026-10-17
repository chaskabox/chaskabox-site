import {withAdmin,sb,json,readJson,httpError} from '../_lib/auth.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const onRequestPost=withAdmin(['owner','manager'],async(c,{user})=>{
 const b=await readJson(c.request),order=String(b.order_id||''),amount=Number(b.amount_pkr),
 date=String(b.received_on||''),reference=String(b.reference||'').trim();
 if(!uuid.test(order)||!Number.isSafeInteger(amount)||amount<=0||!/^\d{4}-\d{2}-\d{2}$/.test(date)
  ||reference.length<3||reference.length>120)httpError('Enter order, positive amount, date and receipt reference',400,'invalid_receipt');
 const r=await sb(c,'/rest/v1/rpc/admin_courier_record_receipt',{method:'POST',
 body:{p_actor:user.id,p_order:order,p_amount:amount,p_received_on:date,p_reference:reference}});
 if(r.error)httpError(r.error,r.status||409,'receipt_rejected');
 return json(r,201);
});
