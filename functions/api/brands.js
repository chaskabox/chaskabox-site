/* GET /api/brands
 * Public brand directory + single-brand lookup for Phase 2A brand pages.
 *
 * Query params:
 *   slug=X   → return one visible brand by slug (404 if missing/hidden)
 *   (none)   → return all visible brands, ordered by sort_order, position
 *
 * Returns ONLY public fields. Product counts are computed from the
 * public_products view brand text match (brand_id may be null).
 * Service-role is used server-side; RLS bypassed by design here.
 */
import { sbRequest } from './_lib/db.js';
import { ok, apiError } from './_lib/respond.js';

const PUBLIC_FIELDS = 'id,name,slug,normalized_name,logo_url,hero_image_url,short_description,long_description,seo_title,seo_description,og_image_url,featured_product_ids,sort_order,is_visible,position';

function publicShape(b, count) {
  return {
    id: Number(b.id),
    name: b.name || '',
    slug: b.slug || '',
    logo: b.logo_url || null,
    hero: b.hero_image_url || null,
    short: b.short_description || '',
    long: b.long_description || '',
    seoTitle: b.seo_title || '',
    seoDescription: b.seo_description || '',
    ogImage: b.og_image_url || null,
    featured: Array.isArray(b.featured_product_ids) ? b.featured_product_ids.map(Number) : [],
    sortOrder: Number(b.sort_order || 0),
    productCount: Number(count || 0),
  };
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const slug = (url.searchParams.get('slug') || '').trim().toLowerCase();

    if (slug) {
      const rows = await sbRequest(context.env, '/brands', {
        query: `?select=${PUBLIC_FIELDS}&slug=eq.${encodeURIComponent(slug)}&is_visible=eq.true&limit=1`,
      });
      const brand = Array.isArray(rows) && rows[0];
      if (!brand) return apiError('NOT_FOUND', 'Brand not found.', 404);
      const count = await countProducts(context.env, brand);
      return ok({ brand: publicShape(brand, count) }, 200, {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      });
    }

    const rows = await sbRequest(context.env, '/brands', {
      query: `?select=${PUBLIC_FIELDS}&is_visible=eq.true&order=sort_order.asc,position.asc,name.asc&limit=200`,
    });
    const list = Array.isArray(rows) ? rows : [];
    // Batch product counts: one query against public_products brand text.
    const counts = await countAllProducts(context.env, list);
    return ok(
      { brands: list.map((b) => publicShape(b, counts.get(brandKey(b)) || 0)) },
      200,
      { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    );
  } catch (error) {
    console.error('[public-brands] failed', error?.message || error);
    return apiError('UNAVAILABLE', 'Brand directory temporarily unavailable.', 503);
  }
}

function brandKey(b) {
  return String(b.normalized_name || b.name || '').toLowerCase().trim();
}

/* Count visible products whose brand text matches (case-insensitive).
 * Falls back to 0 when the view/column is unavailable. */
async function countAllProducts(env, brands) {
  const counts = new Map();
  if (!brands.length) return counts;
  try {
    const rows = await sbRequest(env, '/public_products', {
      query: '?select=brand&limit=1000',
    });
    for (const r of rows || []) {
      const k = String(r.brand || '').toLowerCase().trim();
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  } catch { /* non-fatal: counts stay 0 */ }
  return counts;
}

async function countProducts(env, brand) {
  const counts = await countAllProducts(env, [brand]);
  return counts.get(brandKey(brand)) || 0;
}
