import { withAdmin, json, readJson } from '../../../_lib/auth.js';
import { mutateOrder } from '../../../_lib/order-mutate.js';
import { enqueueCustomerNotification } from '../../../_lib/customer-notify.js';
export const onRequestPost=withAdmin(['owner','manager','fulfilment'],async(context,{user})=>{
 const body=await readJson(context.request);const decision=String(body.decision||'').trim().toLowerCase();
 const result=await mutateOrder(context,user,{action:'payment',value:decision,note:String(body.note||''),expected:body.expected_updated_at||null});
 const order=result.order,base=String(context.env.PUBLIC_BASE_URL||'https://chaskabox.online').replace(/\/+$/,'');
 await enqueueCustomerNotification(context,order,'payment_status',order.payment_status,`ChaskaBox payment update\nOrder: ${order.order_number}\nPayment ${decision}\nTrack: ${base}/track-order.html?order=${encodeURIComponent(order.order_number)}`);
 return json({order});
});
