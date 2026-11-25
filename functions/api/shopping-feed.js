import { publicCatalogue } from './_lib/catalogue-search.js';
import { descriptionSummary } from './_lib/product-description.js';
import { productImage } from './_lib/seo.js';
import { LOCAL_PHOTOS } from './_lib/local-photos.js';
// Google Merchant Center product feed (RSS 2.0 + g: namespace).
// Only the public catalogue: visible products with a valid price and image.
// Availability is honest about the no-stock model: most products are sourced
// after the order, so they are backorder, never claimed in stock.
const x = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
function availability(state) {
  switch (String(state || '').toLowerCase()) {
    case 'available':
    case 'limited': return 'in_stock';
    case 'unavailable': return 'out_of_stock';
    default: return 'backorder';
  }
}
export async function onRequestGet({ env }) {
  try {
    const rows = await publicCatalogue(env);
    const items = (rows || []).filter(p => {
      const price = Number(p.price);
      if (!Number.isFinite(price) || price <= 0) return false;
      return !!productImage(p.image_url, LOCAL_PHOTOS);
    }).map(p => {
      const price = Number(p.price).toFixed(2);
      const name = String(p.name || '').trim();
      const pack = String(p.pack || '').trim();
      const title = name && pack && !name.toLowerCase().includes(pack.toLowerCase()) ? `${name} — ${pack}` : name;
      const desc = (descriptionSummary(p.description) || String(p.seo_description || '').trim() || `Buy ${name} online from ChaskaBox Pakistan.`).slice(0, 500);
      const brand = String(p.brand || '').trim();
      const img = productImage(p.image_url, LOCAL_PHOTOS);
      return `  <item><g:id>${x(p.id)}</g:id><title>${x(title)}</title><description>${x(desc)}</description><g:link>https://chaskabox.online/product/${x(p.id)}/</g:link><g:image_link>${x(img)}</g:image_link><g:price>${price} PKR</g:price><g:availability>${availability(p.stock_state)}</g:availability><g:condition>new</g:condition>${brand ? `<g:brand>${x(brand)}</g:brand>` : ''}</item>`;
    }).join('\n');
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n<channel><title>ChaskaBox Pakistan</title><link>https://chaskabox.online/</link><description>Pakistani snacks, biscuits, candies and Chaska Boxes with delivery across Pakistan.</description>\n${items}\n</channel>\n</rss>`;
    return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public,max-age=300' } });
  } catch (e) {
    return new Response('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>ChaskaBox Pakistan</title><link>https://chaskabox.online/</link><description>Feed temporarily unavailable.</description></channel></rss>', { status: 503, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
}
