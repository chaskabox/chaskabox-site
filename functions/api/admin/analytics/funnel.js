import {withAdmin,sb,json} from '../_lib/auth.js';
import {parseRange,callRpc} from './_lib/helpers.js';
export const onRequestGet=withAdmin(['owner','manager'],async c=>{
 const {from,to,fromStr,toStr}=parseRange(new URL(c.request.url));const data=await callRpc(c,sb,'analytics_funnel',{p_from:from.toISOString(),p_to:to.toISOString()});
 return json({ok:true,from:fromStr,to:toStr,data});
});
