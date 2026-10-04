/* ChaskaBox static store app */
const NAVY='#1a2b5c';
let PRODUCTS=[], CART={};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const fmt=n=>'Rs. '+Number(n).toLocaleString('en-PK');

/* ---------- data ---------- */
async function loadProducts(){
  const r=await fetch('products.json'); PRODUCTS=await r.json();
  // admin overrides from localStorage
  try{
    const ov=JSON.parse(localStorage.getItem('cb_overrides')||'{}');
    PRODUCTS.forEach(p=>{ if(ov[p.id]) Object.assign(p,ov[p.id]); });
  }catch(e){}
}
function activeProducts(){ return PRODUCTS.filter(p=>p.active!==false); }

/* ---------- delivery date estimate (4-7 days) ---------- */
function deliveryRange(){
  const f=d=>d.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
  const a=new Date(); a.setDate(a.getDate()+4);
  const b=new Date(); b.setDate(b.getDate()+7);
  return `From ${f(a)} to ${f(b)}`;
}

/* ---------- cards ---------- */
function cardHTML(p){
  const img=p.img?`<img src="${p.img}" alt="${esc(p.name)}" loading="lazy">`:`<div class="noimg"><b>CHASKABOX</b><span>Photo<br>coming soon</span><small>${esc(p.category||'')}</small></div>`;
  const badge=p.badge?`<span class="badge ${p.badge==='Bestseller'?'bestseller':''}">${esc(p.badge==='Sale'?'Sale':p.badge.toUpperCase())}</span>`:'';
  const old=p.oldPrice&&p.oldPrice>p.price?`<span class="oldprice">${fmt(p.oldPrice)}</span>`:'';
  const stars=p.rating?`<div class="stars">${'★'.repeat(Math.round(p.rating))}${'☆'.repeat(5-Math.round(p.rating))}<span>(${p.reviews||0})</span></div>`:'';
  const catlabel=p.category?`<div class="pcat">${esc(p.category)}${p.bundle?' · BUNDLE':''}</div>`:'';
  const packhead=p.pack?`<div class="pimgpack">${esc(p.pack.toUpperCase())}</div>`:'';
  return `<div class="card">${badge}
    <div class="pimg" onclick="showProductDetail(${p.id})">${packhead}${img}</div>
    <div class="pbody">
      ${catlabel}
      <div class="pname" onclick="showProductDetail(${p.id})">${esc(p.name)}</div>
      <div class="ppack">${esc(p.pack||'')}</div>
      ${stars}
      <div class="dbox"><b>Delivery Details</b><small>Estimated Delivery Dates<br><span class="ddates">${deliveryRange()}</span></small></div>
      <div class="prow"><div><span class="price">${fmt(p.price)}</span>${old}</div>
      <button class="addbtn" aria-label="Add to bag" onclick="addToCart(${p.id},1,this)">+</button></div>
    </div></div>`;
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
function renderHome(){
  const act=activeProducts();
  // categories
  const cats={};
  act.forEach(p=>{cats[p.category]=cats[p.category]||[];cats[p.category].push(p);});
  // category tiles: clean SVG illustrations (match original custom art)
  const allCount=act.length;
  const tileOrder=['All',...CAT_ORDER.filter(c=>cats[c]&&cats[c].length)];
  // ensure 'All' pseudo-category first, then fixed original order
  $('#catTiles').innerHTML=tileOrder.map(c=>{
    const st=CAT_STYLE[c]||{bg:'#8a94a6'};
    const list=c==='All'?act:(cats[c]||[]);
    const n=c==='All'?allCount:list.length;
    if(c!=='All'&&!n) return '';
    const inner=TILE_SVG[c]?`<span class="ci-svg">${TILE_SVG[c]}</span>`:`<span class="ci-emoji">🛍️</span>`;
    return `<div class="cat reveal" onclick="goShop('${c==='All'?'':esc(c)}')">
      <div class="ci" style="background:${st.bg}">${inner}</div>
      <b>${esc(c)}</b><small>${n} items</small></div>`;
  }).join('');
  // hero collage: 3 product images
  const heroPicks=act.filter(p=>p.img).slice(0,3);
  const hi=$('#heroCollage');
  if(hi&&heroPicks.length) hi.innerHTML=heroPicks.map((p,i)=>`<img src="${p.img}" alt="" loading="lazy" class="hc${i+1}">`).join('');
  // shelves: sale + every category with colored band
  let html='';
  const sale=act.filter(p=>p.oldPrice&&p.oldPrice>p.price).slice(0,10);
  if(sale.length) html+=shelf('🔥 Sale Picks',sale,'#1a2b5c','');
  CAT_ORDER.forEach(c=>{
    const list=(cats[c]||[]).slice(0,10);
    if(list.length) html+=shelf(c,list,BAND_COLORS[c]||'#1a2b5c',c);
  });
  // any leftover categories not in order
  Object.keys(cats).sort().forEach(c=>{
    if(!CAT_ORDER.includes(c)&&cats[c].length) html+=shelf(c,cats[c].slice(0,10),BAND_COLORS[c]||'#1a2b5c',c);
  });
  $('#shelves').innerHTML=html;
  observeReveals();
}
let shelfSeq=0;
function shelf(title,items,color,cat){
  const go=cat?`goShop('${esc(cat)}')`:`goShop('')`;
  const sid='hs'+(++shelfSeq);
  return `<div class="shelf reveal">
    <div class="shelfband reveal" style="background:${color}">
      <div class="shelfw"><h2>${esc(title.toUpperCase())}</h2>
      <div class="shelfnav"><a class="viewall" href="#" onclick="${go};return false">View all →</a>
      <button class="sarrow" aria-label="Scroll left" onclick="shelfScroll('${sid}',-1)">←</button>
      <button class="sarrow" aria-label="Scroll right" onclick="shelfScroll('${sid}',1)">→</button></div></div>
    </div>
    <div class="shelfbody"><div class="hscroll" id="${sid}">${items.map(cardHTML).join('')}</div></div>
  </div>`;
}
function shelfScroll(id,dir){
  const el=document.getElementById(id); if(!el) return;
  el.scrollBy({left:dir*el.clientWidth*.85,behavior:'smooth'});
}

/* ---------- shop ---------- */
let shopState={q:'',cat:'',sort:'feat',brands:[],maxPrice:0,pack:''};
function goShop(cat){
  closeMnav();
  shopState={q:'',cat:cat||'',sort:'feat',brands:[],maxPrice:0,pack:''};
  showView('shop'); renderShop();
  window.scrollTo(0,0);
}
function getBrand(name){
  const m=String(name||'').split('|')[0].trim();
  return m||'ChaskaBox';
}
function renderShop(){
  const all=activeProducts();
  const {cat}=shopState;
  const title=cat||'All Snacks';
  $('#crumbCat').textContent=title;
  $('#catTitle').textContent=title;
  const brands=[...new Set(all.map(p=>getBrand(p.name)))].sort();
  const packs=[...new Set(all.map(p=>p.pack).filter(Boolean))].sort();
  const maxP=Math.max(...all.map(p=>p.price),1000);
  $('#shopSidebar').innerHTML=
    '<div class="fgroup"><h4>Brand</h4>'+brands.map(b=>'<label><input type="checkbox" value="'+esc(b)+'" '+(shopState.brands.includes(b)?'checked':'')+' onchange="toggleBrand(this)"> '+esc(b)+'</label>').join('')+'</div>'
    +'<div class="fgroup"><h4>Max Price</h4><input type="range" min="100" max="'+maxP+'" step="50" value="'+(shopState.maxPrice||maxP)+'" oninput="shopState.maxPrice=+this.value;document.getElementById(\'pval\').textContent=fmt(+this.value);renderShopList()"><div id="pval">'+fmt(shopState.maxPrice||maxP)+'</div></div>'
    +'<div class="fgroup"><h4>Pack Size</h4><select onchange="shopState.pack=this.value;renderShopList()"><option value="">All packs</option>'+packs.map(p=>'<option '+(shopState.pack===p?'selected':'')+' value="'+esc(p)+'">'+esc(p)+'</option>').join('')+'</select></div>'
    +'<button class="fclear" onclick="shopState.brands=[];shopState.maxPrice=0;shopState.pack=\'\';shopState.q=\'\';renderShop()">Clear filters</button>';
  renderShopList();
}
function toggleBrand(el){
  const b=el.value;
  shopState.brands=el.checked?[...shopState.brands,b]:shopState.brands.filter(x=>x!==b);
  renderShopList();
}
function filteredShop(){
  let list=activeProducts();const{q,cat,sort,brands,maxPrice,pack}=shopState;
  if(cat)list=list.filter(p=>p.category===cat);
  if(q){const n=q.toLowerCase();list=list.filter(p=>(p.name+' '+(p.pack||'')).toLowerCase().includes(n));}
  if(brands.length)list=list.filter(p=>brands.includes(getBrand(p.name)));
  if(maxPrice)list=list.filter(p=>p.price<=maxPrice);
  if(pack)list=list.filter(p=>p.pack===pack);
  if(sort==='lo')list=[...list].sort((a,b)=>a.price-b.price);
  else if(sort==='hi')list=[...list].sort((a,b)=>b.price-a.price);
  else if(sort==='az')list=[...list].sort((a,b)=>a.name.localeCompare(b.name));
  return list;
}
function renderShopList(){
  const list=filteredShop();
  const{q,cat,sort}=shopState;
  $('#catCount').textContent=list.length+' products';
  $('#shopFilters').innerHTML=
    '<input type="text" id="fq" placeholder="Search in '+esc(cat||'all snacks')+'..." value="'+esc(q)+'" oninput="shopState.q=this.value;renderShopList()">'
    +'<select onchange="shopState.sort=this.value;renderShopList()">'
    +'<option value="feat" '+(sort==='feat'?'selected':'')+'>Sort: Featured</option>'
    +'<option value="lo" '+(sort==='lo'?'selected':'')+'>Price: Low \u2192 High</option>'
    +'<option value="hi" '+(sort==='hi'?'selected':'')+'>Price: High \u2192 Low</option>'
    +'<option value="az" '+(sort==='az'?'selected':'')+'>Name A\u2013Z</option>'
    +'</select><span class="cnt">'+list.length+' products</span>';
  $('#shopGrid').innerHTML=list.length?list.map(cardHTML).join(''):'<div class="empty">No products found. Try another search.</div>';
  if(typeof revealObs!=='undefined'&&revealObs){
    [...document.querySelectorAll('#shopGrid .card')].forEach((c,i)=>{
      c.classList.add('reveal');
      c.style.transitionDelay=((i%8)*45)+'ms';
    });
  }
  observeReveals();
}

/* ---------- product modal ---------- */
function openProduct(id){
  const p=PRODUCTS.find(x=>x.id===id); if(!p)return;
  const img=p.img?`<img src="${p.img}" alt="">`:`<div class="noimg"><b>CHASKABOX</b><span>Photo<br>coming soon</span><small>${esc(p.category||'')}</small></div>`;
  const old=p.oldPrice?`<span class="oldprice">${fmt(p.oldPrice)}</span>`:'';
  $('#mbody').innerHTML=`<div class="mgrid">
    <div class="pimg">${img}</div>
    <div><h2 style="color:var(--navy);font-size:20px;margin-bottom:6px">${esc(p.name)}</h2>
    <div class="ppack" style="margin-bottom:8px">${esc(p.pack||'')} · ${esc(p.category)}</div>
    <div style="margin-bottom:10px"><span class="price" style="font-size:22px">${fmt(p.price)}</span>${old}</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:14px">${esc(p.desc||'')}</p>
    <div class="qty" style="margin-bottom:12px"><button onclick="mQty(-1)">−</button><b id="mqty">1</b><button onclick="mQty(1)">+</button></div>
    <button class="add" style="padding:12px 26px;font-size:15px" onclick="addToCart(${p.id},+document.getElementById('mqty').textContent,this);closeModal()">Add to Bag</button>
    </div></div>`;
  $('#pmodal').classList.add('open');
}
function mQty(d){const e=$('#mqty');e.textContent=Math.max(1,+e.textContent+d);}
function closeModal(){$('#pmodal').classList.remove('open');}

/* ---------- product detail page ---------- */
let pdPrev='home', pdRating=5;
function showProductDetail(id){
  const p=PRODUCTS.find(x=>x.id===id); if(!p)return;
  pdPrev=$('#view-shop').style.display!=='none'?'shop':'home';
  pdRating=5;
  const img=p.img?`<img src="${p.img}" alt="${esc(p.name)}">`:`<div class="noimg"><b>CHASKABOX</b><span>Photo<br>coming soon</span><small>${esc(p.category||'')}</small></div>`;
  const badge=p.badge?`<span class="badge ${p.badge==='Bestseller'?'bestseller':''}">${esc(p.badge==='Sale'?'Sale':p.badge.toUpperCase())}</span>`:'';
  const old=p.oldPrice&&p.oldPrice>p.price?`<span class="oldprice">${fmt(p.oldPrice)}</span>`:'';
  const save=p.oldPrice&&p.oldPrice>p.price?`<span class="pdsave">Save ${Math.round((1-p.price/p.oldPrice)*100)}%</span>`:'';
  const catlabel=p.category?`<div class="pcat">${esc(p.category)}${p.bundle?' · BUNDLE':''}</div>`:'';
  $('#pdCrumbCat').textContent=p.category||'All Snacks';
  $('#pdCrumbCat').setAttribute('onclick',`goShop('${esc(p.category||'')}');return false`);
  $('#pdCrumbName').textContent=p.name;
  $('#pdetail').innerHTML=`<div class="pdetail">
    <div class="pd-grid">
      <div class="pd-imgwrap">${badge}<div class="pd-img">${img}</div></div>
      <div class="pd-info">
        ${catlabel}
        <h1>${esc(p.name)}</h1>
        <div class="pd-brand">${esc(getBrand(p.name))}</div>
        <div class="pd-stars" id="pdAvg"></div>
        <div class="pd-price"><span class="price" style="font-size:26px">${fmt(p.price)}</span>${old}${save}</div>
        <div class="ppack" style="margin-bottom:10px">${esc(p.pack||'')}</div>
        <p class="pd-desc">${esc(p.desc||'No description available yet.')}</p>
        <div class="pd-buyrow">
          <div class="qty"><button onclick="pdQty(-1)" aria-label="Decrease">−</button><b id="pdqty">1</b><button onclick="pdQty(1)" aria-label="Increase">+</button></div>
          <button class="pdbtn" onclick="addToCart(${p.id},+document.getElementById('pdqty').textContent,this)">Add to Bag</button>
        </div>
        <div class="dbox"><b>Delivery Details</b><small>Estimated Delivery Dates<br><span class="ddates">${deliveryRange()}</span></small></div>
        <div class="pd-meta"><span>🚚 COD available (Rs. 300 delivery)</span><span>⚡ JazzCash Rs. 5,000+: FREE delivery</span><span>✅ 100% original packs</span></div>
      </div>
    </div>
    <div class="reviews">
      <h2>Customer Reviews</h2>
      <div id="revList"></div>
      <div class="rev-form">
        <h3>Write a review</h3>
        <input id="revName" maxlength="40" placeholder="Your name">
        <div class="stars-input" id="revStars"></div>
        <textarea id="revComment" maxlength="500" rows="3" placeholder="Share your experience with this snack..."></textarea>
        <button class="pdbtn" onclick="submitReview(${p.id})">Submit Review</button>
      </div>
    </div>
  </div>`;
  renderPdStars(p.id);
  renderRevStars();
  refreshReviews(p.id);
  showView('product');
  window.scrollTo(0,0);
}
function pdBack(){ showView(pdPrev); window.scrollTo(0,0); }
function pdQty(d){const e=$('#pdqty');e.textContent=Math.max(1,+e.textContent+d);}

/* ---------- reviews (localStorage) ---------- */
function getReviews(pid){
  try{ return (JSON.parse(localStorage.getItem('chaskabox-reviews')||'{}'))[pid]||[]; }
  catch(e){ return []; }
}
function avgRating(pid){
  const r=getReviews(pid); if(!r.length) return 0;
  return r.reduce((s,x)=>s+(+x.rating||0),0)/r.length;
}
function starsHTML(avg,n){
  const full=Math.round(avg);
  return `<span class="stars">${'★'.repeat(full)}${'☆'.repeat(5-full)}<span>(${n} review${n===1?'':'s'})</span></span>`;
}
function renderPdStars(pid){
  const el=$('#pdAvg'); if(!el) return;
  const r=getReviews(pid);
  el.innerHTML=r.length?starsHTML(avgRating(pid),r.length):'<span class="stars" style="color:var(--muted)">☆☆☆☆☆<span>(No reviews yet)</span></span>';
}
function renderRevStars(){
  const el=$('#revStars'); if(!el) return;
  el.innerHTML=[1,2,3,4,5].map(n=>`<button type="button" class="${n<=pdRating?'on':''}" onclick="setPRating(${n})" aria-label="${n} star${n>1?'s':''}">★</button>`).join('');
}
function setPRating(n){ pdRating=n; renderRevStars(); }
function refreshReviews(pid){
  const el=$('#revList'); if(!el) return;
  const r=getReviews(pid);
  el.innerHTML=r.length?r.slice().reverse().map(x=>`
    <div class="rev">
      <div class="rev-head"><b>${esc(x.name)}</b><span class="stars">${'★'.repeat(+x.rating||0)}${'☆'.repeat(5-(+x.rating||0))}</span><small>${esc(x.date)}</small></div>
      <p>${esc(x.comment)}</p>
    </div>`).join(''):'<div class="rev-empty">No reviews yet — be the first to review this snack! 👇</div>';
  renderPdStars(pid);
}
function submitReview(pid){
  const name=($('#revName').value||'').trim();
  const comment=($('#revComment').value||'').trim();
  if(!name){ alert('Please enter your name.'); $('#revName').focus(); return; }
  if(!comment){ alert('Please write your review.'); $('#revComment').focus(); return; }
  let all={};
  try{ all=JSON.parse(localStorage.getItem('chaskabox-reviews')||'{}'); }catch(e){ all={}; }
  (all[pid]=all[pid]||[]).push({name, rating:pdRating, comment, date:new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})});
  try{ localStorage.setItem('chaskabox-reviews',JSON.stringify(all)); }catch(e){ alert('Could not save review (storage full).'); return; }
  $('#revName').value=''; $('#revComment').value=''; pdRating=5;
  refreshReviews(pid);
  alert('Thank you! Your review has been posted. 🙏');
}

