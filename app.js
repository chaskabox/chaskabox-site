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
  const img=p.img?`<img src="${p.img}" alt="${esc(p.name)}" loading="lazy">`:`<div class="noimg">🍪</div>`;
  const badge=p.badge?`<span class="badge ${p.badge==='Bestseller'?'bestseller':''}">${esc(p.badge==='Sale'?'Sale':p.badge.toUpperCase())}</span>`:'';
  const old=p.oldPrice&&p.oldPrice>p.price?`<span class="oldprice">${fmt(p.oldPrice)}</span>`:'';
  const stars=p.rating?`<div class="stars">${'★'.repeat(Math.round(p.rating))}${'☆'.repeat(5-Math.round(p.rating))}<span>(${p.reviews||0})</span></div>`:'';
  const catlabel=p.category?`<div class="pcat">${esc(p.category)}</div>`:'';
  const packhead=p.pack?`<div class="pimgpack">${esc(p.pack.toUpperCase())}</div>`:'';
  return `<div class="card">${badge}
    <div class="pimg" onclick="openProduct(${p.id})">${packhead}${img}</div>
    <div class="pbody">
      ${catlabel}
      <div class="pname" onclick="openProduct(${p.id})">${esc(p.name)}</div>
      <div class="ppack">${esc(p.pack||'')}</div>
      ${stars}
      <div class="dbox"><b>Delivery Details</b><small>Estimated Delivery Dates<br><span class="ddates">${deliveryRange()}</span></small></div>
      <div class="prow"><div><span class="price">${fmt(p.price)}</span>${old}</div>
      <button class="addbtn" aria-label="Add to bag" onclick="addToCart(${p.id},1,this)">+</button></div>
    </div></div>`;
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

/* ---------- home ---------- */
const CAT_STYLE={
  'All':{icon:'🍬',bg:'#f2b705'},
  'Biscuits & Wafers':{icon:'🍪',bg:'#8a5a2b'},
  'Bunties & Cakes':{icon:'🧁',bg:'#9b7ed9'},
  'Chews & Gums':{icon:'🍬',bg:'#2a9d8f'},
  'Chocolates & Candies':{icon:'🍫',bg:'#a83232'},
  'Imli & Ice Lollies':{icon:'🍭',bg:'#e8722a'},
  'Jellies & Marshmallow':{icon:'🍮',bg:'#d46a8a'},
  'Snacks & Nimco':{icon:'🍿',bg:'#d9a441'},
  'Betel Nuts & Pan Masala':{icon:'🌿',bg:'#3d8b5f'},
  'Bundles':{icon:'🎁',bg:'#3b6fd4'}
};
const BAND_COLORS={
  'Biscuits & Wafers':'#5f8f5b',
  'Bunties & Cakes':'#8a6d4a',
  'Bundles':'#d9a03a',
  'Chews & Gums':'#2a9d8f',
  'Chocolates & Candies':'#93342e',
  'Imli & Ice Lollies':'#d97b2f',
  'Jellies & Marshmallow':'#c65d7b',
  'Snacks & Nimco':'#c9932b',
  'Betel Nuts & Pan Masala':'#4e7d4e'
};
const CAT_ORDER=['Bundles','Snacks & Nimco','Chocolates & Candies','Biscuits & Wafers','Bunties & Cakes','Chews & Gums','Jellies & Marshmallow','Imli & Ice Lollies','Betel Nuts & Pan Masala'];
function renderHome(){
  const act=activeProducts();
  // categories
  const cats={};
  act.forEach(p=>{cats[p.category]=cats[p.category]||[];cats[p.category].push(p);});
  // category tiles: product photo circles (real images, colored fallback)
  const allCount=act.length;
  const tileOrder=['All',...Object.keys(cats).sort().filter(c=>c!=='All')];
  const firstImg=list=>{const f=list.find(p=>p.img);return f?f.img:null;};
  // ensure 'All' pseudo-category first
  $('#catTiles').innerHTML=tileOrder.map(c=>{
    const st=CAT_STYLE[c]||{icon:'🛍️',bg:'#8a94a6'};
    const list=c==='All'?act:(cats[c]||[]);
    const n=c==='All'?allCount:list.length;
    if(c!=='All'&&!n) return '';
    const src=firstImg(list);
    const inner=src?`<img src="${src}" alt="${esc(c)}" loading="lazy">`:`<span class="ci-emoji">${st.icon}</span>`;
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
    <div class="shelfband" style="background:${color}">
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
  // stagger reveals for grid cards
  if(revealObs){
    $$('#shopGrid .card').forEach((c,i)=>{
      c.classList.add('reveal');
      c.style.transitionDelay=((i%8)*45)+'ms';
    });
  }
  observeReveals();
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
    <button class="add" style="padding:12px 26px;font-size:15px" onclick="addToCart(${p.id},+document.getElementById('mqty').textContent,this);closeModal()">Add to Bag</button>
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
function addToCart(id,qty,el){ if(el) flyToCart(el,id); CART[id]=(CART[id]||0)+qty; saveCart(); popBadge(); openDrawer(); }
function popBadge(){ $$('.cartcount').forEach(e=>{ e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); }); }
/* fly-to-cart: product image flies to the bag icon */
function flyToCart(el,id){
  try{
    if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const p=PRODUCTS.find(x=>x.id===id);
    const target=document.querySelector('.hbtn.solid');
    const imgEl=el.closest('.card')?.querySelector('.pimg img')||el.closest('.mbox')?.querySelector('.pimg img');
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
  const t=text.toLowerCase();
  let best=null,bestScore=0;
  AI_QA.forEach(x=>{
    let s=0;
    x.k.forEach(k=>{ if(t.includes(k)) s+=k.length; });
    if(s>bestScore){bestScore=s;best=x;}
  });
  return best?best.a:'Hmm, ye sawal samajh nahi aaya. 🤔 Aap WhatsApp 0332-0005381 par pooch sakte hain — ya neeche diye gaye sawalon mein se chunein!';
}
function toggleAI(open){
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
  aiSay(v,esc(aiReply(v)));
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
  initReveals(); initTilt();
  showView('home');
  observeReveals();
  if(window.syncThemeIcons) window.syncThemeIcons();
});
