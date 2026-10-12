import {withAdmin,sb,json} from './_lib/auth.js';
import {aiAvailable,selectedTextModel,selectedEmbeddingModel,IMAGE_MODEL} from '../_lib/ai.js';
export const onRequestGet=withAdmin(['owner','manager','content'],async(context)=>{
 const budget=await sb(context,'/rest/v1/rpc/ai_budget_state',{method:'POST',body:{}});
 const index=await sb(context,'/rest/v1/rpc/ai_index_status',{method:'POST',body:{p_model:selectedEmbeddingModel(context)}});
 return json({enabled:aiAvailable(context)&&budget.enabled,binding_present:typeof context.env.AI?.run==='function',budget,index,models:{text:selectedTextModel(context),embedding:selectedEmbeddingModel(context),image:IMAGE_MODEL}});
});
