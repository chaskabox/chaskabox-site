/**
 * /api/admin/resolutions/:id
 * PATCH — update status/resolution. Roles: owner, manager.
 */
import { withAdmin, sb, json, httpError, readJson, audit } from '../_lib/auth.js';
import { validateCasePatch } from '../_lib/resolution-input.js';

export const onRequestPatch = withAdmin(['owner', 'manager'], async (context, { user, role }) => {
  const id = context.params.id;
  if (!id) httpError('Case id required', 400);

  const patch=validateCasePatch(await readJson(context.request,16*1024));
  const updated = await sb(context, `/rest/v1/resolution_cases?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', body: patch,
  });
  if(!Array.isArray(updated)||updated.length===0)httpError('Case not found. Refresh before retrying.',404,'not_found');
  await audit(context, { actorId:user.id, actorRole:role, action:'resolution.updated', entityType:'resolution', entityId:id, after:{ id, status: patch.status } });
  return json({ case: Array.isArray(updated) ? updated[0] : updated });
});
