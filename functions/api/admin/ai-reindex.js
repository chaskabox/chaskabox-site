/* Bounded, version-aware batches. Exact remaining count; no partial-index success claim. */
import {withAdmin,json,httpError,readJson,audit,sb,distributedRateLimit} from './_lib/auth.js';
import {runEmbeddings,vectorLiteral,selectedEmbeddingModel} from '../_lib/ai.js';
export function embeddingText(p){
 return ['Name: '+(p.name||''),'Brand: '+(p.brand||''),'Category: '+(p.category||''),'Pack: '+(p.pack||''),'Description: '+(p.description||''),'Tags: '+(Array.isArray(p.tags)?p.tags.join(', '):'')].join('\n').slice(0,6000);
}
export const onRequestPost=withAdmin(['owner','manager','content'],async(context,{user,role})=>{
 const b=await readJson(context.request,4096),limit=b.limit??12,ids=b.product_ids||[];
 if(!Number.isInteger(limit)||limit<1||limit>12||!Array.isArray(ids)||ids.length>12||ids.some(id=>!Number.isSafeInteger(id)||id<1))httpError('Index batches contain at most 12 public products',400);
 const rate=await distributedRateLimit(context,'ai-index:'+user.id,10,60);if(!rate.allowed)httpError('Indexing is rate limited',429);
 const model=selectedEmbeddingModel(context);
 const rows=ids.length?await sb(context,'/rest/v1/products?visibility=eq.visible&stock_state=neq.unavailable&id=in.('+ids.join(',')+')&select=*&order=id.asc&limit=12'):await sb(context,'/rest/v1/rpc/ai_index_batch',{method:'POST',body:{p_model:model,p_limit:limit}});
 let changed=0,budget=null;
 if(rows?.length)try{
  const texts=rows.map(embeddingText),out=await runEmbeddings(context,texts,{actorId:user.id});budget=out.budget;
  const payload=rows.map((p,i)=>({id:p.id,text:texts[i],model,expected_updated_at:p.updated_at,embedding:vectorLiteral(out.embeddings[i])}));
  changed=await sb(context,'/rest/v1/rpc/set_product_ai_embeddings',{method:'POST',body:{p_rows:payload}});
 }catch(e){if(e instanceof Response)throw e;httpError(e.message||'AI indexing is paused/unavailable',e.status||503,e.code||'ai_unavailable');}
 const status=await sb(context,'/rest/v1/rpc/ai_index_status',{method:'POST',body:{p_model:model}});
 await audit(context,{actorId:user.id,actorRole:role,action:'ai.search_index_refreshed',entityType:'ai',entityId:'products',after:{indexed:Number(changed),...status,model}});
 return json({indexed:Number(changed),...status,model,budget,complete:status.remaining===0});
});
