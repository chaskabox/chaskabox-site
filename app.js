/* ChaskaBox static store app */
const NAVY='#1a2b5c';
let PRODUCTS=[], CART={};
const MAX_CART_QTY=99, MAX_CART_ITEMS=50;
const PROGRESS_STATE={drawer:0,cart:0};
const LOCAL_PHOTOS=new Set(window.CHASKABOX_LOCAL_PHOTOS||[]);
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
function reducedMotion(){return motionPreference.matches;}
function hasPhoto(p){const src=String(p?.img||'').trim();return /^https?:\/\//i.test(src)||LOCAL_PHOTOS.has(src.replace(/^\/?(?:\.\/)?/,''));}
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const currencyFormatter=new Intl.NumberFormat('en-PK');
const fmt=n=>'Rs. '+currencyFormatter.format(Number(n));
function assetUrl(src){ if(!src) return ''; if(/^(https?:|data:|blob:|\/)/i.test(src)) return src; return '/'+String(src).replace(/^\.\//,''); }
function photoAttributes(src,sizes='(max-width:700px) calc(50vw - 36px), 260px'){
 const path=String(src||'').replace(/^https:\/\/chaskabox\.online\//,'').replace(/^\//,'');
 const sources=window.CHASKABOX_IMAGE_VARIANTS?.[path];
 return sources?'src="'+esc(sources[0].src)+'" srcset="'+sources.map(v=>esc(v.src)+' '+v.width+'w').join(', ')+'" sizes="'+esc(sizes)+'"':'src="'+esc(assetUrl(src))+'"';
}

const CB_UI_ICONS={"heart":"<path d=\"M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z\"/>","search":"<circle cx=\"10.8\" cy=\"10.8\" r=\"6.8\"/><path d=\"m16 16 5 5\"/>","home":"<path d=\"m3 10 9-7 9 7v11h-6v-7H9v7H3Z\"/>","grid":"<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\"/>","user":"<circle cx=\"12\" cy=\"7\" r=\"4\"/><path d=\"M4 21v-2a8 8 0 0 1 16 0v2\"/>","box":"<path d=\"m3 7 9-4 9 4-9 5Zm0 0v10l9 4 9-4V7M12 12v9M7 5l10 5\"/>","truck":"<path d=\"M2 5h12v12H2Zm12 5h4l4 4v3h-8\"/><circle cx=\"6\" cy=\"18\" r=\"2\"/><circle cx=\"18\" cy=\"18\" r=\"2\"/>","shield":"<path d=\"m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Zm-4 9 3 3 5-6\"/>","card":"<rect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"3\"/><path d=\"M2 10h20M6 15h4\"/>","star":"<path d=\"m12 2 3 6 7 .9-5 4.8 1.2 7L12 17.5 5.8 21 7 13.7 2 8.9 9 8Z\"/>","sparkles":"<path d=\"m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8ZM20 2v4m-2-2h4\"/>","tag":"<path d=\"M3 3h8l10 10-8 8L3 11Z\"/><circle cx=\"7.5\" cy=\"7.5\" r=\"1\"/>","pepper":"<path d=\"M14 6c5 0 7 3 6 7-1 5-8 8-16 8 5-4 5-8 6-11 1-3 2-4 4-4Zm0 0c0-3 2-4 5-4\"/>","menu":"<path d=\"M3 6h18M3 12h18M3 18h18\"/>"};
function cbIcon(name){return '<svg class="cb-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(CB_UI_ICONS[name]||CB_UI_ICONS.box)+'</svg>';}

/* ---------- data ---------- */
async function loadProducts(){
  try{const initial=JSON.parse(document.getElementById('current-catalogue')?.textContent||'null');if(Array.isArray(initial)&&initial.every(p=>Number.isSafeInteger(Number(p.id))&&typeof p.name==='string')){PRODUCTS=initial;return;}}catch{}

  let lastError=null;
  let seed=null;try{seed=JSON.parse(document.getElementById('current-product')?.textContent||'null');}catch{}
  for(const url of [seed?'/api/products?fresh=1':'/api/products','/products.json']){
    try{const r=await fetch(url,{cache:'no-cache'});if(!r.ok)throw new Error('HTTP '+r.status);let rows=await r.json();if(!Array.isArray(rows))throw new Error('Invalid catalogue');if(url==='/products.json'&&seed){rows=rows.filter(p=>Number(p.id)!==Number(seed.id));rows.push(seed);}PRODUCTS=rows;return;}catch(e){lastError=e;}
  }
  throw lastError||new Error('Could not load product catalogue');
}
function publicProducts(){return PRODUCTS.filter(p=>p.active!==false);}
function activeProducts(){return publicProducts().filter(p=>p.stockState!=='unavailable');}

/* ---------- delivery date estimate (4-7 days) ---------- */
function deliveryRange(){
  const f=d=>d.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
  const raw=String(STORE_CONFIG?.settings?.delivery_estimate||'4-7 days');const nums=raw.match(/\d+/g)||[];
  const min=Math.max(0,Number(nums[0]||4)),max=Math.max(min,Number(nums[1]||nums[0]||7));
  const a=new Date(); a.setDate(a.getDate()+min);
  const b=new Date(); b.setDate(b.getDate()+max);
  return `From ${f(a)} to ${f(b)}`;
}

function productHref(id){return '/product/'+encodeURIComponent(id)+'/';}

/* ---------- cards ---------- */
function bundleFanHTML(p){
  if(!p?.bundle || !p?.desc || matchMedia('(max-width:760px), (hover:none), (prefers-reduced-motion:reduce)').matches) return '';
  const m=String(p.desc).match(/Bundle pack with:\s*(.+?)(?:\.\s|$)/i);
  if(!m) return '';
  const wanted=m[1].split(',').map(s=>s.trim()).filter(Boolean);
  const picks=wanted.map(name=>PRODUCTS.find(x=>String(x.name||'').trim().toLowerCase()===name.toLowerCase())).filter(x=>x&&x.img).slice(0,3);
  if(picks.length<2) return '';
  return `<span class="bundle-fan" aria-hidden="true">${picks.map((x,i)=>`<img ${photoAttributes(x.img,"80px")} alt="" loading="lazy" width="80" height="80" class="bf${i+1}">`).join('')}</span>`;
}
function cardHTML(p,priority){
  const src=hasPhoto(p)?assetUrl(p.img):'';
  const loading=priority==='high'?'loading="eager" fetchpriority="high"':priority==='eager'?'loading="eager"':'loading="lazy"';
  const img=src?`<img ${photoAttributes(p.img)} alt="${esc(p.name)}" ${loading} width="300" height="300" decoding="async">`:`<div class="noimg"><b>CHASKABOX</b><span>${p.photoNote?esc(p.photoNote):'Photo<br>coming soon'}</span><small>${esc(p.category||'')}</small></div>`;
  const badge=p.badge?`<span class="badge ${p.badge==='Bestseller'?'bestseller':''}">${esc(p.badge==='Sale'?'SALE':p.badge.toUpperCase())}</span>`:'';
  const old=p.oldPrice&&p.oldPrice>p.price?`<span class="oldprice">${fmt(p.oldPrice)}</span>`:'';
  const save=p.oldPrice&&p.oldPrice>p.price?`<span class="savepill">Save ${Math.round((1-p.price/p.oldPrice)*100)}%</span>`:'';
  const catlabel=p.category?`<div class="pcat">${esc(p.category)}${p.bundle?' · BOX':''}</div>`:'';
  const href=productHref(p.id);
  const fan=bundleFanHTML(p);
  const unavailable=p.stockState==='unavailable';
  return `<article class="card${p.bundle?' bundle-card':''}">${badge}${typeof wishBtnHTML==='function'?wishBtnHTML(p):''}
    <a class="pimg" href="${href}">${fan}${img}</a>
    <div class="pbody">
      ${catlabel}
      <a class="pname" href="${href}" title="${esc(p.name)}">${esc(p.name)}</a>
      <div class="ppack">${esc(p.pack||'')}</div>${p.bundle?'<small class="bundle-photo-note">Check pack details and contents</small>':''}
      <div class="prow"><div class="pricewrap"><span class="price">${fmt(p.price)}</span>${old}${save}</div></div>
      <button class="addcart" ${unavailable?'disabled':''} aria-label="${unavailable?'Currently unavailable':'Add to Bag '+fmt(p.price)} — ${esc(p.name)}" onclick="addToCart(${p.id},1,this)"><span class="addcart-label">${unavailable?'Currently unavailable':'Add to Bag'}</span><span class="addcart-price">${fmt(p.price)}</span></button>
    </div></article>`;
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

/* ---------- home ---------- */
/* Clean SVG illustrations for category tiles (match original custom art) */
const TILE_SVG={
'All':`<svg viewBox="0 0 64 64"><ellipse cx="32" cy="46" rx="20" ry="8" fill="#3b6fd4"/><ellipse cx="32" cy="42" rx="20" ry="8" fill="#5a8de0"/><circle cx="22" cy="34" r="6" fill="#e5484d"/><circle cx="32" cy="30" r="6" fill="#f2b705"/><circle cx="42" cy="34" r="6" fill="#2a9d8f"/><circle cx="27" cy="26" r="5" fill="#9b7ed9"/><circle cx="37" cy="26" r="5" fill="#e8722a"/><rect x="18" y="36" width="28" height="4" rx="2" fill="#d4a017"/></svg>`,
'Biscuits & Wafers':`<svg viewBox="0 0 64 64"><ellipse cx="32" cy="50" rx="18" ry="5" fill="#4a3020"/><ellipse cx="32" cy="44" rx="16" ry="7" fill="#c8956c"/><ellipse cx="32" cy="42" rx="16" ry="7" fill="#d4a97c"/><ellipse cx="32" cy="36" rx="16" ry="7" fill="#c8956c"/><ellipse cx="32" cy="34" rx="16" ry="7" fill="#d4a97c"/><ellipse cx="32" cy="28" rx="16" ry="7" fill="#c8956c"/><ellipse cx="32" cy="26" rx="16" ry="7" fill="#e0b988"/><circle cx="26" cy="25" r="1.5" fill="#8a5a2b"/><circle cx="32" cy="27" r="1.5" fill="#8a5a2b"/><circle cx="38" cy="25" r="1.5" fill="#8a5a2b"/></svg>`,
'Bunties & Cakes':`<svg viewBox="0 0 64 64"><path d="M22 30h20l-3 22H25z" fill="#e5484d"/><path d="M22 30c0-8 4-14 10-14s10 6 10 14z" fill="#f4a4c0"/><circle cx="26" cy="22" r="2" fill="#fff"/><circle cx="32" cy="18" r="2" fill="#f2b705"/><circle cx="38" cy="22" r="2" fill="#2a9d8f"/><circle cx="29" cy="25" r="1.5" fill="#e8722a"/><circle cx="35" cy="25" r="1.5" fill="#3b6fd4"/><rect x="20" y="28" width="24" height="4" rx="2" fill="#c9303e"/></svg>`,
'Chews & Gums':`<svg viewBox="0 0 64 64"><ellipse cx="32" cy="34" rx="14" ry="18" fill="#3daa7a" transform="rotate(-15 32 34)"/><ellipse cx="32" cy="34" rx="14" ry="18" fill="#4cbb8a" transform="rotate(15 32 34)"/><path d="M32 16v36" stroke="#2a7a5a" stroke-width="2"/><path d="M32 28l-8-6M32 28l8-6M32 38l-8-6M32 38l8-6" stroke="#2a7a5a" stroke-width="1.5"/></svg>`,
'Chocolates & Candies':`<svg viewBox="0 0 64 64"><rect x="14" y="20" width="36" height="26" rx="4" fill="#6b2d1a"/><rect x="18" y="24" width="10" height="8" rx="2" fill="#8a4028"/><rect x="30" y="24" width="10" height="8" rx="2" fill="#8a4028"/><rect x="18" y="34" width="10" height="8" rx="2" fill="#8a4028"/><rect x="30" y="34" width="10" height="8" rx="2" fill="#8a4028"/><rect x="42" y="24" width="6" height="18" rx="2" fill="#d4a017"/></svg>`,
'Imli & Ice Lollies':`<svg viewBox="0 0 64 64"><circle cx="24" cy="24" r="10" fill="#e5484d"/><circle cx="24" cy="24" r="6" fill="#f4707a"/><rect x="22.5" y="32" width="3" height="20" rx="1.5" fill="#fff"/><circle cx="42" cy="28" r="9" fill="#e8722a"/><circle cx="42" cy="28" r="5" fill="#f49a5a"/><rect x="40.5" y="35" width="3" height="17" rx="1.5" fill="#fff"/></svg>`,
'Jellies & Marshmallow':`<svg viewBox="0 0 64 64"><ellipse cx="32" cy="44" rx="18" ry="10" fill="#fff" opacity=".9"/><ellipse cx="32" cy="42" rx="18" ry="10" fill="#f0d0e0"/><rect x="20" y="28" width="10" height="10" rx="3" fill="#fff"/><rect x="32" y="26" width="10" height="10" rx="3" fill="#f4a4c0"/><rect x="26" y="34" width="10" height="10" rx="3" fill="#d46a8a"/><rect x="38" y="34" width="8" height="8" rx="2" fill="#fff"/></svg>`,
'Snacks & Nimco':`<svg viewBox="0 0 64 64"><ellipse cx="32" cy="46" rx="20" ry="8" fill="#c47a1a"/><ellipse cx="32" cy="42" rx="20" ry="8" fill="#e0952f"/><path d="M20 38l4-8 4 6 4-10 4 8 4-6 4 8" stroke="#f2b705" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="26" cy="32" r="3" fill="#d4a017"/><circle cx="38" cy="30" r="3" fill="#d4a017"/></svg>`,
'Betel Nuts & Pan Masala':`<svg viewBox="0 0 64 64"><path d="M32 8C20 20 16 34 32 52 48 34 44 20 32 8z" fill="#2d6a4f"/><path d="M32 14v32" stroke="#1a4a35" stroke-width="2"/><path d="M32 24l-10-4M32 24l10-4M32 34l-10-4M32 34l10-4" stroke="#1a4a35" stroke-width="1.5"/><ellipse cx="32" cy="52" rx="12" ry="4" fill="#c8956c"/><circle cx="28" cy="50" r="3" fill="#8a5a2b"/><circle cx="36" cy="50" r="3" fill="#8a5a2b"/></svg>`,
'Bundles':`<svg viewBox="0 0 64 64"><rect x="16" y="26" width="32" height="24" rx="3" fill="#d4a017"/><rect x="29" y="26" width="6" height="24" fill="#b8860b"/><rect x="16" y="20" width="32" height="8" rx="2" fill="#e8b82a"/><path d="M32 20c-4-8-12-8-12-2 0 4 6 4 12 2zm0 0c4-8 12-8 12-2 0 4-6 4-12 2z" fill="#b8860b"/></svg>`
};
const CAT_STYLE={
  'All':{bg:'#f2b705'},
  'Biscuits & Wafers':{bg:'#6b4a35'},
  'Bunties & Cakes':{bg:'#9b8ac4'},
  'Chews & Gums':{bg:'#2a9d8f'},
  'Chocolates & Candies':{bg:'#a83232'},
  'Imli & Ice Lollies':{bg:'#e8722a'},
  'Jellies & Marshmallow':{bg:'#d46a8a'},
  'Snacks & Nimco':{bg:'#e0952f'},
  'Betel Nuts & Pan Masala':{bg:'#2d6a4f'},
  'Bundles':{bg:'#3b6fd4'}
};
const BAND_COLORS={
  'Biscuits & Wafers':'#6b4a35',
  'Bunties & Cakes':'#7b6b9e',
  'Bundles':'#d9a03a',
  'Chews & Gums':'#2a8a6a',
  'Chocolates & Candies':'#93342e',
  'Imli & Ice Lollies':'#a5522e',
  'Jellies & Marshmallow':'#6a5a8e',
  'Snacks & Nimco':'#c9932b',
  'Betel Nuts & Pan Masala':'#4e7d4e'
};
const CAT_ORDER=['Biscuits & Wafers','Bunties & Cakes','Chews & Gums','Chocolates & Candies','Imli & Ice Lollies','Jellies & Marshmallow','Snacks & Nimco','Betel Nuts & Pan Masala','Bundles'];
function distinctBrandPicks(items,maxItems=10){
  const buckets=new Map(),result=[];
  for(const item of items){
    const brand=getBrand(item).toLowerCase();
    if(!buckets.has(brand))buckets.set(brand,[]);
    buckets.get(brand).push(item);
  }
  while(result.length<maxItems){
    let advanced=false;
    for(const bucket of buckets.values()){
      if(result.length===maxItems)break;
      if(bucket.length){result.push(bucket.shift());advanced=true;}
    }
    if(!advanced)break;
  }
  return result;
}
function renderHomeContent(){
  const act=activeProducts();
  // categories
  const cats={};
  act.forEach(p=>{cats[p.category]=cats[p.category]||[];cats[p.category].push(p);});
  // category tiles: clean SVG illustrations (match original custom art)
  const allCount=act.length;
  const cmsCats=STORE_CONFIG?.categories;
  if(Array.isArray(cmsCats))for(const c of cmsCats)cats[c.name]=act.filter(p=>c.product_ids.includes(Number(p.id)));
  const categoryOrder=['Biscuits & Wafers','Bundles','Bunties & Cakes','Chews & Gums','Chocolates & Candies','Imli & Ice Lollies','Jellies & Marshmallow','Snacks & Nimco'];
  const eligibleCats=Array.isArray(cmsCats)?cmsCats.filter(c=>c.show_on_homepage&&(cats[c.name]||[]).length>0).map(c=>c.name):CAT_ORDER.filter(c=>cats[c]&&cats[c].length);
  const tileOrder=['All',...categoryOrder.filter(c=>eligibleCats.includes(c)),...eligibleCats.filter(c=>!categoryOrder.includes(c))];
  const categoryArt={"All":"0%","Biscuits & Wafers":"12.5%","Bundles":"25%","Bunties & Cakes":"37.5%","Chews & Gums":"50%","Chocolates & Candies":"62.5%","Imli & Ice Lollies":"75%","Jellies & Marshmallow":"87.5%","Snacks & Nimco":"100%"};
  // ensure 'All' pseudo-category first, then fixed original order
  $('#catTiles').innerHTML=tileOrder.map(c=>{
    const st=CAT_STYLE[c]||{bg:'#8a94a6'};
    const list=c==='All'?act:(cats[c]||[]);
    const n=c==='All'?allCount:list.length;
    if(c!=='All'&&!n) return '';
    const matchers={'Biscuits & Wafers':/wafer|biscuit/i,'Bunties & Cakes':/cupkake|cake/i,'Chews & Gums':/bubble|gum/i,'Chocolates & Candies':/chocolate|toffee|candy/i,'Snacks & Nimco':/top pops|nimco|slanty|chewra/i};
    const members=list.filter(p=>p.category===c&&!p.bundle&&hasPhoto(p));
    const featured=(c==='All'||c==='Bundles')?null:members.find(p=>matchers[c]?.test(p.name))||members[0]||list.find(p=>hasPhoto(p)&&!p.bundle);
    const artPos=categoryArt[c];
    const inner=artPos!==undefined? `<span class="cb-category-art" style="--category-art-position:${artPos}" aria-hidden="true"></span>` : featured? `<img ${photoAttributes(featured.img,'90px')} alt="" loading="lazy" width="90" height="90" decoding="async">` :
      (c==='All'||c==='Bundles')?`<span class="ci-svg ci-category-symbol">${cbIcon(c==='All'?'grid':'box')}</span>`:TILE_SVG[c]?`<span class="ci-svg">${TILE_SVG[c]}</span>`:`<span class="ci-emoji">🛍️</span>`;
    const href=c==='All'?'/shop/':categoryPath(c);
    return `<a class="cat reveal" href="${href}">
      <div class="ci${artPos!==undefined?' ci-approved-art':''}" style="background:${st.bg}">${inner}</div>
      <b>${esc(c)}</b><small>${n} ${n===1?'item':'items'}</small></a>`;
  }).join('');
  // hero collage: 3 product images
  const candidates=curatedProducts('hero',act.filter(hasPhoto)).sort((a,b)=>Number(/^https?:/i.test(a.img))-Number(/^https?:/i.test(b.img)));
  const heroPicks=[];
  for(const p of candidates){if(!heroPicks.some(x=>x.category===p.category))heroPicks.push(p);if(heroPicks.length===3)break;}
  for(const p of candidates){if(heroPicks.length===3)break;if(!heroPicks.includes(p))heroPicks.push(p);}
  const hi=$('#heroCollage');
  if(hi){hi.innerHTML=heroPicks.map((p,i)=>`<img ${photoAttributes(p.img,"150px")} alt="${esc(p.name)}" width="150" height="150" loading="lazy" fetchpriority="low" decoding="async" class="hc${i+1}">`).join('');const wrap=hi.closest('.heroimg');if(wrap)wrap.hidden=!heroPicks.length;}
  // Each banner uses only authentic pack images already present in the product catalogue.
  if(hi && heroPicks.length){
    const boxPicks=distinctBrandPicks(act.filter(p=>p.bundle&&hasPhoto(p)),3);
    const snackPicks=distinctBrandPicks(act.filter(p=>p.category==='Snacks & Nimco'&&hasPhoto(p)),3);
    const markup=items=>items.map((p,i)=>`<img ${photoAttributes(p.img,"150px")} alt="${esc(p.name)}" width="150" height="150" loading="lazy" fetchpriority="low" decoding="async" class="hc${i+1}">`).join('');
    window.CHASKABOX_HERO_MARKUP=[hi.innerHTML,markup(boxPicks.length?boxPicks:heroPicks),markup(snackPicks.length?snackPicks:heroPicks)];
    if(typeof window.Event==='function'&&typeof window.dispatchEvent==='function')window.dispatchEvent(new window.Event('chaskabox:hero-imagery-ready'));
  }
  // Curated homepage shelves: fast discovery without dumping the full catalogue
  shelfSeq=0;
  let html='';
  // Homepage shelves: only products WITH real photos (no "Photo coming soon" on showcase)
  const actImg=act.filter(hasPhoto);
  const sale=curatedProducts('deals',distinctBrandPicks(actImg.filter(p=>p.oldPrice&&p.oldPrice>p.price),10)).filter(p=>p.oldPrice>p.price);
  const picks=curatedProducts('chaska_picks',distinctBrandPicks(actImg.filter(p=>p.category!=='Bundles'),10));
  const bundles=curatedProducts('boxes',distinctBrandPicks((cats['Bundles']||[]).filter(hasPhoto),10));
  const chatpata=curatedProducts('chatpata_picks',distinctBrandPicks(actImg.filter(p=>p.category==='Snacks & Nimco'),10));
  const newest=curatedProducts('new_items',distinctBrandPicks([...actImg].sort((a,b)=>Number(b.id)-Number(a.id)),10));
  if(sale.length) html+=shelf('Deals Worth Grabbing',sale,'#b42318','', 'Sale','deals');
  if(picks.length) html+=shelf('Chaska Picks',picks,'#1a2b5c','','','chaska_picks');
  if(bundles.length) html+=shelf('Chaska Boxes',bundles,'#896000','Bundles','','boxes');
  if(chatpata.length) html+=shelf('Chatpata Picks',chatpata,'#276a45','Snacks & Nimco','','chatpata_picks');
  if(newest.length) html+=shelf('New & Recently Added',newest,'#6b4f9d','','','new_items');
  $('#shelves').innerHTML=html;
  // Editorial promotional artwork uses the same authentic pack photos as the catalogue.
  const boxMedia=document.getElementById('cbBoxMedia');
  if(boxMedia)boxMedia.innerHTML=bundles.slice(0,2).map(p=>`<img ${photoAttributes(p.img,'150px')} alt="" loading="lazy" width="150" height="150" decoding="async">`).join('');
  const dealMedia=document.getElementById('cbDealsMedia');
  if(dealMedia)dealMedia.innerHTML=sale.slice(0,2).map(p=>`<img ${photoAttributes(p.img,'150px')} alt="" loading="lazy" width="150" height="150" decoding="async">`).join('');
  const dealBanner=document.querySelector('.cb-offer-deals');
  if(dealBanner)dealBanner.hidden=!sale.length;
  const wp=$('#weeklyPick');
  if(wp){
    const pick=sale[0]||picks[0]||actImg[0];
    if(pick){
      wp.innerHTML=`<a class="pickcard" href="${productHref(pick.id)}"><div class="pickimg"><img ${photoAttributes(pick.img||'')} alt="${esc(pick.name)}" loading="lazy" width="300" height="300" decoding="async"></div><div class="pickinfo"><div class="picktag">${esc((pick.category||'ChaskaBox').toUpperCase())}</div><b>${esc(pick.name)}</b><div class="pickprice">${fmt(pick.price)}</div><span class="alink">View snack →</span></div></a>`;
    } else wp.innerHTML='';
  }
  observeReveals();
}
let shelfSeq=0;
function shelf(title,items,color,cat,badge,homeKey){
  const href=badge?'/shop/?badge='+encodeURIComponent(badge):(homeKey==='new_items'?'/shop/?sort=new':cat?categoryPath(cat):'/shop/');
  const action=badge?`onclick="goBadge('${esc(badge)}');return false"`:'';
  const sid='hs'+(++shelfSeq);
  return `<section class="shelf reveal"${homeKey?` data-home-section="${esc(homeKey)}"`:``}>
    <div class="shelfband" style="background:${color}">
      <div class="shelfw"><h2><span class="cb-heading-icon">${cbIcon(({deals:'tag',chaska_picks:'star',boxes:'box',chatpata_picks:'pepper',new_items:'sparkles'})[homeKey]||'star')}</span>${esc(title)}</h2>
      <div class="shelfnav"><a class="viewall" href="${href}" ${action}>View all →</a>
      <button class="sarrow" aria-label="Scroll left" onclick="shelfScroll('${sid}',-1)">←</button>
      <button class="sarrow" aria-label="Scroll right" onclick="shelfScroll('${sid}',1)">→</button></div></div>
    </div>
    <div class="shelfbody"><div class="hscroll" id="${sid}">${items.map(cardHTML).join('')}</div></div>
  </section>`;
}
function shelfScroll(id,dir){
  const el=document.getElementById(id); if(!el) return;
  el.scrollBy({left:dir*el.clientWidth*.85,behavior:reducedMotion()?'auto':'smooth'});
}

/* ---------- shop ---------- */
let shopState={q:'',cat:'',sort:'feat',brands:[],maxPrice:0,pack:'',badge:''};
function shopRouteFilters(cat=''){
  const p=new URLSearchParams(location.search),sort=p.get('sort'),badge=p.get('badge');
  return {q:p.get('q')||'',cat,sort:['feat','lo','hi','az','new','pop'].includes(sort)?sort:'feat',brands:p.getAll('brand').map(v=>v.trim()).filter(Boolean),maxPrice:0,pack:'',badge:['Sale','Bestseller'].includes(badge)?badge:''};
}
/* navigation is defined in the clean History API router below */
/* populate desktop header dropdowns (categories + top brands) */
function renderHeaderDropdowns(){
  try{
    const dc=$('#ddCats');
    if(dc){
      const cats={}; activeProducts().forEach(p=>{cats[p.category]=(cats[p.category]||0)+1;});
      const order=CAT_ORDER.filter(c=>cats[c]);
      dc.innerHTML=order.map(c=>'<a href="'+categoryPath(c)+'">'+esc(c)+'<span class="cnt">'+cats[c]+'</span></a>').join('');
    }
    const db=$('#ddBrands');
    if(db){
      const bc={}; activeProducts().forEach(p=>{const b=getBrand(p);bc[b]=(bc[b]||0)+1;});
      const top=Object.entries(bc).sort((a,b)=>b[1]-a[1]).slice(0,9);
      db.innerHTML='<a href="/brands/">🏷️ All Brands</a>'
        +top.map(([b,n])=>'<a href="/brand/'+brandSlug(b)+'/">'+esc(b)+'<span class="cnt">'+n+'</span></a>').join('');
    }
  }catch(e){ console.warn('header dropdowns', e); }
}
function getBrand(p){
  if(p&&typeof p==='object'){
    if(String(p.brand||'').trim())return String(p.brand).trim();
    if(p.bundle&&/^ChaskaBox\s/i.test(p.name||''))return 'ChaskaBox';
    p=p.name;
  }
  const m=String(p||'').split('|')[0].trim();
  return m||'ChaskaBox';
}
function brandSlug(name){
  return String(name||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'brand';
}
function filterPanelHTML(){
  const all=publicProducts();
  const brands=[...new Set(all.map(p=>getBrand(p)))].sort();
  const packs=[...new Set(all.map(p=>p.pack).filter(Boolean))].sort();
  const maxP=Math.max(...all.map(p=>p.price),1000);
  const catLinks=['',...(Array.isArray(STORE_CONFIG?.categories)?STORE_CONFIG.categories.map(c=>c.name):CAT_ORDER.filter(c=>c!=='Bundles'))].map(c=>{
    const label=c||'All Snacks', href=c?categoryPath(c):'/shop/', active=shopState.cat===c;
    return `<a class="filter-link${active?' active':''}" href="${href}">${esc(label)}${active?'<span>✓</span>':''}</a>`;
  }).join('');
  const selectedBrands=shopState.brands.length?`<small>${shopState.brands.length} selected</small>`:'';
  return `<details class="fgroup filter-group" open><summary>Category</summary><div class="filter-options filter-links">${catLinks}</div></details>`
    +`<details class="fgroup filter-group"><summary>Brand ${selectedBrands}</summary><div class="filter-options">${brands.map(b=>'<label><input type="checkbox" value="'+esc(b)+'" '+(shopState.brands.includes(b)?'checked':'')+' onchange="toggleBrand(this)"> '+esc(b)+'</label>').join('')}</div></details>`
    +`<details class="fgroup filter-group"><summary>Price</summary><div class="filter-options"><input type="range" min="100" max="${maxP}" step="50" value="${shopState.maxPrice||maxP}" oninput="shopState.maxPrice=+this.value;this.closest('.fgroup').querySelector('.pval').textContent=fmt(+this.value);renderShopResults()"><div class="pval">${fmt(shopState.maxPrice||maxP)}</div></div></details>`
    +`<details class="fgroup filter-group"><summary>Pack size</summary><div class="filter-options"><select onchange="shopState.pack=this.value;renderShopResults()"><option value="">All packs</option>${packs.map(p=>'<option '+(shopState.pack===p?'selected':'')+' value="'+esc(p)+'">'+esc(p)+'</option>').join('')}</select></div></details>`
    +`<details class="fgroup filter-group"><summary>Deals</summary><div class="filter-options"><label><input type="checkbox" ${shopState.badge==='Sale'?'checked':''} onchange="shopState.badge=this.checked?'Sale':'';renderShopResults()"> On Sale</label></div></details>`
    +'<button class="fclear" onclick="clearAllFilters()">Clear filters</button>';
}
function renderShopCategoryRail(){
  const el=document.getElementById('shopCategoryRail');
  if(!el)return;
  const products=publicProducts();
  const totals=new Map();
  for(const product of products){
    const key=String(product.category||'').trim();
    if(key)totals.set(key,(totals.get(key)||0)+1);
  }
  // Bundles route uses the bundle flag, which includes Top Pops bundles in other categories.
  const bundleCount=products.filter(p=>p.bundle).length;
  if(bundleCount)totals.set('Bundles',bundleCount);
  const configured=Array.isArray(STORE_CONFIG?.categories)?STORE_CONFIG.categories
    .map(c=>String(c.name||'').trim()).filter(Boolean):CAT_ORDER.filter(x=>x!=='Bundles');
  const categories=[...new Set([...configured,...totals.keys()])].filter(c=>totals.has(c));
  el.replaceChildren();
  const all=document.createElement('a');all.href='/shop/';all.textContent='All snacks';
  if(!shopState.cat){all.className='active';all.setAttribute('aria-current','page');}
  el.append(all);
  categories.forEach(cat=>{
    const link=document.createElement('a');
    link.href=categoryPath(cat);link.textContent=cat+' ('+totals.get(cat)+')';
    if(shopState.cat===cat){link.className='active';link.setAttribute('aria-current','page');}
    el.append(link);
  });
}
function renderShopContent(){
  const headerSearch=document.getElementById('headerSearch');
  if(headerSearch&&document.activeElement!==headerSearch)headerSearch.value=shopState.q||'';
  const {cat,badge}=shopState;
  let title=cat||'All Snacks';
  if(badge) title=badge==='Sale'?'Snack Deals':'Bestsellers';
  else if(!cat&&shopState.sort==='new')title='New Arrivals';
  $('#crumbCat').textContent=title;
  $('#catTitle').textContent=title;
  renderShopCategoryRail();
  const html=filterPanelHTML();
  $('#shopSidebar').innerHTML=html;
  const sb=$('#filterSheetBody'); if(sb)sb.innerHTML=html;
  renderShopList();
}
/* ---------- mobile filter bottom sheet ---------- */
let filterReturnFocus=null;
function openFilters(){
  filterReturnFocus=document.activeElement;
  const sb=$('#filterSheetBody'); if(sb)sb.innerHTML=filterPanelHTML();
  $('#filterSheet').classList.add('open');
  $('#filterSheet').setAttribute('aria-hidden','false');
  $('#filterSheet').removeAttribute('inert');
  $('#filterBackdrop').classList.add('open');
  document.body.style.overflow='hidden';
  updateApplyBtn();
  setTimeout(()=>document.querySelector('#filterSheet .fsclose')?.focus(),0);
}
function closeFilters(){
  const s=$('#filterSheet'); if(s){s.classList.remove('open');s.setAttribute('aria-hidden','true');s.setAttribute('inert','');}
  const b=$('#filterBackdrop'); if(b)b.classList.remove('open');
  document.body.style.overflow='';
  if(filterReturnFocus&&typeof filterReturnFocus.focus==='function'){const f=filterReturnFocus;filterReturnFocus=null;setTimeout(()=>f.focus(),0);}
}
function clearAllFilters(){
  shopState.brands=[];shopState.maxPrice=0;shopState.pack='';shopState.q='';shopState.badge='';
  syncShopSearchUrl(true);
  renderShopContent();
}
function activeFilterCount(){
  return shopState.brands.length+(shopState.maxPrice?1:0)+(shopState.pack?1:0)+(shopState.badge?1:0);
}
function updateApplyBtn(){
  const n=filteredShop().length;
  const ab=$('#applyFiltersBtn'); if(ab)ab.textContent='Show '+n+' Result'+(n===1?'':'s');
  const badge=$('#filterCount'),c=activeFilterCount();
  if(badge){ if(c>0){badge.style.display='';badge.textContent=c;} else badge.style.display='none'; }
}
function removeBrandChip(el){
  const b=el.getAttribute('data-v');
  shopState.brands=shopState.brands.filter(x=>x!==b);
  renderShopContent();
}
function renderFilterChips(){
  const el=$('#filterChips'); if(!el)return;
  let h='';
  if(shopState.q)h+='<button class="fchip" onclick="shopState.q=\'\';syncShopSearchUrl();renderShopContent()" aria-label="Remove search filter">Search: '+esc(shopState.q)+' <span>✕</span></button>';
  shopState.brands.forEach(b=>{h+='<button class="fchip" data-v="'+esc(b)+'" onclick="removeBrandChip(this)">'+esc(b)+' <span>\u2715</span></button>';});
  if(shopState.maxPrice)h+='<button class="fchip" onclick="shopState.maxPrice=0;renderShopContent()">Under '+fmt(shopState.maxPrice)+' <span>\u2715</span></button>';
  if(shopState.pack)h+='<button class="fchip" onclick="shopState.pack=\'\';renderShopContent()">'+esc(shopState.pack)+' <span>\u2715</span></button>';
  if(shopState.badge)h+='<button class="fchip" onclick="shopState.badge=\'\';renderShopContent()">'+(shopState.badge==='Sale'?'🔥 On Sale':'⭐ Bestsellers')+' <span>\u2715</span></button>';
  el.innerHTML=h;
}
function toggleBrand(el){
  const b=el.value;
  shopState.brands=el.checked?[...shopState.brands,b]:shopState.brands.filter(x=>x!==b);
  renderShopList();
}
function filteredShop(){
  let list=publicProducts();const{q,cat,sort,brands,maxPrice,pack,badge}=shopState;
  if(cat){const category=(STORE_CONFIG?.categories||[]).find(c=>c.name===cat);list=list.filter(p=>cat==='Bundles'?p.bundle:(category?category.product_ids.includes(Number(p.id)):p.category===cat));}
  if(badge)list=list.filter(p=>badge==='Sale'?p.oldPrice>p.price:p.badge===badge);
  if(q){const n=q.toLowerCase().trim();list=list.filter(p=>[p.name,p.pack,p.category,getBrand(p),p.desc].filter(Boolean).join(' ').toLowerCase().includes(n));}
  if(brands.length)list=list.filter(p=>brands.includes(getBrand(p)));
  if(maxPrice)list=list.filter(p=>p.price<=maxPrice);
  if(pack)list=list.filter(p=>p.pack===pack);
  if(sort==='lo')list=[...list].sort((a,b)=>a.price-b.price);
  else if(sort==='hi')list=[...list].sort((a,b)=>b.price-a.price);
  else if(sort==='az')list=[...list].sort((a,b)=>a.name.localeCompare(b.name));
  else if(sort==='new')list=[...list].sort((a,b)=>(b.id||0)-(a.id||0));
  else if(sort==='pop')list=[...list].sort((a,b)=>(b.rating||0)-(a.rating||0));
  return list;
}
let shopSearchTimer;
function renderShopList(){
  const{q,cat,sort}=shopState;
  $('#shopFilters').innerHTML=
    '<div class="shop-search-wrap"><input type="search" id="fq" autocomplete="off" aria-label="Search products" placeholder="Search in '+esc(cat||'all snacks')+'..." value="'+esc(q)+'" oninput="queueShopSearch(this.value)" onkeydown="shopSearchKey(event)"><div id="shopSearchSuggestions" class="shop-search-suggestions" role="listbox" hidden></div></div>'
    +'<select aria-label="Sort products" onchange="shopState.sort=this.value;renderShopResults()">'
    +'<option value="feat" '+(sort==='feat'?'selected':'')+'>Recommended</option>'
    +'<option value="lo" '+(sort==='lo'?'selected':'')+'>Price: Low → High</option>'
    +'<option value="hi" '+(sort==='hi'?'selected':'')+'>Price: High → Low</option>'
    +'<option value="az" '+(sort==='az'?'selected':'')+'>Name A–Z</option>'
    +'<option value="new" '+(sort==='new'?'selected':'')+'>Newest</option>'
    +'<option value="pop" '+(sort==='pop'?'selected':'')+'>Popular</option>'
    +'</select><span class="cnt" id="shopResultCount"></span>';
  renderShopResults();
}
function syncShopSearchUrl(clearBrands=false){
  const url=new URL(location.pathname+location.search+location.hash,location.origin);
  const q=String(shopState.q||'').trim();
  const headerSearch=document.getElementById('headerSearch');
  if(headerSearch&&document.activeElement!==headerSearch)headerSearch.value=q;
  if(q)url.searchParams.set('q',q);else url.searchParams.delete('q');
  if(clearBrands)url.searchParams.delete('brand');
  history.replaceState(null,'',url.pathname+url.search+url.hash);
}
function queueShopSearch(value){
  shopState.q=value;
  syncShopSearchUrl();
  renderShopSearchSuggestions(value);
  clearTimeout(shopSearchTimer);
  shopSearchTimer=setTimeout(renderShopResults,140);
}
let shopSuggestIndex=-1;
function renderShopSearchSuggestions(value){
  const box=document.getElementById('shopSearchSuggestions');if(!box)return;
  const q=String(value||'').trim().toLowerCase(); shopSuggestIndex=-1;
  if(q.length<2){box.hidden=true;box.innerHTML='';return;}
  const matches=activeProducts().filter(p=>(p.name+' '+(p.category||'')+' '+getBrand(p)).toLowerCase().includes(q)).slice(0,5);
  if(!matches.length){box.hidden=true;box.innerHTML='';return;}
  box.hidden=false;
  box.innerHTML=matches.map((p,i)=>`<a role="option" data-sidx="${i}" href="${productHref(p.id)}"><img src="${esc(assetUrl(p.img||''))}" alt=""><span><b>${esc(p.name)}</b><small>${esc(p.pack||p.category||'')}</small></span><strong>${fmt(p.price)}</strong></a>`).join('');
}
function setShopSuggestion(index){
  const box=document.getElementById('shopSearchSuggestions'); if(!box||box.hidden)return;
  const items=[...box.querySelectorAll('[data-sidx]')]; if(!items.length)return;
  shopSuggestIndex=(index+items.length)%items.length;
  items.forEach((el,i)=>{el.classList.toggle('active',i===shopSuggestIndex);el.setAttribute('aria-selected',i===shopSuggestIndex?'true':'false');});
  items[shopSuggestIndex].scrollIntoView({block:'nearest'});
}
function shopSearchKey(event){
  const box=document.getElementById('shopSearchSuggestions');
  if(event.key==='ArrowDown'&&!box?.hidden){event.preventDefault();setShopSuggestion(shopSuggestIndex+1);}
  else if(event.key==='ArrowUp'&&!box?.hidden){event.preventDefault();setShopSuggestion(shopSuggestIndex-1);}
  else if(event.key==='Enter'&&shopSuggestIndex>=0&&!box?.hidden){event.preventDefault();const a=box.querySelector(`[data-sidx="${shopSuggestIndex}"]`);if(a)location.href=a.href;}
  else if(event.key==='Escape'&&box){box.hidden=true;shopSuggestIndex=-1;}
}
let smartSearchSeq=0, smartSearchTimer;
function serverProductToLocal(p){return {id:Number(p.id),name:p.name||'',category:p.category||'',brand:p.brand||'',pack:p.pack||'',price:Number(p.price||0),oldPrice:(p.old_price??p.oldPrice)==null?null:Number(p.old_price??p.oldPrice),desc:p.description??p.desc??'',badge:p.badge||'',img:p.image_url??p.img??'',photoNote:p.image_warning??p.photoNote??'',stockState:p.stock_state??p.stockState??'sourced_after_order',bundle:!!(p.is_bundle??p.bundle),seoTitle:p.seo_title??p.seoTitle??'',seoDescription:p.seo_description??p.seoDescription??'',bundleContents:p.bundle_contents??p.bundleContents??[],retailValue:p.bundle_retail_value??p.retailValue??null,bundleSavings:p.bundle_savings??p.bundleSavings??null,bundleNote:p.bundle_warning??p.bundleNote??''};}
async function renderSmartSearchResults(query,seq){
  try{
    try{ sessionStorage.setItem('cb_last_search',query); }catch(e){}
    const r=await fetch('/api/ai/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query})});
    if(!r.ok)throw new Error('smart search unavailable'); const data=await r.json();
    if(seq!==smartSearchSeq||shopState.q!==query)return;
    const rows=(data.products||[]).map(serverProductToLocal);
    const grid=$('#shopGrid'),cnt=document.getElementById('shopResultCount');
    if(rows.length){grid.innerHTML=rows.map(cardHTML).join('');if(cnt)cnt.textContent=rows.length+' smart matches';$('#catCount').textContent=rows.length+' smart matches';}
    else grid.innerHTML='<div class="empty shop-no-results"><strong>No matching snacks yet</strong><p>Try another name, brand or category.</p><button type="button" class="shop-empty-reset" onclick="clearAllFilters()">Clear search</button><a href="/shop/">Browse all snacks</a></div>';
    observeReveals();
  }catch{if(seq===smartSearchSeq&&shopState.q===query)$('#shopGrid').innerHTML='<div class="empty shop-no-results"><strong>Search suggestions unavailable</strong><p>You can still browse categories or clear the search.</p><button type="button" class="shop-empty-reset" onclick="clearAllFilters()">Clear search</button><a href="/shop/">Browse all snacks</a></div>';}
}
function renderShopResults(){
  const list=filteredShop();
  $('#catCount').textContent=list.length+' '+(list.length===1?'product':'products');
  const cnt=document.getElementById('shopResultCount');if(cnt)cnt.textContent=list.length+' '+(list.length===1?'product':'products');
  const canSmart=!list.length&&String(shopState.q||'').trim().length>=2&&!shopState.cat&&!shopState.brands.length&&!shopState.maxPrice&&!shopState.pack&&!shopState.badge;
  if(list.length){clearTimeout(smartSearchTimer);smartSearchSeq++;$('#shopGrid').innerHTML=list.map((p,i)=>cardHTML(p,i===0?'high':i===1?'eager':undefined)).join('');}
  else if(canSmart){const seq=++smartSearchSeq;clearTimeout(smartSearchTimer);$('#shopGrid').innerHTML='<div class="empty">✦ Looking for smart matches…</div>';smartSearchTimer=setTimeout(()=>renderSmartSearchResults(shopState.q,seq),420);}
  else {clearTimeout(smartSearchTimer);smartSearchSeq++;$('#shopGrid').innerHTML='<div class="empty shop-no-results"><strong>No matching snacks yet</strong><p>Try a different brand, category or price range.</p><button type="button" class="shop-empty-reset" onclick="clearAllFilters()">Clear filters &amp; search</button><a href="/shop/">Browse all snacks</a></div>';}
  renderFilterChips();updateApplyBtn();
  const ms=$('#mSort'); if(ms)ms.value=shopState.sort;
  if(typeof revealObs!=='undefined'&&revealObs){
    [...document.querySelectorAll('#shopGrid .card')].forEach(c=>c.classList.add('in'));
  }
  observeReveals();
}


/* ---------- product modal ---------- */
let productModalReturnFocus=null;
function openProduct(id){
  productModalReturnFocus=document.activeElement;
  const p=PRODUCTS.find(x=>x.id===id);if(!p)return;if(p.stockState==='unavailable'){toast('This snack is unavailable right now.');return;}
  // Search → product click tracking
  try{
    const lastQ=sessionStorage.getItem('cb_last_search');
    if(lastQ){
      let sid=null; try{ sid=localStorage.getItem('cb_sid'); }catch(e){}
      fetch('/api/search-click',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:id,query:lastQ,session_id:sid})}).catch(()=>{});
      sessionStorage.removeItem('cb_last_search');
    }
  }catch(e){}
  const img=p.img?`<img src="${esc(assetUrl(p.img))}" alt="">`:`<div class="noimg"><b>CHASKABOX</b><span>${p.photoNote?esc(p.photoNote):'Photo<br>coming soon'}</span><small>${esc(p.category||'')}</small></div>`;
  const old=p.oldPrice?`<span class="oldprice">${fmt(p.oldPrice)}</span>`:'';
  $('#mbody').innerHTML=`<div class="mgrid">
    <div class="pimg">${img}</div>
    <div><h2 style="color:var(--navy);font-size:20px;margin-bottom:6px">${esc(p.name)}</h2>
    <div class="ppack" style="margin-bottom:8px">${esc(p.pack||'')} · ${esc(p.category)}</div>
    <div style="margin-bottom:10px"><span class="price" style="font-size:22px">${fmt(p.price)}</span>${old}</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:14px">${esc(p.desc||'')}</p>
    <div class="qty" style="margin-bottom:12px"><button onclick="mQty(-1)">−</button><b id="mqty">1</b><button onclick="mQty(1)">+</button></div>
    <button class="pdbtn" onclick="addToCart(${p.id},+document.getElementById('mqty').textContent,this);closeModal()">Add to Bag</button>
    </div></div>`;
  $('#pmodal').classList.add('open');
  $('#pmodal').setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
  setTimeout(()=>$('#pmodal .mclose')?.focus(),0);
}
function mQty(d){const e=$('#mqty');e.textContent=Math.min(MAX_CART_QTY,Math.max(1,+e.textContent+d));}
function closeModal(){$('#pmodal').classList.remove('open');$('#pmodal').setAttribute('aria-hidden','true');document.body.style.overflow='';if(productModalReturnFocus&&typeof productModalReturnFocus.focus==='function'){const f=productModalReturnFocus;productModalReturnFocus=null;setTimeout(()=>f.focus(),0);}}

/* ---------- product detail page ---------- */
function renderProductDetail(id){
  const p=PRODUCTS.find(x=>x.id===id); if(!p){render404(location.pathname);return;}
  setProductMeta(p);
  const img=hasPhoto(p)?`<img ${photoAttributes(p.img,"(max-width:700px) calc(100vw - 32px), 520px")} alt="${esc(p.name)}" fetchpriority="high" width="600" height="600" decoding="async">`:`<div class="noimg"><b>CHASKABOX</b><span>${p.photoNote?esc(p.photoNote):'Photo<br>coming soon'}</span><small>${esc(p.category||'')}</small></div>`;
  const badge=p.badge?`<span class="badge ${p.badge==='Bestseller'?'bestseller':''}">${esc(p.badge==='Sale'?'Sale':p.badge.toUpperCase())}</span>`:'';
  const old=p.oldPrice&&p.oldPrice>p.price?`<span class="oldprice">${fmt(p.oldPrice)}</span>`:'';
  const save=p.oldPrice&&p.oldPrice>p.price?`<span class="pdsave">Save ${Math.round((1-p.price/p.oldPrice)*100)}%</span>`:'';
  const catlabel=p.category?`<div class="pcat">${esc(p.category)}${p.bundle?' · BUNDLE':''}</div>`:'';
  $('#pdCrumbCat').textContent=p.category||'All Snacks';
  $('#pdCrumbCat').removeAttribute('onclick');$('#pdCrumbCat').href=categoryPath(p.category||'');
  $('#pdCrumbName').textContent=p.name;
  // Related products: same category, exclude current
  const related=activeProducts().filter(x=>x.id!==p.id&&x.category===p.category).slice(0,4);
  const relatedHTML=related.length?`<section class="pd-related"><h2>You may also like</h2><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${related.map(cardHTML).join('')}</div></section>`:'';
  $('#pdetail').innerHTML=`<div class="pdetail">
    <div class="pd-grid">
      <div class="pd-imgwrap">${badge}<button type="button" class="pd-img pd-image-button" ${hasPhoto(p)?`data-zoom-src="${esc(assetUrl(p.img))}" data-zoom-alt="${esc(p.name)}"`:'disabled'} aria-label="Enlarge product photo">${img}</button></div>
      <div class="pd-info">
        ${catlabel}
        <h1>${esc(p.name)}</h1>
        <div class="pd-brand">${esc(getBrand(p))}</div>
        <div class="pd-price"><span class="price" style="font-size:26px">${fmt(p.price)}</span>${old}${save}</div>
        <div class="ppack" style="margin-bottom:10px">${esc(p.pack||'')}</div>

        <p class="pd-desc">${esc(p.desc||'Product details are being updated. Contact ChaskaBox if you need ingredient or allergen information before ordering.')}</p>
        <div class="pd-buyrow">
          <div class="qty"><button onclick="pdQty(-1)" aria-label="Decrease quantity">−</button><b id="pdqty">1</b><button onclick="pdQty(1)" aria-label="Increase quantity">+</button></div>
          <button class="pdbtn" ${p.stockState==='unavailable'?'disabled':''} onclick="addToCart(${p.id},+document.getElementById('pdqty').textContent,this)">${p.stockState==='unavailable'?'Currently unavailable':'Add to Bag'}</button>
          <button class="pdwish${typeof isWished==='function'&&isWished(p.id)?' on':''}" aria-label="Add ${esc(p.name)} to wishlist" onclick="toggleWishlist(${p.id},this)">♥</button>
        </div>
        <dl class="pd-facts"><div><dt>Brand</dt><dd>${esc(p.brand||'Not specified')}</dd></div><div><dt>Pack</dt><dd>${esc(p.pack||'See listed contents')}</dd></div><div><dt>Availability</dt><dd>${p.stockState==='sourced_after_order'?'Sourced after order; confirmed before fulfilment':p.stockState==='unavailable'?'Currently unavailable':'See current order details'}</dd></div></dl>
        ${bundleContentsHTML(p)}
        <div class="dbox"><b>Estimated delivery</b><small>Pakistan-wide delivery window<br><span class="ddates">${deliveryRange()}</span></small></div>
        <div class="pd-meta"><span>🚚 ${esc(deliveryFeeCopy())}</span><span>Delivery fees confirmed at checkout for your city</span><span>✅ Original sealed packs</span></div>${codAdvanceNote()}
        <div class="product-help"><b>Need ingredients, allergen or best-before details?</b><span>Read the original pack label. <a href="${esc(productSupportHref(p))}" target="_blank" rel="noopener">Ask ChaskaBox before ordering</a>. If an item becomes unavailable, we contact you before any substitution.</span></div>
        <nav class="pd-policy-links" aria-label="Product and order help"><a href="/shipping-policy/">Delivery and charges</a><a href="/refund-policy/">Refund and resolution</a><a href="/track-order.html">Track your order</a></nav>
      </div>
    </div>
  </div>${relatedHTML}<div id="reviewsMount"></div>`;
  $('#pdetail').querySelector('[data-zoom-src]')?.addEventListener('click',event=>{const el=event.currentTarget;openImageLightbox(el.dataset.zoomSrc,el.dataset.zoomAlt);});
  showView('product');
  window.scrollTo(0,0);
  if(typeof window.chaskaTrack==='function') window.chaskaTrack('product_view',{id:p.id,name:p.name,price:p.price,category:p.category});
  if(window.ReviewsWidget) ReviewsWidget.mount('#reviewsMount', p.id);
}
// Image lightbox for product zoom
let lightboxReturnFocus=null;
function closeImageLightbox(){const lb=document.getElementById('imgLightbox');if(lb){lb.classList.remove('open');lb.style.display='none';}lightboxReturnFocus?.focus();}
function openImageLightbox(src,alt){
 if(!src)return;
 let lb=document.getElementById('imgLightbox');
 if(!lb){
  lb=document.createElement('div');lb.id='imgLightbox';lb.setAttribute('role','dialog');lb.setAttribute('aria-modal','true');lb.setAttribute('aria-label','Product image enlarged');
  lb.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);display:grid;place-items:center;padding:20px';
  lb.innerHTML='<button class="lightbox-close" type="button" aria-label="Close enlarged photo">×</button><img style="max-width:90vw;max-height:90vh;object-fit:contain;border-radius:12px" alt="">';
  lb.querySelector('button').onclick=closeImageLightbox;lb.onclick=e=>{if(e.target===lb)closeImageLightbox();};
  lb.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();closeImageLightbox();}else if(e.key==='Tab'){e.preventDefault();lb.querySelector('button').focus();}};
  document.body.appendChild(lb);
 }
 lightboxReturnFocus=document.activeElement;lb.querySelector('img').src=src;lb.querySelector('img').alt=alt||'Product image';
 lb.classList.add('open');lb.style.display='grid';lb.querySelector('button').focus();
}
function productSupportHref(p){return 'https://wa.me/923320005381?text='+encodeURIComponent('Please confirm ingredients, allergens and best-before for '+p.name+' ('+(p.pack||'listed pack')+'): https://chaskabox.online'+productHref(p.id));}
function bundleContentsHTML(p){
 if(!p.bundle)return '';
 if(p.bundleNote)return '<p class="product-help">'+esc(p.bundleNote)+'</p>';
 if(!Array.isArray(p.bundleContents)||!p.bundleContents.length)return '';
 const items=p.bundleContents.map(i=>'<li>'+Number(i.quantity)+' × <a href="'+productHref(i.product_id)+'">'+esc(i.name)+'</a> — '+esc(i.pack)+'</li>').join('');
 return '<section class="bundle-contents"><h2>Included packs</h2><ul>'+items+'</ul><p>'+((Number(p.retailValue)>0)?'Current individual pack total: '+fmt(p.retailValue)+'. ':'')+((Number(p.bundleSavings)>0)?'Save '+fmt(p.bundleSavings)+' against these current packs.':'')+'</p></section>';
}
function productPageTitle(p){
 const name=String(p.name||''),pack=String(p.pack||'').trim();
 const raw=String(p.seoTitle||name+(pack&&!name.toLowerCase().includes(pack.toLowerCase())?' — '+pack:'')+' | ChaskaBox').trim();
 return raw.replace(/(Pack of\s+(\d+))(?:\s*[—-]\s*Pack of\s+\2)+/gi,'$1').replace(/(?:\s*\|\s*ChaskaBox){2,}$/i,' | ChaskaBox').replace(/^(ChaskaBox\s*\|.+?)\s*\|\s*ChaskaBox$/i,'$1');
}
function setProductMeta(p){
 const title=productPageTitle(p);
 const description=p.seoDescription||p.desc||'Compare the listed pack and order details at ChaskaBox Pakistan.';
 setPageMeta(title,productHref(p.id),false,description);setMetaTag('property','og:type','product');
 const photo=hasPhoto(p)?new URL(assetUrl(p.img),'https://chaskabox.online').href:'https://chaskabox.online/images/logo-approved-20261017.png';
 setMetaTag('property','og:image',photo);setMetaTag('name','twitter:image',photo);
 const canonical='https://chaskabox.online'+productHref(p.id),offer={'@type':'Offer',url:canonical,priceCurrency:'PKR',price:String(p.price),seller:{'@type':'Organization',name:'ChaskaBox'}};
 const availability={available:'InStock',limited:'LimitedAvailability',unavailable:'OutOfStock'}[p.stockState];if(availability)offer.availability='https://schema.org/'+availability;
 const schema={'@context':'https://schema.org','@type':'Product',name:p.name,description,sku:String(p.id),url:canonical,...(String(p.brand||'').trim()?{brand:{'@type':'Brand',name:String(p.brand).trim()}}:{}),...(hasPhoto(p)?{image:[photo]}:{}),...(Number.isFinite(Number(p.price))&&Number(p.price)>=0?{offers:offer}:{})};
 for(const [id,data] of [['product-schema',schema],['breadcrumb-schema',{'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Home',item:'https://chaskabox.online/'},{'@type':'ListItem',position:2,name:p.category||'Shop',item:'https://chaskabox.online'+categoryPath(p.category)},{'@type':'ListItem',position:3,name:p.name,item:canonical}]}]]){
  let el=document.getElementById(id);if(!el){el=document.createElement('script');el.type='application/ld+json';el.id=id;document.head.appendChild(el);}el.textContent=JSON.stringify(data);
 }
}
function pdBack(){ history.back(); }
function pdQty(d){const e=$('#pdqty');e.textContent=Math.min(MAX_CART_QTY,Math.max(1,+e.textContent+d));}


