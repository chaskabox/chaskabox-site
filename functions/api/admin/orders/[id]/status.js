import { withAdmin, json, readJson } from '../../_lib/auth.js';
import { mutateOrder } from '../../_lib/order-mutate.js';
import { enqueueCustomerNotification } from '../../_lib/customer-notify.js';
import { sendStatusUpdate } from '../../../_lib/notify.js';
export const onRequestPatch=withAdmin(['owner','manager','fulfilment'],async(context,{user})=>{
 const body=await readJson(context.request);const next=String(body.fulfilment_status||'').trim();
 const result=await mutateOrder(context,user,{action:'status',value:next,note:String(body.cancel_reason||'').trim(),expected:body.expected_updated_at||null});
 const order=result.order,base=String(context.env.PUBLIC_BASE_URL||'https://chaskabox.online').replace(/\/+$/,'');
 await enqueueCustomerNotification(context,order,'order_status',next,`ChaskaBox order update\nOrder: ${order.order_number}\nStatus: ${next}\nTrack: ${base}/track-order.html?order=${encodeURIComponent(order.order_number)}`);
 try{await sendStatusUpdate(context.env,order,next);}catch{}
 return json({order,transition:{from:result.from,to:next}});
});
