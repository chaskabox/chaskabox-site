import {withAdmin,sb,json,httpError,readJson,audit} from '../../_lib/auth.js';
const validId=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||'');
export const onRequestPatch=withAdmin(['owner'],async(context,{user,role})=>{
 const id=context.params.id;
 if(!validId(id))httpError('Invalid order ID',400,'invalid_order');
 const body=await readJson(context.request,2048);
 if(typeof body.is_test!=='boolean')httpError('is_test must be boolean',400,'invalid_classification');
 const reason=String(body.reason||'').trim();
 if(reason.length<3||reason.length>500)httpError('A reason (3–500 characters) is required',400,'invalid_reason');
 const rows=await sb(context,'/rest/v1/orders?id=eq.'+encodeURIComponent(id)+'&select=id,order_number,is_test,test_reason');
 const before=rows?.[0];if(!before)httpError('Order not found',404,'not_found');
 if(before.is_test===body.is_test)return json({ok:true,unchanged:true,is_test:before.is_test});
 const updated=await sb(context,'/rest/v1/orders?id=eq.'+encodeURIComponent(id)+'&is_test=eq.'+(!body.is_test),{
  method:'PATCH',body:{is_test:body.is_test,test_reason:body.is_test?reason:null}
 });
 if(!updated?.length)httpError('Order classification changed concurrently. Reload.',409,'classification_conflict');
 await audit(context,{actorId:user.id,actorRole:role,action:'order.classification_changed',entityType:'order',entityId:id,before:{is_test:before.is_test},after:{is_test:body.is_test,reason}});
 return json({ok:true,is_test:body.is_test});
});