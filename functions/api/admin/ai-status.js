import {withAdmin,sb,json} from './_lib/auth.js';
import {aiAvailable,selectedTextModel,selectedEmbeddingModel,IMAGE_MODEL} from '../_lib/ai.js';
export const onRequestGet=withAdmin(['owner','manager','content'],async(context)=>{
 const [budget,index]=await Promise.all([sb(context,'/rest/v1/rpc/ai_budget_state',{method:'POST',body:{}}),sb(context,'/rest/v1/rpc/ai_index_status',{method:'POST',body:{p_model:selectedEmbeddingModel(context)}})]);
 const server_enabled=context.env.AI_ENABLED==='true',binding_present=typeof context.env.AI?.run==='function';
 const effective_budget=Math.min(Number(context.env.AI_DAILY_BUDGET_NEURONS)||8000,Number(budget.policy_budget)||8000,8000);
 const remaining=Math.max(0,effective_budget-Number(budget.accounted_neuron_estimate||0));
 const reasons=[...(!server_enabled?['Server AI switch is off']:[]),...(!binding_present?['Workers AI binding is missing']:[]),...(!budget.enabled?['Store AI switch is off']:[]),...(!budget.features?.text?['Text drafts are paused']:[]),...(remaining<=0?['Daily app budget exhausted']:[])];
 return json({enabled:aiAvailable(context)&&budget.enabled&&budget.features?.text===true&&remaining>0,server_enabled,binding_present,reasons,budget:{...budget,effective_budget,remaining},index,checked_at:new Date().toISOString(),models:{text:selectedTextModel(context),embedding:selectedEmbeddingModel(context),image:IMAGE_MODEL}});
});
