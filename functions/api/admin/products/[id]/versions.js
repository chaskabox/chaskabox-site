/**
 * /api/admin/products/:id/versions
 * GET — list version history. POST — revert to a version.
 * Roles: owner, manager, content (view); owner, manager (revert).
 */
import { withAdmin, sb, json, httpError, readJson, audit } from '../../../_lib/auth.js';

export const onRequestGet = withAdmin(['owner', 'manager', 'content'], async (context) => {
  const id = context.params.id;
  if (!id) httpError('Product id required', 400);
  const versions = await sb(context,
    `/rest/v1/product_versions?product_id=eq.${encodeURIComponent(id)}&select=id,changed_by,change_type,created_at&order=created_at.desc&limit=20`);
  return json({ versions: versions || [] });
});

export const onRequestPost = withAdmin(['owner', 'manager'], async (context, { user, role }) => {
  const id = context.params.id;
  if (!id) httpError('Product id required', 400);
  const body = await readJson(context.request);
  const versionId = body.version_id;
  if (!versionId) httpError('version_id required', 400);

  // Load the version snapshot
  const versions = await sb(context,
    `/rest/v1/product_versions?id=eq.${encodeURIComponent(versionId)}&product_id=eq.${encodeURIComponent(id)}&select=snapshot`);
  if (!versions || !versions.length) httpError('Version not found', 404);
  const snapshot = versions[0].snapshot;

  // Save current as a version before reverting
  const current = await sb(context, `/rest/v1/products?id=eq.${encodeURIComponent(id)}&select=*`);
  if (current && current.length) {
    await sb(context, '/rest/v1/product_versions', {
      method: 'POST',
      body: { product_id: Number(id), snapshot: current[0], changed_by: user.email || user.id, change_type: 'revert' },
    }).catch(() => {});
  }

  // Restore snapshot (only editable fields)
  const EDITABLE = ['name','slug','price','old_price','category','brand','pack','description','badge','image_url','visibility','stock_state','seo_title','seo_description','og_image','canonical_url'];
  const patch = {};
  for (const k of EDITABLE) if (snapshot[k] !== undefined) patch[k] = snapshot[k];
  patch.updated_by = user.id;

  await sb(context, `/rest/v1/products?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
  await audit(context, { actorId: user.id, actorRole: role, action: 'product.reverted', entityType: 'product', entityId: Number(id), after: { version_id: versionId } });

  return json({ ok: true });
});