/* ---------- public CMS/settings (admin-controlled, public-safe) ---------- */
let STORE_CONFIG={settings:{},sections:[]},HOME_PREVIEW_ROWS=null;
window.addEventListener('message',event=>{if(event.source!==window.parent||window.parent===window||event.origin!==location.origin||!new URLSearchParams(location.search).has('cms_preview')||event.data?.type!=='CHASKABOX_HOME_PREVIEW'||!Array.isArray(event.data.sections)||event.data.sections.length>20)return;HOME_PREVIEW_ROWS=event.data.sections;STORE_CONFIG.sections=HOME_PREVIEW_ROWS;if(document.getElementById('catTiles')){renderHomeContent();applyHomeCms();}});
async function loadStorefrontConfig(){
  if(window.loadStorefrontManifest){
    try{const data=await window.loadStorefrontManifest();STORE_CONFIG=HOME_PREVIEW_ROWS?{...data,sections:HOME_PREVIEW_ROWS}:data;window.applyStorefrontManifest?.(STORE_CONFIG);}catch{}
    return STORE_CONFIG;
  }
  try{const seed=JSON.parse(document.getElementById('current-storefront-config')?.textContent||'null');if(seed&&typeof seed==='object'&&!Array.isArray(seed)&&Array.isArray(seed.categories)){STORE_CONFIG=seed;if(HOME_PREVIEW_ROWS)STORE_CONFIG.sections=HOME_PREVIEW_ROWS;window.applyStorefrontManifest?.(STORE_CONFIG);return STORE_CONFIG;}}catch{}
  try{const r=await fetch('/api/storefront-config',{cache:'no-cache'});if(r.ok){STORE_CONFIG=await r.json();if(HOME_PREVIEW_ROWS)STORE_CONFIG.sections=HOME_PREVIEW_ROWS;window.applyStorefrontManifest?.(STORE_CONFIG);}}catch(e){}
  return STORE_CONFIG;
}
function settingNum(key,fallback){const v=STORE_CONFIG?.settings?.[key];const n=Number(v);return Number.isFinite(n)?n:fallback;}
function prepaidThreshold(){return STORE_CONFIG?.settings?.prepaid_free_delivery_enabled===false?null:Math.max(0,settingNum('prepaid_free_delivery_threshold_pkr',5000));}
function deliveryFeeCopy(){
  const threshold=prepaidThreshold(),cod=STORE_CONFIG?.settings?.cod_enabled===false?'COD currently unavailable':`COD: ${fmt(settingNum('cod_delivery_fee_pkr',300))} delivery`;
  return cod+' · '+(threshold===null?`Prepaid: ${fmt(settingNum('prepaid_delivery_fee_pkr',300))} delivery`:threshold===0?'Prepaid delivery: FREE':`Prepaid ${fmt(threshold)}+: free delivery; below: ${fmt(settingNum('prepaid_delivery_fee_pkr',300))}`);
}
function codAdvanceCopy(total=null){
  if(STORE_CONFIG?.settings?.cod_enabled===false||STORE_CONFIG?.settings?.cod_advance_enabled===false)return '';
  const configured=settingNum('cod_advance_amount_pkr',500),amount=Number.isSafeInteger(configured)&&configured>=1&&configured<=100000?configured:500;
  return `COD: ${total===null?'up to ':''}${fmt(total===null?amount:Math.min(amount,Math.max(0,total)))} advance after ordering, verified before dispatch; adjusted within your total. Remaining balance on delivery.`;
}
function codAdvanceNote(total=null){const copy=codAdvanceCopy(total);return copy?'<p class="cart-note cod-advance-note">'+esc(copy)+'</p>':'';}
function sectionConfig(key){return (STORE_CONFIG?.sections||[]).find(r=>r.section_key===key)?.config||{};}
function curatedProducts(key,fallback){
  const ids=sectionConfig(key)?.product_ids;
  if(!Array.isArray(ids)) return fallback;
  const by=new Map(activeProducts().map(p=>[Number(p.id),p]));
  const chosen=ids.map(Number).map(id=>by.get(id)).filter(p=>p&&hasPhoto(p));
  return chosen;
}
function applyHomeCms(){
  const rows=STORE_CONFIG?.sections||[]; const by=Object.fromEntries(rows.map(r=>[r.section_key,r]));
  const selectors={
    announcement_bar:['.promo'], hero:['#view-home .hero'], categories:['#view-home .discover'],
    deals:['#view-home [data-home-section="deals"]','#view-home .cb-offer-deals'],
    trust_bar:['#view-home .cb-trust-rail'],why_chaskabox:['#view-home .why-section'],promotions:['#view-home .cb-offers'],box_spotlight:['#view-home .box-spotlight'],
    chaska_picks:['#view-home [data-home-section="chaska_picks"]'], boxes:['#view-home [data-home-section="boxes"]','#view-home .cb-offer-box'],
    chatpata_picks:['#view-home [data-home-section="chatpata_picks"]'], new_items:['#view-home [data-home-section="new_items"]'],
    how_it_works:['#view-home .fresh'], faq:['#view-home .faq-section']
  };
  const positions={hero:0,categories:10,trust_bar:20,chaska_picks:30,promotions:40,new_items:50,deals:60,boxes:70,chatpata_picks:80,box_spotlight:90,how_it_works:100,why_chaskabox:110,faq:120};
  const home=document.getElementById('view-home');if(home){home.style.flexDirection='column';const shelves=home.querySelector('#shelves');if(shelves)shelves.style.display='contents';}
  for(const [key,sels] of Object.entries(selectors)){
    const row=by[key]||{enabled:true,position:positions[key],config:{}};
    for(const sel of sels){
      const el=document.querySelector(sel); if(!el) continue;
      el.hidden=row.enabled===false;
      // Inline priority makes the protected editor authoritative over theme defaults.
      if(key!=='announcement_bar')el.style.setProperty('order',String(row.position*10),'important');
      const cfg=row.config||{};if(key==='hero'){const link=el.querySelector('.hero-actions a');if(link){if(cfg.button_text!==undefined)link.textContent=cfg.button_text;if(cfg.button_url&&/^(\/[^/]|https:\/\/)/.test(cfg.button_url))link.href=cfg.button_url;}}
      if(row.heading!==null&&row.heading!==undefined){const h=el.querySelector('h1,h2');if(h)h.textContent=row.heading;}
      if(row.subheading!==null&&row.subheading!==undefined){const text=el.querySelector('p,.freshdesc');if(text)text.textContent=row.subheading;}
    }
  }
  const offers=document.querySelector('#view-home .cb-offers');
  if(offers&&Array.from(offers.querySelectorAll('.cb-offer')).every(el=>el.hidden))offers.hidden=true;
  const faq=by.faq?.config?.items;
  if(Array.isArray(faq)){
    const section=document.querySelector('#view-home .faq-section'),target=section?.querySelector('.faq-grid')||section;
    if(target){
      if(!target.dataset.defaultFaq)target.dataset.defaultFaq=Array.from(target.querySelectorAll('details')).map(el=>el.outerHTML).join('');
      target.querySelectorAll('details').forEach(el=>el.remove());
      for(const item of faq.slice(0,10)){
        if(typeof item?.q!=='string'||typeof item?.a!=='string')continue;
        const details=document.createElement('details'),summary=document.createElement('summary'),answer=document.createElement('p');
        summary.textContent=item.q;answer.textContent=item.a;details.append(summary,answer);target.append(details);
      }
    }
  }else{
    const section=document.querySelector('#view-home .faq-section'),target=section?.querySelector('.faq-grid')||section;
    if(target?.dataset.defaultFaq){target.querySelectorAll('details').forEach(el=>el.remove());target.insertAdjacentHTML('beforeend',target.dataset.defaultFaq);delete target.dataset.defaultFaq;}
  }
  window.applyStorefrontManifest?.(STORE_CONFIG);
  const heroRow=by.hero||{};
  if(typeof window.CustomEvent==='function'&&typeof window.dispatchEvent==='function')window.dispatchEvent(new window.CustomEvent('chaskabox:home-config',{detail:{
    ...(heroRow.config||{}),heading:heroRow.heading,subheading:heroRow.subheading
  }}));
  renderPackingVideo();
}
/* ---------- views ---------- */
function showView(v){
  const views=['home','shop','product','account','cart','wishlist','brands','brand','404'];
  views.forEach(name=>{
    const el=document.getElementById('view-'+name);
    if(!el) return;
    const active = (v===name);
    // Show the active route; hide and make inactive route content inert.
    if(!active){
      // Hide inactive views without destroying the homepage's server-rendered hero.
      // The same DOM must work when navigating Home -> Shop -> Home.
      el.style.display='none';
      el.setAttribute('hidden','');
      el.setAttribute('aria-hidden','true');
      el.setAttribute('inert','');
    } else {
      el.style.display='';
      el.removeAttribute('hidden');
      el.removeAttribute('aria-hidden');
      el.removeAttribute('inert');
    }
  });
  if(typeof closeFilters==='function') closeFilters();
  closeMnav();
}

