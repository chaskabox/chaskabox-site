import {withAdmin,sb,json} from '../_lib/auth.js';
import {parseRange,callRpc} from './_lib/helpers.js';
export const onRequestGet=withAdmin(['owner','manager'],async c=>{
 const {from,to,fromStr,toStr}=parseRange(new URL(c.request.url));const data=await callRpc(c,sb,'analytics_search',{p_from:from.toISOString(),p_to:to.toISOString()});
 data.no_result_rate=data.total_searches?data.total_no_results/data.total_searches:0;data.click_through_rate=data.total_searches?data.total_clicks/data.total_searches:0;
 return json({ok:true,from:fromStr,to:toStr,data});
});
