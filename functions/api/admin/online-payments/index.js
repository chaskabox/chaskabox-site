import {withAdmin,sb,json} from '../_lib/auth.js';
export const onRequestGet=withAdmin(['owner','manager'],async context=>{
 const [accounts,ledger]=await Promise.all([
  sb(context,'/rest/v1/online_payment_accounts?select=method,display_name,account_label,settlement_days,updated_at&order=method.asc'),
  sb(context,'/rest/v1/online_payment_ledger?select=*&order=created_at.desc&limit=1000')
 ]);
 return json({accounts:accounts||[],ledger:ledger||[],card_gateway_connected:false,
   warning:(ledger||[]).length>=1000?'First 1000 online orders shown; this is not a complete export.':null},200,{'Cache-Control':'no-store'});
});
