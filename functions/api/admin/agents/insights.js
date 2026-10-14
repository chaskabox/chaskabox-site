import {withAdmin,sb,json} from '../_lib/auth.js';
import {summarizeM03} from '../_lib/agent-insights.js';

// Only public-safe aggregates; owner with live AAL2 MFA. Does NOT run generative AI.
export const onRequestGet=withAdmin(['owner'],async(context)=>{
 const raw=await sb(context,'/rest/v1/rpc/agent_m03_insight_signals',{method:'POST',body:{}});
 return json({milestone:'M03',activation:'disabled',...summarizeM03(raw)},200,{'Cache-Control':'no-store'});
});
