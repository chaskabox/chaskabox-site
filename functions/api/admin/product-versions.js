import {withAdmin,sb,json,httpError,readJson} from './_lib/auth.js';
import {contentRpc} from './_lib/content-rpc.js';
export const onRequestGet=withAdmin(['owner','manager','content'],async(context)=>{
 const url=new URL(context.request.url),id=Number(url.searchParams.get('product_id')),page=Number(url.searchParams.get('page')||1);
 if(!Number.isSafeInteger(id)||id<1||!Number.isInteger(page)||page<1||page>1000)httpError('Invalid product history request',400);
 const product=await sb(context,'/rest/v1/products?id=eq.'+id+'&select=updated_at');
 if(!product?.length)httpError('Product not found',404);
 const result=await sb(context,'/rest/v1/product_versions?product_id=eq.'+id+'&select=id,changed_by,change_type,created_at,reverted_at&order=id.desc&limit=20&offset='+((page-1)*20),{count:true});
 return json({versions:result.data,total:result.total,page,expected_updated_at:product[0].updated_at});
});
export const onRequestPost=withAdmin(['owner','manager'],async(context,{user})=>{
 const b=await readJson(context.request,4096);
 if(!Number.isSafeInteger(b.product_id)||b.product_id<1||!Number.isSafeInteger(b.version_id)||b.version_id<1||b.confirm!==true)httpError('Product, version and explicit confirmation are required',400);
 if(typeof b.expected_updated_at!=='string'||!Number.isFinite(Date.parse(b.expected_updated_at)))httpError('Reload product history before reverting',400);
 const result=await contentRpc(context,'admin_product_revert',{p_actor:user.id,p_id:b.product_id,p_version:b.version_id,p_expected:b.expected_updated_at,p_confirm:true});
 return json({ok:true,...result});
});
