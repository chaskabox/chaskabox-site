/**
 * /api/admin/product-versions
 * GET  ?product_id=123 — list version history. Roles: owner, manager, content.
 * POST {product_id, version_id} — revert to a version. Roles: owner, manager.
 */
import { withAdmin, sb, json, httpError, readJson, audit } from './_lib/auth.js';

export const onRequestGet = withAdmin(['owner', 'manager', 'content'], async (context) => {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('product_id');
  if (!id) httpError('product_id required', 400);
  const versions = await sb(context,
    `/rest/v1/product_versions?product_id=eq.${encodeURIComponent(id)}&select=id,changed_by,change_type,created_at&order=created_at.desc&limit=20`);
  return json({ versions: versions || [] });
});

export const onRequestPost = withAdmin(['owner', 'manager'], async (context, { user, role }) => {
  const body = await readJson(context.request);
  const id = body.product_id;
  const versionId = body.version_id;
  if (!id || !versionId) httpError('product_id and version_id required', 400);

  const versions = await sb(context,
    `/rest/v1/product_versions?id=eq.${encodeURIComponent(versionId)}&product_id=eq.${encodeURIComponent(id)}&select=snapshot`);
  if (!versions || !versions.length) httpError('Version not found', 404);
  const snapshot = versions[0].snapshot;

  const current = await sb(context, `/rest/v1/products?id=eq.${encodeURIComponent(id)}&select=*`);
  if (current && current.length) {
    await sb(context, '/rest/v1/product_versions', {
      method: 'POST',
      body: { product_id: Number(id), snapshot: current[0], changed_by: user.email || user.id, change_type: 'revert' },
    }).catch(() => {});
  }

  const EDITABLE = ['name','slug','price','old_price','category','brand','pack','description','badge','image_url','visibility','stock_state','seo_title','seo_description','og_image','canonical_url'];
  const patch = {};
  for (const k of EDITABLE) if (snapshot[k] !== undefined) patch[k] = snapshot[k];
  patch.updated_by = user.id;

  await sb(context, `/rest/v1/products?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
  await audit(context, { actorId: user.id, actorRole: role, action: 'product.reverted', entityType: 'product', entityId: Number(id), after: { version_id: versionId } });

  return json({ ok: true });
});
