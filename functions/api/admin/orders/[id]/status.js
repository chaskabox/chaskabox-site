import { withAdmin, json, readJson, sb, httpError } from '../../_lib/auth.js';
import { mutateOrder } from '../../_lib/order-mutate.js';
export const onRequestPatch=withAdmin(['owner','manager','fulfilment'],async(context,{user})=>{
 const body=await readJson(context.request),next=String(body.fulfilment_status||'').trim();
 let result;
 if(next==='dispatched'){
  const courierId=Number(body.courier_id);
  const tracking=String(body.tracking_number||'').trim();
  if(!Number.isSafeInteger(courierId)||courierId<1 || tracking.length>120 ||
     (tracking && !/^[A-Za-z0-9][A-Za-z0-9 /._-]*$/.test(tracking)))
   httpError('Select a courier company and enter a valid tracking number if provided',400,'courier_required');
  result=await sb(context,'/rest/v1/rpc/admin_courier_dispatch',{method:'POST',
   body:{p_actor:user.id,p_order:context.params.id,p_courier:courierId,
    p_tracking:tracking||null,p_expected_updated_at:body.expected_updated_at||null}});
  if(result?.error)httpError(result.error,result.status||409,'courier_dispatch');
 }else{
  result=await mutateOrder(context,user,{action:'status',value:next,note:String(body.cancel_reason||'').trim(),expected:body.expected_updated_at||null});
 }
 return json({order:result.order,transition:{from:result.from,to:next}});
});
