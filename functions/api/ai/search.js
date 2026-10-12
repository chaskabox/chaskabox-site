import {sbRequest} from '../_lib/db.js';
import {takeToken,getClientIp} from '../_lib/rate-limit.js';
import {containsSensitiveText} from '../_lib/ai.js';
import {cleanQuery,searchCatalogue,publicSettings} from '../_lib/catalogue-search.js';
import {readJson,json} from '../admin/_lib/auth.js';
export async function onRequestPost(context){
 try{
  const rate=await takeToken('ai-search:'+getClientIp(context.request),context.env,{capacity:8,perMinute:6});
  if(!rate.allowed)return json({error:'Search limit reached',code:'rate_limited'},429,{'Retry-After':String(rate.retryAfterSec)});
  const body=await readJson(context.request,4096),query=cleanQuery(body.query);
  if(query.length<2)return json({error:'Search query is too short'},400);
  if(containsSensitiveText(query))return json({mode:'safe_redirect',products:[],track_url:'/track-order.html',message:'Use Track Order or support for private details.'});
  let cfg={};try{cfg=await publicSettings(context.env);}catch{/* Deterministic public catalogue remains available. */}
  const result=await searchCatalogue(context,query,cfg);
  let analytics='saved';
  try{await sbRequest(context.env,'/search_logs',{method:'POST',body:{query,results_count:result.products.length},prefer:'return=minimal'});}catch{analytics='unavailable';}
  return json({query,...result,analytics},200,{'Cache-Control':'no-store'});
 }catch(e){if(e instanceof Response)return e;return json({error:'Search is temporarily unavailable',code:'search_unavailable'},503);}
}
