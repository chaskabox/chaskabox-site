/**
 * M01 AI-agent safety contract. Deterministic checks before any DB call.
 * Never accept secrets or customer/order PII in an agent job metadata field.
 * These guards are additional to the service-role-only PostgreSQL RPCs.
 */
export const AGENTS=Object.freeze([
 'orders','inventory','security','backups','support','seo','marketing','analytics'
]);
export const OBSERVE_ACTIONS=Object.freeze(['scan','summarize','draft']);
const METADATA_KEYS=new Set([
 'metric','count','result_count','severity','window','source',
 'category','status','summary','subject_hash','model','age_minutes'
]);
const DEDUPE=/^[a-z0-9][a-z0-9:._-]{15,199}$/;
const LEAK=/@|(?:\+?\d[\s().-]*){10,}|bearer\s|password|api[_-]?key|secret|one.time.password/i;

export function prepareAgentJob({agentKey,action,dedupeKey,metadata={}}={}){
 if(!AGENTS.includes(agentKey)) throw new TypeError('Unknown agent');
 if(!OBSERVE_ACTIONS.includes(action)) throw new TypeError('M01 does not allow side-effect actions');
 if(typeof dedupeKey!=='string'||!DEDUPE.test(dedupeKey))
  throw new TypeError('Dedupe key must be an opaque stable identifier');
 if(!metadata||Array.isArray(metadata)||typeof metadata!=='object')
  throw new TypeError('Metadata object required');
 const safe=Object.create(null);
 for(const [key,value] of Object.entries(metadata)){
  if(!METADATA_KEYS.has(key)) throw new TypeError('Unsupported metadata field');
  if(value===null||!['string','number','boolean'].includes(typeof value))
   throw new TypeError('Nested or null metadata is not accepted');
  if(typeof value==='string'&&(value.length>180||(key!=='subject_hash'&&LEAK.test(value))))
   throw new TypeError('Possible private information in metadata');
  if(typeof value==='number'&&!Number.isFinite(value))
   throw new TypeError('Non-finite metadata');
  if(key==='subject_hash' && !/^[a-f0-9]{64}$/.test(value))
   throw new TypeError('Only SHA-256 hex subject hashes are allowed');
  safe[key]=value;
 }
 if(JSON.stringify(safe).length>1500) throw new TypeError('Metadata exceeds limit');
 return {p_agent:agentKey,p_action:action,p_dedupe_key:dedupeKey,p_metadata:{...safe}};
}

/** Deny-by-default: every agent must be explicitly enabled through a reviewed owner flow. */
export function shouldRunAgent(settings,agentKey){
 return AGENTS.includes(agentKey) && settings?.agent_key===agentKey
  && settings?.enabled===true && settings?.mode==='observe';
}
