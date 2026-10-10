/**
 * /api/admin/navigation
 * GET  — all navigation items grouped by location. Roles: owner, manager, content.
 * POST — create nav item. Roles: owner, manager, content.
 */
import { withAdmin, sb, json, httpError, readJson, audit } from '../_lib/auth.js';

export const onRequestGet = withAdmin(['owner', 'manager', 'content'], async (context) => {
  const items = await sb(context, '/rest/v1/navigation_menus?select=*&order=location.asc,position.asc');
  const grouped = { header: [], footer: [], mobile: [] };
  (items || []).forEach(i => { if (grouped[i.location]) grouped[i.location].push(i); });

  // Fallback: if navigation_menus is empty, return live site defaults
  // so admin isn't blank. These match index.html header/footer.
  if (!items || !items.length) {
    grouped.header = [
      { id: 'default-1', location: 'header', label: 'Shop', url: '/shop/', position: 1, is_enabled: true },
      { id: 'default-2', location: 'header', label: 'Categories', url: '/shop/', position: 2, is_enabled: true },
      { id: 'default-3', location: 'header', label: 'Brands', url: '/shop/', position: 3, is_enabled: true },
      { id: 'default-4', location: 'header', label: 'Chaska Boxes', url: '/bundles/', position: 4, is_enabled: true },
      { id: 'default-5', location: 'header', label: 'Deals', url: '/shop/', position: 5, is_enabled: true },
    ];
    grouped.footer = [
      { id: 'default-6', location: 'footer', label: 'All Snacks', url: '/shop/', position: 1, is_enabled: true },
      { id: 'default-7', location: 'footer', label: 'Chaska Boxes', url: '/bundles/', position: 2, is_enabled: true },
      { id: 'default-8', location: 'footer', label: 'Track Order', url: '/track-order.html', position: 3, is_enabled: true },
      { id: 'default-9', location: 'footer', label: 'Contact', url: '/contact/', position: 4, is_enabled: true },
      { id: 'default-10', location: 'footer', label: 'Privacy', url: '/privacy-policy/', position: 5, is_enabled: true },
      { id: 'default-11', location: 'footer', label: 'Terms', url: '/terms/', position: 6, is_enabled: true },
    ];
  }

  return json({ navigation: grouped, all: items || [], is_default: !items || !items.length });
});

export const onRequestPost = withAdmin(['owner', 'manager', 'content'], async (context, { user }) => {
  const body = await readJson(context.request);
  if (!body.label || !body.location) httpError('label and location required', 400, 'invalid');

  const row = {
    location: body.location,
    label: String(body.label),
    url: String(body.url || '#'),
    parent_id: body.parent_id || null,
    position: Number(body.position || 0),
    is_external: !!body.is_external,
    is_enabled: body.is_enabled !== false,
  };
  const created = await sb(context, '/rest/v1/navigation_menus', { method: 'POST', body: row });
  await audit(context, user.id, 'navigation.created', { label: row.label });
  return json({ item: Array.isArray(created) ? created[0] : created }, 201);
});

/**
 * PATCH — reorder nav items (touch-friendly up/down buttons + drag fallback).
 * Body: { items: [{ id, position }] }. Roles: owner, manager, content.
 */
export const onRequestPatch = withAdmin(['owner', 'manager', 'content'], async (context, { user, role }) => {
  const body = await readJson(context.request);
  const items = body.items;
  if (!Array.isArray(items) || !items.length) httpError('items array required', 400, 'invalid');
  if (items.length > 100) httpError('too many items', 400, 'invalid');
  let updated = 0;
  for (const it of items) {
    const id = String(it && it.id || '');
    // Default rows (id like "default-1") are not persisted — skip silently.
    if (!id || id.startsWith('default-')) continue;
    const patch = {};
    if (it.position !== undefined && Number.isFinite(Number(it.position))) patch.position = Math.round(Number(it.position));
    if (it.is_enabled !== undefined) patch.is_enabled = !!it.is_enabled;
    if (!Object.keys(patch).length) continue;
    await sb(context, `/rest/v1/navigation_menus?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
    updated++;
  }
  await audit(context, { actorId: user.id, actorRole: role, action: 'navigation.reordered', entityType: 'navigation', entityId: 'menus', before: null, after: { count: updated } });
  return json({ ok: true, updated });
});
