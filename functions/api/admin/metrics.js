import {withAdmin,sb,json} from './_lib/auth.js';
export const onRequestGet=withAdmin(['owner','manager'],async context=>{
 const days=Math.min(365,Math.max(1,Number.parseInt(new URL(context.request.url).searchParams.get('days')||'30',10)||30));
 return json(await sb(context,'/rest/v1/rpc/admin_dashboard_metrics',{method:'POST',body:{p_days:days}}));
});
