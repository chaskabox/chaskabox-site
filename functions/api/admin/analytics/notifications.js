/**
 * GET /api/admin/analytics/notifications
 * Owner + customer notification queue stats: queued/sent/failed/retry/dead
 * from notification_outbox and customer_notification_outbox, plus
 * order-level email/WhatsApp flags for the last 30 days.
 * Roles: owner, manager.
 */
import { withAdmin, sb, json } from '../_lib/auth.js';
import { callRpc } from './_lib/helpers.js';

export const onRequestGet = withAdmin(['owner', 'manager'], async (context) => {
  const data = await callRpc(context, sb, 'analytics_notifications', {});
  return json({ ok: true, data });
});
