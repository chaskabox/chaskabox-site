/**
 * /api/admin/shipping-zones
 * GET — list. POST — create. PATCH /:id — update. DELETE /:id — delete.
 * Roles: owner, manager.
 */
import { withAdmin, sb, json, httpError, readJson, audit } from '../_lib/auth.js';

export const onRequestGet = withAdmin(['owner', 'manager'], async (context) => {
  const zones = await sb(context, '/rest/v1/shipping_zones?select=*&order=position.asc');
  return json({ zones: zones || [] });
});

export const onRequestPost = withAdmin(['owner', 'manager'], async (context, { user }) => {
  const body = await readJson(context.request);
  const name = String(body.name || '').trim();
  if (!name) httpError('Zone name required', 400, 'invalid');
  const row = {
    name,
    cities: Array.isArray(body.cities) ? body.cities : [],
    fee: Number(body.fee) || 0,
    free_above: body.free_above ? Number(body.free_above) : null,
    is_active: body.is_active !== false,
    position: Number(body.position) || 0,
  };
  const created = await sb(context, '/rest/v1/shipping_zones', { method: 'POST', body: row });
  await audit(context, user.id, 'shipping_zone.created', { name });
  return json({ zone: Array.isArray(created) ? created[0] : created }, 201);
});
