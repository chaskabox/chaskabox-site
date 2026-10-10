import { sbRequest } from './_lib/db.js';
// Dynamic product sitemap: ALL visible products (not just new IDs).
// Static sitemap-products.xml covers the same URLs as a fallback;
// this endpoint is always fresh (new/updated products appear immediately).
const x = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export async function onRequestGet({ env }) {
  try {
    const rows = await sbRequest(env, '/public_products', {
      query: `?select=id,updated_at,image_url&order=id.asc&limit=5000`
    }).catch(async () =>
      sbRequest(env, '/public_products', { query: `?select=id&order=id.asc&limit=5000` })
    );
    const urls = (rows || []).map(p => {
      const lastmod = p.updated_at ? `<lastmod>${x(String(p.updated_at).slice(0, 10))}</lastmod>` : '';
      const img = p.image_url ? `<image:image><image:loc>${x(p.image_url)}</image:loc></image:image>` : '';
      return `  <url><loc>https://chaskabox.online/product/${x(p.id)}/</loc>${lastmod}<changefreq>weekly</changefreq><priority>0.8</priority>${img}</url>`;
    }).join('\n');
    // Phase 2A: brand directory + brand detail URLs
    let brandUrls = '  <url><loc>https://chaskabox.online/brands/</loc><changefreq>daily</changefreq><priority>0.7</priority></url>';
    try {
      const brands = await sbRequest(env, '/brands', {
        query: '?select=slug,updated_at&is_visible=eq.true&order=slug.asc&limit=200',
      });
      brandUrls += '\n' + (brands || []).map(b =>
        `  <url><loc>https://chaskabox.online/brand/${x(b.slug)}/</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>`
      ).join('\n');
    } catch { /* brands table may not have new columns yet; directory URL still listed */ }
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls}\n${brandUrls}\n</urlset>`;
    return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public,max-age=1800' } });
  } catch (e) {
    return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', { status: 503, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
}
