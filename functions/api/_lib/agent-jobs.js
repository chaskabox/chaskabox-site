/* ChaskaBox AI agents — shared contract, disabled by default. */
import {rpc} from './db.js';
const namePattern=/^[a-z][a-z0-9_]{2,39}$/;
const hashPattern=/^[0-9a-f]{64}$/;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function invalid(code='AGENT_INPUT_INVALID'){const e=new Error(code);e.code=code;throw e;}
export function validAgent(name){return typeof name==='string'&&namePattern.test(name);}
export function validHash(hash){return typeof hash==='string'&&hashPattern.test(hash);}
export function publicJobPayload(input={}){
 if(input===null||typeof input!=='object'||Array.isArray(input))invalid();
 const keys=Object.keys(input),out={};
 if(keys.length>6)invalid();
 for(const key of keys){
  const v=input[key];
  if(key==='product_id'&&Number.isSafeInteger(v)&&v>0)out[key]=v;
  else if(key==='locale'&&['en','ur','roman-ur'].includes(v))out[key]=v;
  else if(key==='context_hash'&&validHash(v))out[key]=v;
  else if(key==='period_days'&&Number.isInteger(v)&&v>=1&&v<=90)out[key]=v;
  else invalid('AGENT_PAYLOAD_PRIVATE_OR_UNSUPPORTED');
 }
 return out;
}
export async function enqueueAgent(context,{agent,dedupeHash,payload={}}){
 if(context?.env?.AGENTS_ENABLED!=='true')invalid('AGENTS_DISABLED');
 if(!validAgent(agent)||!validHash(dedupeHash))invalid();
 return rpc(context.env,'agent_enqueue',{p_agent:agent,p_dedupe_hash:dedupeHash,p_payload:publicJobPayload(payload)});
}
export async function claimAgent(context,{agent,workerId,leaseSeconds=120}){
 if(context?.env?.AGENTS_ENABLED!=='true')invalid('AGENTS_DISABLED');
 if(!validAgent(agent)||typeof workerId!=='string'||!uuidPattern.test(workerId)||!Number.isInteger(leaseSeconds)||leaseSeconds<30||leaseSeconds>300)invalid();
 return rpc(context.env,'agent_claim',{p_agent:agent,p_worker:workerId,p_lease_seconds:leaseSeconds});
}
