// Shared, conservative SEO helpers for server-rendered product pages.
// Only declare inventory when the stock state explicitly supports it.
export const CATEGORY_PATHS = Object.freeze({
  'Biscuits & Wafers': '/category/biscuits-and-wafers/',
  'Bunties & Cakes': '/category/bunties-and-cakes/',
  'Chews & Gums': '/category/chews-and-gums/',
  'Chocolates & Candies': '/category/chocolates-and-candies/',
  'Imli & Ice Lollies': '/category/imli-and-ice-lollies/',
  'Jellies & Marshmallow': '/category/jellies-and-marshmallow/',
  'Snacks & Nimco': '/category/snacks-and-nimco/',
  'Betel Nuts & Pan Masala': '/category/betel-nuts-and-pan-masala/',
  'Bundles': '/bundles/',
});

export function productImage(value, localPhotos = new Set()) {
  const s = String(value || '').trim();
  if (/^https:\/\//i.test(s)) return s;
  if (/^(?:http:|\/\/|data:|javascript:)/i.test(s)) return '';
  const path = s.replace(/^\/?(?:\.\/)?/, '');
  return localPhotos.has(path) ? 'https://chaskabox.online/' + path : '';
}

export function stockAvailability(state) {
  switch (String(state || '').toLowerCase()) {
    case 'available': return 'https://schema.org/InStock';
    case 'limited': return 'https://schema.org/LimitedAvailability';
    case 'unavailable': return 'https://schema.org/OutOfStock';
    // "sourced_after_order" is not proof of inventory or a supplier backorder.
    default: return null;
  }
}

// Presentation-only title guard; catalog records and explicit pack data remain untouched.
export function productPageTitle(p) {
  const name=String(p.name||''),pack=String(p.pack||'').trim();
  const fallback=name+(pack&&!name.toLowerCase().includes(pack.toLowerCase())?' — '+pack:'')+' | ChaskaBox';
  return String(p.seo_title||fallback).trim()
    .replace(/(Pack of\s+(\d+))(?:\s*[—-]\s*Pack of\s+\2)+/gi,'$1')
    .replace(/(?:\s*\|\s*ChaskaBox){2,}$/i,' | ChaskaBox')
    .replace(/^(ChaskaBox\s*\|.+?)\s*\|\s*ChaskaBox$/i,'$1');
}
export function productSchema(p, canonical, photo) {
  // Never publish a zero-rupee Offer when price data is missing or blank.
  // This is schema-only; existing catalog prices and checkout are unchanged.
  const hasExplicitPrice = p.price !== null && p.price !== undefined && String(p.price).trim() !== '';
  const n = hasExplicitPrice ? Number(p.price) : NaN;
  const offer = {
    '@type': 'Offer',
    url: canonical,
    priceCurrency: 'PKR',
    price: String(n),
    seller: { '@type': 'Organization', name: 'ChaskaBox' },
  };
  const state = stockAvailability(p.stock_state);
  if (state) offer.availability = state;
  const brand = String(p.brand || '').trim();
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: String(p.name || ''),
    description: String(p.description || p.seo_description || ('Buy ' + p.name + ' online from ChaskaBox Pakistan.')),
    sku: String(p.id),
    url: canonical,
    ...(brand ? { brand: { '@type': 'Brand', name: brand } } : {}),
    ...(photo ? { image: [photo] } : {}),
    ...(Number.isFinite(n) && n >= 0 ? { offers: offer } : {}),
  };
}

export function breadcrumbSchema(p, canonical) {
  const cat = String(p.category || '').trim();
  const catPath = CATEGORY_PATHS[cat] || '/shop/';
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://chaskabox.online/' },
      { '@type': 'ListItem', position: 2, name: cat || 'Shop', item: 'https://chaskabox.online' + catPath },
      { '@type': 'ListItem', position: 3, name: String(p.name || ''), item: canonical },
    ],
  };
}