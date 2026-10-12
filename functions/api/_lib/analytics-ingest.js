import {readJson,json,httpError} from '../admin/_lib/auth.js';
import {sbRequest} from './db.js';
import {takeToken,getClientIp} from './rate-limit.js';
const spec={
 funnel_events:{event:['product_view','add_to_cart','cart_viewed','checkout_started'],product_id:'id',session_id:64},
 filter_events:{filter_type:['category','brand','price','pack','badge','sort','search'],filter_value:160,page:160,session_id:64},
 box_events:{action:['view','add_to_cart'],box_id:'id',box_name:160,session_id:64},
 wishlist_events:{action:['add','remove','to_cart'],product_id:'required_id',session_id:64},
 search_logs:{query:200,clicked_product_id:'required_id',session_id:64}
};
export function analyticsEvent(table,body){
 const fields=spec[table];if(!fields)throw new Error('Unknown analytics table');const out={};
 for(const [key,rule] of Object.entries(fields)){
  const v=body[key];
  if(Array.isArray(rule)){if(!rule.includes(v))httpError('Invalid '+key,400);out[key]=v;}
  else if(rule==='id'||rule==='required_id'){if(v==null&&rule==='id'){out[key]=null;continue;}if(!Number.isSafeInteger(v)||v<1)httpError('Invalid product id',400);out[key]=v;}
  else {if(v==null){out[key]=null;continue;}if(typeof v!=='string'||v.length>rule||/[\u0000-\u001f]/.test(v))httpError('Invalid '+key,400);out[key]=v.trim().replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g,'[email]').replace(/\b(?:\+92|03)\d{9,11}\b/g,'[phone]');}
 }
 if(table==='search_logs')out.results_count=0;
 return out;
}
export async function ingestAnalytics(context,table){
 try{
  const rl=await takeToken('analytics:'+getClientIp(context.request),context.env,{capacity:30,perMinute:30});
  if(!rl.allowed)return json({error:{code:'RATE_LIMITED',message:'Event rate exceeded'}},429);
  const event=analyticsEvent(table,await readJson(context.request,4096));
  const raw=new TextEncoder().encode(table+getClientIp(context.request)+JSON.stringify(event));
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const once=await takeToken('analytics-once:'+digest,context.env,{capacity:1,perMinute:6});
  if(!once.allowed)return json({logged:false,deduplicated:true});
  await sbRequest(context.env,'/'+table,{method:'POST',body:event,prefer:'return=minimal'});
  return json({logged:true},200,{'Cache-Control':'no-store'});
 }catch(e){if(e instanceof Response)return e;return json({error:{code:'ANALYTICS_UNAVAILABLE',message:'Event could not be saved'}},503);}
}
