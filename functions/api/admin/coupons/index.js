/**
 * /api/admin/coupons
 * GET — list. POST — create. Roles: owner, manager.
 */
import { withAdmin, sb, json, httpError, readJson, audit } from '../_lib/auth.js';

export const onRequestGet = withAdmin(['owner', 'manager'], async (context) => {
  const coupons = await sb(context, '/rest/v1/coupons?select=*&order=created_at.desc');
  return json({ coupons: coupons || [] });
});

export const onRequestPost = withAdmin(['owner', 'manager'], async (context, { user }) => {
  const body = await readJson(context.request);
  const code = String(body.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) httpError('Coupon code required', 400, 'invalid');
  if (!['percent', 'fixed'].includes(body.discount_type)) httpError('Invalid discount_type', 400, 'invalid');
  const value = Number(body.discount_value);
  if (!value || value <= 0) httpError('Invalid discount_value', 400, 'invalid');
  if (body.discount_type === 'percent' && value > 90) httpError('Percent discount max 90%', 400, 'invalid');

  const row = {
    code,
    discount_type: body.discount_type,
    discount_value: value,
    min_order: Number(body.min_order) || 0,
    max_uses: body.max_uses ? Number(body.max_uses) : null,
    valid_until: body.valid_until || null,
    is_active: body.is_active !== false,
  };
  const created = await sb(context, '/rest/v1/coupons', { method: 'POST', body: row });
  await audit(context, user.id, 'coupon.created', { code });
  return json({ coupon: Array.isArray(created) ? created[0] : created }, 201);
});
