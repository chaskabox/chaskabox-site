/* Single inference boundary. Admission uses an atomic private ledger.
 * Estimates do not measure Cloudflare's account-wide bill/free allocation.
 */
import { rpc } from './db.js';
const encoder = new TextEncoder();
export const DEFAULT_TEXT_MODEL = '@cf/meta/llama-3.2-3b-instruct';
export const DEFAULT_EMBEDDING_MODEL = '@cf/qwen/qwen3-embedding-0.6b';
export const IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const TEXT_RATES = {
  [DEFAULT_TEXT_MODEL]: [4625, 30475],
  '@cf/qwen/qwen3-30b-a3b-fp8': [4625, 30475],
  '@cf/meta/llama-3.1-8b-instruct-fp8-fast': [4119, 34868],
};
function failure(code, message, status = 503) { const e = new Error(message); e.code = code; e.status = status; return e; }
export function aiAvailable(context) { return context?.env?.AI_ENABLED === 'true' && typeof context?.env?.AI?.run === 'function'; }
export function selectedTextModel(context) { return Object.hasOwn(TEXT_RATES, context?.env?.AI_TEXT_MODEL) ? context.env.AI_TEXT_MODEL : DEFAULT_TEXT_MODEL; }
export function selectedEmbeddingModel() { return DEFAULT_EMBEDDING_MODEL; }
export function containsSensitiveText(text) {
  return /[\w.+%-]+@[\w.-]+\.[a-z]{2,}/i.test(text) || /(?:\+?92|0)3\d{2}[\s-]?\d{7}\b/.test(text)
    || /\b(?:password|passcode|otp|cvv|cvc|cnic|iban|api.?key|service.?role|account\s*(?:number|no)|transaction\s*(?:reference|ref))\b/i.test(text)
    || /\bCB[-\s]?\d{4,}[a-z0-9-]*\b/i.test(text) || /\b\d{12,19}\b/.test(text);
}
export function extractText(result) {
  const candidates = [result, result?.response, result?.result?.response, result?.choices?.[0]?.message?.content, result?.result?.choices?.[0]?.message?.content, result?.text];
  for (const value of candidates) if (typeof value === 'string' && value.trim()) return value.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  return '';
}
function usageFrom(result) {
  const u = result?.usage || result?.result?.usage || {}, safe = {};
  for (const k of ['prompt_tokens','completion_tokens','total_tokens']) if (Number.isSafeInteger(u[k]) && u[k] >= 0 && u[k] <= 1000000) safe[k] = u[k];
  return safe;
}
async function digest(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function inference(context, { feature, model, input, reserve, actorId = null, ttl = 600, convert, estimate }) {
  if (!aiAvailable(context)) throw failure('AI_DISABLED', 'AI is disabled or its binding is unavailable.');
  const state = await rpc(context.env, 'ai_budget_state', {});
  if (!state?.enabled || state.features?.[feature] !== true) throw failure('AI_DISABLED', 'This AI feature is paused.');
  const key = await digest(JSON.stringify([actorId,feature,model,input]));
  if (feature !== 'image') {
    const cached = await rpc(context.env, 'ai_cache_get', { p_key:key });
    if (cached) return { ...cached, cached:true, budget:state };
  }
  const id = crypto.randomUUID(), configCap = Number(context.env.AI_DAILY_BUDGET_NEURONS || 8000);
  const budget = Number.isInteger(configCap) && configCap >= 1 && configCap <= 8000 ? configCap : 8000;
  const admission = await rpc(context.env, 'ai_budget_reserve', { p_id:id, p_actor:actorId, p_feature:feature, p_model:model, p_units:reserve, p_budget:budget });
  if (!admission?.allowed) throw failure(admission?.reason === 'budget_exhausted' ? 'AI_BUDGET_EXHAUSTED' : admission?.reason === 'image_rate_limited' ? 'AI_IMAGE_RATE_LIMIT' : 'AI_DISABLED', 'AI is paused or its app budget has been reached.', 429);
  let raw, converted, usage = {}, finished;
  try {
    let timer;
    try { raw = await Promise.race([context.env.AI.run(model, input), new Promise((_, reject) => { timer = setTimeout(() => reject(failure('AI_TIMEOUT', 'AI did not respond in time.')), 20000); })]); }
    finally { clearTimeout(timer); }
    usage = usageFrom(raw);
    converted = await convert(raw);
    finished = await rpc(context.env, 'ai_budget_finish', { p_id:id, p_success:true, p_usage:usage, p_estimate:estimate(usage,converted) });
  } catch (error) {
    // Unknown/failed outcomes retain the reservation instead of refunding it.
    try { await rpc(context.env, 'ai_budget_finish', { p_id:id, p_success:false, p_usage:usage, p_estimate:null }); } catch { /* Reservation still counts. */ }
    throw error;
  }
  const result = { ...converted, model, cached:false };
  if (feature !== 'image') {
    try { await rpc(context.env, 'ai_cache_put', { p_key:key, p_result:result, p_seconds:ttl }); } catch { /* Cache is optional after accounted success. */ }
  }
  return { ...result, budget:finished };
}
export async function runTextAI(context, { system = '', user = '', maxTokens = 500, temperature = .35, model, actorId = null } = {}) {
  if (typeof system !== 'string' || typeof user !== 'string' || encoder.encode(system).length > 8000 || encoder.encode(user).length > 12000) throw failure('AI_INPUT_INVALID', 'AI text input is too large.', 422);
  if (containsSensitiveText(user)) throw failure('AI_PRIVATE_INPUT', 'Remove private identifiers from AI input.', 422);
  const selected = Object.hasOwn(TEXT_RATES, model) ? model : selectedTextModel(context), rates = TEXT_RATES[selected];
  const limit = Math.max(32, Math.min(600, Number(maxTokens) || 500));
  // UTF-8 bytes conservatively bound input tokens; include protocol overhead.
  const upper = encoder.encode(system + user).length + 512;
  const reserve = Math.ceil((upper*rates[0] + limit*rates[1])/1000000*1.25)+2;
  return inference(context, { feature:'text', model:selected, actorId, reserve,
    input:{messages:[{role:'system',content:system},{role:'user',content:user}],max_tokens:limit,temperature:Math.max(0,Math.min(1,Number(temperature)||.35))},
    convert:raw => { const text=extractText(raw); if(!text || encoder.encode(text).length>10000 || containsSensitiveText(text))throw failure('AI_RESPONSE_INVALID','AI returned an empty, oversized or private response.',422); return {text}; },
    estimate:u => Number.isInteger(u.prompt_tokens) && Number.isInteger(u.completion_tokens) ? Math.ceil((u.prompt_tokens*rates[0]+u.completion_tokens*rates[1])/1000000*1.25)+2 : null });
}
export function normalizeEmbeddingResult(result, count) {
  let data=result?.data ?? result?.result?.data; const shape=result?.shape ?? result?.result?.shape;
  if(!Array.isArray(data))throw failure('AI_EMBEDDING_INVALID','Missing embedding data.');
  if(!Array.isArray(data[0])) {
    if(count===1)data=[data];
    else if(shape?.[0]===count && shape?.[1]===1024 && data.length===count*1024)data=Array.from({length:count},(_,i)=>data.slice(i*1024,(i+1)*1024));
  }
  if(data.length!==count || data.some(v=>!Array.isArray(v)||v.length!==1024||v.some(n=>typeof n!=='number'||!Number.isFinite(n))))throw failure('AI_EMBEDDING_INVALID','Embedding count/dimensions do not match the pinned index.');
  return data;
}
export async function runEmbeddings(context, texts, { actorId = null } = {}) {
  const list=Array.isArray(texts)?texts:[texts];
  if(!list.length || list.length>12 || list.some(t=>typeof t!=='string'||!t.trim()||t.length>6000||containsSensitiveText(t)))throw failure('AI_INPUT_INVALID','Invalid public embedding batch.',422);
  const bytes=list.reduce((n,t)=>n+encoder.encode(t).length+128,0);
  return inference(context, {feature:'embedding',model:DEFAULT_EMBEDDING_MODEL,actorId,ttl:3600,reserve:Math.ceil(bytes*1075/1000000*1.25)+2,input:{text:list},
    convert:raw=>({embeddings:normalizeEmbeddingResult(raw,list.length)}),
    estimate:u=>Number.isInteger(u.prompt_tokens)?Math.ceil(u.prompt_tokens*1075/1000000*1.25)+2:null});
}
export function vectorLiteral(values) {
  if(!Array.isArray(values)||values.length!==1024||values.some(n=>typeof n!=='number'||!Number.isFinite(n)))throw failure('AI_EMBEDDING_INVALID','Expected a finite 1024-dimensional vector.',422);
  return '['+values.map(n=>Number(n.toFixed(8))).join(',')+']';
}
async function readBytes(value, cap) {
  if(value instanceof Response)return readBytes(value.body,cap);
  if(value?.getReader) {
    const reader=value.getReader(),parts=[];let length=0;
    try {for(;;){const{done,value:part}=await reader.read();if(done)break;length+=part.byteLength;if(length>cap){await reader.cancel();throw failure('AI_IMAGE_INVALID','Image exceeds the size limit.',422);}parts.push(part);}}
    finally{reader.releaseLock();}
    const out=new Uint8Array(length);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.byteLength;}return out;
  }
  if(value instanceof ArrayBuffer)return new Uint8Array(value);
  if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  const base64=value?.image ?? value?.result?.image ?? (typeof value==='string'?value:null);
  if(typeof base64==='string' && base64.length<=Math.ceil(cap/3)*4+100) {
    const raw=base64.replace(/^data:image\/(?:png|jpeg|webp);base64,/,'');
    if(!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))throw failure('AI_IMAGE_INVALID','Invalid image encoding.',422);
    try{return Uint8Array.from(atob(raw),c=>c.charCodeAt(0));}catch{throw failure('AI_IMAGE_INVALID','Invalid image encoding.',422);}
  }
  throw failure('AI_IMAGE_INVALID','Unsupported image response.',422);
}
export async function imageOutput(value) {
  const bytes=await readBytes(value,5*1024*1024);
  if(!bytes.length||bytes.length>5*1024*1024)throw failure('AI_IMAGE_INVALID','Empty/oversized image.',422);
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let mime,width,height;
  if(bytes.length>=45 && [137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)){
    mime='image/png';let pos=8,hasData=false,ended=false;
    while(pos+12<=bytes.length){
      const size=view.getUint32(pos),kind=String.fromCharCode(...bytes.slice(pos+4,pos+8));
      if(pos+12+size>bytes.length)break;
      if(pos===8){if(kind!=='IHDR'||size!==13)break;width=view.getUint32(16);height=view.getUint32(20);}
      if(kind==='IDAT'&&size>0)hasData=true;
      pos+=12+size;
      if(kind==='IEND'&&size===0){ended=pos===bytes.length;break;}
    }
    if(!hasData||!ended)throw failure('AI_IMAGE_INVALID','Truncated image data.',422);
  }
  else if(bytes[0]===255 && bytes[1]===216) {
    if(bytes.at(-2)!==255||bytes.at(-1)!==217)throw failure('AI_IMAGE_INVALID','Truncated image data.',422);
    mime='image/jpeg';let pos=2;
    while(pos+4<bytes.length){if(bytes[pos++]!==255)break;const marker=bytes[pos++];if(marker===216||marker===217)continue;const len=view.getUint16(pos);if(len<2||pos+len>bytes.length)break;if([192,193,194].includes(marker)&&len>=8){height=view.getUint16(pos+3);width=view.getUint16(pos+5);break;}pos+=len;}
  } else if(bytes.length>=30 && String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP') {
    if(view.getUint32(4,true)+8!==bytes.length)throw failure('AI_IMAGE_INVALID','Truncated image data.',422);
    mime='image/webp';const kind=String.fromCharCode(...bytes.slice(12,16));
    if(kind==='VP8X'){width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);}
    else if(kind==='VP8 ' && bytes[23]===157 && bytes[24]===1 && bytes[25]===42){width=view.getUint16(26,true)&16383;height=view.getUint16(28,true)&16383;}
    else if(kind==='VP8L' && bytes[20]===47){const bits=view.getUint32(21,true);width=1+(bits&16383);height=1+((bits>>>14)&16383);}
  }
  if(!mime||!width||!height||width>4096||height>4096)throw failure('AI_IMAGE_INVALID','Invalid image MIME/dimensions.',422);
  const declared=value instanceof Response?'data:'+value.headers.get('content-type')+';':typeof value==='string'?value:value?.image;
  if(declared?.startsWith('data:')&&!declared.startsWith('data:'+mime+';'))throw failure('AI_IMAGE_INVALID','Image MIME does not match its bytes.',422);
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return {image_url:'data:'+mime+';base64,'+btoa(binary),mime,width,height,bytes:bytes.length};
}
export async function runImageAI(context, { prompt, actorId } = {}) {
  if(typeof prompt!=='string'||prompt.length<10||prompt.length>1000||containsSensitiveText(prompt))throw failure('AI_INPUT_INVALID','Use a short decorative prompt without private information.',422);
  // Reserve for the largest accepted image (64 tiles), not only a usual 1024px result.
  return inference(context,{feature:'image',model:IMAGE_MODEL,actorId,input:{prompt,steps:4},reserve:434,
    convert:imageOutput,estimate:(_,image)=>Math.ceil((Math.ceil(image.width/512)*Math.ceil(image.height/512)*4.8+4*9.6)*1.25)+2});
}
