// Live card acceptance must have a real deployed processor/callback and verified
// BOP credentials; NEVER infer readiness from the owner toggle or UI alone.
export function cardGatewayReadiness(env={},control=null){
 const credentials=Boolean(env?.BOP_CARD_GATEWAY_MERCHANT_ID&&env?.BOP_CARD_GATEWAY_SIGNING_KEY&&env?.BOP_CARD_GATEWAY_CALLBACK_SECRET);
 const processor=env?.BOP_CARD_PROCESSOR_READY==='true';
 const integration=control?.integration_verified===true;
 const ready=credentials&&processor&&integration;
 const reason=!integration?'BOP gateway integration and callback tests have not been verified'
   :!credentials?'BOP merchant credentials are not configured on the server'
   :!processor?'Production BOP payment processor has not passed acceptance'
   :'Provider credentials and integration verified';
 return {credentials,processor,integration,ready,reason};
}
