import { sbRequest } from './_lib/db.js';
import { productImage } from './_lib/seo.js';
import { LOCAL_PHOTOS } from './_lib/local-photos.js';
import { cataloguePhoto } from './_lib/catalogue-photos.js';
import { validLastmod, sitemapPublicBrands } from './_lib/sitemap-helpers.js';
// Public products and nonempty visible brands; match the actual public routes.
const x = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export async function onRequestGet({ env }) {
  try {
    const rows=[];
    for(let page=0;page<100;page++){
      const chunk=await sbRequest(env,'/public_products',{query:'?select=id,brand,pack,updated_at,image_url,canonical_url&order=id.asc&limit=500&offset='+page*500});
      if(!Array.isArray(chunk))throw Error('Invalid public catalogue');
      rows.push(...chunk);
      if(chunk.length<500)break;
      if(page===99)throw Error('Public catalogue exceeds sitemap pagination limit');
    }
    const urls = (rows || []).filter(p=>{
      const external=String(p.canonical_url||'').trim();
      return !/^https:\/\/chaskabox\.online\/product\/[1-9]\d*\/$/.test(external)||external===`https://chaskabox.online/product/${p.id}/`;
    }).map(p => {
      const date = validLastmod(p.updated_at);
      const lastmod = date ? `<lastmod>${date}</lastmod>` : '';
      const validImage = productImage(cataloguePhoto(p), LOCAL_PHOTOS);
      const img = validImage ? `<image:image><image:loc>${x(validImage)}</image:loc></image:image>` : '';
      return `  <url><loc>https://chaskabox.online/product/${x(p.id)}/</loc>${lastmod}${img}</url>`;
    }).join('\n');
    // Phase 2A: brand directory + brand detail URLs
    let brandUrls = '  <url><loc>https://chaskabox.online/brands/</loc></url>';
    try {
      const brands = await sbRequest(env, '/brands', {
        query: '?select=name,slug,updated_at&is_visible=eq.true&order=slug.asc&limit=200',
      });
      brandUrls += '\n' + sitemapPublicBrands(rows,brands).map(b => {
        const date=validLastmod(b.updated_at);
        return `  <url><loc>https://chaskabox.online/brand/${x(b.slug)}/</loc>${date?`<lastmod>${date}</lastmod>`:''}</url>`;
      }).join('\n');
    } catch { /* brands table may not have new columns yet; directory URL still listed */ }
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls}\n${brandUrls}\n</urlset>`;
    return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public,max-age=300' } });
  } catch (e) {
    return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', { status: 503, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
}
