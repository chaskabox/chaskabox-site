import {withAdmin,sb,json,readJson,httpError} from '../_lib/auth.js';
export const onRequestPatch=withAdmin(['owner','manager'],async(c,{user})=>{
 const id=Number(c.params.id),b=await readJson(c.request);
 const name=String(b.name||'').trim(),days=Number(b.settlement_days),deduction=Number(b.deduction_per_order_pkr??0);
 if(!Number.isSafeInteger(id)||id<1||name.length<2||name.length>100||!Number.isInteger(days)
 ||days<0||days>120||!Number.isInteger(deduction)||deduction<0||deduction>100000||typeof b.is_active!=='boolean')
 httpError('Invalid courier settings',400,'invalid_courier');
 const r=await sb(c,'/rest/v1/rpc/admin_courier_company_save',{method:'POST',
 body:{p_actor:user.id,p_id:id,p_name:name,p_settlement_days:days,p_deduction_pkr:deduction,p_active:b.is_active}});
 if(r.error)httpError(r.error,r.status||400,'courier_settings');
 return json(r);
});
