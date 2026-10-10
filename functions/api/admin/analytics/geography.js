/**
 * GET /api/admin/analytics/geography
 * Orders and revenue by city. Roles: owner, manager.
 *
 * Query params:
 *   from, to — YYYY-MM-DD (default: last 30 days)
 */
import { withAdmin, sb, json } from '../_lib/auth.js';
import { parseRange, callRpc } from './_lib/helpers.js';

export const onRequestGet = withAdmin(['owner', 'manager'], async (context) => {
  const url = new URL(context.request.url);
  const { from, to, fromStr, toStr } = parseRange(url);
  const data = await callRpc(context, sb, 'analytics_geography', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  return json({ ok: true, from: fromStr, to: toStr, data });
});
