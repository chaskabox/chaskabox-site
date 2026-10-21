import {withAdmin,json,pagination,sanitizeSearch} from '../_lib/auth.js';
import {accountRpc} from '../_lib/customer-account.js';
export const onRequestGet=withAdmin(['owner','manager'],async(c,{user})=>{
 const url=new URL(c.request.url),{page,per,offset}=pagination(url,25,100);
 const result=await accountRpc(c,'admin_account_directory',{p_actor:user.id,p_q:sanitizeSearch(url.searchParams.get('q'),100),p_id:null,p_limit:per,p_offset:offset});
 return json({...result,page,per_page:per,total_pages:Math.ceil(result.total/per)});
});
