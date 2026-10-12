/* Decorative drafts only. No external fallback and no product-photo publishing. */
import {withAdmin,json,httpError,readJson,audit,distributedRateLimit} from './_lib/auth.js';
import {runImageAI} from '../_lib/ai.js';
export const onRequestPost=withAdmin(['owner','manager','content'],async(context,{user,role})=>{
 const body=await readJson(context.request,8192);
 if(!['banner','social'].includes(body.type))httpError('Only decorative banner/social drafts are supported. Upload an authentic photo for products.',422,'unsupported_image_type');
 if(body.reference_image!=null)httpError('Reference editing is not supported by the selected model. No image was sent.',422,'unsupported_reference');
 const prompt=typeof body.prompt==='string'?body.prompt.trim():'',style=typeof body.style==='string'?body.style.trim():'';
 if(prompt.length<10||prompt.length>500||style.length>100)httpError('Invalid decorative prompt',400);
 const rate=await distributedRateLimit(context,'ai-image:'+user.id,10,1);
 if(!rate.allowed)return json({error:{code:'RATE_LIMITED',message:'Image draft limit reached.'}},429,{'Retry-After':String(rate.retryAfterSec||60)});
 try{
  const result=await runImageAI(context,{prompt:prompt+(style?', '+style:''),actorId:user.id});
  await audit(context,{actorId:user.id,actorRole:role,action:'ai.image_generated',entityType:'ai',entityId:'draft',after:{type:body.type,model:result.model,mime:result.mime,width:result.width,height:result.height}});
  return json({...result,source:'Cloudflare Workers AI',warnings:['Decorative draft: review and download. Use authentic photos in product listings.']});
 }catch(e){if(e instanceof Response)throw e;httpError(e.message||'AI image draft unavailable',e.status||503,e.code||'ai_unavailable');}
});
