import {withAdmin,sb,json,httpError,pagination} from '../_lib/auth.js';
export const onRequestGet=withAdmin(['owner','manager'],async c=>{
 const id=String(c.params.id||'');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))httpError('Invalid customer id',400);
 const result=await sb(c,'/rest/v1/rpc/customer_directory',{method:'POST',body:{p_q:'',p_id:id,p_limit:1,p_offset:0}});
 const customer=result.customers[0];if(!customer)httpError('Customer not found',404);
 const {page,per,rangeHeader}=pagination(new URL(c.request.url),25,100);
 const {data,total}=await sb(c,'/rest/v1/orders?customer_id=eq.'+id+'&select=id,order_number,payment_method,payment_status,fulfilment_status,total,created_at&order=created_at.desc,id.desc',{headers:{Range:rangeHeader},count:true});
 return json({customer,orders:data,page,per_page:per,total,total_pages:Math.ceil(total/per)});
});