/* ---------- Route renderers ---------- */
const SEO_CATEGORY_DATA = {"biscuits-and-wafers":{"name":"Biscuits & Wafers","title":"Biscuits & Wafers Online | ChaskaBox Pakistan","description":"Buy biscuits & wafers online in Pakistan from ChaskaBox. Explore original snack brands and compare pack sizes before ordering.","intro":"Browse biscuits, wafer packs and tea-time treats, including Mayfair varieties. Check the listed pack size and current price for each product; ChaskaBox confirms availability when sourcing your order."},"bunties-and-cakes":{"name":"Bunties & Cakes","title":"Bunties & Cakes Online | ChaskaBox Pakistan","description":"Shop bunties, cakes and sweet snacks online in Pakistan. Explore pack sizes and delivery details at ChaskaBox.","intro":"Explore cakes, bunties and individually packed sweet treats for school, guests or tea breaks. Compare the pack counts and prices shown on each ChaskaBox product page."},"chews-and-gums":{"name":"Chews & Gums","title":"Chews & Gums Online | ChaskaBox Pakistan","description":"Explore chews, chewing gums and chewy sweets in Pakistan at ChaskaBox with clear pack sizes and prices.","intro":"Browse chewing gum, fruity chews and other chewy snacks from the ChaskaBox catalogue. Product pages show pack sizes, prices and how to order."},"chocolates-and-candies":{"name":"Chocolates & Candies","title":"Chocolates & Candies Online | ChaskaBox Pakistan","description":"Buy chocolates and candies online in Pakistan at ChaskaBox. Browse candy packs and chocolate treats by brand and pack size.","intro":"Explore chocolate treats, candies and assorted sweet packs from Pakistani snack brands. Use product pages to check what is included and compare prices before placing your order."},"imli-and-ice-lollies":{"name":"Imli & Ice Lollies","title":"Imli & Ice Lollies Online | ChaskaBox Pakistan","description":"Browse imli, sour sweets and ice lollies online in Pakistan at ChaskaBox. Find your preferred flavors and pack sizes.","intro":"Discover tangy imli snacks, sour treats and ice-lolly style sweets in the ChaskaBox catalogue. Check individual listings for packaging, format and current order details."},"jellies-and-marshmallow":{"name":"Jellies & Marshmallow","title":"Jellies & Marshmallow Online | ChaskaBox Pakistan","description":"Shop jellies and marshmallow snacks online in Pakistan. Compare sweet varieties and packs at ChaskaBox.","intro":"Explore colorful jellies, chewy sweets and marshmallow packs, including popular Pakistani snack brands. Browse individual product listings for the pack quantity and current price."},"snacks-and-nimco":{"name":"Snacks & Nimco","title":"Snacks & Nimco Online | ChaskaBox Pakistan","description":"Buy nimco and savory Pakistani snacks online at ChaskaBox. Browse spicy, salty and crunchy snack packs.","intro":"Find salty, spicy and crunchy Pakistani snacks, including nimco-style mixes and packaged savory treats. Compare pack sizes and prices, then order your favorites for delivery in Pakistan."},"betel-nuts-and-pan-masala":{"name":"Betel Nuts & Pan Masala","title":"Betel Nuts & Pan Masala | ChaskaBox Pakistan","description":"Explore listed betel nut and pan masala products at ChaskaBox. Review packaging and product information before ordering.","intro":"Browse ChaskaBox's betel-nut and pan-masala catalogue listings. Read individual product information and packaging details before placing an order."},"shop":{"name":"All Snacks","title":"Buy Pakistani Snacks Online | ChaskaBox Shop","description":"Browse packaged Pakistani snacks by category and brand. Compare biscuits, candies, nimco, jellies and Chaska Boxes, with current pack sizes and prices.","intro":"Explore the ChaskaBox catalogue of Pakistani sweets and savory snacks. Browse by category and brand, and compare the displayed pack sizes and prices before ordering."},"bundles":{"name":"Chaska Boxes","title":"Chaska Boxes — Snack Bundles | ChaskaBox","description":"Explore ChaskaBox snack bundles online in Pakistan. Compare box contents, pack sizes and prices before ordering.","intro":"Browse Chaska Boxes for gifting, family snack tables and everyday cravings. Check the contents and current price of each bundle before ordering."}};
function setCategorySeoCopy(data){
  const target=document.getElementById('categorySeoIntro');
  if(!target) return;
  target.textContent=data?.intro||'';
  target.hidden=!data?.intro;
}
function setCategoryBreadcrumb(name, path){
  let script=document.getElementById('category-breadcrumb-schema');
  if(!script){script=document.createElement('script');script.id='category-breadcrumb-schema';script.type='application/ld+json';document.head.appendChild(script);}
  script.textContent=JSON.stringify({'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
    {'@type':'ListItem',position:1,name:'Home',item:'https://chaskabox.online/'},
    {'@type':'ListItem',position:2,name:name,item:'https://chaskabox.online'+path},
  ]});
}
function setMetaRobots(noindex){
  let m=document.querySelector('meta[name="robots"]');
  if(!m){ m=document.createElement('meta'); m.name='robots'; document.head.appendChild(m); }
  m.content=noindex?'noindex, follow':'index, follow';
}
function setPageMeta(title,path,noindex,description){
  document.title=title;
  setMetaRobots(!!noindex);
  setMetaTag('property','og:title',title);
  setMetaTag('name','twitter:title',title);
  const productPath=normalizePath(path||'/').startsWith('/product/');
  if(!productPath){
    document.getElementById('product-schema')?.remove();
    document.getElementById('breadcrumb-schema')?.remove?.();
    setMetaTag('property','og:type','website');
    setMetaTag('property','og:image','https://chaskabox.online/images/logo-approved-20261017.png');
    setMetaTag('name','twitter:image','https://chaskabox.online/images/logo-approved-20261017.png');
  }
  if(!normalizePath(path||'/').startsWith('/brand/'))document.getElementById('brandBreadcrumbSchema')?.remove();
  if(!normalizePath(path||'/').startsWith('/category/') && normalizePath(path||'/')!=='/shop/' && normalizePath(path||'/')!=='/bundles/')document.getElementById('category-breadcrumb-schema')?.remove?.();
  const canonical='https://chaskabox.online'+normalizePath(path||'/');
  let c=document.querySelector('link[rel="canonical"]');
  if(!c){ c=document.createElement('link'); c.rel='canonical'; document.head.appendChild(c); }
  c.href=canonical;
  let og=document.querySelector('meta[property="og:url"]');
  if(og) og.content=canonical;
  if(description){ const d=document.querySelector('meta[name="description"]'); if(d)d.content=description;setMetaTag('property','og:description',description); }
}
function renderHomeRoute(){
  setPageMeta('Pakistani Snacks Online | ChaskaBox Pakistan','/',false,'Explore Pakistani childhood snacks, biscuits, candies, nimco and Chaska Boxes. Compare brands, pack sizes and prices, with delivery across Pakistan.');
  // Mount home content from template (SEO: only active route in DOM)
  const vh=document.getElementById('view-home');
  const tpl=document.getElementById('tpl-home');
  if(vh && tpl && !vh.innerHTML.trim()){
    vh.appendChild(tpl.content.cloneNode(true));
  }
  showView('home');
  renderHomeContent();
  applyHomeCms();
  // The initial route already awaited storefront configuration; avoid a second
  // fetch and a destructive re-render of images/shelves in the first viewport.
}
function renderShopRoute(){
  const saleRoute=new URLSearchParams(location.search).get('badge')==='Sale';
  setPageMeta(saleRoute?'Snack Deals | ChaskaBox Pakistan':SEO_CATEGORY_DATA.shop.title,'/shop/',false,saleRoute?'Browse current snack deals and compare listed prices at ChaskaBox Pakistan.':SEO_CATEGORY_DATA.shop.description);
  setCategorySeoCopy(SEO_CATEGORY_DATA.shop);
  setCategoryBreadcrumb('All Snacks','/shop/');
  shopState=shopRouteFilters();
  const urlQ=new URLSearchParams(location.search).get('q'); if(urlQ!==null) shopState.q=urlQ;
  const params=new URLSearchParams(location.search);
  if(params.get('sort')==='new')shopState.sort='new';
  if(params.get('badge')==='Sale')shopState.badge='Sale';
  if(params.has('brand'))shopState.brands=params.getAll('brand').map(v=>v.trim()).filter(Boolean);
  const category=params.get('category')??params.get('cat');if(category!==null)shopState.cat=(STORE_CONFIG?.categories||[]).find(c=>c.slug===category)?.name||CATEGORY_SLUGS[category]||category;
  showView('shop');
  renderShopContent();
}
function renderBundlesRoute(){
  setPageMeta(SEO_CATEGORY_DATA.bundles.title,'/bundles/',false,SEO_CATEGORY_DATA.bundles.description);
  setCategorySeoCopy(SEO_CATEGORY_DATA.bundles);
  setCategoryBreadcrumb('Chaska Boxes','/bundles/');
  shopState=shopRouteFilters('Bundles');
  showView('shop');
  renderShopContent();
  // Box view tracking
  try{ let sid=null; try{ sid=localStorage.getItem('cb_sid'); }catch(e){}
    fetch('/api/box-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'view',box_name:'bundles-page',session_id:sid})}).catch(()=>{});
  }catch(e){}
}

/* ---------- Phase 2A: Brand directory + brand detail ---------- */
let _brandsCache=null;
async function fetchBrands(){
  if(_brandsCache) return _brandsCache;
  try{
    const r=await fetch('/api/brands',{headers:{'Accept':'application/json'}});
    const d=await r.json();
    _brandsCache=(d&&d.brands)||[];
  }catch(e){ _brandsCache=[]; }
  return _brandsCache;
}
function renderBrandsRoute(){
  setPageMeta('Pakistani Snack Brands | ChaskaBox','/brands/',false,'Browse snack brands with public products at ChaskaBox, including Hilal, Mayfair, Candyland and Giggly. Compare listed packs and current prices.');
  showView('brands');
  renderBrandsDirectory();
}
async function renderBrandsDirectory(){
  const grid=document.getElementById('brandGrid');
  const countEl=document.getElementById('brandCount');
  const azEl=document.getElementById('brandAZ');
  if(!grid) return;
  grid.innerHTML='<p class="muted" style="grid-column:1/-1">Loading brands...</p>';
  const brands=(await fetchBrands()).filter(b=>Number(b.productCount)>0);
  // Empty brands stay in the admin catalogue; only customer-facing discovery is filtered.
  if(countEl) countEl.textContent=brands.length+' '+(brands.length===1?'brand':'brands');
  const q=(document.getElementById('brandSearch')?.value||'').toLowerCase();
  const list=brands.filter(b=>!q||b.name.toLowerCase().includes(q));
  // A-Z filter chips
  if(azEl){
    const letters=[...new Set(brands.map(b=>(b.name[0]||'#').toUpperCase()))].sort();
    azEl.innerHTML='<button class="fchip" data-az="">All</button>'+letters.map(l=>`<button class="fchip" data-az="${l}">${l}</button>`).join('');
    azEl.querySelectorAll('[data-az]').forEach(btn=>{btn.onclick=()=>{renderBrandsDirectory(btn.dataset.az);};});
  }
  const az=(arguments[0]||'').toUpperCase();
  const shown=list.filter(b=>!az||(b.name[0]||'').toUpperCase()===az);
  grid.innerHTML=shown.length?shown.map(b=>{
    const logo=b.logo?`<img src="${esc(b.logo)}" alt="${esc(b.name)} logo" loading="lazy" style="max-height:56px;max-width:100%;object-fit:contain">`:`<span style="font-size:34px">🏷️</span>`;
    return `<a class="card" href="/brand/${esc(b.slug)}/" style="text-decoration:none;text-align:center;padding:18px 12px;display:block">
      <div style="height:64px;display:flex;align-items:center;justify-content:center">${logo}</div>
      <div class="pname" style="margin-top:8px">${esc(b.name)}</div>
      <div class="pcat">${b.productCount} ${Number(b.productCount)===1?'product':'products'}</div></a>`;
  }).join(''):'<p class="muted" style="grid-column:1/-1">No brands found.</p>';
}
async function renderBrandRoute(slug){
  if(!slug){ render404('/brand/'); return; }
  const v=document.getElementById('view-brand');
  document.getElementById('brandExtras')?.remove();
  for(const id of ['brandHero','brandIntro','brandFAQ']){const el=document.getElementById(id);if(el)el.replaceChildren();}
  showView('brand');
  const titleEl=document.getElementById('brandTitle');
  if(titleEl) titleEl.textContent='Loading...';
  try{
    const r=await fetch('/api/brands?slug='+encodeURIComponent(slug),{headers:{'Accept':'application/json'}});
    const d=await r.json();
    const brand=d&&d.brand;
    if(!brand){ render404('/brand/'+slug+'/'); return; }
    const seoTitle=brand.seoTitle||`${brand.name} Snacks Online in Pakistan | ChaskaBox`;
    const seoDesc=brand.seoDescription||`Shop ${brand.name} snacks online at ChaskaBox Pakistan. Original sealed packs, COD available, 4-7 day nationwide delivery.`;
    setPageMeta(seoTitle,'/brand/'+brand.slug+'/',false,seoDesc);
    // OG tags per brand
    setMetaTag('property','og:title',seoTitle);
    setMetaTag('property','og:description',seoDesc);
    setMetaTag('property','og:url','https://chaskabox.online/brand/'+brand.slug+'/');
    if(brand.ogImage||brand.logo) setMetaTag('property','og:image',brand.ogImage||brand.logo);
    document.getElementById('brandCrumb').textContent=brand.name;
    titleEl.textContent=`${brand.name} Snacks Online in Pakistan`;
    document.getElementById('brandProdCount').textContent=brand.productCount+' products';
    if(brand.long||brand.short) document.getElementById('brandIntro').textContent=brand.long||brand.short;
    if(brand.hero) document.getElementById('brandHero').innerHTML=`<img src="${esc(brand.hero)}" alt="${esc(brand.name)}" style="width:100%;border-radius:14px;max-height:280px;object-fit:cover" loading="lazy" width="300" height="300" decoding="async">`;
    // Breadcrumb schema
    setBrandBreadcrumbSchema(brand);
    // Products
    const pr=await fetch('/api/brand-products?slug='+encodeURIComponent(slug),{headers:{'Accept':'application/json'}});
    const pd=await pr.json();
    const products=(pd&&pd.products)||[];
    const grid=document.getElementById('brandProductGrid');
    if(grid) grid.innerHTML=products.length?products.map(cardHTML).join(''):'<p class="muted" style="grid-column:1/-1">No products yet for this brand.</p>';
    // Wire sort
    const sortSel=document.getElementById('brandSort');
    if(sortSel) sortSel.onchange=()=>{ logFilter('sort',sortSel.value,'brand'); sortBrandProducts(products,sortSel.value); };
    // Best sellers section
    const bestSellers=products.filter(p=>p.badge==='Bestseller').slice(0,8);
    // Featured products section
    const featuredIds=(brand.featured||[]).map(Number);
    const featured=featuredIds.length?products.filter(p=>featuredIds.includes(p.id)).slice(0,8):[];
    // Deals section
    const deals=products.filter(p=>p.oldPrice>p.price).slice(0,8);
    let extraHTML='';
    if(bestSellers.length) extraHTML+=`<section style="margin-top:28px"><h2 style="font-size:20px;margin-bottom:12px">⭐ Best Sellers</h2><div class="grid">${bestSellers.map(cardHTML).join('')}</div></section>`;
    if(deals.length) extraHTML+=`<section style="margin-top:28px"><h2 style="font-size:20px;margin-bottom:12px">🏷️ Deals</h2><div class="grid">${deals.map(cardHTML).join('')}</div></section>`;
    if(featured.length) extraHTML+=`<section style="margin-top:28px"><h2 style="font-size:20px;margin-bottom:12px">✨ Featured</h2><div class="grid">${featured.map(cardHTML).join('')}</div></section>`;
    // Related brands (other visible brands)
    try{
      const br=await fetch('/api/brands',{headers:{'Accept':'application/json'}});
      const bd=await br.json();
      const others=((bd&&bd.brands)||[]).filter(b=>b.slug!==slug&&Number(b.productCount)>0).slice(0,6);
      if(others.length) extraHTML+=`<section style="margin-top:28px"><h2 style="font-size:20px;margin-bottom:12px">🔗 Related Brands</h2><div style="display:flex;gap:12px;flex-wrap:wrap">${others.map(b=>`<a href="/brand/${esc(b.slug)}/" style="padding:10px 16px;border:1px solid var(--line);border-radius:10px;text-decoration:none;color:inherit">${b.logo?`<img src="${esc(b.logo)}" alt="${esc(b.name)}" style="height:24px;vertical-align:middle;margin-right:8px">`:''}<b>${esc(b.name)}</b></a>`).join('')}</div></section>`;
    }catch(e){}
    // FAQ section
    const faqEl=document.getElementById('brandFAQ');
    if(faqEl){
      const faqs=[
        {q:`Where can I buy ${brand.name} snacks online in Pakistan?`,a:`You can order listed ${brand.name} snacks at ChaskaBox Pakistan. Estimated nationwide delivery: ${fallbackDeliveryEstimate()}. ${codAdvanceCopy()}`},
        {q:`Are ${brand.name} products original?`,a:`Yes, all ${brand.name} products at ChaskaBox are original sealed packs sourced from the market on order.`},
        {q:`What is the delivery time for ${brand.name} products?`,a:`Estimated delivery: ${fallbackDeliveryEstimate()}. ${deliveryFeeCopy()}. Checkout confirms the final total for your city.`}
      ];
      faqEl.innerHTML=`<section style="margin-top:28px"><h2 style="font-size:20px;margin-bottom:12px">❓ Frequently Asked Questions</h2>${faqs.map(f=>`<details style="margin-bottom:8px;border:1px solid var(--line);border-radius:10px;padding:12px"><summary style="cursor:pointer;font-weight:600">${esc(f.q)}</summary><p style="margin:8px 0 0;color:var(--muted)">${esc(f.a)}</p></details>`).join('')}</section>`;
    }
    if(extraHTML){
      const grid2=document.getElementById('brandProductGrid');
      let extras=document.getElementById('brandExtras');
      if(!extras&&grid2){extras=document.createElement('div');extras.id='brandExtras';grid2.after(extras);}
      if(extras)extras.innerHTML=extraHTML;
    }
  }catch(e){
    if(titleEl) titleEl.textContent='Brand unavailable';
  }
}
function sortBrandProducts(products,mode){
  const arr=[...products];
  if(mode==='lo') arr.sort((a,b)=>a.price-b.price);
  else if(mode==='hi') arr.sort((a,b)=>b.price-a.price);
  else if(mode==='az') arr.sort((a,b)=>a.name.localeCompare(b.name));
  else if(mode==='new') arr.sort((a,b)=>b.id-a.id);
  else if(mode==='pop') arr.sort((a,b)=>(b.badge==='Bestseller')-(a.badge==='Bestseller'));
  const grid=document.getElementById('brandProductGrid');
  if(grid) grid.innerHTML=arr.map(cardHTML).join('');
}
function setMetaTag(attr,key,val){
  let m=document.querySelector(`meta[${attr}="${key}"]`);
  if(!m){ m=document.createElement('meta'); m.setAttribute(attr,key); document.head.appendChild(m); }
  m.content=val;
}
// Filter/discovery analytics tracking (fire-and-forget)
function logFilter(filter_type, filter_value, page){
  try{
    let sid=null; try{ sid=localStorage.getItem('cb_sid')||(localStorage.setItem('cb_sid','s'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)),localStorage.getItem('cb_sid')); }catch(e){}
    fetch('/api/filter-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filter_type,filter_value:filter_value||null,page:page||location.pathname,session_id:sid})}).catch(()=>{});
  }catch(e){}
}
function setBrandBreadcrumbSchema(brand){
  let s=document.getElementById('brandBreadcrumbSchema');
  if(!s){ s=document.createElement('script'); s.id='brandBreadcrumbSchema'; s.type='application/ld+json'; document.head.appendChild(s); }
  s.textContent=JSON.stringify({"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
    {"@type":"ListItem","position":1,"name":"Home","item":"https://chaskabox.online/"},
    {"@type":"ListItem","position":2,"name":"Brands","item":"https://chaskabox.online/brands/"},
    {"@type":"ListItem","position":3,"name":brand.name,"item":"https://chaskabox.online/brand/"+brand.slug+"/"}
  ]});
}
function renderCategoryRoute(slug){
  const standardName=CATEGORY_SLUGS[slug];const cms=(STORE_CONFIG?.categories||[]).find(c=>c.slug===slug||c.name===standardName);const catName=cms?.name||standardName;
  if(!catName){ render404('/category/'+slug+'/'); return; }
  const seo={...(SEO_CATEGORY_DATA[CATEGORY_NAMES_TO_SLUG[catName]||slug]||{}),...(cms?.seo_title?{title:cms.seo_title}:{}),...(cms?.seo_description?{description:cms.seo_description}:{}),...(cms?.description?{intro:cms.description}:{})};
  setPageMeta(seo?.title||catName+' | ChaskaBox',categoryPath(catName),false,seo?.description||'Shop '+catName+' from ChaskaBox.');
  setCategorySeoCopy(seo);
  setCategoryBreadcrumb(catName,'/category/'+slug+'/');
  shopState=shopRouteFilters(catName);
  showView('shop');
  renderShopContent();
}
function renderCartRoute(){
  setPageMeta('Your Snack Bag | ChaskaBox','/cart/',true);
  showView('cart');
  renderCartPage();
}
function renderCartPage(){
  const el=document.getElementById('view-cart'); if(!el)return;
  const items=Object.entries(CART);
  if(!items.length){
    el.innerHTML='<div class="section cart-page"><div class="crumbs"><a href="/">Home</a> <span>›</span> Bag</div><div class="cart-empty"><span>🛒</span><h1>Your snack bag is empty</h1><p>Apna favourite chaska choose karein — singles, deals ya Chaska Boxes.</p><a class="cta" href="/shop/">Shop All Snacks</a></div></div>';
    return;
  }
  let subtotal=0;
  const rows=items.map(([id,qty])=>{
    const p=PRODUCTS.find(x=>x.id==id); if(!p)return '';
    subtotal+=p.price*qty;
    return `<div class="cart-page-item"><a href="${productHref(p.id)}"><img src="${esc(assetUrl(p.img||''))}" alt="${esc(p.name)}"></a><div class="cart-page-copy"><a href="${productHref(p.id)}"><b>${esc(p.name)}</b></a><small>${esc(p.pack||'')}</small><span>${fmt(p.price)}</span></div><div class="qty"><button onclick="setCartPageQty(${p.id},${qty-1})" aria-label="Decrease">−</button><b>${qty}</b><button onclick="setCartPageQty(${p.id},${qty+1})" aria-label="Increase" ${qty>=MAX_CART_QTY?'disabled':''}>+</button></div><b>${fmt(p.price*qty)}</b><button class="cart-remove" onclick="setCartPageQty(${p.id},0)" aria-label="Remove ${esc(p.name)}">Remove</button></div>`;
  }).join('');
  const threshold=prepaidThreshold();
  const remaining=Math.max(0,threshold-subtotal), pct=threshold<=0?100:Math.min(100,Math.round(subtotal/threshold*100));
  const progress=threshold===null?'':remaining?`<p><b>${fmt(remaining)}</b> more to unlock FREE delivery with prepaid payment.</p>`:'<p><b>🎉 Free delivery unlocked</b> for prepaid payment.</p>';
  const cartIds=new Set(items.map(([id])=>String(id)));
  const cartCats=[...new Set(items.map(([id])=>{const pr=PRODUCTS.find(x=>x.id==id);return pr&&pr.category;}).filter(Boolean))];
  const crossSell=activeProducts().filter(p=>!cartIds.has(String(p.id))&&cartCats.indexOf(p.category)>=0).slice(0,4);
  const crossHTML=crossSell.length?`<section class="cart-cross"><h2>Complete your chaska</h2><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">${crossSell.map(cardHTML).join('')}</div></section>`:'';
  el.innerHTML=`<div class="section cart-page"><div class="crumbs"><a href="/">Home</a> <span>›</span> Bag</div><div class="section-head"><div><span class="eyebrow">YOUR CHASKA</span><h1>Your Snack Bag</h1></div><a href="/shop/">Continue shopping →</a></div><div class="cart-page-layout"><div class="cart-page-items">${rows}</div><aside class="cart-summary"><h3>Order summary</h3><div class="drow"><span>Subtotal</span><b>${fmt(subtotal)}</b></div><div class="shipping-progress"${threshold===null?' hidden':''}><div class="progress-track"><span class="${pct>=100?'is-full':''}" data-progress="${pct}"></span></div>${progress}</div><p class="cart-note">${esc(deliveryFeeCopy())}</p>${codAdvanceNote(subtotal+settingNum('cod_delivery_fee_pkr',300))}<a class="checkoutbtn cart-checkout" href="/checkout.html">Proceed to Checkout →</a></aside></div>${crossHTML}</div>`;
  animateProgressIn(el,'cart',pct);
}
function setCartPageQty(id,qty){
  qty=Number(qty);
  if(!Number.isInteger(qty)||qty>MAX_CART_QTY){toast('You can add up to '+MAX_CART_QTY+' packs of each snack.');return;}
  if(qty<=0)delete CART[id]; else CART[id]=qty;
  saveCart();
}
function renderAccountRoute(){
  setPageMeta('My Account | ChaskaBox','/account/',true);
  showView('account');
  if(typeof renderAccountView==='function')renderAccountView();
}
function render404(path){
  setPageMeta('Page Not Found | ChaskaBox',path||'/',true);
  showView('404');
  const el=document.getElementById('view-404');
  if(el)el.innerHTML='<div class="section notfound"><div class="nf-emoji">🍬</div><h1>Yahan chaska nahi mila.</h1><p>Page move ho gaya ho sakta hai — shop ya home se dobara start karein.</p><div class="nf-actions"><a class="cta" href="/">Home</a><a class="cta secondary" href="/shop/">Shop Snacks</a></div></div>';
}

