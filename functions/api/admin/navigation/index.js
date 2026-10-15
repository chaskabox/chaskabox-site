/**
 * /api/admin/navigation
 * GET  — all navigation items grouped by location. Roles: owner, manager, content.
 * POST — create nav item. Roles: owner, manager, content.
 */
import { withAdmin, sb, json, httpError, readJson, audit } from '../_lib/auth.js';
import { cmsMutate } from '../_lib/cms-mutate.js';

// Public navigation URLs must remain internal paths, links to secure websites,
// or explicit contact actions. Never allow executable schemes or protocol-relative URLs.
export function safeNavTarget(value){
  if(typeof value!=='string')httpError('Navigation URL must be text',400,'invalid_url');
  const s=value.trim();
  if(!s||s.length>500||/[\u0000-\u0020\u007f]/.test(s))
    httpError('Navigation URL is empty, too long or contains invalid spacing',400,'invalid_url');
  if(s==='/'||(/^\/(?!\/)/.test(s)))return s;
  if(/^#[a-z0-9_.-]*$/i.test(s))return s;
  if(/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(s))return s;
  if(/^tel:\+?[0-9() -]{6,24}$/i.test(s))return s;
  try{
    const parsed=new URL(s);
    if(parsed.protocol==='https:'&&parsed.hostname&&!parsed.username&&!parsed.password)return s;
  }catch{}
  httpError('Use a relative /path, https:// URL, email or telephone link',400,'invalid_url');
}
export function navLabel(value){
  if(typeof value!=='string'||!value.trim()||value.trim().length>100)
    httpError('Menu label must contain 1–100 characters',400,'invalid_label');
  return value.trim();
}
export function navLocation(value){
  if(!['header','footer','mobile'].includes(value))httpError('Choose header, footer or mobile menu',400,'invalid_location');
  return value;
}


export const onRequestGet = withAdmin(['owner', 'manager', 'content'], async (context) => {
  const items = await sb(context, '/rest/v1/navigation_menus?select=*&order=location.asc,position.asc');
  const grouped = { header: [], footer: [], mobile: [] };
  (items || []).forEach(i => { if (grouped[i.location]) grouped[i.location].push(i); });


  return json({ navigation: grouped, all: items || [], is_default: !items || !items.length });
});

export const onRequestPost = withAdmin(['owner', 'manager', 'content'], async (context, { user, role }) => {
  const body = await readJson(context.request);
  for(const key of ['is_visible','show_on_homepage','hide_if_empty','is_enabled','is_external','is_active'])if(body[key]!==undefined&&typeof body[key]!=='boolean')httpError(`${key} must be boolean`,400,'invalid_field');
  const label=navLabel(body.label),location=navLocation(body.location);
  const url=safeNavTarget(body.url||'#');
  const position=Number(body.position??0);
  if(!Number.isSafeInteger(position)||position<0||position>100000)httpError('Invalid menu position',400,'invalid_position');
  const row={
    location,label,url,parent_id:null,position,
    is_external:/^https:///i.test(url),
    is_enabled:body.is_enabled!==false,
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
    if(it.position!==undefined){if(!Number.isInteger(it.position)||it.position<0||it.position>100000)httpError('Invalid position',400,'invalid');data.position=it.position;}
    if(it.is_enabled!==undefined){if(typeof it.is_enabled!=='boolean')httpError('is_enabled must be boolean',400,'invalid');data.is_enabled=it.is_enabled;}
    if(it.label!==undefined)data.label=navLabel(it.label);
    if(it.location!==undefined)data.location=navLocation(it.location);
    if(it.url!==undefined){data.url=safeNavTarget(it.url);data.is_external=/^https:///i.test(data.url);}
    if(!Object.keys(data).length)httpError('Navigation change required',400,'invalid');
    operations.push({table:'navigation_menus',op:'update',id,data});
  }
  const saved=operations.length?await cmsMutate(context,user,operations):[];
  const updated=saved.length;
  return json({ ok: true, updated });
});
