import {withAdmin,json,audit,httpError,distributedRateLimit} from './_lib/auth.js';
import {runTextAI} from '../_lib/ai.js';
export const onRequestPost=withAdmin(['owner','manager','content'],async(context,{user,role})=>{
 const rate=await distributedRateLimit(context,'ai-selftest:'+user.id,2,1);
 if(!rate.allowed)httpError('Wait a minute before repeating the AI check.',429,'rate_limited');
 try{
  const result=await runTextAI(context,{actorId:user.id,system:'Return only the text requested by the user, with no explanation.',user:'Write exactly: ChaskaBox AI is ready.',maxTokens:40,temperature:0.1});
  const passed=/ChaskaBox/i.test(result.text)&&result.text.length<200;
  await audit(context,{actorId:user.id,actorRole:role,action:'ai.selftest',entityType:'ai',entityId:'text',after:{passed,model:result.model,cached:result.cached}});
  return json({passed,response:result.text,model:result.model,cached:result.cached,budget:result.budget,checked_at:new Date().toISOString()});
 }catch(e){if(e instanceof Response)throw e;httpError(e.message||'AI did not respond',e.status||503,e.code||'ai_unavailable');}
});
