import {withAdmin,sb,json,readJson,httpError} from '../_lib/auth.js';
export const onRequestPatch=withAdmin(['owner','manager'],async(c,{user})=>{
 const b=await readJson(c.request),method=String(b.method||''),
 label=String(b.account_label||'').trim(),days=b.settlement_days;
 if(!['jazzcash','bank_transfer'].includes(method)||label.length>100||(label&&label.length<2)||
 (days!==null&&(!Number.isSafeInteger(days)||days<0||days>120)))
  httpError('Choose a supported payment method, account label and valid settlement days',400,'invalid_payment_account');
 const r=await sb(c,'/rest/v1/rpc/admin_online_payment_account_save',{method:'POST',
  body:{p_actor:user.id,p_method:method,p_label:label||null,p_days:days}});
 if(r?.error)httpError(r.error,r.status||400,'payment_account');
 return json(r);
});