/* ---------- History API router with clean URLs ---------- */
/* Canonical URL style: trailing slash (matches /product/<id>/) */

const CATEGORY_SLUGS = {
  'biscuits-and-wafers': 'Biscuits & Wafers',
  'bunties-and-cakes': 'Bunties & Cakes',
  'chocolates-and-candies': 'Chocolates & Candies',
  'snacks-and-nimco': 'Snacks & Nimco',
  'jellies-and-marshmallow': 'Jellies & Marshmallow',
  'imli-and-ice-lollies': 'Imli & Ice Lollies',
  'chews-and-gums': 'Chews & Gums',
  'betel-nuts-and-pan-masala': 'Betel Nuts & Pan Masala',
};
const CATEGORY_NAMES_TO_SLUG=Object.fromEntries(Object.entries(CATEGORY_SLUGS).map(([slug,name])=>[name,slug]));
CATEGORY_NAMES_TO_SLUG['Bundles']='bundles';
function categoryPath(cat){if(!cat)return '/shop/';if(cat==='Bundles')return '/bundles/';const standard=CATEGORY_NAMES_TO_SLUG[cat];if(standard)return '/category/'+standard+'/';const managed=(STORE_CONFIG?.categories||[]).find(c=>c.name===cat);return managed?'/category/'+encodeURIComponent(managed.slug)+'/':'/shop/';}

