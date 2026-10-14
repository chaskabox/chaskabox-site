import {withAdmin,sb,json,httpError,readJson} from '../_lib/auth.js';
const call=(ctx,name,body)=>sb(ctx,'/rest/v1/rpc/'+name,{method:'POST',body});
// Owner+live MFA for reads and mutations; safe deterministic drafts, no publish/send.
export const onRequestGet=withAdmin(['owner'],async context=>
 json({milestone:'M04',mode:'owner_review',delivery_enabled:false,
  drafts:await call(context,'agent_m04_list',{})},200,{'Cache-Control':'no-store'}));
export const onRequestPost=withAdmin(['owner'],async(context,{user})=>{
 const b=await readJson(context.request,2048);
 if(b.operation==='propose'){
  if(!Number.isSafeInteger(b.product_id)||b.product_id<=0||
     !['social','email','whatsapp'].includes(b.channel))httpError('Invalid proposal',400);
  const proposal=await call(context,'agent_m04_propose',{
   p_actor:user.id,p_product_id:b.product_id,p_channel:b.channel
  });
  return json({proposal,published:false,sent:false});
 }
 if(b.operation==='decide'){
  if(typeof b.draft_id!=='string'||!/^[a-f0-9-]{36}$/i.test(b.draft_id)
    ||!['approved','rejected'].includes(b.decision))httpError('Invalid decision',400);
  const decision=await call(context,'agent_m04_decide',{
   p_actor:user.id,p_draft:b.draft_id,p_decision:b.decision
  });
  return json({decision});
 }
 httpError('Unsupported marketing operation',400);
});
