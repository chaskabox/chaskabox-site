/* Preview first; apply, version and audit commit as a single transaction. */
import {withAdmin,sb,json,httpError,readJson} from './_lib/auth.js';
import {productDraft} from './_lib/ai-contract.js';
import {contentRpc} from './_lib/content-rpc.js';
export const onRequestPost=withAdmin(['owner','manager','content'],async(context,{user,role})=>{
 const body=await readJson(context.request,8192),patch=productDraft(body,role),id=body.product_id;
 const rows=await sb(context,'/rest/v1/products?id=eq.'+id+'&select=id,name,updated_at,'+body.field);
 if(!rows?.length)httpError('Product not found',404);
 const product=rows[0];
 if(body.confirm!==true)return json({preview:{product_id:id,product_name:product.name,field:body.field,old_value:product[body.field],new_value:patch[body.field],expected_updated_at:product.updated_at}});
 if(typeof body.expected_updated_at!=='string'||!Number.isFinite(Date.parse(body.expected_updated_at)))httpError('A current preview timestamp is required',400,'preview_required');
 const result=await contentRpc(context,'admin_product_draft_apply',{p_actor:user.id,p_id:id,p_patch:patch,p_expected:body.expected_updated_at,p_confirm:true});
 return json({applied:true,product:result.product,version_id:result.version_id});
});