function normalizePath(p){
  if(!p) return '/';
  p = p.split('?')[0].split('#')[0]; // strip query and hash
  if(!p.startsWith('/')) p = '/' + p;
  p = p.replace(/\/+/g, '/'); // collapse duplicate slashes
  p = p.toLowerCase();
  if(p.length > 1 && !p.endsWith('/')) p += '/';
  return p;
}

function navigate(path){
  const url=new URL(path,location.origin);
  path = normalizePath(url.pathname)+url.search+url.hash;
  if(location.pathname+location.search+location.hash === path){
    route(); // same path, re-render
    return;
  }
  history.pushState(null, '', path);
  route();
}

function goHome(){ navigate('/'); }
function goShop(cat){
  closeMnav();
  shopState={q:'',cat:'',sort:'feat',brands:[],maxPrice:0,pack:'',badge:''};
  if(!cat){ navigate('/shop/'); return; }
  if(cat==='Bundles'||cat==='bundles'){ navigate('/bundles/'); return; }
  const slug=CATEGORY_SLUGS[cat]?cat:CATEGORY_NAMES_TO_SLUG[cat];
  if(slug&&CATEGORY_SLUGS[slug]) navigate('/category/'+slug+'/'); else navigate('/shop/');
}
function goBadge(badge){ closeMnav(); shopState={q:'',cat:'',sort:'feat',brands:[],maxPrice:0,pack:'',badge:badge||''}; navigate('/shop/'+(badge?'?badge='+encodeURIComponent(badge):'')); }
function goShopBadge(cat,badge){
  closeMnav(); shopState={q:'',cat:cat||'',sort:'feat',brands:[],maxPrice:0,pack:'',badge:badge||''};
  navigate((cat==='Bundles'?'/bundles/':categoryPath(cat))+(badge?'?badge='+encodeURIComponent(badge):''));
}
function goFlavor(q){ closeMnav(); navigate('/shop/'+(q?'?q='+encodeURIComponent(q):'')); }
function goBrand(b){closeMnav();navigate('/shop/'+(b?'?brand='+encodeURIComponent(b):''));}
function goBundles(){ closeMnav(); shopState={q:'',cat:'Bundles',sort:'feat',brands:[],maxPrice:0,pack:'',badge:''}; navigate('/bundles/'); }
function goCart(){ navigate('/cart/'); }
function goAccount(){ navigate('/account/'); }
function focusShopSearch(){
  if(normalizePath(location.pathname)!=='/shop/') navigate('/shop/');
  setTimeout(()=>{const s=document.getElementById('fq'); if(s){s.focus();s.scrollIntoView({behavior:reducedMotion()?'auto':'smooth',block:'center'});}},80);
}

