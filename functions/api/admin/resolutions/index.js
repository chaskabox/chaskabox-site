/**
 * /api/admin/resolutions
 * GET  — list cases. POST — create case. Roles: owner, manager.
 */
import { withAdmin, sb, json, httpError, readJson, audit, pagination } from '../_lib/auth.js';

export const onRequestGet = withAdmin(['owner', 'manager'], async (context) => {
  const url = new URL(context.request.url);
  const { page, per, rangeHeader } = pagination(url, 25, 100);
  const status = url.searchParams.get('status');

  let q = '/rest/v1/resolution_cases?select=*&order=created_at.desc';
  if (status) q += `&status=eq.${encodeURIComponent(status)}`;

  const { data, total } = await sb(context, q, { headers: { Range: rangeHeader }, count: true });
  return json({ cases: data || [], page, per_page: per, total, total_pages: Math.ceil(total / per) });
});

export const onRequestPost = withAdmin(['owner', 'manager'], async (context, { user }) => {
  const body = await readJson(context.request);
  if (!body.issue_type || !body.description) httpError('issue_type and description required', 400, 'invalid');

  const row = {
    order_id: body.order_id || null,
    order_number: body.order_number || null,
    customer_name: body.customer_name || null,
    customer_phone: body.customer_phone || null,
    issue_type: body.issue_type,
    description: body.description,
    status: 'open',
    refund_amount: Number(body.refund_amount) || 0,
  };
  const created = await sb(context, '/rest/v1/resolution_cases', { method: 'POST', body: row });
  await audit(context, user.id, 'resolution.created', { issue_type: row.issue_type });
  return json({ case: Array.isArray(created) ? created[0] : created }, 201);
});
