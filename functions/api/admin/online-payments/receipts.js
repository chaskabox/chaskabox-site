import {withAdmin,sb,json,readJson,httpError} from '../_lib/auth.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const onRequestPost=withAdmin(['owner','manager'],async(c,{user})=>{
 const b=await readJson(c.request),order=String(b.order_id||''),
 amount=Number(b.amount_pkr),fee=Number(b.processing_fee_pkr),day=String(b.received_on||''),
 ref=String(b.reference||'').trim();
 if(!uuid.test(order)||!Number.isSafeInteger(amount)||amount<1||!Number.isSafeInteger(fee)||fee<0||
 !/^\d{4}-\d{2}-\d{2}$/.test(day)||ref.length<3||ref.length>120)
  httpError('Order, positive payout, fee, date and bank/wallet reference required',400,'invalid_online_receipt');
 const r=await sb(c,'/rest/v1/rpc/admin_online_payment_record_receipt',{method:'POST',
  body:{p_actor:user.id,p_order:order,p_amount:amount,p_fee:fee,p_received_on:day,p_reference:ref}});
 if(r?.error)httpError(r.error,r.status||409,'payment_receipt_rejected');
 return json(r,201);
});
