/**
 * /api/admin/coupons/:id — PATCH toggle/update, DELETE. Roles: owner, manager.
 */
import { withAdmin, sb, json, httpError, readJson, audit } from '../_lib/auth.js';

export const onRequestPatch = withAdmin(['owner', 'manager'], async (context, { user, role }) => {
  const id = context.params.id;
  if (!id) httpError('Coupon id required', 400);
  const body = await readJson(context.request);
  const patch = {};
  if (body.is_active !== undefined) patch.is_active = !!body.is_active;
  if (body.max_uses !== undefined) patch.max_uses = body.max_uses ? Number(body.max_uses) : null;
  if (body.valid_until !== undefined) patch.valid_until = body.valid_until || null;
  if (body.min_order !== undefined) patch.min_order = Number(body.min_order) || 0;
  const updated = await sb(context, `/rest/v1/coupons?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
  await audit(context, { actorId:user.id, actorRole:role, action:'coupon.updated', entityType:'coupon', entityId:id, after:{ id } });
  return json({ coupon: Array.isArray(updated) ? updated[0] : updated });
});

export const onRequestDelete = withAdmin(['owner'], async (context, { user, role }) => {
  const id = context.params.id;
  if (!id) httpError('Coupon id required', 400);
  await sb(context, `/rest/v1/coupons?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  await audit(context, { actorId:user.id, actorRole:role, action:'coupon.deleted', entityType:'coupon', entityId:id, after:{ id } });
  return json({ ok: true });
});
