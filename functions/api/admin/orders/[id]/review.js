import {withAdmin,sb,json,httpError,audit} from '../../_lib/auth.js';
const validId=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||'');
export const onRequestPost=withAdmin(['owner','manager'],async(context,{user,role})=>{
 const id=context.params.id;
 if(!validId(id))httpError('Invalid order ID',400,'invalid_order');
 const rows=await sb(context,'/rest/v1/orders?id=eq.'+encodeURIComponent(id)+'&select=id,order_number,is_test,owner_reviewed_at');
 const o=rows?.[0];if(!o)httpError('Order not found',404,'not_found');
 if(o.is_test)httpError('Test orders do not require owner review',409,'test_order');
 if(o.owner_reviewed_at)return json({ok:true,already_reviewed:true,owner_reviewed_at:o.owner_reviewed_at});
 const when=new Date().toISOString();
 const updated=await sb(context,'/rest/v1/orders?id=eq.'+encodeURIComponent(id)+'&owner_reviewed_at=is.null',{
  method:'PATCH',body:{owner_reviewed_at:when,owner_reviewed_by:user.id}
 });
 if(updated?.length){
  await audit(context,{actorId:user.id,actorRole:role,action:'order.owner_reviewed',entityType:'order',entityId:id,before:{owner_reviewed_at:null},after:{owner_reviewed_at:when}});
 }
 return json({ok:true,owner_reviewed_at:updated?.[0]?.owner_reviewed_at||null,already_reviewed:!updated?.length});
});