let homeSuggestIndex=-1;
// Fuzzy match: returns true if query matches text with up to 1 typo per 4 chars
function fuzzyMatch(query, text){
  const q=query.toLowerCase(), t=text.toLowerCase();
  if(t.includes(q)) return true;
  if(q.length<3) return false;
  // Simple edit-distance-1 check: try removing one char from query
  for(let i=0;i<q.length;i++){
    const shortened=q.slice(0,i)+q.slice(i+1);
    if(t.includes(shortened)) return true;
  }
  return false;
}
function getMatchingBrands(q){
  const brands=[...new Set(activeProducts().map(p=>getBrand(p)))];
  return brands.filter(b=>fuzzyMatch(q,b)).slice(0,3);
}
function getMatchingCategories(q){
  const cats=[...new Set(activeProducts().map(p=>p.category).filter(Boolean))];
  return cats.filter(c=>fuzzyMatch(q,c)).slice(0,3);
}
function renderHomeSearchSuggestions(value){
  const box=document.getElementById('homeSearchSuggestions'); if(!box)return;
  const raw=String(value||'').trim(), q=raw.toLowerCase(); homeSuggestIndex=-1;
  if(q.length<2){box.hidden=true;box.innerHTML='';return;}
  const allMatches=activeProducts().filter(p=>{
    const hay=[p.name,p.category,p.brand,getBrand(p)].filter(Boolean).join(' ').toLowerCase();
    return fuzzyMatch(q, hay);
  });
  const matches=allMatches.slice(0,6);
  const brands=getMatchingBrands(q);
  const cats=getMatchingCategories(q);
  box.hidden=false;
  box.setAttribute('role','listbox');
  let html='';
  if(brands.length) html+=brands.map(b=>`<a role="option" class="suggest-brand" href="/shop/?brand=${encodeURIComponent(b)}"><span>🏷️ <b>${esc(b)}</b> <small>Brand</small></span><span>→</span></a>`).join('');
  if(cats.length) html+=cats.map(c=>`<a role="option" class="suggest-cat" href="/shop/?cat=${encodeURIComponent(c)}"><span>📁 <b>${esc(c)}</b> <small>Category</small></span><span>→</span></a>`).join('');
  html+=matches.length?matches.map((p,i)=>`<a role="option" data-hidx="${i}" href="${productHref(p.id)}"><img src="${esc(assetUrl(p.img||''))}" alt=""><span><b>${esc(p.name)}</b><small>${esc(p.pack||p.category||'')}</small></span><strong>${fmt(p.price)}</strong></a>`).join('')+`<button class="search-all" type="button" onclick="searchAllFromHome()">See all ${allMatches.length} result${allMatches.length===1?'':'s'} →</button>`:'<div class="search-empty">No exact match — press Search to browse all results.</div>';
  box.innerHTML=html;
}
function setHomeSuggestion(index){
  const box=document.getElementById('homeSearchSuggestions');if(!box||box.hidden)return;
  const items=[...box.querySelectorAll('[data-hidx]')];if(!items.length)return;
  homeSuggestIndex=(index+items.length)%items.length;
  items.forEach((el,i)=>{el.classList.toggle('active',i===homeSuggestIndex);el.setAttribute('aria-selected',i===homeSuggestIndex?'true':'false');});
  items[homeSuggestIndex].scrollIntoView({block:'nearest'});
}
function searchAllFromHome(){ submitHomeSearch(); }
function submitHomeSearch(){
  const input=document.getElementById('homeSearch');
  const q=(input?.value||'').trim();
  if(typeof window.chaskaTrack==='function' && q) window.chaskaTrack('search',{query:q,source:'home'});
  shopState={q,cat:'',sort:'feat',brands:[],maxPrice:0,pack:'',badge:''};
  navigate('/shop/'+(q?'?q='+encodeURIComponent(q):''));
  setTimeout(()=>document.getElementById('fq')?.focus(),80);
}
function submitHeaderSearch(event){
  event?.preventDefault();
  const input=document.getElementById('headerSearch'); const q=(input?.value||'').trim();
  const box=document.getElementById('headerSearchSuggestions'); if(box){box.hidden=true;}
  shopState={q,cat:'',sort:'feat',brands:[],maxPrice:0,pack:'',badge:''};
  navigate('/shop/'+(q?'?q='+encodeURIComponent(q):''));
  setTimeout(()=>{const el=document.getElementById('fq');if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length);}},80);
}
let headerSuggestIndex=-1;
function renderHeaderSearchSuggestions(value){
  const box=document.getElementById('headerSearchSuggestions'); if(!box)return;
  const raw=String(value||'').trim(), q=raw.toLowerCase(); headerSuggestIndex=-1;
  if(q.length<2){box.hidden=true;box.innerHTML='';return;}
  const allMatches=activeProducts().filter(p=>{
    const hay=[p.name,p.category,p.brand,getBrand(p)].filter(Boolean).join(' ').toLowerCase();
    return fuzzyMatch(q, hay);
  });
  const matches=allMatches.slice(0,6);
  const brands=getMatchingBrands(q);
  const cats=getMatchingCategories(q);
  box.hidden=false;
  let html='';
  if(brands.length) html+=brands.map(b=>`<a role="option" class="suggest-brand" href="/shop/?brand=${encodeURIComponent(b)}"><span>🏷️ <b>${esc(b)}</b> <small>Brand</small></span><span>→</span></a>`).join('');
  if(cats.length) html+=cats.map(c=>`<a role="option" class="suggest-cat" href="/shop/?cat=${encodeURIComponent(c)}"><span>📁 <b>${esc(c)}</b> <small>Category</small></span><span>→</span></a>`).join('');
  html+=matches.length?matches.map((p,i)=>`<a role="option" data-hidx="${i}" href="${productHref(p.id)}"><img src="${esc(assetUrl(p.img||''))}" alt=""><span><b>${esc(p.name)}</b><small>${esc(p.pack||p.category||'')}</small></span><strong>${fmt(p.price)}</strong></a>`).join(''):'<div class="search-empty">No matches — press Enter to search.</div>';
  box.innerHTML=html;
}
function headerSearchKey(event){
  const box=document.getElementById('headerSearchSuggestions');
  if(event.key==='ArrowDown'&&box&&!box.hidden){
    event.preventDefault();
    const items=[...box.querySelectorAll('[data-hidx]')];if(!items.length)return;
    headerSuggestIndex=(headerSuggestIndex+1)%items.length;
    items.forEach((el,i)=>el.classList.toggle('active',i===headerSuggestIndex));
    items[headerSuggestIndex].scrollIntoView({block:'nearest'});
  }
  else if(event.key==='ArrowUp'&&box&&!box.hidden){
    event.preventDefault();
    const items=[...box.querySelectorAll('[data-hidx]')];if(!items.length)return;
    headerSuggestIndex=(headerSuggestIndex-1+items.length)%items.length;
    items.forEach((el,i)=>el.classList.toggle('active',i===headerSuggestIndex));
    items[headerSuggestIndex].scrollIntoView({block:'nearest'});
  }
  else if(event.key==='Enter'&&box&&!box.hidden&&headerSuggestIndex>=0){
    const a=box.querySelector(`[data-hidx="${headerSuggestIndex}"]`);
    if(a){event.preventDefault();location.href=a.href;return;}
  }
  else if(event.key==='Escape'){if(box){box.hidden=true;}headerSuggestIndex=-1;}
}
// Hide header suggestions when clicking outside
document.addEventListener('click',event=>{
  const box=document.getElementById('headerSearchSuggestions');
  if(box&&!box.hidden&&!event.target.closest('.header-search')){box.hidden=true;headerSuggestIndex=-1;}
});
function homeSearchKey(event){
  const box=document.getElementById('homeSearchSuggestions');
  if(event.key==='ArrowDown'&&!box?.hidden){event.preventDefault();setHomeSuggestion(homeSuggestIndex+1);}
  else if(event.key==='ArrowUp'&&!box?.hidden){event.preventDefault();setHomeSuggestion(homeSuggestIndex-1);}
  else if(event.key==='Enter'){
    event.preventDefault();
    if(homeSuggestIndex>=0&&!box?.hidden){const a=box.querySelector(`[data-hidx="${homeSuggestIndex}"]`);if(a){location.href=a.href;return;}}
    submitHomeSearch();
  } else if(event.key==='Escape'){if(box)box.hidden=true;homeSuggestIndex=-1;}
}

/* Legacy hash URL migration: #/shop -> /shop/ (replaceState, no new history entry) */
function migrateHashURL(){
  const h = location.hash;
  if(h && h.startsWith('#/')){
    const hashPath = h.slice(1); // remove #
    let newPath = '/';
    if(hashPath.startsWith('/shop')){
      const parts=hashPath.split('/').filter(Boolean);
      if(parts.length>1){ try{ newPath=categoryPath(decodeURIComponent(parts.slice(1).join('/'))); }catch(e){ newPath='/shop/'; } } else newPath='/shop/';
    } else if(hashPath.startsWith('/product/')){
      // Let product hash URLs redirect to clean product URLs if possible
      const m = hashPath.match(/\/product\/(\d+)/);
      if(m) newPath = productHref(m[1]);
    }
    history.replaceState(null, '', normalizePath(newPath)+location.search);
    // replaceState already clears the legacy hash without adding history
  }
}

/* Main router */
function route(){
  let path = normalizePath(location.pathname);
  // Normalize URL in address bar if needed (replaceState, no history entry)
  if(path !== location.pathname){
    history.replaceState(null, '', path+location.search+location.hash);
  }

  // Scroll to top for new navigations (popstate handles back/forward restore)
  const scrollTop = !route._isPopstate;

  if(path === '/'){
    renderHomeRoute();
  } else if(path === '/shop/'){
    shopState.cat = '';
    renderShopRoute();
  } else if(path === '/bundles/'){
    renderBundlesRoute();
  } else if(path === '/brands/'){
    renderBrandsRoute();
  } else if(path.startsWith('/brand/')){
    const slug = path.replace('/brand/', '').replace(/\/$/, '') || new URLSearchParams(location.search).get('slug') || '';
    renderBrandRoute(slug);
  } else if(path === '/cart/' || path === '/bag/'){
    renderCartRoute();
  } else if(path === '/account/'){
    renderAccountRoute();
  } else if(path === '/wishlist/'){
    renderWishlistRoute();
  } else if(path.startsWith('/category/')){
    const slug = path.replace('/category/', '').replace(/\/$/, '');
    renderCategoryRoute(slug);
  } else if(path.startsWith('/product/')){
    const id=Number(path.split('/')[2]);
    if(Number.isInteger(id)&&id>0)renderProductDetail(id);else render404(path);
  } else {
    render404(path);
  }

  window.ChaskaPageCopy?.navigate(location.pathname);
  if(scrollTop) window.scrollTo(0, 0);
  route._isPopstate = false;
}

/* Back/forward navigation */
if('scrollRestoration' in history) history.scrollRestoration='auto';
window.addEventListener('popstate', function(){
  route._isPopstate = true;
  route();
});

/* Link interception - only same-origin, preserve Ctrl/Cmd/middle-click */
document.addEventListener('click', function(e){
  const a = e.target.closest('a');
  if(!a) return;
  const href = a.getAttribute('href');
  if(!href || href.startsWith('#')) return; // skip hash-only links
  // Skip special protocols
  if(/^(mailto:|tel:|javascript:)/i.test(href)) return;
  // Content and occasion routes have their own Pages HTML, outside this SPA.
  if(/^\/(?:guides|snack-boxes)(?:\/|$)/.test(href))return;
  // Skip download links
  if(a.hasAttribute('download')) return;
  // Skip external links
  let url;
  try{ url = new URL(href, location.origin); }catch(err){ return; }
  if(url.origin !== location.origin) return;
  if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0||a.target==='_blank')return;
  if(url.hash && url.pathname === '/') {
    e.preventDefault();
    if(normalizePath(location.pathname)!=='/') navigate('/');
    setTimeout(()=>{ const t=document.getElementById(url.hash.slice(1)); if(t)t.scrollIntoView({behavior:reducedMotion()?'auto':'smooth',block:'start'}); },80);
    return;
  }
  // Skip product pages (separate static files - let browser handle for full load)
  // Actually, product pages are static HTML, SPA navigation won't work for them
  // Let them do full page loads
  if(url.pathname.startsWith('/product/')) return;
  // Skip checkout and admin (separate HTML files)
  if(/\.html$/i.test(url.pathname)||/^\/admin(?:\/|$)/i.test(url.pathname))return;
  // Skip static policy/support pages (separate HTML files - let browser handle for full load)
  if(/^\/(about|contact|privacy-policy|refund-policy|shipping-policy|terms)\/?$/.test(url.pathname)) return;
  // Preserve Ctrl/Cmd-click, Shift-click, middle-click (open in new tab)
  if(e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
  // Skip target=_blank
  if(a.target === '_blank') return;

  e.preventDefault();
  navigate(url.pathname+url.search+url.hash);
});

