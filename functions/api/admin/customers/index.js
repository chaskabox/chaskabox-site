import {withAdmin,sb,json,pagination,sanitizeSearch} from '../_lib/auth.js';
export const onRequestGet=withAdmin(['owner','manager'],async c=>{
 const url=new URL(c.request.url),{page,per}=pagination(url,25,100);
 const result=await sb(c,'/rest/v1/rpc/customer_directory',{method:'POST',body:{p_q:sanitizeSearch(url.searchParams.get('q')),p_id:null,p_limit:per,p_offset:(page-1)*per}});
 return json({...result,page,per_page:per,total_pages:Math.ceil(result.total/per)});
});
