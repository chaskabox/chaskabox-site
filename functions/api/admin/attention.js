import {withAdmin,sb,json} from './_lib/auth.js';
export const onRequestGet=withAdmin(['owner','manager','fulfilment'],async context=>
 json(await sb(context,'/rest/v1/rpc/admin_attention_summary',{method:'POST',body:{}})));
