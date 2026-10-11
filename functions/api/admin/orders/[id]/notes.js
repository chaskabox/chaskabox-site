import { withAdmin, json, readJson } from '../../_lib/auth.js';
import { mutateOrder } from '../../_lib/order-mutate.js';
export const onRequestPost=withAdmin(['owner','manager','fulfilment'],async(context,{user})=>{
 const body=await readJson(context.request);
 const result=await mutateOrder(context,user,{action:'note',note:String(body.note||'').trim()});
 return json({order:result.order});
});
