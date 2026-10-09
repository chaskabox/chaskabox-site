/**
 * /api/admin/brands/:id
 * PATCH  — update brand. Roles: owner, manager.
 * DELETE — delete brand. Roles: owner.
 */
import { withAdmin, sb, json, httpError, readJson, audit } from '../../_lib/auth.js';

function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'brand';
}

export const onRequestPatch = withAdmin(['owner', 'manager'], async (context, { user }) => {
  const id = context.params.id;
  if (!id) httpError('Brand id required', 400);

  const body = await readJson(context.request);
  const patch = {};
  if (body.name !== undefined) { patch.name = String(body.name).trim(); patch.slug = slugify(body.slug || body.name); }
  if (body.logo_url !== undefined) patch.logo_url = body.logo_url || null;
  if (body.description !== undefined) patch.description = body.description || null;
  if (body.is_visible !== undefined) patch.is_visible = !!body.is_visible;
  if (body.position !== undefined) patch.position = Number(body.position) || 0;
  patch.updated_at = new Date().toISOString();

  const updated = await sb(context, `/rest/v1/brands?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', body: patch,
  });
  await audit(context, user.id, 'brand.updated', { id });
  return json({ brand: Array.isArray(updated) ? updated[0] : updated });
});

export const onRequestDelete = withAdmin(['owner'], async (context, { user }) => {
  const id = context.params.id;
  if (!id) httpError('Brand id required', 400);

  await sb(context, `/rest/v1/brands?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  await audit(context, user.id, 'brand.deleted', { id });
  return json({ ok: true });
});
