/**
 * POST /api/admin/ai — ChaskaBox Admin Copilot, DRAFT/INSIGHT ONLY.
 * Uses Cloudflare Workers AI binding (context.env.AI), so no provider API key
 * is exposed or required. AI has no write capability.
 */
import {
  withAdmin, json, httpError, readJson, audit, distributedRateLimit, sb,
} from './_lib/auth.js';
import { runTextAI, aiAvailable } from '../_lib/ai.js';

import {TASKS as ALLOWED_TASKS,SENSITIVE_TASKS as SENSITIVE_INSIGHT_TASKS,draftContext,structuredDraft,pageRewrite} from './_lib/ai-contract.js';
import {publicCatalogue,publicSettings} from '../_lib/catalogue-search.js';
import {parseRange} from './analytics/_lib/helpers.js';

const BLOCKLIST = [
  /\bpublish\b/i, /go\s*live/i, /\bdeploy\b/i,
  /change\s+(?:the\s+)?price|set\s+(?:the\s+)?price|update\s+(?:the\s+)?price/i,
  /verify.*payment|payment.*verif|mark.*paid/i,
  /\brefund\b/i, /\bcancel\b.*order|order.*\bcancel/i,
  /\bdelete\b/i, /\bremove\b.*product/i,
  /\brole\b/i, /permission/i, /make.*admin/i, /promote/i,
  /service.?role|secret|api.?key|password|otp/i,
];

const TASK_PROMPTS = {
  page_rewrite: 'Rewrite only the supplied public text concisely. Keep its original language and script: English stays English; Roman Urdu stays in Latin letters. Preserve all facts, numbers and policy. Do not translate into Urdu or Devanagari script. Return only replacement prose with no DRAFT label, quotations or Markdown.',
  brand_description: 'Draft a concise brand description using supplied public products only. Do not invent brand history, origin or certifications.',
  brand_seo: 'Return ONLY JSON with seo_title (max 60 chars) and seo_description (max 155 chars).',
  brand_featured: 'Return ONLY JSON with featured_ids: up to 8 numeric IDs selected only from the supplied brand catalogue sample.',
  brand_faq: 'Return ONLY JSON with faqs: up to 3 objects with q and a, based only on supplied confirmed public facts. State when an ingredient, allergen or sourcing fact is unconfirmed.',
  analytics_insight: 'Explain the complete supplied SQL aggregate metrics for the selected Pakistan calendar date range. Do not invent causes.',
  general_draft: 'Help with a safe ChaskaBox admin drafting task. Produce text/advice only; never claim that you changed the store.',
  product_description: 'Draft a concise, appetizing product description (40-70 words, Roman Urdu-friendly tone) for a Pakistani snack-store product.',
  seo_meta: 'Return ONLY JSON with seo_title (max 60 chars) and seo_description (max 155 chars) for the product page.',
  category_tags: 'Return ONLY JSON with tags: an array of up to 8 useful public category/flavour/search strings (max 60 chars each).',
  box_ideas: 'Suggest 3 Chaska Box themes (name + 1-line concept each) using only the supplied products.',
  faq_reply: 'Draft a helpful FAQ answer in friendly Roman Urdu + simple English.',
  support_reply: 'Draft a polite customer-support reply in Roman Urdu + simple English using only confirmed facts.',
  merchandising: 'Suggest homepage merchandising using only the supplied catalogue context. Do not call anything a bestseller without sales data.',
  sales_summary: 'Explain the supplied seven-day commerce metrics. Clearly distinguish gross order value from recognized sales and pending prepaid value. Highlight practical observations without inventing causes.',
  attention_summary: 'Summarize the supplied operational exceptions into a short prioritized action list.',
  catalogue_summary: 'Summarize the supplied catalogue state: visible/draft/hidden/archived and stock-state counts; suggest safe content actions only.',
  translate: 'Translate the supplied text between English and Roman Urdu. Keep brand names unchanged. Return only the translation.',
  pricing_suggest: 'Describe the supplied current price and list what market evidence an owner would need before changing it. Do not invent competitor prices or price ranges.',
  inventory_insight: 'Analyze the supplied inventory/stock data. Identify low-stock items, overstocked items, and suggest reorder priorities. Do not invent stock numbers.',
  customer_insight: 'Summarize customer patterns from the supplied ANONYMIZED order data (no names/phones). Identify repeat buyers, average order value trends, and suggestions.',
  order_insight: 'Analyze the supplied order fulfilment data. Identify bottlenecks, delayed orders, and process improvements.',
  review_reply: 'Draft a polite, professional reply to this customer review in Roman Urdu + simple English. Thank them, address their point, invite them back.',
};

