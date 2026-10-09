/**
 * /api/admin/notification-templates/:id
 * PATCH — update template. Roles: owner, manager.
 */
import { withAdmin, sb, json, httpError, readJson, audit } from '../../_lib/auth.js';

export const onRequestPatch = withAdmin(['owner', 'manager'], async (context, { user }) => {
  const id = context.params.id;
  if (!id) httpError('Template id required', 400);

  const body = await readJson(context.request);
  const patch = {};
  if (body.subject !== undefined) patch.subject = body.subject || null;
  if (body.body !== undefined) {
    if (!String(body.body).trim()) httpError('Body cannot be empty', 400, 'invalid');
    patch.body = body.body;
  }
  if (body.is_active !== undefined) patch.is_active = !!body.is_active;
  patch.updated_at = new Date().toISOString();

  const updated = await sb(context, `/rest/v1/notification_templates?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', body: patch,
  });
  await audit(context, user.id, 'template.updated', { id });
  return json({ template: Array.isArray(updated) ? updated[0] : updated });
});
