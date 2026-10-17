import {withAdmin,sb,json,readJson,httpError} from '../_lib/auth.js';
import {cardGatewayReadiness} from '../_lib/card-gateway-readiness.js';
export const onRequestPatch=withAdmin(['owner'],async(c,{user})=>{
 const b=await readJson(c.request),enabled=b.enabled,days=b.settlement_days,
 fee=b.fee_bps,fixed=b.fixed_fee_pkr;
 const valid=n=>n===null||(Number.isSafeInteger(n)&&n>=0);
 if(typeof enabled!=='boolean'||!valid(days)||!valid(fee)||!valid(fixed)||
 (days!==null&&days>120)||(fee!==null&&fee>10000)||(fixed!==null&&fixed>100000))
  httpError('Enter a boolean switch and valid settlement, fee and deduction settings',400,'invalid_card_gateway');
 const rows=await sb(c,'/rest/v1/card_gateway_control?select=integration_verified,enabled&limit=1');
 const state=rows?.[0];
 if(!state)httpError('Card gateway configuration is unavailable',503,'gateway_unavailable');
 if(enabled){
  const readiness=cardGatewayReadiness(c.env,state);
  if(!readiness.ready)httpError('Card cannot be enabled: '+readiness.reason+'. Wait for approved BOP integration.',409,'card_gateway_not_ready');
 }
 const result=await sb(c,'/rest/v1/rpc/admin_card_gateway_update',{method:'POST',
  body:{p_actor:user.id,p_enabled:enabled,p_settlement_days:days,p_fee_bps:fee,p_fixed_fee_pkr:fixed}});
 if(result?.error)httpError(result.error,result.status||409,'card_gateway_update_failed');
 return json({gateway:{enabled:result.gateway?.enabled===true,provider:'bop'},saved:true});
});
