import { sb, httpError } from './auth.js';
export async function mutateOrder(context,user,{action,value='',note='',expected=null}) {
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(context.params.id||''))) httpError('Valid order id required',400,'invalid_order');
  const data=await sb(context,'/rest/v1/rpc/admin_order_mutate',{method:'POST',body:{p_actor:user.id,p_order:context.params.id,p_action:action,p_value:value,p_note:note,p_expected_updated_at:expected}});
  if(data?.error) httpError(data.error,data.status||409,data.code||'mutation_failed');
  if(!data?.order?.id) httpError('Order update could not be confirmed',502,'invalid_response');
  return data;
}
