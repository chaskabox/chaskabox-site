import {withAdmin,sb,json,httpError,readJson} from '../_lib/auth.js';

// Owner and live AAL2 MFA enforced by withAdmin. No direct private-schema exposure.
// All calls use server-side service-role RPCs with strict grants and transactional audit.
const rpc=(ctx,name,body={})=>sb(ctx,'/rest/v1/rpc/'+name,{method:'POST',body});
const noStore={'Cache-Control':'no-store'};

export const onRequestGet=withAdmin(['owner'],async context=>{
  const state=await rpc(context,'agent_phase12_state');
  return json(state,200,noStore);
});

export const onRequestPost=withAdmin(['owner'],async(context,{user})=>{
  const body=await readJson(context.request,1024);
  if(body.action==='activate'){
    if(Object.keys(body).sort().join(',')!=='action,agent,enabled' ||
       !['orders','inventory','security','backups','support','seo','analytics'].includes(body.agent) ||
       typeof body.enabled!=='boolean') httpError('Invalid safe observation control',400);
    const result=await rpc(context,'agent_phase12_activate',{
      p_actor:user.id,p_agent:body.agent,p_enabled:body.enabled
    });
    return json({activation:result,mode:'observe_only',no_external_actions:true},200,noStore);
  }
  if(body.action==='scan'){
    if(Object.keys(body).length!==1)httpError('Unsupported scan parameters',400);
    // Read-only metrics; scheduled receipts remain the only persisted observations.
    const data=await rpc(context,'agent_phase12_scan');
    return json({scan:data,saved:false,notifications_sent:false},200,noStore);
  }
  httpError('Unsupported agent operation',400);
});
