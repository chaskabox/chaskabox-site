import {takeToken,getClientIp} from '../_lib/rate-limit.js';
import {runTextAI,aiAvailable,containsSensitiveText} from '../_lib/ai.js';
import {cleanQuery,searchCatalogue,publicSettings} from '../_lib/catalogue-search.js';
import {readJson,json} from '../admin/_lib/auth.js';
export function groundedAnswer(question,products,cfg){
 if(/ingredient|allerg|halal|gluten|vegan|sugar.?free|organic|certif|expiry|expire|manufactur/i.test(question))return 'Is product ki ingredients, allergens, certification ya expiry ki confirmed detail yahan available nahin. Pack ki asli photo dekhein ya support se confirm karein.';
 if(/delivery|shipping|courier|fee|charges|kitne din/i.test(question))return 'Delivery fee aapke city, payment method aur coupon ke mutabiq checkout par confirm hoti hai.'+(typeof cfg.delivery_estimate==='string'?' Store estimate: '+cfg.delivery_estimate+'.':'');
 if(/payment|cod|jazzcash|bank/i.test(question)){
  const methods=[cfg.cod_enabled===true?'COD':null,cfg.jazzcash_enabled===true?'JazzCash':null,cfg.bank_transfer_enabled===true?'bank transfer':null].filter(Boolean);
  return methods.length?'Available payment methods: '+methods.join(', ')+'. Final total checkout par confirm karein.':'Available payment methods checkout par dekhein.';
 }
 return products.length?'Aapke search aur budget ke mutabiq: '+products.slice(0,3).map(p=>p.name+' — PKR '+p.price).join('; ')+'. Pack aur details product page par dekhein.':'Is search aur budget ka relevant match nahin mila. Brand, product ya category ka naam try karein.';
}
export function validAssistantAnswer(text,products){
 if(typeof text!=='string'||!text.trim()||text.split(/\s+/).length>90||containsSensitiveText(text))return false;
 if(/guarantee|guaranteed|bestseller|best.seller|allergen.free|certified|halal|sugar.free|organic|authentic|original|same.day|free.delivery|discount|refund|payment.verified/i.test(text))return false;
 const sentences=text.toLowerCase().split(/[!?\n]+|\.\s+/).map(s=>s.trim()).filter(s=>s.length>15);
 if(new Set(sentences).size!==sentences.length)return false;
 for(const m of text.matchAll(/(?:pkr|rs\.?|rupees?)\s*([\d,]+)/gi))if(!products.some(p=>Number(p.price)===Number(m[1].replace(/,/g,''))))return false;
 for(const p of products){
  const at=text.toLowerCase().indexOf(p.name.toLowerCase());if(at<0)continue;
  const following=text.slice(at+p.name.length).split(/[;\n]/)[0];
  const quote=following.match(/(?:pkr|rs\.?)\s*([\d,]+)/i);
  if(quote&&Number(quote[1].replace(/,/g,''))!==Number(p.price))return false;
 }
 return true;
}
export async function onRequestPost(context){
 try{
  const rate=await takeToken('ai-assistant:'+getClientIp(context.request),context.env,{capacity:6,perMinute:4});
  if(!rate.allowed)return json({error:'Chaska Help limit reached',code:'rate_limited'},429,{'Retry-After':String(rate.retryAfterSec)});
  const body=await readJson(context.request,4096),question=cleanQuery(body.question);
  if(question.length<2)return json({error:'Question is too short'},400);
  if(containsSensitiveText(question)||/track|order.status|mera.?order|mere.?order|my.?order|verify.?payment|account.?balance/i.test(question))return json({mode:'safe_redirect',answer:'Private order/payment details ke liye Track Order ya official support use karein.',products:[],track_url:'/track-order.html'});
  let cfg={};try{cfg=await publicSettings(context.env);}catch{}
  const found=await searchCatalogue(context,question,cfg),answer=groundedAnswer(question,found.products,cfg);
  const safe={mode:'deterministic_fallback',answer,products:found.products.slice(0,5)};
  // Factual/payment/allergen questions stay in the deterministic confirmed flow.
  if(cfg.ai_customer_assistant_enabled!==true||!aiAvailable(context)||!found.products.length||/delivery|shipping|courier|fee|charges|payment|cod|bank|jazzcash|ingredient|allerg|halal|certif|expiry|expire|gluten|vegan|sugar|organic/i.test(question))return json(safe);
  try{
   const result=await runTextAI(context,{system:'Paraphrase the supplied shopping answer in friendly Roman Urdu, under 90 words. Use only the supplied exact names and prices. Do not add guarantees, availability, ingredients, delivery promises, discounts or new facts.',user:JSON.stringify({question,confirmed_answer:answer}),maxTokens:180,temperature:.15});
   if(!validAssistantAnswer(result.text,found.products))return json(safe);
   return json({...safe,mode:'workers_ai',answer:result.text,model:result.model});
  }catch{return json(safe);}
 }catch(e){if(e instanceof Response)return e;return json({error:'Chaska Help is temporarily unavailable',code:'assistant_unavailable'},503);}
}
