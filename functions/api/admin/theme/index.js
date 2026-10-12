/**
 * /api/admin/theme
 * GET — all theme settings. PUT — update settings. Roles: owner, manager.
 * /api/theme (public) — returns active theme for storefront.
 */
import { withAdmin, sb, json, readJson, audit } from '../_lib/auth.js';
import { validateTheme,DEFAULT_THEME } from '../../_lib/theme-contract.js';
import { cmsMutate } from '../_lib/cms-mutate.js';

export const onRequestGet = withAdmin(['owner', 'manager', 'content'], async (context) => {
  const rows = await sb(context, '/rest/v1/theme_settings?select=*');
  const theme = {};
  (rows || []).forEach(r => { theme[r.key] = r.value; });
  return json({ theme });
});

export const onRequestPut = withAdmin(['owner', 'manager'], async (context, { user, role }) => {
  const body = await readJson(context.request);
  let settings;
  try { settings=body.action==='reset'?DEFAULT_THEME:validateTheme(body.settings||body); }catch(e){return json({error:{code:'INVALID_THEME',message:e.message}},400);}
  if (typeof settings !== 'object') return json({ error: 'Invalid' }, 400);

  if(!settings || Array.isArray(settings) || Object.keys(settings).length<1 || Object.keys(settings).length>50) return json({error:{code:'INVALID_THEME',message:'Theme requires 1..50 string settings'}},400);
  const operations=Object.entries(settings).map(([key,value])=>{if(typeof value!=='string'||key.length>80||value.length>1000) throw json({error:{code:'INVALID_THEME',message:'Invalid theme value'}},400);return {table:'theme_settings',op:'upsert',id:key,data:{key,value,updated_at:new Date().toISOString()}};});
  await cmsMutate(context,user,operations);
  return json({ ok: true });
});
