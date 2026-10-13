/**
 * /api/admin/resolutions
 * GET  — list cases. POST — create case. Roles: owner, manager.
 */
import { withAdmin, sb, json, httpError, readJson, audit, pagination } from '../_lib/auth.js';
import { validateCaseCreate } from '../_lib/resolution-input.js';

export const onRequestGet = withAdmin(['owner', 'manager'], async (context) => {
  const url = new URL(context.request.url);
  const { page, per, rangeHeader } = pagination(url, 25, 100);
  const status = url.searchParams.get('status');

  let q = '/rest/v1/resolution_cases?select=*&order=created_at.desc';
  if (status) q += `&status=eq.${encodeURIComponent(status)}`;

  const { data, total } = await sb(context, q, { headers: { Range: rangeHeader }, count: true });
  return json({ cases: data || [], page, per_page: per, total, total_pages: Math.ceil(total / per) });
});

export const onRequestPost = withAdmin(['owner', 'manager'], async (context, { user, role }) => {
  const row=validateCaseCreate(await readJson(context.request,16*1024));
  const created = await sb(context, '/rest/v1/resolution_cases', { method: 'POST', body: row });
  await audit(context, { actorId:user.id, actorRole:role, action:'resolution.created', entityType:'resolution', entityId:(Array.isArray(created)?created[0]?.id:created?.id), after:{ issue_type: row.issue_type } });
  return json({ case: Array.isArray(created) ? created[0] : created }, 201);
});
