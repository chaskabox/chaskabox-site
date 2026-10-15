import { sb, json, httpError, readJson } from './admin/_lib/auth.js';
import { takeToken,getClientIp } from './_lib/rate-limit.js';
export async function onRequestPost(context){
 try {
  const rl=await takeToken('quote:'+getClientIp(context.request),context.env,{capacity:20,perMinute:20});
  if(!rl.allowed)return json({error:{code:'RATE_LIMITED',message:'Please wait before updating your quote.'}},429);
  const b=await readJson(context.request,16384);
  if(!Array.isArray(b.items)||b.items.length<1||b.items.length>50||b.items.some(i=>!Number.isSafeInteger(i.product_id)||i.product_id<1||!Number.isInteger(i.qty)||i.qty<1||i.qty>99))httpError('Invalid items',400);
  const city=String(b.customer?.city||'').trim(),country=String(b.customer?.country||'Pakistan').trim();
  if(!city||city.length<2||city.length>100||/[\u0000-\u001f\u007f0-9<>]/.test(city))httpError('Enter a valid Pakistani delivery city.',400);
  if(country.toLowerCase()!=='pakistan')httpError('Delivery is currently available within Pakistan.',400);
  const quote=await sb(context,'/rest/v1/rpc/checkout_quote',{method:'POST',body:{p_order:{items:b.items,payment_method:b.payment_method,coupon_code:b.coupon_code||null,customer:{city,country}}}});
  return json({quote},200,{'Cache-Control':'no-store'});
 }catch(e){if(e instanceof Response)return e;return json({error:{code:'QUOTE_UNAVAILABLE',message:'Could not verify your quote. Check the coupon, city and bag, then retry.'}},503);}
}
