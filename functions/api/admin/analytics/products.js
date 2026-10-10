/**
 * GET /api/admin/analytics/products
 * Per-product sales: units, gross value, recognized revenue, order count,
 * 7-day trend, plus never-sold and missing-image lists. Roles: owner, manager.
 *
 * Query params:
 *   from, to   — YYYY-MM-DD (default: last 30 days)
 *   sort       — units | revenue | recognized | orders | name (default: units)
 *   limit      — 1..200 (default: 50)
 */
import { withAdmin, sb, json } from '../_lib/auth.js';
import { parseRange, callRpc } from './_lib/helpers.js';

const SORTS = ['units', 'revenue', 'recognized', 'orders', 'name'];

export const onRequestGet = withAdmin(['owner', 'manager'], async (context) => {
  const url = new URL(context.request.url);
  const { from, to, fromStr, toStr } = parseRange(url);
  const sortRaw = (url.searchParams.get('sort') || 'units').toLowerCase();
  const sort = SORTS.includes(sortRaw) ? sortRaw : 'units';
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));

  const data = await callRpc(context, sb, 'analytics_products', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_sort: sort,
    p_limit: limit,
  });
  return json({ ok: true, from: fromStr, to: toStr, sort, limit, data });
});