const SYSTEM_GUARDRAILS = [
  'You are ChaskaBox Admin Copilot. You output DRAFT TEXT, SUMMARIES, OR RECOMMENDATIONS ONLY.',
  'You cannot publish, change prices, verify payments, refund/cancel orders, delete products, deploy, or change roles/security.',
  'Never claim an action happened. Say what the admin can review/do instead.',
  'Never invent ingredients, allergens, stock quantities, bestseller/sales claims, discounts, customer data, or delivery promises.',
  'Never describe branded products as ChaskaBox exclusive, official partnerships, manufacturer-authorized, certified or endorsed unless the supplied server facts explicitly confirm it.',
  'Use only the factual context supplied by the server/admin. If a fact is missing, say it is not confirmed.',
  'Do not output or request passwords, OTPs, service-role keys, API keys, bank/card credentials, or private customer information.',
  'Follow the task language and format exactly. Roman Urdu uses Latin letters. When no language is specified, prefer concise Roman Urdu + simple English.',
].join('\n');

async function serverContextForTask(context, task, client) {
  if(['product_description','seo_meta','category_tags','pricing_suggest'].includes(task)&&client.product_id){
    const rows=await sb(context,'/rest/v1/products?id=eq.'+client.product_id+'&select=id,name,brand,category,pack,description,price,stock_state,tags&limit=1');
    if(!rows?.[0])httpError('Select an existing product',404,'not_found');
    return {product:rows[0],facts:'Confirmed saved catalogue fields. No ingredients/allergens are confirmed unless explicitly listed.'};
  }
  if(['support_reply','faq_reply'].includes(task)){
    const settings=await publicSettings(context.env),keys=['delivery_estimate','cod_enabled','jazzcash_enabled','bank_transfer_enabled','cod_delivery_fee_pkr','prepaid_delivery_fee_pkr','prepaid_free_delivery_enabled','prepaid_free_delivery_threshold_pkr','cod_advance_enabled','cod_advance_amount_pkr'];
    return {policy:Object.fromEntries(keys.filter(k=>settings[k]!==undefined).map(k=>[k,settings[k]])),facts:'COD advance is deducted from the total, capped at that total. Do not invent order status, courier guarantees, ingredients or allergens.'};
  }
  if (['sales_summary','customer_insight','order_insight','analytics_insight'].includes(task)) {
    const url=new URL(context.request.url);
    for(const [k,v] of Object.entries(client.range||{}))url.searchParams.set(k,v);
    const {from,to,fromStr,toStr}=parseRange(url);
    const params={p_from:from.toISOString(),p_to:to.toISOString()};
    const revenue=await sb(context,'/rest/v1/rpc/analytics_revenue',{method:'POST',body:params});
    const overview=await sb(context,'/rest/v1/rpc/analytics_overview',{method:'POST',body:params});
    return {range:{from:fromStr,to:toStr,timezone:'Asia/Karachi'},revenue,cards:overview.cards,daily:overview.daily};
  }
  if(task==='attention_summary')return sb(context,'/rest/v1/rpc/ai_attention_snapshot',{method:'POST',body:{}});
  if(['catalogue_summary','inventory_insight'].includes(task))return sb(context,'/rest/v1/rpc/ai_catalogue_snapshot',{method:'POST',body:{}});
  if(task.startsWith('brand_')||['box_ideas','merchandising'].includes(task)) {
    const catalogue=await publicCatalogue(context.env);
    const eligible=catalogue.filter(p=>p.stock_state!=='unavailable'&&(!task.startsWith('brand_')||String(p.brand||'').toLowerCase()===String(client.brand||'').toLowerCase()));
    if(task.startsWith('brand_')&&!eligible.length)httpError('This brand has no eligible public catalogue facts to draft from',422,'empty_brand');
    return {total:eligible.length,sample:eligible.slice(0,40).map(p=>({id:p.id,name:p.name,brand:p.brand,pack:p.pack,description:String(p.description||'').slice(0,180),price:p.price})),sample_limit:40};
  }
  return null;
}

