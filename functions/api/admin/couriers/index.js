import {withAdmin,sb,json,readJson,httpError} from '../_lib/auth.js';
function parseCompany(b){
 const name=String(b.name||'').trim();
 const days=Number(b.settlement_days),deduction=Number(b.deduction_per_order_pkr??0);
 if(name.length<2||name.length>100||!Number.isInteger(days)||days<0||days>120
  ||!Number.isInteger(deduction)||deduction<0||deduction>100000
  ||(b.is_active!==undefined&&typeof b.is_active!=='boolean'))
   httpError('Check company name, 0–120 calendar days and per-order deduction',400,'invalid_courier');
 return {name,days,deduction,active:b.is_active!==false};
}
export const onRequestGet=withAdmin(['owner','manager','fulfilment'],async c=>{
 const companies=await sb(c,'/rest/v1/courier_companies?select=id,name,settlement_days,deduction_per_order_pkr,is_active,updated_at&order=name.asc');
 return json({couriers:companies||[]});
});
export const onRequestPost=withAdmin(['owner','manager'],async(c,{user})=>{
 const b=parseCompany(await readJson(c.request));
 const result=await sb(c,'/rest/v1/rpc/admin_courier_company_save',{method:'POST',
 body:{p_actor:user.id,p_id:null,p_name:b.name,p_settlement_days:b.days,p_deduction_pkr:b.deduction,p_active:b.active}});
 if(result.error)httpError(result.error,result.status||400,'courier_settings');
 return json(result,201);
});
