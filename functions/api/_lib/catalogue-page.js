import {publicCatalogue} from './catalogue-search.js';
import {imageAttributes,imagePreloadAttributes} from './responsive-images.js';
import {sbRequest} from './db.js';
import {storefrontConfig} from './storefront-config.js';
import {productImage} from './seo.js';
import {LOCAL_PHOTOS} from './local-photos.js';
import {SEO_CATEGORIES} from './catalogue-content.js';
import {catalogueDiscoveryNav} from './catalogue-discovery.js';
import {SITE,esc,safeJson,replaceMount,routeShell,withSeo,organizationSchema,catalogueUnavailable} from './storefront-html.js';
export function browserProduct(p){return {id:Number(p.id),slug:p.slug||'',name:p.name,brand:p.brand||'',price:Number(p.price),oldPrice:p.old_price==null?null:Number(p.old_price),category:p.category||'',pack:p.pack||'',desc:p.description||'',badge:p.badge||'',img:p.image_url||null,photoNote:p.image_warning||'',bundle:!!p.is_bundle,stockState:p.stock_state||'sourced_after_order',seoTitle:p.seo_title||'',seoDescription:p.seo_description||'',bundleContents:p.bundle_contents||[],retailValue:p.bundle_retail_value??null,bundleSavings:p.bundle_savings??null,bundleNote:p.bundle_warning||''};}
const moneyFormatter=new Intl.NumberFormat('en-PK',{maximumFractionDigits:2});
export function catalogueCard(p){const photo=productImage(p.image_url,LOCAL_PHOTOS),href='/product/'+Number(p.id)+'/';const original=Number(p.old_price),sale=Number.isFinite(original)&&original>Number(p.price);const saleLabel=sale?'<span class="oldprice">Rs. '+moneyFormatter.format(original)+'</span><span class="savepill">Save '+Math.round((1-Number(p.price)/original)*100)+'%</span>':'';return '<article class="card"><a class="pimg" href="'+href+'">'+(photo?'<img '+imageAttributes(photo)+' alt="'+esc(p.name)+'" width="300" height="300" loading="lazy" decoding="async">':'<div class="noimg">'+esc(p.image_warning||'Photo coming soon')+'</div>')+'</a><div class="pbody"><div class="pcat">'+esc(p.category)+'</div><a class="pname" href="'+href+'">'+esc(p.name)+'</a><div class="packmeta"><div class="ppack">'+esc(p.pack)+'</div></div><div class="pricewrap"><span class="price">Rs. '+moneyFormatter.format(Number(p.price))+'</span>'+saleLabel+'</div><small>'+(p.stock_state==='unavailable'?'Currently unavailable':p.stock_state==='sourced_after_order'?'Sourced after order':'See current product details')+'</small></div></article>';}
function collectionSchema(rows,name,path){return {'@context':'https://schema.org','@type':'CollectionPage',name,url:SITE+path,mainEntity:{'@type':'ItemList',numberOfItems:rows.length,itemListElement:rows.map((p,i)=>({'@type':'ListItem',position:i+1,url:SITE+'/product/'+p.id+'/',name:p.name}))}};}
export function filterCatalogueRows(rows,params,manifest={}){
 let out=rows;
 if(params.get('badge')==='Sale')out=out.filter(p=>Number(p.old_price)>Number(p.price));
 const query=(params.get('q')||'').trim().toLowerCase();
 if(query)out=out.filter(p=>[p.name,p.pack,p.category,p.brand,p.description].join(' ').toLowerCase().includes(query));
 const brands=params.getAll('brand').filter(Boolean);if(brands.length)out=out.filter(p=>brands.includes(p.brand));
 const category=params.get('category')??params.get('cat');
 if(category){const row=(manifest?.categories||[]).find(c=>c.slug===category);out=row?out.filter(p=>row.product_ids.includes(Number(p.id))):out.filter(p=>p.category===category);}
 if(params.get('sort')==='new')out=[...out].sort((a,b)=>Number(b.id)-Number(a.id));
 return out;
}
async function shell(context){const request=new Request(new URL('/',context.request.url));const r=context.next?await context.next(request):await context.env.ASSETS.fetch(request);if(!r.ok)throw Error('Store shell unavailable');return r.text();}
export async function renderCataloguePage(context,kind,slug=''){
 try{
  const [all,manifest,staticShell]=await Promise.all([publicCatalogue(context.env),storefrontConfig(context.env).catch(error=>{if(kind==='category')throw error;return null;}),shell(context)]);
  let rows=all,path=kind==='category'?'/category/'+slug+'/':kind==='bundles'?'/bundles/':'/shop/',copy=SEO_CATEGORIES[kind]||SEO_CATEGORIES.shop;
  if(kind==='bundles')rows=all.filter(p=>p.is_bundle);
  if(kind==='shop'){const params=new URL(context.request.url).searchParams;rows=filterCatalogueRows(all,params,manifest);if(params.get('badge')==='Sale')copy={...copy,name:'Snack Deals',title:'Snack Deals | ChaskaBox Pakistan',description:'Browse current snack deals and compare listed prices at ChaskaBox Pakistan.'};}
  if(kind==='category'){
   const known=SEO_CATEGORIES[slug],cms=(manifest.categories||[]).find(c=>c.slug===slug||known&&c.name===known.name);
   if(!known&&!cms)return catalogueUnavailable(404);
   const standard=Object.entries(SEO_CATEGORIES).find(([k,v])=>k!=='shop'&&k!=='bundles'&&v.name===cms?.name)?.[0];
   if(standard&&standard!==slug)return Response.redirect(SITE+'/category/'+standard+'/',301);
   copy={...(known||{name:cms.name,title:cms.name+' | ChaskaBox',description:'Browse '+cms.name+' at ChaskaBox Pakistan.',intro:''}),...(cms?.seo_title?{title:cms.seo_title}:{}),...(cms?.seo_description?{description:cms.seo_description}:{}),...(cms?.description?{intro:cms.description}:{})};
   rows=cms?all.filter(p=>(cms.product_ids||[]).map(Number).includes(Number(p.id))):all.filter(p=>p.category===known.name);
  }
  let html=routeShell(staticShell,'shop');
  // The first grid card is visible and eagerly loaded. Announce its exact
  // responsive source early; filters/sorts resolve before selecting the image.
  // Never preload a generic hero, another product, or a missing original photo.
  const firstPhoto=rows[0]?productImage(rows[0].image_url,LOCAL_PHOTOS):'';
  if(firstPhoto)html=html.replace('</head>',`<link rel="preload" as="image" ${imagePreloadAttributes(firstPhoto)} fetchpriority="high">\n</head>`);
  html=replaceMount(html,'shopGrid',rows.map((p,i)=>catalogueCard(p).replace('loading="lazy"',i===0?'loading="eager" fetchpriority="high"':i===1?'loading="eager"':'loading="lazy"')).join('')||'<p>No public products in this collection yet. <a href="/shop/">Browse all snacks</a>.</p>');
  html=html.replace(/(<h1\b[^>]*id="catTitle"[^>]*>)[\s\S]*?<\/h1>/i,'$1'+esc(copy.name)+'</h1>').replace(/(<[^>]+id="catCount"[^>]*>)[\s\S]*?<\//i,'$1'+rows.length+' '+(rows.length===1?'product':'products')+'</');
  html=html.replace(/(<[^>]+id="categorySeoIntro"[^>]*>)[\s\S]*?<\//i,'$1'+esc(copy.intro)+'</');
  // The source storefront shell lacks the static catalogue intro element. Put factual
  // SSR copy below the initial product grid to protect desktop above-the-fold layout.
  // Empty collections remain noindex and do not advertise unsupported categories.
  if(rows.length>0){
   const nav=catalogueDiscoveryNav(all,kind==='category'?slug:'');
   const intro=copy.intro?'<p style="line-height:1.7;margin:0 0 10px">'+esc(copy.intro)+'</p>':'';
   const supplementary='<section aria-label="Shopping and category information" style="max-width:1040px;margin:18px auto 30px;padding:0 18px">'+intro+nav+'</section>';
   if(html.includes('id="collectionSeoSupplement"'))html=replaceMount(html,'collectionSeoSupplement',supplementary);
   else if(html.includes('id="categorySeoIntro"'))html=html.replace(/(<p\b[^>]*\bid="categorySeoIntro"[^>]*>[\s\S]*?<\/p>)/i,'$1'+supplementary);
  }
  html=withSeo(html,{title:copy.title,description:copy.description,path,noindex:rows.length===0,schemas:[organizationSchema(),collectionSchema(rows,copy.name,path)],seed:'<script type="application/json" id="current-catalogue">'+safeJson(all.map(browserProduct))+'</script>'+(manifest?'<script type="application/json" id="current-storefront-config">'+safeJson(manifest)+'</script>':'')});
  return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){console.error('[catalogue-page]',error?.code||'unavailable');return catalogueUnavailable();}
}
export async function renderBrandPage(context,slug){
 try{
  const [all,brands]=await Promise.all([publicCatalogue(context.env),sbRequest(context.env,'/brands',{query:'?select=name,slug,normalized_name,short_description,long_description,seo_title,seo_description,og_image_url,hero_image_url,logo_url&slug=eq.'+encodeURIComponent(slug)+'&is_visible=eq.true&limit=1'})]);
  const brand=brands?.[0];if(!brand)return catalogueUnavailable(404);
  const brandNames=new Set([brand.name,brand.normalized_name].filter(Boolean).map(v=>v.toLowerCase().trim()));
  const rows=all.filter(p=>brandNames.has(String(p.brand||'').toLowerCase().trim()));if(!rows.length)return catalogueUnavailable(404);
  const path='/brand/'+slug+'/';let html=routeShell(await shell(context,'/brand/'),'brand');
  html=replaceMount(html,'brandProductGrid',rows.map(catalogueCard).join(''));
  html=html.replace(/(<h1\b[^>]*id="brandTitle"[^>]*>)[\s\S]*?<\/h1>/i,'$1'+esc(brand.name)+'</h1>').replace(/(<b\b[^>]*id="brandCrumb"[^>]*>)[\s\S]*?<\/b>/i,'$1'+esc(brand.name)+'</b>');
  html=html.replace(/(<[^>]+id="brandIntro"[^>]*>)[\s\S]*?<\//i,'$1'+esc(brand.long_description||brand.short_description||'')+'</');
  const image=productImage(brand.og_image_url||brand.hero_image_url||brand.logo_url,LOCAL_PHOTOS)||SITE+'/images/logo-approved-20261017.png';
  const crumbs={'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Home',item:SITE+'/'},{'@type':'ListItem',position:2,name:'Brands',item:SITE+'/brands/'},{'@type':'ListItem',position:3,name:brand.name,item:SITE+path}]};
  html=withSeo(html,{title:brand.seo_title||brand.name+' Snacks Online | ChaskaBox Pakistan',description:brand.seo_description||brand.short_description||'Shop '+brand.name+' snacks online at ChaskaBox. Compare exact packs and current prices before ordering.',image,path,schemas:[organizationSchema(),collectionSchema(rows,brand.name,path),crumbs],seed:'<script type="application/json" id="current-catalogue">'+safeJson(all.map(browserProduct))+'</script>'});
  return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
 }catch{return catalogueUnavailable();}
}
