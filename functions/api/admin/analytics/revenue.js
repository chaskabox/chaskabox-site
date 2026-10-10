/**
 * GET /api/admin/analytics/revenue
 * Revenue breakdown for a date range. Roles: owner, manager.
 *
 * Query params: from=YYYY-MM-DD, to=YYYY-MM-DD (default: last 30 days).
 *
 * Returns gross_order_value, confirmed_prepaid, delivered_cod,
 * recognized_revenue, pending_cod (integer PKR) plus a `definitions`
 * object with tooltip text for every metric.
 */
import { withAdmin, sb, json } from '../_lib/auth.js';
import { parseRange, callRpc } from './_lib/helpers.js';

export const onRequestGet = withAdmin(['owner', 'manager'], async (context) => {
  const { from, to, fromStr, toStr } = parseRange(new URL(context.request.url));
  const data = await callRpc(context, sb, 'analytics_revenue', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  return json({ ok: true, from: fromStr, to: toStr, data });
});
