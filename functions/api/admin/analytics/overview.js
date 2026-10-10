/**
 * GET /api/admin/analytics/overview
 * Main analytics dashboard: top cards, daily revenue/orders series,
 * payment-method split, fulfilment funnel. Roles: owner, manager.
 *
 * Query params: from=YYYY-MM-DD, to=YYYY-MM-DD (default: last 30 days).
 */
import { withAdmin, sb, json } from '../_lib/auth.js';
import { parseRange, callRpc } from './_lib/helpers.js';

export const onRequestGet = withAdmin(['owner', 'manager'], async (context) => {
  const { from, to, fromStr, toStr } = parseRange(new URL(context.request.url));
  const data = await callRpc(context, sb, 'analytics_overview', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  return json({ ok: true, from: fromStr, to: toStr, data });
});
