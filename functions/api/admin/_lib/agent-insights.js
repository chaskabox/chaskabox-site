/** M03 deterministic owner-only intelligence summaries. Never accept AI instructions or PII. */
const NONNEG=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
export function summarizeM03(value){
 if(!value||typeof value!=='object')return {state:'unknown',agents:[]};
 const blocks=['support','seo','analytics'];
 if(blocks.some(k=>!value[k]||typeof value[k]!=='object'))return {state:'unknown',agents:[]};
 const s=value.support,e=value.seo,a=value.analytics;
 const su=['ai_requests_7d','ai_failures_7d'],se=['visible_products','missing_seo_title','missing_seo_description','missing_product_image'];
 const an=['orders_30d','recognized_sales_pkr_30d','checkout_started_30d','product_views_30d'];
 if([...su.map(k=>s[k]),...se.map(k=>e[k]),...an.map(k=>a[k])].some(x=>!NONNEG(x)))
  return {state:'unknown',agents:[]};
 const signal=(keys,v)=>Object.fromEntries(keys.map(k=>[k,Math.min(v[k],1000000000)]));
 return {state:'ok',mode:'observation',agents:[
  {agent:'support',status:s.ai_failures_7d>0?'attention':'ok',
   scope:'AI usage covers all AI tasks, not only customer support.',
   signals:signal(su,s),alerts:s.ai_failures_7d?[{code:'ai_request_failures',severity:'medium',count:s.ai_failures_7d}]:[]},
  {agent:'seo',status:se.some(k=>k!=='visible_products'&&e[k]>0)?'attention':'ok',
   signals:signal(se,e),alerts:se.filter(k=>k!=='visible_products'&&e[k]>0)
    .map(k=>({code:k,severity:'medium',count:e[k]}))},
  {agent:'analytics',status:'ok',signals:signal(an,a),alerts:[]}
 ]};
}
