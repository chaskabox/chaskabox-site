import {withAdmin,sb,json,readJson,httpError} from '../../_lib/auth.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const onRequestPost=withAdmin(['owner','manager'],async(context,{user})=>{
 const b=await readJson(context.request),order=String(context.params.id||'');
 const amount=b.amount_pkr,channel=String(b.channel||''),receivedOn=String(b.received_on||''),
  reference=String(b.reference||'').trim();
 if(!uuid.test(order)||!Number.isSafeInteger(amount)||amount<1||!['jazzcash','bank_transfer'].includes(channel)||
 !/^\d{4}-\d{2}-\d{2}$/.test(receivedOn)||reference.length<3||reference.length>120)
  httpError('Verified amount, JazzCash/bank channel, date and payment statement reference required',400,'invalid_cod_advance');
 const result=await sb(context,'/rest/v1/rpc/admin_cod_advance_record',{method:'POST',body:{
  p_actor:user.id,p_order:order,p_amount:amount,p_channel:channel,p_reference:reference,p_received_on:receivedOn
 }});
 if(result?.error)httpError(result.error,result.status||409,'cod_advance_not_verified');
 return json({advance:result},201,{'Cache-Control':'no-store'});
});