/* ---------- cart ---------- */
function loadCart(){try{CART=JSON.parse(localStorage.getItem('chaskabox-cart')||'{}');}catch(e){CART={};}}
function saveCart(){
  localStorage.setItem('chaskabox-cart',JSON.stringify(CART));
  // Abandoned cart: track last activity (cleared on successful order)
  if(Object.keys(CART).length) localStorage.setItem('chaskabox-cart-ts', String(Date.now()));
  else localStorage.removeItem('chaskabox-cart-ts');
  updateBadge(); renderDrawer();
  if(normalizePath(location.pathname)==='/cart/') renderCartPage();
}
/* Abandoned cart reminder: if cart has items untouched for 2+ hours, nudge on return */
function checkAbandonedCart(){
  try{
    const ts = Number(localStorage.getItem('chaskabox-cart-ts') || 0);
    if(!ts || !Object.keys(CART).length) return;
    const hours = (Date.now() - ts) / 3600000;
    if(hours < 2 || sessionStorage.getItem('abandoned-nudged')) return;
    sessionStorage.setItem('abandoned-nudged', '1');
    const n = Object.values(CART).reduce((s,q) => s + (Number(q)||0), 0);
    const bar = document.createElement('div');
    bar.className = 'abandoned-nudge';
    bar.innerHTML = `<span>🛍️ You left <b>${n} item${n===1?'':'s'}</b> in your bag!</span><a href="/cart/">Complete order →</a><button aria-label="Dismiss">✕</button>`;
    bar.querySelector('button').onclick = () => bar.remove();
    document.body.prepend(bar);
    setTimeout(() => bar.classList.add('show'), 100);
  }catch(e){}
}
function clearAbandonedCart(){ localStorage.removeItem('chaskabox-cart-ts'); }
let toastTimer=null;
function showCartToast(p,qty){
  let t=document.getElementById('cartToast');
  if(!t){ t=document.createElement('div'); t.id='cartToast'; t.className='cart-toast'; t.setAttribute('role','status'); t.setAttribute('aria-live','polite'); document.body.appendChild(t); }
  t.innerHTML=`<span>✓ ${qty>1?qty+' × ':''}${esc(p?.name||'Snack')} added</span><button onclick="openDrawer()">View Bag</button>`;
  t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),2600);
}
function addToCart(id,qty=1,el){
  const p=PRODUCTS.find(x=>x.id===id);if(!p)return;if(p.stockState==='unavailable'){toast('This snack is unavailable right now.');return;}
  qty=Number(qty);
  const current=Number(CART[id]||0);
  if(!Number.isInteger(qty)||qty<1||qty+current>MAX_CART_QTY){toast('You can add up to '+MAX_CART_QTY+' packs of each snack.');return;}
  if(!current&&Object.keys(CART).length>=MAX_CART_ITEMS){toast('Your bag can contain up to '+MAX_CART_ITEMS+' different snacks.');return;}
  if(el) flyToCart(el,id);
  CART[id]=current+qty; saveCart(); popBadge();
  if(typeof window.chaskaTrack==='function') window.chaskaTrack('add_to_cart',{id:p.id,name:p.name,price:p.price,qty});
  // Wishlist → cart conversion tracking
  try{
    if(typeof isWished==='function'&&isWished(id)){
      let sid=null; try{ sid=localStorage.getItem('cb_sid'); }catch(e){}
      fetch('/api/wishlist-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:id,action:'to_cart',session_id:sid})}).catch(()=>{});
    }
    // Box add-to-cart tracking
    if(p.bundle){
      let sid=null; try{ sid=localStorage.getItem('cb_sid'); }catch(e){}
      fetch('/api/box-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({box_id:id,box_name:p.name,action:'add_to_cart',session_id:sid})}).catch(()=>{});
    }
  }catch(e){}
  if(el && el.closest && el.closest('.card')){
    const old=el.innerHTML; el.innerHTML='Added ✓'; el.disabled=true;
    setTimeout(()=>{ if(document.body.contains(el)){el.innerHTML=old;el.disabled=false;} },850);
    showCartToast(p,qty);
  }else openDrawer();
}
function popBadge(){ $$('.cartcount').forEach(e=>{ e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }); }
/* fly-to-cart: product image flies to the bag icon */
function flyToCart(el,id){
  try{
    if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const p=PRODUCTS.find(x=>x.id===id);
    const target=document.querySelector('.hbtn.solid');
    const imgEl=el.closest('.card')?.querySelector('.pimg img')||el.closest('.mbox')?.querySelector('.pimg img')||el.closest('.pdetail')?.querySelector('.pd-img img');
    if(!p||!p.img||!target||!imgEl) return;
    const r1=imgEl.getBoundingClientRect(), r2=target.getBoundingClientRect();
    if(!r1.width||!r2.width) return;
    const g=document.createElement('img');
    g.src=assetUrl(p.img); g.alt=''; g.className='fly-ghost';
    g.style.left=(r1.left+r1.width/2-27)+'px';
    g.style.top=(r1.top+r1.height/2-27)+'px';
    document.body.appendChild(g);
    const dx=(r2.left+r2.width/2)-(r1.left+r1.width/2);
    const dy=(r2.top+r2.height/2)-(r1.top+r1.height/2);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      g.style.transform=`translate(${dx}px,${dy}px) scale(.12)`;
      g.style.opacity='.25';
    }));
    setTimeout(()=>g.remove(),700);
  }catch(e){}
}
function cartCount(){return Object.values(CART).reduce((a,b)=>a+b,0);}
function cartSubtotal(){return Object.entries(CART).reduce((s,[id,q])=>{const p=PRODUCTS.find(x=>x.id==id);return s+(p?p.price*q:0);},0);}
function updateBadge(){const n=cartCount();$$('.cartcount').forEach(e=>{e.textContent=n;e.style.display=n?'flex':'none';});}
let drawerReturnFocus=null;
function openDrawer(){drawerReturnFocus=document.activeElement;renderDrawer();$('#overlay').classList.add('open');$('#drawer').classList.add('open');$('#drawer').setAttribute('aria-hidden','false');$('#drawer').removeAttribute('inert');document.body.style.overflow='hidden';setTimeout(()=>$('#drawer .mclose')?.focus(),0);
  if(typeof window.chaskaTrack==='function') window.chaskaTrack('cart_viewed',{});}
function closeDrawer(){$('#overlay').classList.remove('open');$('#drawer').classList.remove('open');$('#drawer').setAttribute('aria-hidden','true');$('#drawer').setAttribute('inert','');document.body.style.overflow='';if(drawerReturnFocus&&typeof drawerReturnFocus.focus==='function'){const f=drawerReturnFocus;drawerReturnFocus=null;setTimeout(()=>f.focus(),0);}}
function renderDrawer(){
  const box=$('#ditems');
  const ids=Object.keys(CART);
  if(!ids.length){box.innerHTML='<div class="empty">Your bag is empty.<br>Go grab some chaska! 🍪</div>';}
  else box.innerHTML=ids.map(id=>{
    const p=PRODUCTS.find(x=>x.id==id); if(!p)return '';
    const img=p.img?`<img src="${esc(assetUrl(p.img))}" alt="${esc(p.name)}">`:'<div style="font-size:36px">🍪</div>';
    return `<div class="ditem">${img}<div class="di"><div class="din">${esc(p.name)}</div>
    <div class="dip">${fmt(p.price)} each</div></div>
    <div class="qty"><button onclick="chQty(${id},-1)" aria-label="Decrease ${esc(p.name)}">−</button><b>${CART[id]}</b><button onclick="chQty(${id},1)" aria-label="Increase ${esc(p.name)}" ${CART[id]>=MAX_CART_QTY?'disabled':''}>+</button></div></div>`;
  }).join('');
  const sub=cartSubtotal();
  const threshold=prepaidThreshold();
  const rem=Math.max(0,threshold-sub), pct=threshold<=0?100:Math.min(100,Math.round(sub/threshold*100));
  $('#dfoot').innerHTML=`<div class="drow total"><span>Subtotal</span><span>${fmt(sub)}</span></div><div class="drawer-progress"${threshold===null?' hidden':''}><div class="progress-track"><span class="${pct>=100?'is-full':''}" data-progress="${pct}"></span></div><small>${rem?fmt(rem)+' more for FREE prepaid delivery':'🎉 FREE prepaid delivery unlocked'}</small></div><p class="cart-note">${esc(deliveryFeeCopy())}</p>${ids.length?codAdvanceNote(sub+settingNum('cod_delivery_fee_pkr',300)):''}<div class="drawer-actions"><a class="drawer-viewcart" href="/cart/" onclick="closeDrawer()">View Bag</a><a class="checkoutbtn" href="/checkout.html">Checkout →</a></div>`;
  animateProgressIn($('#dfoot'),'drawer',pct);
}
function chQty(id,d){setCartPageQty(id,Number(CART[id]||0)+d);}

function animateProgressIn(scope,key,pct){
  const bar=scope?.querySelector('.progress-track span[data-progress]');
  if(!bar) return;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const prev=Math.max(0,Math.min(100,Number(PROGRESS_STATE[key])||0));
  const next=Math.max(0,Math.min(100,Number(pct)||0));
  bar.style.width=(reduce?next:prev)+'%';
  if(!reduce) requestAnimationFrame(()=>requestAnimationFrame(()=>{bar.style.width=next+'%';}));
  PROGRESS_STATE[key]=next;
}

