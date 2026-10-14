import {withAdmin,sb,json} from '../_lib/auth.js';

// Owner-only, existing Supabase Auth + live MFA, read-only service-role RPC.
// No agent actions, status updates or external side effects are exposed.
export const onRequestGet=withAdmin(['owner'],async (context)=>{
 const state=await sb(context,'/rest/v1/rpc/agent_m01_health',{method:'POST',body:{}});
 return json(state,200,{'Cache-Control':'no-store'});
});
