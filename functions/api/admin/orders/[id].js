/**
 * GET /api/admin/orders/:id
 * Full order detail: order row + immutable line-item snapshots + audit trail.
 * Roles: owner, manager, fulfilment.
 */
import { withAdmin, sb, json, httpError } from '../_lib/auth.js';

export const onRequestGet = withAdmin(['owner', 'manager', 'fulfilment'], async (context) => {
  const id = context.params.id;
  if (!id) httpError('Order id required', 400);

  const orders = await sb(context, `/rest/v1/orders?id=eq.${encodeURIComponent(id)}&select=*`);
  const order = orders && orders[0];
  if (!order) httpError('Order not found', 404, 'not_found');

  const items = await sb(context, `/rest/v1/order_items?order_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.asc`);

  const history = await sb(
    context,
    `/rest/v1/audit_log?entity_type=eq.order&entity_id=eq.${encodeURIComponent(String(order.id))}&select=actor_id,actor_role,action,before_data,after_data,created_at&order=created_at.asc&limit=200`
  );

  const shipmentRows = await sb(context,`/rest/v1/courier_order_shipments?order_id=eq.${encodeURIComponent(id)}&select=order_id,courier_id,courier_name_snapshot,tracking_number,settlement_days_snapshot,deduction_snapshot_pkr,assigned_at`);
  const receipts=await sb(context,`/rest/v1/cod_advance_receipts?order_id=eq.${encodeURIComponent(id)}&select=id,amount_pkr,channel,reference,received_on,created_at&order=created_at.asc`);
  const advanceReceived=(receipts||[]).reduce((sum,row)=>sum+Number(row.amount_pkr||0),0);
  return json({
    order, items: items || [], history: history || [], courier_shipment:(shipmentRows||[])[0]||null,
    cod_advance:{
      required_pkr:Number(order.cod_advance_required_pkr||0),
      received_pkr:advanceReceived,
      remaining_pkr:Math.max(0,Number(order.cod_advance_required_pkr||0)-advanceReceived),
      courier_cod_pkr:Math.max(0,Number(order.total||0)-Number(order.cod_advance_required_pkr||0)),
      receipts:receipts||[]
    }
  });
});
