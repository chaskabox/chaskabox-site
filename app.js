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

/* ---------- cards ---------- */
function cardHTML(p){
  const img=p.img?`<img src="${p.img}" alt="${esc(p.name)}" loading="lazy">`:`<div class="noimg">🍪</div>`;
  const badge=p.badge?`<span class="badge ${p.badge==='Bestseller'?'bestseller':''}">${esc(p.badge)}</span>`:'';
  const old=p.oldPrice?`<span class="oldprice">${fmt(p.oldPrice)}</span>`:'';
  return `<div class="card">${badge}
    <div class="pimg" onclick="openProduct(${p.id})">${img}</div>
    <div class="pbody">
      <div class="pname" onclick="openProduct(${p.id})">${esc(p.name)}</div>
      <div class="ppack">${esc(p.pack||'')}</div>
      <div class="prow"><div><span class="price">${fmt(p.price)}</span>${old}</div>
      <button class="add" onclick="addToCart(${p.id},1)">Add</button></div>
    </div></div>`;
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

/* ---------- home ---------- */
const CAT_ICONS={'Biscuits & Wafers':'🍪','Bunties & Cakes':'🧁','Chews & Gums':'🍬','Chocolates & Candies':'🍫','Imli & Ice Lollies':'🍭','Jellies & Marshmallow':'🫧','Snacks & Nimco':'🍿','Betel Nuts & Pan Masala':'🌿','Bundles':'🎁'};
function renderHome(){
  const act=activeProducts();
  // categories
  const cats={};
  act.forEach(p=>{cats[p.category]=cats[p.category]||[];cats[p.category].push(p);});
  $('#catTiles').innerHTML=Object.keys(cats).sort().map(c=>
    `<div class="cat" onclick="goShop('${esc(c)}')"><div class="ci">${CAT_ICONS[c]||'🛍️'}</div><b>${esc(c)}</b><small>${cats[c].length} items</small></div>`).join('');
  // shelves: sale + a few categories
  let html='';
  const sale=act.filter(p=>p.oldPrice&&p.oldPrice>p.price).slice(0,10);
  if(sale.length) html+=shelf('🔥 Sale Picks',sale);
  ['Snacks & Nimco','Chocolates & Candies','Biscuits & Wafers'].forEach(c=>{
    const list=(cats[c]||[]).slice(0,10);
    if(list.length) html+=shelf(c,list);
  });
  $('#shelves').innerHTML=html;
}
function shelf(title,items){
  return `<div class="section"><div class="stitle"><h2>${esc(title)}</h2><a href="#" onclick="goShop('');return false">View all →</a></div>
  <div class="grid">${items.map(cardHTML).join('')}</div></div>`;
}

/* ---------- shop ---------- */
let shopState={q:'',cat:'',sort:'pop'};
function goShop(cat){
  shopState.cat=cat||''; shopState.q='';
  showView('shop'); renderShop();
  window.scrollTo(0,0);
}
function renderShop(){
  let list=activeProducts();
  const {q,cat,sort}=shopState;
  if(cat) list=list.filter(p=>p.category===cat);
  if(q){const n=q.toLowerCase();list=list.filter(p=>(p.name+' '+(p.pack||'')).toLowerCase().includes(n));}
  if(sort==='lo')list=[...list].sort((a,b)=>a.price-b.price);
  else if(sort==='hi')list=[...list].sort((a,b)=>b.price-a.price);
  else if(sort==='az')list=[...list].sort((a,b)=>a.name.localeCompare(b.name));
  const cats=[...new Set(activeProducts().map(p=>p.category))].sort();
  $('#shopFilters').innerHTML=`
    <input type="text" id="fq" placeholder="Search snacks..." value="${esc(q)}" oninput="shopState.q=this.value;renderShopList()">
    <select onchange="shopState.cat=this.value;renderShopList()">
      <option value="">All categories</option>
      ${cats.map(c=>`<option ${c===cat?'selected':''} value="${esc(c)}">${esc(c)}</option>`).join('')}
    </select>
    <select onchange="shopState.sort=this.value;renderShopList()">
      <option value="pop" ${sort==='pop'?'selected':''}>Sort: Popular</option>
      <option value="lo" ${sort==='lo'?'selected':''}>Price: Low → High</option>
      <option value="hi" ${sort==='hi'?'selected':''}>Price: High → Low</option>
      <option value="az" ${sort==='az'?'selected':''}>Name A–Z</option>
    </select>
    <span class="cnt">${list.length} products</span>`;
  renderShopList(list);
  const fq=$('#fq'); if(fq){fq.focus();fq.setSelectionRange(fq.value.length,fq.value.length);}
}
function renderShopList(list){
  list=list||filteredShop();
  $('#shopGrid').innerHTML=list.length?list.map(cardHTML).join(''):`<div class="empty">No products found. Try another search.</div>`;
  const cnt=$('#shopFilters .cnt'); if(cnt)cnt.textContent=list.length+' products';
}
function filteredShop(){
  let list=activeProducts();const{q,cat,sort}=shopState;
  if(cat)list=list.filter(p=>p.category===cat);
  if(q){const n=q.toLowerCase();list=list.filter(p=>(p.name+' '+(p.pack||'')).toLowerCase().includes(n));}
  if(sort==='lo')list=[...list].sort((a,b)=>a.price-b.price);
  else if(sort==='hi')list=[...list].sort((a,b)=>b.price-a.price);
  else if(sort==='az')list=[...list].sort((a,b)=>a.name.localeCompare(b.name));
  return list;
}

/* ---------- product modal ---------- */
function openProduct(id){
  const p=PRODUCTS.find(x=>x.id===id); if(!p)return;
  const img=p.img?`<img src="${p.img}" alt="">`:`<div class="noimg" style="font-size:80px">🍪</div>`;
  const old=p.oldPrice?`<span class="oldprice">${fmt(p.oldPrice)}</span>`:'';
  $('#mbody').innerHTML=`<div class="mgrid">
    <div class="pimg">${img}</div>
    <div><h2 style="color:var(--navy);font-size:20px;margin-bottom:6px">${esc(p.name)}</h2>
    <div class="ppack" style="margin-bottom:8px">${esc(p.pack||'')} · ${esc(p.category)}</div>
    <div style="margin-bottom:10px"><span class="price" style="font-size:22px">${fmt(p.price)}</span>${old}</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:14px">${esc(p.desc||'')}</p>
    <div class="qty" style="margin-bottom:12px"><button onclick="mQty(-1)">−</button><b id="mqty">1</b><button onclick="mQty(1)">+</button></div>
    <button class="add" style="padding:12px 26px;font-size:15px" onclick="addToCart(${p.id},+document.getElementById('mqty').textContent);closeModal()">Add to Bag</button>
    </div></div>`;
  $('#pmodal').classList.add('open');
}
function mQty(d){const e=$('#mqty');e.textContent=Math.max(1,+e.textContent+d);}
function closeModal(){$('#pmodal').classList.remove('open');}

/* ---------- views ---------- */
function showView(v){
  $('#view-home').style.display=v==='home'?'':'none';
  $('#view-shop').style.display=v==='shop'?'':'none';
  if(v==='home')renderHome(); if(v==='shop')renderShop();
}

/* ---------- cart ---------- */
function loadCart(){try{CART=JSON.parse(localStorage.getItem('chaskabox-cart')||'{}');}catch(e){CART={};}}
function saveCart(){localStorage.setItem('chaskabox-cart',JSON.stringify(CART));updateBadge();renderDrawer();}
function addToCart(id,qty){CART[id]=(CART[id]||0)+qty;saveCart();openDrawer();}
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
    <div class="dip">${fmt(p.price)} × ${CART[id]} = <b>${fmt(p.price*CART[id])}</b></div></div>
    <div class="qty"><button onclick="chQty(${id},-1)">−</button><b>${CART[id]}</b><button onclick="chQty(${id},1)">+</button></div></div>`;
  }).join('');
  const sub=cartSubtotal();
  $('#dfoot').innerHTML=`<div class="drow"><span>Subtotal</span><span>${fmt(sub)}</span></div>
  <div class="drow"><span>Delivery</span><span style="font-size:12px;color:var(--muted)">at checkout</span></div>
  <div class="drow total"><span>Total</span><span>${fmt(sub)}</span></div>
  <button class="checkoutbtn" ${ids.length?'':'disabled'} onclick="location.href='checkout.html'">Checkout →</button>`;
}
function chQty(id,d){CART[id]=(CART[id]||0)+d;if(CART[id]<=0)delete CART[id];saveCart();}

/* ---------- init ---------- */
document.addEventListener('DOMContentLoaded',async()=>{
  loadCart(); await loadProducts(); updateBadge();
  const hs=$('#hsearch'); if(hs)hs.addEventListener('input',e=>{shopState.q=e.target.value;shopState.cat='';showView('shop');renderShop();});
  showView('home');
});
