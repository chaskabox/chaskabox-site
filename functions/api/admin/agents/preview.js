import {withAdmin,sb,json} from '../_lib/auth.js';
import {observeOrders,observeInventory,observeGitHub,unavailable} from '../_lib/agent-monitors.js';

// Owner + live MFA enforced by existing withAdmin; GET has no agent side effects.
// Dry-run observation only; no scheduler, AI inference, alert persistence or sending.
export const onRequestGet=withAdmin(['owner'],async (context)=>{
 const [orders,inventory,github]=await Promise.allSettled([
  sb(context,'/rest/v1/rpc/agent_m02_order_signals',{method:'POST',body:{}}),
  sb(context,'/rest/v1/rpc/agent_m02_inventory_signals',{method:'POST',body:{}}),
  observeGitHub(fetch)
 ]);
 const agents=[
  orders.status==='fulfilled'?observeOrders(orders.value):unavailable('orders'),
  inventory.status==='fulfilled'?observeInventory(inventory.value):unavailable('inventory'),
  github.status==='fulfilled'?github.value.security:unavailable('security'),
  github.status==='fulfilled'?github.value.backups:unavailable('backups')
 ];
 return json({
  milestone:'M02',mode:'dry_run',activation:'disabled',agents,
  notice:'No alerts sent, records modified, AI billed or schedules activated.'
 },200,{'Cache-Control':'no-store'});
});
