/**
 * GET /api/admin/analytics/categories
 * Per-category orders/units/revenue/AOV, top-3 products, 7-day trend.
 * Roles: owner, manager.
 *
 * Query params: from=YYYY-MM-DD, to=YYYY-MM-DD (default: last 30 days).
 */
import { withAdmin, sb, json } from '../_lib/auth.js';
import { parseRange, callRpc } from './_lib/helpers.js';

export const onRequestGet = withAdmin(['owner', 'manager'], async (context) => {
  const { from, to, fromStr, toStr } = parseRange(new URL(context.request.url));
  const data = await callRpc(context, sb, 'analytics_categories', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  return json({ ok: true, from: fromStr, to: toStr, data });
});
