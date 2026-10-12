/**
 * /api/admin/navigation
 * GET  — all navigation items grouped by location. Roles: owner, manager, content.
 * POST — create nav item. Roles: owner, manager, content.
 */
import { withAdmin, sb, json, httpError, readJson, audit } from '../_lib/auth.js';
import { cmsMutate } from '../_lib/cms-mutate.js';

export const onRequestGet = withAdmin(['owner', 'manager', 'content'], async (context) => {
  const items = await sb(context, '/rest/v1/navigation_menus?select=*&order=location.asc,position.asc');
  const grouped = { header: [], footer: [], mobile: [] };
  (items || []).forEach(i => { if (grouped[i.location]) grouped[i.location].push(i); });


  return json({ navigation: grouped, all: items || [], is_default: !items || !items.length });
});

export const onRequestPost = withAdmin(['owner', 'manager', 'content'], async (context, { user, role }) => {
  const body = await readJson(context.request);
  for(const key of ['is_visible','show_on_homepage','hide_if_empty','is_enabled','is_external','is_active'])if(body[key]!==undefined&&typeof body[key]!=='boolean')httpError(`${key} must be boolean`,400,'invalid_field');
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
  const created = await cmsMutate(context,user,[{table:'navigation_menus',op:'insert',data:row}]);
  return json({ item: Array.isArray(created) ? created[0] : created }, 201);
});

/**
 * PATCH — reorder nav items (touch-friendly up/down buttons + drag fallback).
 * Body: { items: [{ id, position }] }. Roles: owner, manager, content.
 */
export const onRequestPatch = withAdmin(['owner', 'manager', 'content'], async (context, { user, role }) => {
  const body = await readJson(context.request);
  for(const key of ['is_visible','show_on_homepage','hide_if_empty','is_enabled','is_external','is_active'])if(body[key]!==undefined&&typeof body[key]!=='boolean')httpError(`${key} must be boolean`,400,'invalid_field');
  const items = body.items;
  if (!Array.isArray(items) || !items.length) httpError('items array required', 400, 'invalid');
  if (items.length > 100) httpError('too many items', 400, 'invalid');
  const operations=[];
  for (const it of items) {
    const id=String(it?.id||'');

    if(!/^[0-9a-f-]{36}$/i.test(id))httpError('Invalid navigation id',400,'invalid');
    const data={};
    if(it.position!==undefined){if(!Number.isInteger(it.position)||Math.abs(it.position)>100000)httpError('Invalid position',400,'invalid');data.position=it.position;}
    if(it.is_enabled!==undefined){if(typeof it.is_enabled!=='boolean')httpError('is_enabled must be boolean',400,'invalid');data.is_enabled=it.is_enabled;}
    if(!Object.keys(data).length)httpError('Navigation change required',400,'invalid');
    operations.push({table:'navigation_menus',op:'update',id,data});
  }
  const saved=operations.length?await cmsMutate(context,user,operations):[];
  const updated=saved.length;
  return json({ ok: true, updated });
});
