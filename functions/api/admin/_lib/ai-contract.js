import { httpError } from './auth.js';
import { containsSensitiveText } from '../../_lib/ai.js';
export const TASKS=new Set(['general_draft','product_description','seo_meta','category_tags','box_ideas','faq_reply','support_reply','merchandising','sales_summary','attention_summary','catalogue_summary','translate','pricing_suggest','inventory_insight','customer_insight','order_insight','review_reply','brand_description','brand_seo','brand_featured','brand_faq','analytics_insight']);
export const SENSITIVE_TASKS=new Set(['sales_summary','attention_summary','customer_insight','order_insight','analytics_insight','inventory_insight']);
const TEXT_KEYS=new Set(['name','brand','category','pack','description','text','instructions','question','language','review']);
export function draftContext(value={}) {
  if(typeof value==='string')value={text:value};
  if(!value||typeof value!=='object'||Array.isArray(value))httpError('AI context must be an object',422,'invalid_context');
  const out={};
  for(const [key,v]of Object.entries(value)) {
    if(TEXT_KEYS.has(key)){if(typeof v!=='string'||v.length>1500||containsSensitiveText(v))httpError('Use public product/text context without private identifiers',422,'private_context');out[key]=v.trim();}
    else if(key==='product_id'){if(!Number.isSafeInteger(v)||v<1)httpError('Invalid product ID',422);out[key]=v;}
    else if(key==='range'){if(!v||Array.isArray(v)||Object.keys(v).some(k=>!['from','to'].includes(k)))httpError('Invalid date range',422);out.range=v;}
    else httpError('Unsupported AI context field: '+key,422,'private_context');
  }
  return out;
}
function boundedString(v,limit) { return typeof v==='string'&&v.trim()&&v.length<=limit&&!containsSensitiveText(v); }
export function structuredDraft(task,text,allowedIds=[]) {
  if(!['seo_meta','brand_seo','category_tags','brand_featured','brand_faq'].includes(task))return null;
  let value;try{value=JSON.parse(text.replace(/^.*?\x60{3}(?:json)?\s*/s,'').replace(/\s*\x60{3}.*$/s,''));}catch{httpError('AI returned invalid structured text. Existing fields were preserved.',422,'invalid_draft');}
  if(task==='seo_meta'||task==='brand_seo') {
    if(!boundedString(value.seo_title,60)||!boundedString(value.seo_description,155))httpError('Invalid SEO draft',422,'invalid_draft');
    return {seo_title:value.seo_title.trim(),seo_description:value.seo_description.trim()};
  }
  if(task==='category_tags') {
    if(!Array.isArray(value.tags)||!value.tags.length||value.tags.length>8||value.tags.some(v=>!boundedString(v,60)))httpError('Invalid tags draft',422,'invalid_draft');
    return {tags:[...new Set(value.tags.map(v=>v.trim()))]};
  }
  if(task==='brand_featured') {
    if(!Array.isArray(value.featured_ids)||value.featured_ids.length>8||value.featured_ids.some(id=>!Number.isSafeInteger(id)||!allowedIds.includes(id)))httpError('Draft referenced a product outside this public brand catalogue',422,'invalid_draft');
    return {featured_ids:[...new Set(value.featured_ids)]};
  }
  if(!Array.isArray(value.faqs)||!value.faqs.length||value.faqs.length>5||value.faqs.some(f=>!boundedString(f.q,160)||!boundedString(f.a,700)))httpError('Invalid FAQ draft',422,'invalid_draft');
  return {faqs:value.faqs.map(f=>({q:f.q.trim(),a:f.a.trim()}))};
}
export function productDraft(body,role) {
  if(!Number.isSafeInteger(body.product_id)||body.product_id<1)httpError('Valid product_id required',400);
  if(body.confirm!==undefined&&typeof body.confirm!=='boolean')httpError('confirm must be boolean',400,'invalid_confirmation');
  const field=body.field,value=body.value,strings={description:5000,seo_title:60,seo_description:155};
  if(Object.hasOwn(strings,field)){if(!boundedString(value,strings[field]))httpError('Invalid '+field,400);return {[field]:value.trim()};}
  if(field==='tags') {
    if(!Array.isArray(value)||value.length>20||value.some(v=>!boundedString(v,60)))httpError('tags must be a bounded string array',400);
    return {tags:[...new Set(value.map(v=>v.trim()))]};
  }
  if(['price','old_price'].includes(field)) {
    if(role!=='owner')httpError('Owner price approval required',403,'owner_only');
    if(field==='old_price'&&value===null)return {old_price:null};
    if(!Number.isSafeInteger(value)||value<(field==='price'?1:0)||value>1000000)httpError('Price must be a bounded integer',400);
    return {[field]:value};
  }
  httpError('Unsupported AI product field',403,'blocked_field');
}
