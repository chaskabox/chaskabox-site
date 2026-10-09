/**
 * /api/admin/resolutions/:id
 * PATCH — update status/resolution. Roles: owner, manager.
 */
import { withAdmin, sb, json, httpError, readJson, audit } from '../_lib/auth.js';

export const onRequestPatch = withAdmin(['owner', 'manager'], async (context, { user }) => {
  const id = context.params.id;
  if (!id) httpError('Case id required', 400);

  const body = await readJson(context.request);
  const patch = {};
  if (body.status) {
    if (!['open', 'in_progress', 'resolved', 'rejected'].includes(body.status)) httpError('Invalid status', 400);
    patch.status = body.status;
    if (body.status === 'resolved' || body.status === 'rejected') patch.resolved_at = new Date().toISOString();
  }
  if (body.resolution !== undefined) patch.resolution = body.resolution || null;
  if (body.refund_amount !== undefined) patch.refund_amount = Number(body.refund_amount) || 0;
  patch.updated_at = new Date().toISOString();

  const updated = await sb(context, `/rest/v1/resolution_cases?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', body: patch,
  });
  await audit(context, user.id, 'resolution.updated', { id, status: patch.status });
  return json({ case: Array.isArray(updated) ? updated[0] : updated });
});
