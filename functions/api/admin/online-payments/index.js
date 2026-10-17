import {withAdmin,sb,json} from '../_lib/auth.js';
import {cardGatewayReadiness} from '../_lib/card-gateway-readiness.js';
export const onRequestGet=withAdmin(['owner','manager'],async context=>{
 const [accounts,ledger,cardRows,transactions]=await Promise.all([
  sb(context,'/rest/v1/online_payment_accounts?select=method,display_name,account_label,settlement_days,updated_at&order=method.asc'),
  sb(context,'/rest/v1/online_payment_ledger?select=*&order=created_at.desc&limit=1000'),
  sb(context,'/rest/v1/card_gateway_control?select=provider,enabled,integration_verified,settlement_days,fee_bps,fixed_fee_pkr,updated_at&limit=1'),
  sb(context,'/rest/v1/card_gateway_transactions?select=id,order_id,provider_transaction_id,status,gross_amount_pkr,fee_amount_pkr,net_settled_pkr,settled_on,settlement_reference,provider_created_at&order=updated_at.desc&limit=100')
 ]);
 const card=cardRows?.[0]||null;
 const readiness=cardGatewayReadiness(context.env,card);
 return json({accounts:accounts||[],ledger:ledger||[],
   card_gateway:{
    provider:'bop',requested_enabled:card?.enabled===true,effective_enabled:readiness.ready&&card?.enabled===true,
    integration_verified:card?.integration_verified===true,credentials_configured:readiness.credentials,
    processor_connected:readiness.processor,can_activate:readiness.ready,
    settlement_days:card?.settlement_days??null,fee_bps:card?.fee_bps??null,
    fixed_fee_pkr:card?.fixed_fee_pkr??null,readiness_reason:readiness.reason,
    transactions:transactions||[]
   },
   warning:(ledger||[]).length>=1000?'First 1000 online orders shown; this is not a complete export.':null
 },200,{'Cache-Control':'no-store'});
});
