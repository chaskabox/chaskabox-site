/**
 * GET /api/admin/analytics/customers
 * New vs repeat customers, repeat rate, orders per customer, top customers
 * by recognized spend. PII is masked server-side (first name + last
 * initial; phones show last 4 digits only). Roles: owner, manager.
 *
 * Query params: from=YYYY-MM-DD, to=YYYY-MM-DD (default: last 30 days).
 */
import { withAdmin, sb, json } from '../_lib/auth.js';
import { parseRange, callRpc } from './_lib/helpers.js';

export const onRequestGet = withAdmin(['owner', 'manager'], async (context) => {
  const { from, to, fromStr, toStr } = parseRange(new URL(context.request.url));
  const data = await callRpc(context, sb, 'analytics_customers', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  return json({ ok: true, from: fromStr, to: toStr, data });
});