/* ---------- views ---------- */
function showView(v){
  $('#view-home').style.display=v==='home'?'':'none';
  $('#view-shop').style.display=v==='shop'?'':'none';
  $('#view-product').style.display=v==='product'?'':'none';
  if(v==='home')renderHome(); if(v==='shop')renderShop();
}

/* ---------- cart ---------- */
function loadCart(){try{CART=JSON.parse(localStorage.getItem('chaskabox-cart')||'{}');}catch(e){CART={};}}
function saveCart(){localStorage.setItem('chaskabox-cart',JSON.stringify(CART));updateBadge();renderDrawer();}
function addToCart(id,qty,el){ if(el) flyToCart(el,id); CART[id]=(CART[id]||0)+qty; saveCart(); popBadge(); openDrawer(); }
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
    g.src=p.img; g.alt=''; g.className='fly-ghost';
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
function openDrawer(){renderDrawer();$('#overlay').classList.add('open');$('#drawer').classList.add('open');}
function closeDrawer(){$('#overlay').classList.remove('open');$('#drawer').classList.remove('open');}
function renderDrawer(){
  const box=$('#ditems');
  const ids=Object.keys(CART);
  if(!ids.length){box.innerHTML='<div class="empty">Your bag is empty.<br>Go grab some chaska! 🍪</div>';}
  else box.innerHTML=ids.map(id=>{
    const p=PRODUCTS.find(x=>x.id==id); if(!p)return '';
    const img=p.img?`<img src="${p.img}">`:'<div style="font-size:36px">🍪</div>';
    return `<div class="ditem">${img}<div class="di"><div class="din">${esc(p.name)}</div>
    <div class="dip">${fmt(p.price)} each</div></div>
    <div class="qty"><button onclick="chQty(${id},-1)">−</button><b>${CART[id]}</b><button onclick="chQty(${id},1)">+</button></div></div>`;
  }).join('');
  const sub=cartSubtotal();
  $('#dfoot').innerHTML=`<div class="drow total"><span>Total</span><span>${fmt(sub)}</span></div>
  <button class="checkoutbtn" ${ids.length?'':'disabled'} onclick="location.href='checkout.html'">Continue to checkout</button>`;
}
function chQty(id,d){CART[id]=(CART[id]||0)+d;if(CART[id]<=0)delete CART[id];saveCart();}

