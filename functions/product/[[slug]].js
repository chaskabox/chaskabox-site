import {SITE,organizationSchema} from '../api/_lib/storefront-html.js';
import {imageAttributes} from '../api/_lib/responsive-images.js';
import {cataloguePhoto,photoUnderReview} from '../api/_lib/catalogue-photos.js';
import { sbRequest } from '../api/_lib/db.js';
import { LOCAL_PHOTOS } from '../api/_lib/local-photos.js';
import { productImage, productSchema, breadcrumbSchema, CATEGORY_PATHS, productPageTitle } from '../api/_lib/seo.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=s=>JSON.stringify(s).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const image=s=>productImage(s,LOCAL_PHOTOS);
function unavailable(status,message){return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>Snack unavailable | ChaskaBox</title><link rel="stylesheet" href="/styles.css?v=10"></head><body><main class="section" style="padding:64px 20px"><h1>${esc(message)}</h1><p>Browse the current ChaskaBox catalogue.</p><a class="cta" href="/shop/">Shop snacks</a></main></body></html>`,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}

export async function onRequestGet(context){
 const parts=Array.isArray(context.params.slug)?context.params.slug:[context.params.slug];
 if(parts.length!==1||!/^\d+$/.test(String(parts[0]||'')))return unavailable(404,'This snack is not available right now.');
 const id=Number(parts[0]);if(!Number.isSafeInteger(id)||id<=0)return unavailable(404,'This snack is not available right now.');
 try{
  const rows=await sbRequest(context.env,'/products',{query:`?select=*&id=eq.${id}&visibility=eq.visible&limit=1`});
  const p=rows?.[0];if(!p||p.visibility!=='visible')return unavailable(404,'This snack is not available right now.');
  const canonical=`https://chaskabox.online/product/${id}/`,title=productPageTitle(p),description=p.seo_description||p.description||`Buy ${p.name} from ChaskaBox Pakistan.`,photo=image(cataloguePhoto(p)),ogPhoto=image(photoUnderReview(p)&&p.og_image===p.image_url?'':p.og_image)||photo||'https://chaskabox.online/images/logo-approved-20261017.png';
  const seed={id,name:p.name,brand:p.brand||'',price:Number(p.price),oldPrice:p.old_price,category:p.category,pack:p.pack,desc:p.description||'',badge:p.badge||'',img:cataloguePhoto(p)||null,photoNote:photoUnderReview(p)?'Photo under review':'',stockState:p.stock_state||'sourced_after_order',bundle:!!p.is_bundle,seoTitle:p.seo_title||'',seoDescription:p.seo_description||''};
  const schema=productSchema(p,canonical,photo);
  const crumbs=breadcrumbSchema(p,canonical);
  const assets=await context.env.ASSETS.fetch(new Request(new URL('/',context.request.url)));
  if(!assets.ok)throw Error('Site shell unavailable');
  let html=await assets.text();
  if(!html.includes('<div id="pdetail"></div>'))throw Error('Product mount unavailable');
  html=html.replace(/<title>[\s\S]*?<\/title>/i,'').replace(/<meta\b[^>]*(?:name|property)=["'](?:description|robots|og:[^"']+|twitter:[^"']+)["'][^>]*>/gi,'').replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi,'').replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,'');
  const head=`<title>${esc(title)}</title><meta name="description" content="${esc(String(description).slice(0,160))}"><meta name="robots" content="index,follow"><link rel="canonical" href="${canonical}"><meta property="og:type" content="product"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${esc(ogPhoto)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:image" content="${esc(ogPhoto)}"><script type="application/ld+json" id="store-schema">${json(organizationSchema())}</script><script type="application/ld+json" id="product-schema">${json(schema)}</script><script type="application/ld+json" id="breadcrumb-schema">${json(crumbs)}</script><script type="application/json" id="current-product">${json(seed)}</script>`;
  // The shared site shell contains a server-rendered homepage hero. Hide it for
  // product requests *before* JS runs so crawlers see one visible primary H1.
  html=html.replace('<div id="view-home">','<div id="view-home" style="display:none" hidden inert aria-hidden="true">');
  html=html.replace('</head>',head+'</head>').replace('<div id="view-product" style="display:none">','<div id="view-product">');
  html=html.replace(/<a\b[^>]*\bid="pdCrumbCat"[^>]*>[\s\S]*?<\/a>/i,`<a id="pdCrumbCat" href="${esc(CATEGORY_PATHS[p.category]||'/shop/')}">${esc(p.category||'All Snacks')}</a>`)
    .replace(/<b\b[^>]*\bid="pdCrumbName"[^>]*>[\s\S]*?<\/b>/i,`<b id="pdCrumbName">${esc(p.name)}</b>`);
  const detail=`<div class="pdetail"><div class="pd-grid"><div class="pd-imgwrap"><div class="pd-img">${photo?`<img ${imageAttributes(photo,"(max-width:700px) calc(100vw - 32px), 520px")} alt="${esc(p.name)}" fetchpriority="high" decoding="async" width="600" height="600">`:`<div class="noimg">${photoUnderReview(p)?'Photo under review':'Photo coming soon'}</div>`}</div></div><div class="pd-info"><div class="pcat">${esc(p.category)}</div><h1>${esc(p.name)}</h1><div class="pd-price"><span class="price">Rs. ${Number(p.price).toLocaleString('en-PK')}</span>${Number(p.old_price)>Number(p.price)?`<span class="oldprice">Rs. ${Number(p.old_price).toLocaleString('en-PK')}</span><span class="pdsave">Save ${Math.round((1-Number(p.price)/Number(p.old_price))*100)}%</span>`:''}</div><div class="ppack">${esc(p.pack)}</div>${p.stock_state==='sourced_after_order'?'<p class="pd-stock-note">Sourced after order; availability is confirmed before fulfilment.</p>':''}<p class="pd-desc">${esc(p.description||'Contact ChaskaBox for ingredient or allergen details before ordering.')}</p><button class="pdbtn" type="button" disabled>Loading bag…</button><dl class="pd-facts"><div><dt>Brand</dt><dd>${esc(p.brand||"ChaskaBox")}</dd></div><div><dt>Pack</dt><dd>${esc(p.pack)}</dd></div></dl><p>Ask about the original label for ingredients, allergens and best-before before ordering.</p><nav class="pd-policy-links" aria-label="Product and order help"><a href="/shipping-policy/">Delivery and charges</a><a href="/refund-policy/">Refund and resolution</a><a href="/track-order.html">Track your order</a></nav><p><a href="/shop/">Browse more snacks</a></p></div></div></div>`;
  html=html.replace('<div id="pdetail"></div>',`<div id="pdetail">${detail}</div>`);
  return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){console.error('[product-page] unavailable',error?.code||'shell_error');return unavailable(503,'The catalogue is temporarily unavailable.');}
}
