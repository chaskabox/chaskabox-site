import {withAdmin,sb,json} from '../_lib/auth.js';
export const onRequestGet=withAdmin(['owner','manager'],async c=>{
 const [ledger,unassigned]=await Promise.all([
  sb(c,'/rest/v1/courier_cod_ledger?select=*&order=assigned_at.desc&limit=1000'),
  sb(c,'/rest/v1/orders?select=id,order_number,total,customer_city&payment_method=eq.cod&fulfilment_status=eq.delivered&payment_status=neq.refunded&order=created_at.desc&limit=1000')
 ]);
 const refs=new Set((ledger||[]).map(x=>x.order_id));
 const missing=(unassigned||[]).filter(o=>!refs.has(o.id));
 return json({ledger:ledger||[],unassigned:missing,warning:(ledger||[]).length>=1000||(unassigned||[]).length>=1000?'Showing first 1000 rows; export not yet available.':null},{},{'Cache-Control':'no-store'});
});
