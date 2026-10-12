import { withAdmin, json, readJson } from '../../../_lib/auth.js';
import { mutateOrder } from '../../../_lib/order-mutate.js';
export const onRequestPost=withAdmin(['owner','manager','fulfilment'],async(context,{user})=>{
 const body=await readJson(context.request);const decision=String(body.decision||'').trim().toLowerCase();
 const result=await mutateOrder(context,user,{action:'payment',value:decision,note:String(body.note||''),expected:body.expected_updated_at||null});
 const order=result.order; // Database status-event trigger enqueues the notification atomically.
 return json({order});
});
