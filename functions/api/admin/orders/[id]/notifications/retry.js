import { withAdmin, sb, json, httpError } from '../../../_lib/auth.js';
export const onRequestPost = withAdmin(['owner', 'manager', 'fulfilment'], async (context, { user }) => {
  const id = context.params.id;
  if (!/^[a-f0-9-]{36}$/i.test(id || '')) httpError('Valid order id required', 400);
  const rows = await sb(context, '/rest/v1/orders?id=eq.' + encodeURIComponent(id) + '&select=id,order_number&limit=1');
  if (!rows?.[0]) httpError('Order not found', 404, 'not_found');
  // The RPC audits the retry and only queues safe, current, unsent jobs.
  // Accepted, processing, uncertain, dead and historical jobs cannot be reset.
  const result = await sb(context, '/rest/v1/rpc/notification_retry_order', { method: 'POST', body: { p_order_id: id, p_actor: user.id } });
  return json({ ok: true, order_number: rows[0].order_number, ...result });
});