export const onRequestPost = withAdmin(['owner', 'manager', 'content'], async (context, { user, role }) => {
  if (!aiAvailable(context)) httpError('AI is paused or its binding is unavailable', 503, 'ai_disabled');
  const rl = await distributedRateLimit(context, `ai:${user.id}`, 20, 2);
  if (!rl.allowed) return json({ error: { code: 'RATE_LIMITED', message: 'AI draft limit reached. Try again shortly.' } }, 429, { 'Retry-After': String(rl.retryAfterSec || 30) });

  const body = await readJson(context.request, 10 * 1024);
  const task = String(body.task || 'general_draft').trim();
  if (!ALLOWED_TASKS.has(task)) httpError(`Unknown or disallowed task '${task}'`, 422, 'blocked_task');
  if (SENSITIVE_INSIGHT_TASKS.has(task) && !['owner','manager'].includes(role)) httpError('This insight is limited to owner/manager', 403, 'forbidden_role');

  if(Object.keys(body).some(k=>!['task','context'].includes(k)))httpError('Send task and public context only',422,'invalid_context');
  const client = draftContext(body.context);
  if(task==='page_rewrite'&&!client.text)httpError('Select existing public page text to rewrite',422,'invalid_context');
  const clientContext = JSON.stringify(client);
  const combined = `${task}\n${clientContext}`.slice(0, 5200);
  if (BLOCKLIST.some((re) => re.test(combined))) {
    await audit(context,{actorId:user.id,actorRole:role,action:'ai.blocked',entityType:'ai',entityId:'n/a',after:{task,reason:'sensitive_action_request'}});
    httpError('Blocked: Copilot cannot execute or instruct sensitive store actions. It only drafts and summarizes.',422,'blocked_sensitive');
  }

  const serverContext = await serverContextForTask(context, task, client);
  const userText = [
    clientContext ? `Admin request/context: ${clientContext}` : '',
    serverContext ? `Trusted server metrics: ${JSON.stringify(serverContext)}` : '',
  ].filter(Boolean).join('\n');

  try {
    const result = await runTextAI(context, {
      system: `${SYSTEM_GUARDRAILS}\n\nTask: ${TASK_PROMPTS[task]}`,
      user: userText || `Perform task: ${task}`,
      maxTokens: task.endsWith('_summary') ? 420 : 600,
      temperature: task.endsWith('_summary')||task==='page_rewrite' ? 0.15 : 0.45,
      actorId:user.id,
    });
    if(task==='page_rewrite')result.text=pageRewrite(result.text,client.text);
    await audit(context,{actorId:user.id,actorRole:role,action:'ai.draft_generated',entityType:'ai',entityId:'n/a',after:{task,draft_chars:result.text.length,model:result.model}});
    const structured=structuredDraft(task,result.text,(serverContext?.sample||[]).map(p=>p.id));
    return json({task,draft:result.text,structured,model:result.model,cached:result.cached,budget:result.budget,source:serverContext?'trusted_server_context':'public_admin_context',warnings:['DRAFT ONLY: review factual claims before saving.']});
  } catch (error) {
    console.error('[admin-ai] Workers AI error',error?.message||error);
    if(error instanceof Response)throw error;
    httpError(error?.code==='AI_BUDGET_EXHAUSTED'?'AI app budget has been reached.':'AI is paused or unavailable. Store operations are unaffected.',error?.status||503,error?.code||'ai_unavailable');
  }
});
