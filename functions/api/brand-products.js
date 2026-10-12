import {cataloguePhoto,photoUnderReview} from './_lib/catalogue-photos.js';
/* GET /api/brand-products?slug=X
 * Public: visible products for one brand (by brand slug).
 * Resolves the brand via /api/brands logic, then matches products by
 * brand_id FK first, falling back to brand text (case-insensitive).
 *
 * Query params: slug (required), limit (default 200, max 500)
 */
import { sbRequest } from './_lib/db.js';
import { ok, apiError } from './_lib/respond.js';

function localShape(p) {
  return {
    id: Number(p.id),
    slug: p.slug || '',
    name: p.name || '',
    brand: p.brand || '',
    price: Number(p.price || 0),
    oldPrice: p.old_price == null ? null : Number(p.old_price),
    category: p.category || '',
    pack: p.pack || '',
    desc: p.description || '',
    badge: p.badge || '',
    img: cataloguePhoto(p)||null,
    photoNote:photoUnderReview(p)?'Photo under review':'',
    stockState:p.stock_state||'sourced_after_order',
    bundle: !!p.is_bundle,
  };
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const slug = (url.searchParams.get('slug') || '').trim().toLowerCase();
    if (!slug) return apiError('VALIDATION_ERROR', 'Brand slug is required.', 400);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 1), 500);

    const brows = await sbRequest(context.env, '/brands', {
      query: `?select=id,name,normalized_name&slug=eq.${encodeURIComponent(slug)}&is_visible=eq.true&limit=1`,
    });
    const brand = Array.isArray(brows) && brows[0];
    if (!brand) return apiError('NOT_FOUND', 'Brand not found.', 404);

    // 1) products linked by brand_id (service-role: filter visibility manually)
    const cols = 'id,slug,name,brand,category,pack,price,old_price,description,badge,image_url,is_bundle,stock_state';
    let rows = await sbRequest(context.env, '/products', {
      query: `?select=${cols}&brand_id=eq.${Number(brand.id)}&visibility=eq.visible&order=id.asc&limit=${limit}`,
    });

    // 2) fallback: brand text match (case-insensitive)
    if (!rows || !rows.length) {
      const bname = String(brand.normalized_name || brand.name || '');
      rows = await sbRequest(context.env, '/public_products', {
        query: `?select=id,slug,name,brand,category,pack,price,old_price,description,badge,image_url,is_bundle,stock_state&order=id.asc&limit=1000`,
      });
      const key = bname.toLowerCase().trim();
      rows = (rows || []).filter((r) => String(r.brand || '').toLowerCase().trim() === key).slice(0, limit);
    }

    return ok({ brand: brand.name, products: (rows || []).map(localShape) }, 200, {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    });
  } catch (error) {
    console.error('[brand-products] failed', error?.message || error);
    return apiError('UNAVAILABLE', 'Brand products temporarily unavailable.', 503);
  }
}
