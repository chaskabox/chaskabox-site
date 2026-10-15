/**
 * /api/admin/brands
 * GET    — list all brands with product counts. Roles: owner, manager, content.
 * POST   — create brand. Roles: owner, manager.
 * PATCH  — update brand. Roles: owner, manager.
 * DELETE — delete brand. Roles: owner.
 */
import { withAdmin, sb, json, httpError, readJson, audit } from '../_lib/auth.js';
import { cmsMutate } from '../_lib/cms-mutate.js';

function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'brand';
}

export const onRequestGet = withAdmin(['owner', 'manager', 'content'], async (context) => {
  const brands = await sb(context, '/rest/v1/brands?select=*&order=position.asc,name.asc');

  // Count products per brand (via text extraction from product names)
  let counts = {};
  try {
    const prods = await sb(context, '/rest/v1/products?select=name&limit=2000');
    (prods || []).forEach(p => {
      const name = String(p.name || '');
      const m = name.match(/^([^|]+)\|/);
      if (m) {
        const b = m[1].trim();
        counts[b] = (counts[b] || 0) + 1;
      }
    });
  } catch (e) {}

  const enriched = (brands || []).map(b => ({
    ...b,
    product_count: counts[b.name] || 0,
  }));

  // Also include brands found in products but not in brands table
  const knownNames = new Set((brands || []).map(b => b.name));
  const missing = Object.entries(counts)
    .filter(([name]) => !knownNames.has(name))
    .map(([name, count]) => ({ id: null, name, slug: slugify(name), product_count: count, is_visible: true, _auto: true }));

  return json({ brands: [...enriched, ...missing].sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name)) });
});

export const onRequestPost = withAdmin(['owner', 'manager'], async (context, { user, role }) => {
  const body = await readJson(context.request);
  for(const key of ['is_visible','show_on_homepage','hide_if_empty','is_enabled','is_external','is_active'])if(body[key]!==undefined&&typeof body[key]!=='boolean')httpError(`${key} must be boolean`,400,'invalid_field');
  const optionalText=(name,max=2000)=>{
    if(body[name]===undefined||body[name]===null)return null;
    if(typeof body[name]!=='string')httpError(name+' must be text',400,'invalid_field');
    const value=body[name].trim();
    if(value.length>max)httpError(name+' exceeds '+max+' characters',400,'invalid_field');
    return value||null;
  };
  const ids=body.featured_product_ids;
  if(ids!==undefined && (!Array.isArray(ids)||ids.length>50||
      ids.some(x=>!Number.isSafeInteger(x)||x<=0)))httpError('Invalid featured product ids',400,'invalid_field');
  const sortOrder=Number(body.sort_order??0);
  if(!Number.isSafeInteger(sortOrder)||sortOrder<0||sortOrder>1000000)httpError('Invalid sort order',400,'invalid_field');
  const name = String(body.name || '').trim();
  if (!name || name.length>160) httpError('Brand name must be 1–160 characters',400,'invalid');

  const row = {
    name,
    slug: body.slug ? slugify(body.slug) : slugify(name),
    logo_url: body.logo_url || null,
    description: optionalText('description'),
    hero_image_url: optionalText('hero_image_url',500),
    short_description: optionalText('short_description',160),
    long_description: optionalText('long_description'),
    seo_title: optionalText('seo_title',160),
    seo_description: optionalText('seo_description',320),
    og_image_url: optionalText('og_image_url',500),
    featured_product_ids: ids||[],
    sort_order: sortOrder,
    is_visible: body.is_visible !== false,
    position: Number(body.position || 0),
  };
  const created=await cmsMutate(context,user,[{table:'brands',op:'insert',data:row}]);
  return json({ brand: Array.isArray(created) ? created[0] : created }, 201);
});
