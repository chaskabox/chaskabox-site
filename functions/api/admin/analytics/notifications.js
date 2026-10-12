/**
 * GET /api/admin/analytics/notifications
 * Exact channel-ledger counts, verified provider receipts and retained legacy queues.
 * Roles: owner, manager.
 */
import { withAdmin, sb, json } from '../_lib/auth.js';
import { callRpc } from './_lib/helpers.js';

export const onRequestGet = withAdmin(['owner', 'manager'], async (context) => {
  const data = await callRpc(context, sb, 'analytics_notifications', {});
  return json({ ok: true, data });
});
