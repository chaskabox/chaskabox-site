/**
 * /api/admin/brands/:id
 * PATCH  — update brand. Roles: owner, manager.
 * DELETE — delete brand. Roles: owner.
 */
import { withAdmin, sb, json, httpError, readJson, audit } from '../_lib/auth.js';

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
  if (body.hero_image_url !== undefined) patch.hero_image_url = body.hero_image_url || null;
  if (body.description !== undefined) patch.description = body.description || null;
  if (body.short_description !== undefined) patch.short_description = body.short_description || null;
  if (body.long_description !== undefined) patch.long_description = body.long_description || null;
  if (body.seo_title !== undefined) patch.seo_title = body.seo_title || null;
  if (body.seo_description !== undefined) patch.seo_description = body.seo_description || null;
  if (body.og_image_url !== undefined) patch.og_image_url = body.og_image_url || null;
  if (body.featured_product_ids !== undefined) patch.featured_product_ids = Array.isArray(body.featured_product_ids) ? body.featured_product_ids.filter(n=>Number.isInteger(n)&&n>0) : [];
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order) || 0;
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
