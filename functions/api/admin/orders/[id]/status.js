import { withAdmin, json, readJson } from '../../_lib/auth.js';
import { mutateOrder } from '../../_lib/order-mutate.js';
export const onRequestPatch=withAdmin(['owner','manager','fulfilment'],async(context,{user})=>{
 const body=await readJson(context.request);const next=String(body.fulfilment_status||'').trim();
 const result=await mutateOrder(context,user,{action:'status',value:next,note:String(body.cancel_reason||'').trim(),expected:body.expected_updated_at||null});
 const order=result.order; // Database status-event trigger enqueues the notification atomically.
 return json({order,transition:{from:result.from,to:next}});
});
