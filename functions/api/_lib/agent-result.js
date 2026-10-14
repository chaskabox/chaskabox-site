/* M01: completion contract. Only opaque artifact references, never raw AI text. */
import {rpc} from './db.js';
import {validAgent,publicJobPayload} from './agent-jobs.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(){const e=new Error('AGENT_COMPLETION_INVALID');e.code='AGENT_COMPLETION_INVALID';throw e;}
export function safeAgentResult(result=null){
 if(result===null)return null;
 if(!result||typeof result!=='object'||Array.isArray(result)||Object.keys(result).length>2)fail();
 const out={};
 for(const [key,value] of Object.entries(result)){
  if(key==='artifact_ref'&&typeof value==='string'&&UUID.test(value))out[key]=value;
  else if(key==='summary_code'&&typeof value==='string'&&/^[a-z][a-z0-9_]{1,39}$/.test(value))out[key]=value;
  else fail();
 }
 return out;
}
export async function agentDedupeHash(agent,payload,window='once'){
 if(!validAgent(agent)||typeof window!=='string'||!/^(once|[0-9]{4}-[0-9]{2}-[0-9]{2})$/.test(window))fail();
 const bytes=new TextEncoder().encode(JSON.stringify([agent,publicJobPayload(payload),window]));
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function finishAgent(context,{jobId,leaseToken,success,result=null,errorCode=null}){
 if(context?.env?.AGENTS_ENABLED!=='true')fail();
 if(typeof jobId!=='string'||!UUID.test(jobId)||typeof leaseToken!=='string'||!UUID.test(leaseToken)||typeof success!=='boolean')fail();
 if(success&&errorCode!==null)fail();
 if(!success&&(result!==null||(errorCode!==null&&(typeof errorCode!=='string'||!/^[A-Z][A-Z0-9_]{1,39}$/.test(errorCode)))))fail();
 return rpc(context.env,'agent_finish',{p_id:jobId,p_lease_token:leaseToken,p_success:success,
  p_result:success?safeAgentResult(result):null,p_error_code:errorCode});
}