/* ---------- Chaska Help (FAQ + product finder) ---------- */
function fallbackDeliveryEstimate(){return String(STORE_CONFIG?.settings?.delivery_estimate||'4-7 days').replace(/^"|"$/g,'');}
function fallbackDeliveryCopy(){return deliveryFeeCopy()+'. '+codAdvanceCopy();}
function fallbackJazzCopy(){return `Checkout par JazzCash select karein, screen par dikhaye gaye official payment details par exact total bhejein, phir transaction/reference number enter karein. ${deliveryFeeCopy()}.`;}
const AI_QA=[
 {q:'Delivery kitne din mein hogi?',k:['deliver','din','kitne','time','pohnch','kab'],a:()=>`Pakistan-wide estimated delivery ${fallbackDeliveryEstimate()} hai. 🚚 Order ke waqt available estimate bhi dikhaya jata hai.`},
 {q:'Delivery charges kya hain?',k:['charge','fee','delivery charges','kitna'],a:()=>fallbackDeliveryCopy()},
 {q:'Payment kaise karun?',k:['payment','pay','pese','paise','jazzcash','easypaisa','cod'],a:'Available options checkout par live settings ke mutabiq dikhte hain: Cash on Delivery aur enabled prepaid methods. Prepaid payment checkout total ke mutabiq karein aur transaction/reference number submit karein.'},
 {q:'JazzCash par paise kaise bhejun?',k:['jazzcash','till','qr','advance','bhejun','send'],a:()=>fallbackJazzCopy()},
 {q:'Order kaise track karun?',k:['track','status','order number','kahan'],a:'Order ke baad aapko order number milta hai (jaise CB-041026-00001). WhatsApp 0332-0005381 par order number bhej kar status pooch sakte hain.'},
 {q:'Order number kya hai?',k:['order number','number'],a:'Har order par ek unique number milta hai, jaise CB-041026-00001. Ye confirmation screen par aur email mein hota hai — isi se aapka order track hota hai.'},
 {q:'Kya products original hain?',k:['original','asli','fake','naqli','brand'],a:'Hum original sealed branded packs source karne ki koshish karte hain — Hilal, Kolson, Mayfair, Candyland waghera. Kisi specific pack ya authenticity concern par WhatsApp se verify kar sakte hain. ✅'},
 {q:'Return ya exchange policy?',k:['return','exchange','wapsi','damage','kharab','ghalat'],a:'Ghalat ya damage item mile to 48 ghante ke andar WhatsApp 0332-0005381 par rabta karein — tasveer bhej dein, hum foran hal nikalenge.'},
 {q:'Bulk ya bara order kar sakta hun?',k:['bulk','bara','wholesale','zyada','dokan','shop'],a:'Bulk order ke liye WhatsApp 0332-0005381 par quantity aur products bhej dein — ChaskaBox availability aur possible pricing confirm karega. 📦'},
 {q:'Kya recommend karoge?',k:['best','seller','mashhoor','popular','famous','recommend'],a:'Homepage par Chaska Picks aur current Deals dekhein — ya mujhe flavour/product ka naam likhein, main matching snacks dhoond deta hun. 🔥'},
 {q:'Naye products kab aate hain?',k:['naye','new','arrival','kab'],a:'Naye snacks waqtan-fa-waqtan add hote rehte hain. Page refresh kar ke "All Snacks" dekhein — ya WhatsApp par poochein! 🆕'},
 {q:'Address ghalat likh diya, kya karun?',k:['address','ghalat','pata','change','tabdeel'],a:'Fikar na karein! Foran WhatsApp 0332-0005381 par apna order number aur sahi address bhej dein — dispatch se pehle hum update kar denge.'},
 {q:'Gift ya tohfa bhejna hai?',k:['gift','tohfa','wrap','present'],a:'Chaska Boxes gifting ke liye easy option hain. Special packing request ho to order se pehle WhatsApp 0332-0005381 par confirm kar lein. 🎁'},
 {q:'Payment mein masla ho gaya?',k:['masla','problem','fail','error','payment mein'],a:'Payment mein masla ho to order submit na karein jab tak reference available na ho. COD choose kar sakte hain, ya WhatsApp 0332-0005381 par help lein.'}
];
function aiReply(text){
  const t=text.toLowerCase().trim();
  // Greetings & small talk
  const greetings=[
    {k:['salam','assalam','hello','hi ','hey','aoa'],a:'Walaikum Assalam! 😊 Main Chaska Help hun. Kya dhoond rahe hain? Product ka naam likhein ya category batayein!'},
    {k:['kia hal','kya hal','hal hai','how are you','kesay ho','kese ho'],a:'Main bilkul theek hun, shukriya poochne ka! 😊 Aap sunayein? Koi snack chahiye to naam likhein — main dhoond dunga!'},
    {k:['shukriya','thanks','thank you','meherbani'],a:'Khush amdeed! 😊 Aur kuch chahiye to batayein!'},
    {k:['allah hafiz','bye','khuda hafiz','alvida'],a:'Allah Hafiz! 👋 Phir zaroor aayiyega!'},
    {k:['tum kaun','who are you','ap kaun','your name'],a:'Main ChaskaBox ka shopping helper hun! 💬 Products dhoondne mein madad karta hun. Kya chahiye?'},
    {k:['mazak','joke','funny'],a:'Ek snack ne dusre se kaha: "Tum to bohat namkeen ho!" 😄'},
  ];
  for(const g of greetings){
    if(g.k.some(k=>t.includes(k))) return {text:g.a};
  }
  // Product search: if query looks like a product search, show matching products
  const prod=searchProductsAI(t);
  if(prod.length) return {products:prod};
  let best=null,bestScore=0;
  AI_QA.forEach(x=>{
    let s=0;
    x.k.forEach(k=>{ if(t.includes(k)) s+=k.length; });
    if(s>bestScore){bestScore=s;best=x;}
  });
  return best?{text:(typeof best.a==='function'?best.a():best.a)}:{text:'Hmm, ye sawal samajh nahi aaya. 🤔 Product ka naam likhein (jaise "chocolate") ya WhatsApp 0332-0005381 par poochein!'};
}
function searchProductsAI(q){
  // Skip if it's clearly a FAQ question
  const faqWords=['delivery','payment','return','refund','address','order','track','cash','jazzcash','bank','transfer','cod','whatsapp','gift','discount','offer','sale'];
  if(faqWords.some(w=>q.includes(w))) return [];
  // Search products by name/category
  const words=q.split(/\s+/).filter(w=>w.length>2);
  if(!words.length) return [];
  const res=PRODUCTS.filter(p=>{
    const hay=(p.name+' '+(p.category||'')+' '+(p.brand||'')).toLowerCase();
    return words.some(w=>hay.includes(w));
  }).slice(0,5);
  return res;
}
function aiProductCards(prods){
  return '<div class="aiprods">'+prods.map(p=>`
    <div class="aiprod">
      <img src="${esc(assetUrl(p.img||'images/placeholder.png'))}" alt="${esc(p.name)}" loading="lazy" width="300" height="300" decoding="async">
      <div class="aipname">${esc(p.name)}</div>
      <div class="aipprice">Rs. ${p.price}</div>
      <button class="aipadd" onclick="addToCart(${p.id})">Add +</button>
    </div>`).join('')+'</div>';
}
let helpReturnFocus=null;
function toggleAI(open){
  const m=$('#aimodal');
  const willOpen=open===undefined?!m.classList.contains('open'):!!open;
  if(willOpen) helpReturnFocus=document.activeElement;
  m.classList.toggle('open',willOpen);
  m.setAttribute('aria-hidden',willOpen?'false':'true');
  document.getElementById('helpFab')?.setAttribute('aria-expanded',willOpen?'true':'false');
  if(willOpen){ renderAIQA(); setTimeout(()=>document.getElementById('aiq')?.focus(),0); }
  else if(helpReturnFocus&&typeof helpReturnFocus.focus==='function'){setTimeout(()=>helpReturnFocus.focus(),0);}
}
function renderAIQA(){
  const path=normalizePath(location.pathname);
  let intro='Salam! 👋 Main Chaska Help hun. Neeche sawal chunein ya apna sawal likhein:';
  let ids=[0,1,2,4,5,6];
  if(path==='/cart/'){intro='Bag mein help chahiye? Delivery, payment ya order ke bare mein poochein:';ids=[1,2,3,4,6];}
  else if(path.startsWith('/product/')){intro='Is snack ke bare mein help chahiye? Payment, delivery ya authenticity poochein:';ids=[0,1,5,6,8];}
  $('#aibody').innerHTML='<div class="amsg bot">'+esc(intro)+'</div>'+
    ids.filter(i=>AI_QA[i]).map(i=>`<button class="aq" onclick="askAI(${i})">${esc(AI_QA[i].q)}</button>`).join('');
}
function aiSay(user,bot){
  $('#aibody').innerHTML+=`<div class="amsg user">${esc(user)}</div><div class="amsg bot">${bot}</div>`;
  $('#aibody').scrollTop=$('#aibody').scrollHeight;
}
function askAI(i){
  const x=AI_QA[i];
  aiSay(x.q,esc(typeof x.a==='function'?x.a():x.a));
}
async function askAIFree(){
  const inp=$('#aiq'),v=(inp.value||'').trim();
  if(!v) return;
  inp.value=''; inp.disabled=true;
  const body=$('#aibody'), id='aiwait-'+Date.now();
  body.innerHTML+=`<div class="amsg user">${esc(v)}</div><div class="amsg bot" id="${id}">✦ Soch raha hun…</div>`; body.scrollTop=body.scrollHeight;
  const out=document.getElementById(id);
  try{
    const res=await fetch('/api/ai/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:v})});
    const data=await res.json().catch(()=>({})); if(!res.ok)throw new Error(data.error||'AI unavailable');
    const prods=(data.products||[]).map(serverProductToLocal);
    const answer=esc(data.answer||'').replace(/\n/g,'<br>');
    out.innerHTML=answer+(prods.length?'<br>'+aiProductCards(prods):'')+(data.track_url?`<br><a class="aq" href="${esc(data.track_url)}">Secure Track Order →</a>`:'');
  }catch{
    const r=aiReply(v);
    out.innerHTML=r.products&&r.products.length?'Ye rahe matching products! 👇<br>'+aiProductCards(r.products):esc(r.text||r);
  }finally{inp.disabled=false;inp.focus();body.scrollTop=body.scrollHeight;}
}

/* ---------- accessible header promo rotation ---------- */
function promoItems(){return ['Original sealed packs',`🚚 ${fallbackDeliveryEstimate()} nationwide delivery`,'💰 COD + prepaid options','🎁 Chaska Boxes for easy gifting'];}
let promoIdx=0,promoTimer=null,promoSource='';
function initPromo(){
  const banner=document.querySelector('.promo');
  const desktop=banner?.querySelector('.promo-desktop'),mobile=document.getElementById('promoMsg');
  if(!banner||!desktop||!mobile)return;
  const spans=[desktop,mobile];
  function setText(raw){
    const text=String(raw||'').trim();
    if(text===promoSource&&promoTimer!==null)return;
    promoSource=text;promoIdx=0;
    let messages=text?text.split(/\s*[·•|]\s*/).map(s=>s.trim()).filter(Boolean):promoItems();
    if(!messages.length)messages=promoItems();
    messages=messages.slice(0,6);
    spans.forEach(el=>{el.classList.remove('fading');el.textContent=messages[0];});
    if(promoTimer!==null){clearInterval(promoTimer);promoTimer=null;}
    if(messages.length<2)return;
    promoTimer=setInterval(()=>{
      if(banner.hidden||document.hidden||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
      spans.forEach(el=>el.classList.add('fading'));
      setTimeout(()=>{
        promoIdx=(promoIdx+1)%messages.length;
        spans.forEach(el=>{el.textContent=messages[promoIdx];el.classList.remove('fading');});
      },240);
    },4200);
  }
  window.ChaskaPromo={setText};
  setText(STORE_CONFIG?.theme?.announcement_text||STORE_CONFIG?.settings?.promo_text||'');
}

/* Original packing video: published How it works configuration, loaded on request. */
let packingVideoRender=0;
async function renderPackingVideo(){
  const box=document.getElementById('packingVideoBox');
  if(!box) return;
  const seq=++packingVideoRender,wrap=box.closest('.freshvideo');
  if(wrap)wrap.hidden=true;box.innerHTML='';
  const section=(STORE_CONFIG.sections||[]).find(s=>s.section_key==='how_it_works');
  const raw=section?.config?.packing_video_url;
  if(section?.enabled===false||!raw)return;
  try{
    const {packingVideoSource}=await import('/packing-video.js?v=20261014-final-readiness');const video=packingVideoSource(raw);
    if(seq!==packingVideoRender||!video)return;
    if(wrap)wrap.hidden=false;
    box.innerHTML='<button class="cta" type="button" data-load-packing-video>Show packing video</button><p class="fv-sub">Video loads when you choose to watch.</p>';
    box.querySelector('[data-load-packing-video]').onclick=()=>{
      box.innerHTML=video.type==='youtube'?'<iframe class="fv-frame" src="'+esc(video.src)+'" title="ChaskaBox original packing video" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe>':'<video class="fv-frame" controls preload="none" playsinline src="'+esc(video.src)+'">Your browser does not support this video.</video>';
    };
  }catch{if(seq===packingVideoRender){box.innerHTML='';if(wrap)wrap.hidden=true;}}
}

/* ---------- animations: scroll reveals, hero tilt ---------- */
let revealObs=null;
function initReveals(){
  if(reducedMotion()||typeof IntersectionObserver==='undefined'){
    document.documentElement.classList.remove('motion-reveals');
    document.querySelectorAll('.reveal').forEach(el=>el.classList.add('in'));return;
  }
  if(revealObs)return;
  revealObs=new IntersectionObserver(entries=>{
    entries.forEach(en=>{
      if(en.isIntersecting){
        en.target.classList.add('in');
        setTimeout(()=>{en.target.style.transitionDelay='';},300);
        revealObs.unobserve(en.target);
      }
    });
  },{threshold:.08,rootMargin:'0px 0px -30px 0px'});
  document.documentElement.classList.add('motion-reveals');
}
function observeReveals(scope){
  if(!revealObs||reducedMotion()){(scope||document).querySelectorAll('.reveal').forEach(el=>el.classList.add('in'));return;}
  (scope||document).querySelectorAll('.reveal:not(.in)').forEach(el=>revealObs.observe(el));
}
motionPreference.addEventListener?.('change',()=>{
  if(reducedMotion()){
    revealObs?.disconnect();revealObs=null;
    document.documentElement.classList.remove('motion-reveals');
    document.querySelectorAll('.reveal').forEach(el=>{el.classList.add('in');el.style.transitionDelay='';});
    const collage=document.getElementById('heroCollage');if(collage)collage.style.transform='';
    document.querySelectorAll('.motion-tilt').forEach(el=>{el.classList.remove('motion-tilt');el.style.removeProperty('--tilt-x');el.style.removeProperty('--tilt-y');el.style.removeProperty('--card-lift');});
  }else{initReveals();observeReveals();}
});
document.addEventListener('visibilitychange',()=>document.body.classList.toggle('motion-paused',document.hidden));
document.addEventListener('error',event=>{
  const img=event.target;if(img?.tagName!=='IMG')return;
  const collage=img.closest('#heroCollage');
  if(collage){img.remove();if(!collage.querySelector('img')){const wrap=collage.closest('.heroimg');if(wrap)wrap.hidden=true;}return;}
  if(img.closest('.bundle-fan')){img.remove();return;}
  const wrap=img.closest('.pimg,.pd-img,.pickimg');if(!wrap)return;
  const placeholder=document.createElement('div');placeholder.className='noimg';placeholder.textContent='Photo coming soon';wrap.replaceChildren(placeholder);
},true);
function initTilt(){
  if(!matchMedia('(pointer:fine)').matches) return;
  const hero=$('.hero'), col=$('#heroCollage');
  if(!hero||!col) return;
  let frame=0,last=null;
  hero.addEventListener('mousemove',e=>{
    if(reducedMotion()||document.hidden)return;
    last={x:e.clientX,y:e.clientY};
    if(frame) return;
    frame=requestAnimationFrame(()=>{
      frame=0; if(!last||reducedMotion()||document.hidden)return;
      const r=hero.getBoundingClientRect();
      const x=(last.x-r.left)/r.width-.5, y=(last.y-r.top)/r.height-.5;
      col.style.transform=`rotateY(${(x*3.2).toFixed(2)}deg) rotateX(${(-y*2.6).toFixed(2)}deg)`;
    });
  },{passive:true});
  hero.addEventListener('mouseleave',()=>{last=null;if(frame){cancelAnimationFrame(frame);frame=0;}col.style.transform='';});
}
function initCardTilt(){
  if(!matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  let frame=0,pending=null;
  document.addEventListener('pointermove',e=>{
    if(reducedMotion()||document.hidden)return;
    const card=e.target.closest?.('.card'); if(!card) return;
    if(card.classList.contains('reveal')&&!card.classList.contains('in')) return;
    pending={card,x:e.clientX,y:e.clientY};
    if(frame) return;
    frame=requestAnimationFrame(()=>{
      frame=0; if(!pending||reducedMotion()||document.hidden)return;
      const {card,x,y}=pending; pending=null;
      if(!document.body.contains(card)) return;
      card.classList.add('motion-tilt');
      const r=card.getBoundingClientRect();
      const px=Math.max(0,Math.min(1,(x-r.left)/r.width));
      const py=Math.max(0,Math.min(1,(y-r.top)/r.height));
      card.style.setProperty('--tilt-y',((px-.5)*5).toFixed(2)+'deg');
      card.style.setProperty('--tilt-x',((.5-py)*4).toFixed(2)+'deg');
      card.style.setProperty('--shine-x',(px*100).toFixed(1)+'%');
      card.style.setProperty('--shine-y',(py*100).toFixed(1)+'%');
    });
  },{passive:true});
  document.addEventListener('pointerout',e=>{
    const card=e.target.closest?.('.card'); if(!card) return;
    if(e.relatedTarget&&card.contains(e.relatedTarget)) return;
    card.style.setProperty('--tilt-x','0deg');
    card.style.setProperty('--tilt-y','0deg');
  });
}

/* ---------- mobile header fix ---------- */
function fixMobileHeader(){
  document.querySelectorAll('header .mnav-btn, header .search-btn, header .account-btn').forEach(btn=>{
    btn.style.removeProperty('display'); btn.style.removeProperty('visibility');
  });
}

/* ---------- global keyboard escape ---------- */
function getOpenDialog(){
  return document.querySelector('#mnav.open,#aimodal.open,#pmodal.open,#acctmodal.open,#filterSheet.open,#drawer.open');
}
function trapDialogTab(event){
  const dialog=getOpenDialog(); if(!dialog||event.key!=='Tab')return;
  const nodes=[...dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);
  if(!nodes.length)return; const first=nodes[0],last=nodes[nodes.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
}
document.addEventListener('keydown',event=>{
  trapDialogTab(event);
  if(event.key!=='Escape') return;
  if(document.getElementById('mnav')?.classList.contains('open')){closeMnav();return;}
  // Cart drawer: check both class and aria-hidden for robustness
  const drawer = document.getElementById('drawer');
  if(drawer && (drawer.classList.contains('open') || drawer.getAttribute('aria-hidden')==='false')) { closeDrawer(); return; }
  else if(document.getElementById('filterSheet')?.classList.contains('open')) closeFilters();
  else if(document.getElementById('pmodal')?.classList.contains('open')) closeModal();
  else if(document.getElementById('aimodal')?.classList.contains('open')) toggleAI(false);
  else if(document.getElementById('acctmodal')?.classList.contains('open')&&typeof closeAuthModal==='function') closeAuthModal();
});

/* ---------- init ---------- */
function hasStoredAccountSession(){
  // Inspect storage key names only; the Auth SDK still validates any session.
  // Fresh guests need no Auth download until they choose account/sign-in.
  try{for(let i=0;i<localStorage.length;i++)if(/^sb-[a-z0-9]+-auth-token$/.test(localStorage.key(i)||''))return true;}catch{}
  return false;
}
document.addEventListener('DOMContentLoaded',async()=>{
  // Render the initial HTML immediately. Slow catalogue/config APIs must not
  // block the primary hero from being interactive or present to assistive tech.
  // Dynamic lists still populate when both background fetches settle.
  fixMobileHeader();
  initPromo(); // Independent of the catalogue/API loading.
  loadCart();
  try{
    // Preview and production hydrate the same server seed/public API. loadProducts
    // already falls back to the versioned snapshot if that API is unavailable.
    await Promise.all([loadProducts(),loadStorefrontConfig().catch(()=>{})]);
  }
  catch{const view=document.getElementById('view-home');if(view){view.hidden=false;view.style.display='block';view.innerHTML='<section class="section"><h1>Catalogue unavailable</h1><p>Please try again in a moment.</p><button class="cta" id="catalogueRetry">Retry</button></section>';document.getElementById('catalogueRetry').onclick=()=>location.reload();}return;}
  updateBadge();updateWishCount();
  checkAbandonedCart();
  initReveals(); initTilt(); initCardTilt(); renderPackingVideo();
  renderHeaderDropdowns();
  /* premium header: deeper shadow once scrolled */
  (function(){const h=document.querySelector('header');if(!h)return;
    const onS=()=>h.classList.toggle('scrolled',window.scrollY>60);
    window.addEventListener('scroll',onS,{passive:true});onS();})();
  migrateHashURL(); /* migrate old #/shop URLs to clean paths (replaceState) */
  route(); /* Phase 1: route from clean URL path */
  // Restore sessions immediately on the account route. On public pages, use
  // idle time so the Auth SDK does not compete with the first content paint.
  if(typeof initAccount==='function'){
    const authStart=()=>initAccount().catch(e=>console.warn('account init',e));
    if(location.pathname==='/account/' || location.hash.includes('type=recovery')) authStart();
    else if(hasStoredAccountSession()){
      if(typeof requestIdleCallback==='function') requestIdleCallback(authStart,{timeout:3500});
      else setTimeout(authStart,2500);
    }
  }
  observeReveals();
});

/* ---------- mobile nav drawer ---------- */
function toggleMnav(force){
  const m=$('#mnav'); if(!m) return;
  const open=force!==undefined?force:!m.classList.contains('open');
  m.classList.toggle('open',open);
  $('#overlay').classList.toggle('open',open&&!$('#drawer').classList.contains('open'));
  m.setAttribute('aria-hidden',String(!open));
  if(open){mnavReturnFocus=document.activeElement;renderMnav();m.removeAttribute('inert');document.body.style.overflow='hidden';setTimeout(()=>m.querySelector('button')?.focus(),0);}
  else closeMnav();
}
let mnavReturnFocus=null;
function closeMnav(){const m=$('#mnav');if(m){m.classList.remove('open');m.setAttribute('aria-hidden','true');m.setAttribute('inert','');}if(!$('#drawer').classList.contains('open')){$('#overlay').classList.remove('open');document.body.style.overflow='';}if(mnavReturnFocus){mnavReturnFocus.focus?.();mnavReturnFocus=null;}}
function renderMnav(){
  if(Array.isArray(STORE_CONFIG?.navigation)&&window.applyStorefrontManifest){window.applyStorefrontManifest(STORE_CONFIG);return;}
  const cats={}; activeProducts().forEach(p=>{cats[p.category]=cats[p.category]||[];cats[p.category].push(p);});
  const order=['',...CAT_ORDER.filter(c=>cats[c]&&cats[c].length)];
  const catsHtml=order.map(c=>`<a href="${c===''?'/shop/':categoryPath(c)}">${c===''?'🛍️ All Snacks':esc(c)}</a>`).join('');
  const bc={}; activeProducts().forEach(p=>{const b=getBrand(p);bc[b]=(bc[b]||0)+1;});
  const topBrands=Object.entries(bc).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const brandsHtml=topBrands.length?`<div style="border-top:1px solid var(--border);margin:8px 0"></div><div style="padding:8px 16px 4px;font-size:11px;font-weight:800;color:var(--muted)">🏷️ BRANDS</div>`+topBrands.map(([b,n])=>`<a href="/shop/?brand=${esc(encodeURIComponent(b))}">${esc(b)} <span style="opacity:.5">(${n})</span></a>`).join(''):'';
  $('#mnavList').innerHTML=catsHtml+brandsHtml+`
    <div style="border-top:1px solid var(--border);margin:8px 0"></div>
    <a href="/bundles/">Chaska Boxes</a>
    <a href="/shop/?badge=Sale" onclick="goBadge('Sale');return false">🔥 Deals</a>
    <div style="border-top:1px solid var(--border);margin:8px 0"></div>
    <a href="/account/" onclick="closeMnav()">👤 My Account</a>`;
}

/* ---------- Wishlist ---------- */
function getWishlist(){ try{ return JSON.parse(localStorage.getItem('chaskabox-wishlist')||'[]'); }catch{ return []; } }
function saveWishlist(w){ localStorage.setItem('chaskabox-wishlist', JSON.stringify(w)); updateWishCount(); }
function isWished(id){ return getWishlist().includes(Number(id)); }
function toggleWishlist(id, btn){
  id = Number(id);
  let w = getWishlist();
  const wasIn = w.includes(id);
  if(wasIn) w = w.filter(x => x !== id);
  else w.push(id);
  saveWishlist(w);
  // Sync to server if logged in (cross-device)
  try{
    if(typeof ACCOUNT_SESSION !== 'undefined' && ACCOUNT_SESSION && typeof SB !== 'undefined' && SB){
      const uid = ACCOUNT_SESSION.user.id;
      if(wasIn) SB.from('wishlists').delete().eq('user_id', uid).eq('product_id', id).then(()=>{});
      else SB.from('wishlists').upsert({user_id: uid, product_id: id}, {onConflict: 'user_id,product_id'}).then(()=>{});
    }
  }catch(e){}
  // Track for analytics
  try{ let sid=null; try{ sid=localStorage.getItem('cb_sid'); }catch(e){}
    fetch('/api/wishlist-log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:id,action:wasIn?'remove':'add',session_id:sid})}).catch(()=>{});
  }catch(e){}
  // Update all heart buttons for this product
  document.querySelectorAll(`[data-wish="${id}"]`).forEach(b => {
    b.classList.toggle('on', w.includes(id));
    b.setAttribute('aria-pressed', w.includes(id) ? 'true' : 'false');
  });
  if(btn){ btn.classList.toggle('on', w.includes(id)); }
  // Refresh wishlist view if open
  if(location.pathname === '/wishlist/') renderWishlistRoute();
}
function wishBtnHTML(p){
  const on = isWished(p.id) ? ' on' : '';
  return `<button class="wishbtn${on}" data-wish="${p.id}" aria-label="Add to wishlist" aria-pressed="${isWished(p.id)}" onclick="event.preventDefault();toggleWishlist(${p.id},this)">${cbIcon('heart')}</button>`;
}
function updateWishCount(){
  const n = getWishlist().length;
  document.querySelectorAll('.wishcount').forEach(el => {
    el.textContent = n;
    el.style.display = n ? '' : 'none';
  });
}
function renderWishlistRoute(){
  const w = getWishlist();
  const products = w.map(id => activeProducts().find(p => Number(p.id) === Number(id))).filter(Boolean);
  const html = products.length
    ? `<div class="grid">${products.map(p => cardHTML(p)).join('')}</div>`
    : `<div class="empty-state"><p>🤍 Your wishlist is empty.</p><p>Tap the ♥ on any snack to save it here.</p><a class="cta" href="/shop/">Browse snacks →</a></div>`;
  $('#view-wishlist').innerHTML = `<div class="section"><span class="eyebrow">SAVED</span><h1>My Wishlist (${products.length})</h1>${html}</div>`;
  showView('wishlist');
  window.scrollTo(0,0);
}