/* ---------- Ask ChaskaBox AI (FAQ assistant) ---------- */
const AI_QA=[
 {q:'Delivery kitne din mein hogi?',k:['deliver','din','kitne','time','pohnch','kab'],a:'All over Pakistan 4–7 din mein delivery hoti hai. 🚚 Order ke waqt aapko estimated dates bhi dikhai deti hain.'},
 {q:'Delivery charges kya hain?',k:['charge','fee','delivery charges','kitna'],a:'COD par Rs. 300 delivery fee hai. JazzCash advance par Rs. 5,000 ya zyada ke order par delivery BILKUL FREE hai — is se kam par Rs. 300.'},
 {q:'Payment kaise karun?',k:['payment','pay','pese','paise','jazzcash','easypaisa','cod'],a:'Do tareeqe hain: 1) Cash on Delivery — saman milne par cash dein, 2) JazzCash advance — checkout par QR scan karein ya Till ID 981716438 par bhejein.'},
 {q:'JazzCash par paise kaise bhejun?',k:['jazzcash','till','qr','advance','bhejun','send'],a:'Checkout par JazzCash select karein — QR code scan karein ya Till ID 981716438 par amount bhejein, phir order place karein. Rs. 5,000+ par delivery FREE! ✅'},
 {q:'Order kaise track karun?',k:['track','status','order number','kahan'],a:'Order ke baad aapko order number milta hai (jaise CB-041026-00001). WhatsApp 0332-0005381 par order number bhej kar status pooch sakte hain.'},
 {q:'Order number kya hai?',k:['order number','number'],a:'Har order par ek unique number milta hai, jaise CB-041026-00001. Ye confirmation screen par aur email mein hota hai — isi se aapka order track hota hai.'},
 {q:'Kya products original hain?',k:['original','asli','fake','naqli','brand'],a:'Ji haan! 100% original market brands — Hilal, Kolson, Mayfair, Candyland waghera. Koi copy nahi. ✅'},
 {q:'Return ya exchange policy?',k:['return','exchange','wapsi','damage','kharab','ghalat'],a:'Ghalat ya damage item mile to 48 ghante ke andar WhatsApp 0332-0005381 par rabta karein — tasveer bhej dein, hum foran hal nikalenge.'},
 {q:'Bulk ya bara order kar sakta hun?',k:['bulk','bara','wholesale','zyada','dokan','shop'],a:'Ji bilkul! Bara order ya dokan ke liye WhatsApp 0332-0005381 par rabta karein — hum khaas rate laga denge. 📦'},
 {q:'Best seller kaun se hain?',k:['best','seller','mashhoor','popular','famous'],a:'Chocolates & Candies aur Snacks & Nimco hamari sab se popular categories hain! Shop page par "SALE" badge wali deals bhi zaroor dekhein. 🔥'},
 {q:'Naye products kab aate hain?',k:['naye','new','arrival','kab'],a:'Naye snacks waqtan-fa-waqtan add hote rehte hain. Page refresh kar ke "All Snacks" dekhein — ya WhatsApp par poochein! 🆕'},
 {q:'Address ghalat likh diya, kya karun?',k:['address','ghalat','pata','change','tabdeel'],a:'Fikar na karein! Foran WhatsApp 0332-0005381 par apna order number aur sahi address bhej dein — dispatch se pehle hum update kar denge.'},
 {q:'Gift wrap ya tohfa ke liye?',k:['gift','tohfa','wrap','present'],a:'Kisi ko tohfa bhejna hai? Order notes mein likh dein ya WhatsApp par bata dein — hum khubsurat packing kar denge! 🎁'},
 {q:'Payment mein masla ho gaya?',k:['masla','problem','fail','error','payment mein'],a:'Payment fail ho jaye to pareshan na hon — dobara try karein ya COD select kar lein. Phir bhi masla ho to WhatsApp 0332-0005381 par rabta karein.'}
];
function aiReply(text){
  const t=text.toLowerCase().trim();
  // Greetings & small talk
  const greetings=[
    {k:['salam','assalam','hello','hi ','hey','aoa'],a:'Walaikum Assalam! 😊 Main ChaskaBox AI hun. Kya dhoond rahe hain? Product ka naam likhein ya category batayein!'},
    {k:['kia hal','kya hal','hal hai','how are you','kesay ho','kese ho'],a:'Main bilkul theek hun, shukriya poochne ka! 😊 Aap sunayein? Koi snack chahiye to naam likhein — main dhoond dunga!'},
    {k:['shukriya','thanks','thank you','meherbani'],a:'Khush amdeed! 😊 Aur kuch chahiye to batayein!'},
    {k:['allah hafiz','bye','khuda hafiz','alvida'],a:'Allah Hafiz! 👋 Phir zaroor aayiyega!'},
    {k:['tum kaun','who are you','ap kaun','your name'],a:'Main ChaskaBox ka AI shopping assistant hun! 🤖 Products dhoondne mein madad karta hun. Kya chahiye?'},
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
  return best?{text:best.a}:{text:'Hmm, ye sawal samajh nahi aaya. 🤔 Product ka naam likhein (jaise "chocolate") ya WhatsApp 0332-0005381 par poochein!'};
}
function searchProductsAI(q){
  // Skip if it's clearly a FAQ question
  const faqWords=['delivery','payment','return','refund','address','order','track','cash','jazzcash','cod','whatsapp','gift','discount','offer','sale'];
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
      <img src="${p.img||'images/placeholder.png'}" alt="${esc(p.name)}" loading="lazy">
      <div class="aipname">${esc(p.name)}</div>
      <div class="aipprice">Rs. ${p.price}</div>
      <button class="aipadd" onclick="addToCart(${p.id})">Add +</button>
    </div>`).join('')+'</div>';
}
function toggleAI(open){
/* ---------- customer account (placeholder) ---------- */
function toggleAccount(){
  alert('Customer accounts jald aa rahe hain! 🚧\n\nAbhi ke liye checkout par apna naam/number dein.');
}
  const m=$('#aimodal');
  if(open===undefined) m.classList.toggle('open');
  else m.classList.toggle('open',!!open);
  if(m.classList.contains('open')&&!$('#aibody').children.length) renderAIQA();
}
function renderAIQA(){
  $('#aibody').innerHTML='<div class="amsg bot">Salam! 👋 Main ChaskaBox AI hun. Neeche sawal chunein ya apna sawal likhein:</div>'+
    AI_QA.map((x,i)=>`<button class="aq" onclick="askAI(${i})">${esc(x.q)}</button>`).join('');
}
function aiSay(user,bot){
  $('#aibody').innerHTML+=`<div class="amsg user">${esc(user)}</div><div class="amsg bot">${bot}</div>`;
  $('#aibody').scrollTop=$('#aibody').scrollHeight;
}
function askAI(i){
  const x=AI_QA[i];
  aiSay(x.q,esc(x.a));
}
function askAIFree(){
  const inp=$('#aiq'),v=(inp.value||'').trim();
  if(!v) return;
  inp.value='';
  const r=aiReply(v);
  if(r.products&&r.products.length){
    aiSay(v,'Ye rahe matching products! 👇<br>'+aiProductCards(r.products));
  }else{
    aiSay(v,esc(r.text||r));
  }
}

/* ---------- promo rotation ---------- */
const PROMOS=['100% original packs','🚚 4-7 din mein delivery','💰 COD available','🎁 Bundle boxes par discount'];
let promoIdx=0;
function initPromo(){
  const el=document.getElementById('promoMsg');
  if(!el) return;
  setInterval(()=>{
    el.classList.add('fading');
    setTimeout(()=>{
      promoIdx=(promoIdx+1)%PROMOS.length;
      el.textContent=PROMOS[promoIdx];
      el.classList.remove('fading');
    },350);
  },4000);
}

/* ---------- animations: scroll reveals, hero tilt ---------- */
let revealObs=null;
function initReveals(){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  revealObs=new IntersectionObserver(entries=>{
    entries.forEach(en=>{
      if(en.isIntersecting){
        en.target.classList.add('in');
        setTimeout(()=>{en.target.style.transitionDelay='';},700);
        revealObs.unobserve(en.target);
      }
    });
  },{threshold:.08,rootMargin:'0px 0px -30px 0px'});
}
function observeReveals(scope){
  if(!revealObs) return;
  (scope||document).querySelectorAll('.reveal:not(.in)').forEach(el=>revealObs.observe(el));
}
function initTilt(){
  if(!matchMedia('(pointer:fine)').matches) return;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const hero=$('.hero'), col=$('#heroCollage');
  if(!hero||!col) return;
  hero.addEventListener('mousemove',e=>{
    const r=hero.getBoundingClientRect();
    const x=(e.clientX-r.left)/r.width-.5, y=(e.clientY-r.top)/r.height-.5;
    col.style.transform=`rotateY(${(x*12).toFixed(2)}deg) rotateX(${(-y*10).toFixed(2)}deg)`;
  });
  hero.addEventListener('mouseleave',()=>{col.style.transform='';});
}

/* ---------- init ---------- */
document.addEventListener('DOMContentLoaded',async()=>{
  loadCart(); await loadProducts(); updateBadge();
  initReveals(); initTilt(); initPromo();
  showView('home');
  observeReveals();
  if(window.syncThemeIcons) window.syncThemeIcons();
});

/* ---------- mobile nav drawer ---------- */
function toggleMnav(force){
  const m=$('#mnav'); if(!m) return;
  const open=force!==undefined?force:!m.classList.contains('open');
  m.classList.toggle('open',open);
  $('#overlay').classList.toggle('open',open&&!$('#drawer').classList.contains('open'));
  if(open) renderMnav();
}
function closeMnav(){const m=$('#mnav');if(m)m.classList.remove('open');if(!$('#drawer').classList.contains('open'))$('#overlay').classList.remove('open');}
function renderMnav(){
  const cats={}; activeProducts().forEach(p=>{cats[p.category]=cats[p.category]||[];cats[p.category].push(p);});
  const order=['',...CAT_ORDER.filter(c=>cats[c]&&cats[c].length)];
  $('#mnavList').innerHTML=order.map(c=>`<a href="#" onclick="goShop('${esc(c)}');return false">${c===''?'🏠 All Products':esc(c)}</a>`).join('');
}
