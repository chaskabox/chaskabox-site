// SSR for /brand/<slug>/ — serves index.html with dynamic OG tags injected
import { sbRequest } from '../api/_lib/db.js';

const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

export async function onRequestGet(context) {
  const slugParam = context.params.slug;
  const slug = (Array.isArray(slugParam) ? slugParam[0] : slugParam) || '';

  let brand = null;
  try {
    const rows = await sbRequest(context.env, '/brands', {
      query: `?select=name,slug,logo_url,hero_image_url,short_description,seo_title,seo_description,og_image_url&slug=eq.${encodeURIComponent(slug)}&is_visible=eq.true&limit=1`,
    });
    brand = Array.isArray(rows) && rows[0];
  } catch (e) {}

  const name = brand?.name || 'Brand';
  const title = brand?.seo_title || `${name} Snacks Online in Pakistan | ChaskaBox`;
  const desc = brand?.seo_description || brand?.short_description || `Shop ${name} snacks online at ChaskaBox Pakistan.`;
  const ogImage = brand?.og_image_url || brand?.logo_url || 'https://chaskabox.online/images/logo.png';
  const url = `https://chaskabox.online/brand/${encodeURIComponent(slug)}/`;

  // Fetch the main index.html and inject OG tags
  let html = '';
  try {
    const req = new Request(new URL('/index.html', context.request.url));
    const res = await context.env.ASSETS.fetch(req);
    html = await res.text();
  } catch (e) {
    // Fallback: minimal HTML
    html = '<!DOCTYPE html><html><head><title>ChaskaBox</title></head><body><div id="view-brand"></div><script src="/app.js"></script></body></html>';
  }

  // Inject/replace OG tags
  const ogTags = `
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:site_name" content="ChaskaBox">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(ogImage)}">
<link rel="canonical" href="${esc(url)}">`;

  // Replace existing title and add OG tags after <head>
  html = html.replace(/<title>.*?<\/title>/is, `<title>${esc(title)}</title>`);
  html = html.replace(/<meta name="description"[^>]*>/is, `<meta name="description" content="${esc(desc)}">`);
  html = html.replace(/(<head[^>]*>)/is, `$1\n${ogTags}`);

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
}
