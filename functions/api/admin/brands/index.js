/**
 * /api/admin/brands
 * GET    — list all brands with product counts. Roles: owner, manager, content.
 * POST   — create brand. Roles: owner, manager.
 * PATCH  — update brand. Roles: owner, manager.
 * DELETE — delete brand. Roles: owner.
 */
import { withAdmin, sb, json, httpError, readJson, audit } from '../_lib/auth.js';

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

export const onRequestPost = withAdmin(['owner', 'manager'], async (context, { user }) => {
  const body = await readJson(context.request);
  const name = String(body.name || '').trim();
  if (!name) httpError('Brand name required', 400, 'invalid');

  const row = {
    name,
    slug: body.slug ? slugify(body.slug) : slugify(name),
    logo_url: body.logo_url || null,
    description: body.description || null,
    is_visible: body.is_visible !== false,
    position: Number(body.position || 0),
  };
  const created = await sb(context, '/rest/v1/brands', { method: 'POST', body: row });
  await audit(context, user.id, 'brand.created', { name });
  return json({ brand: Array.isArray(created) ? created[0] : created }, 201);
});
