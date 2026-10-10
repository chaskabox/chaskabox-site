(() => {
  'use strict';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>`Rs. ${Number(n||0).toLocaleString('en-PK')}`;
  const fmtDate=v=>{try{return new Date(v).toLocaleString('en-PK',{dateStyle:'medium',timeStyle:'short'})}catch{return String(v||'')}};
  let session=null, me=null, products=[], orders=[];

  async function ensureClient(){ if(typeof initSupabase!=='function') return false; return await initSupabase(); }
  async function token(){ if(!SB) return ''; const {data}=await SB.auth.getSession(); session=data?.session||null; return session?.access_token||''; }
  async function api(path,{method='GET',body,headers={}}={},_retried){
    const t=await token();
    if(!t){ const e=new Error('Sign in required'); e.status=401; throw e; }
    const h={Authorization:`Bearer ${t}`,...headers}; let payload=body;
    if(body!==undefined && !(body instanceof FormData)){h['Content-Type']='application/json';payload=JSON.stringify(body);}
    let r;
    try{ r=await fetch(path,{method,headers:h,body:payload}); }
    catch(netErr){ const e=new Error('Network error — check connection and retry'); e.status=0; throw e; }
    // Stale access-token race: the stored token may have expired just before this
    // call. Refresh once and retry so a valid session is never mistaken for signed-out.
    if(r.status===401 && !_retried && typeof SB!=='undefined' && SB){
      try{
        const {data:rd}=await SB.auth.refreshSession();
        if(rd && rd.session && rd.session.access_token){ session=rd.session; return await api(path,{method,body,headers},true); }
      }catch(e){/* fall through to the 401 error below */}
    }
    const text=await r.text(); let data={}; try{data=text?JSON.parse(text):{}}catch{data={raw:text}};
    if(!r.ok){ const e=new Error(data?.error?.message||data?.error||`Request failed (${r.status})`); e.status=r.status; e.code=data?.error?.code; throw e; }
    return data;
  }
  window.chaskaAdminApi=api;
  function toast(msg){const el=$('#adminToast'); if(!el)return; el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2500);}
  function showLogin(message='Sign in with an approved staff account.'){
    hideBoot(); // bootstrap gate off — the login form is the only thing shown now
    let el=$('#liveAdminLogin'); if(!el){el=document.createElement('div');el.id='liveAdminLogin';el.className='live-admin-login';document.body.appendChild(el);} el.hidden=false;
    el.innerHTML=`<form class="live-login-card" id="liveLoginForm"><img src="/images/logo-navy.png" alt="ChaskaBox"><span class="eyebrow">SECURE ADMIN</span><h1>Staff sign in</h1><p>${esc(message)}</p><label>Email<input id="liveEmail" type="email" autocomplete="username" required></label><label>Password<input id="livePassword" type="password" autocomplete="current-password" required></label><div id="liveLoginError" class="live-error" hidden></div><button class="btn primary" type="submit">Sign in</button><a href="/" class="text-btn">← Storefront</a></form>`;
    $('#liveLoginForm').onsubmit=async e=>{e.preventDefault();const err=$('#liveLoginError');err.hidden=true;try{if(!(await ensureClient()))throw new Error('Supabase public configuration unavailable');const res=await SB.auth.signInWithPassword({email:$('#liveEmail').value.trim(),password:$('#livePassword').value});if(res.error)throw res.error;session=res.data.session;await bootAuthenticated();el.hidden=true;}catch(x){err.textContent=x.message||'Sign-in failed';err.hidden=false;}};
  }
  async function getMe(){ return await api('/api/admin/me'); }
  function roleAllows(...roles){return me&&roles.includes(me.role)}
  function wireNav(){
    $$('.admin-nav-btn').forEach(btn=>btn.addEventListener('click',()=>setTimeout(()=>{ $('#adminSidebar').classList.remove('open'); $('#sidebarBackdrop')?.classList.remove('show'); loadView(btn.dataset.view); },0),true));
  }
  async function loadView(name){
    try{
      if(name==='orders') await loadOrders();
      if(name==='analytics' && roleAllows('owner','manager')) await loadAnalytics();
      if(name==='coupons' && roleAllows('owner','manager')) await loadCoupons();
      if(name==='shipping' && roleAllows('owner','manager')) await loadShipping();
      if(name==='resolutions' && roleAllows('owner','manager')) await loadResolutions();
      if(name==='customers' && roleAllows('owner','manager')) await loadCustomers();
      if(name==='reviews' && roleAllows('owner','manager','content')) await loadReviews();
      if(name==='homepage' && roleAllows('owner','manager','content')) await loadHomepage();
      if(name==='media' && roleAllows('owner','manager','content')) await loadMedia();
      if(name==='settings' && roleAllows('owner')) await loadSettings();
      if(name==='security' && roleAllows('owner')) await loadSecurity();
      if(name==='products' && roleAllows('owner','manager','content')) await loadProducts();
      if(name==='boxes' && roleAllows('owner','manager','content')) await enableBoxBuilder();
      if(name==='categories' && roleAllows('owner','manager','content')) await loadCategories();
      if(name==='studio' && roleAllows('owner','manager','content')) initImageStudio();
      if(name==='theme' && roleAllows('owner','manager')) await loadTheme();
      if(name==='brands' && roleAllows('owner','manager','content')) await loadBrands();
      if(name==='navigation' && roleAllows('owner','manager','content')) await loadNavigation();
      if(name==='notifications' && roleAllows('owner','manager')) await loadNotifications();
      if(name==='health' && roleAllows('owner','manager')) await loadHealth();
      if(name==='assistant' && roleAllows('owner','manager','content')) await loadAICenter();
    }catch(e){
      // Session died mid-use: send back to the staff login instead of showing dead views.
      if(e && e.status===401){ try{await SB?.auth?.signOut();}catch(se){} showLogin(); return; }
      toast(e.message);
    }
  }
  /* ============ AUTH BOOTSTRAP GATE ============
     The #adminBoot overlay covers the shell until the staff session is verified.
     Signed-out visitors see only the overlay or the staff login form — never
     misleading empty/stale admin data. */
  let bootDone=false;
  function hideBoot(){ const b=$('#adminBoot'); if(b) b.style.display='none'; bootDone=true; try{window.chaskaAdminBooted=true;}catch(e){} }
  function showBootError(msg){
    bootDone=true;
    const b=$('#adminBoot'); if(!b) return;
    b.innerHTML=`<div class="admin-boot-card"><div class="spinner"></div><p>${esc(msg)}</p><button class="btn primary" onclick="location.reload()">Reload</button></div>`;
  }
  async function bootAuthenticated(){
    let fresh=false;
    try{
      // Proactively refresh so a just-expired access token never fails the first check.
      try{ const {data:rd}=await SB.auth.refreshSession(); if(rd?.session?.access_token){ session=rd.session; fresh=true; } }catch(e){}
      if(!fresh){ const {data}=await SB.auth.getSession(); session=data?.session||null; }
      me=await getMe();
    }catch(e){
      // A network blip must NEVER destroy a valid session — only real auth
      // failures (401/403) sign out. Anything else shows a retry state.
      if(e && e.status===0){ showBootError('Could not reach the server. Check your connection and reload.'); return; }
      try{ await SB?.auth?.signOut(); }catch(se){}
      hideBoot();
      showLogin(e && e.status===403 ? 'This account is not authorized for the ChaskaBox admin panel.' : undefined);
      return;
    }
    $('#backendState').className='backend-state'; $('#backendState').innerHTML=`<span></span><b>Live backend</b><small>${esc(me.role)} · authenticated</small>`;
    $('#securityNotice').className='security-notice live'; $('#securityNotice').innerHTML=`<strong>Live secure mode:</strong> authenticated as <b>${esc(me.role)}</b>. Every write is re-authorized server-side and audited.`;
    const foot=$('.admin-sidebar-foot'); if(foot&&!$('#adminSignOut')) foot.insertAdjacentHTML('beforeend','<button class="text-btn" id="adminSignOut">Sign out</button>');
    $('#adminSignOut')?.addEventListener('click',async()=>{await SB.auth.signOut();location.reload()});
    wireNav(); wireOrderFilters(); wireLiveProductEditor(); wireHomepage(); wireMedia(); wireSettings(); wireBoxLive();
    hideBoot(); // session verified — reveal the console; views show their own loaders
    await Promise.allSettled([loadDashboard(),loadProducts()]);
    // Boot legacy admin.js catalogue UI now that we are authenticated.
    try{ await window.chaskaAdminDataBoot?.(); }catch(e){}
    const hash=location.hash||''; if(hash.startsWith('#order-')){ const id=hash.slice(7); document.querySelector('[data-view="orders"]')?.click(); setTimeout(()=>openOrder(id),250); }
  }

  async function loadDashboard(){
    let attention={counts:{},needs_attention:[]}, od={orders:[]}, metrics={}, boxes={boxes:[],total:0};
    try{
      [attention,od,metrics,boxes]=await Promise.all([api('/api/admin/attention'),api('/api/admin/orders?per_page=100'),api('/api/admin/metrics?days=30'),api('/api/admin/boxes?per_page=1')]);
    }catch(e){ console.warn('[dashboard] API error', e); }
    const dashOrders=od.orders||[];
    $('#metricOrders').textContent=attention.counts?.new_orders ?? dashOrders.filter(o=>o.fulfilment_status==='new').length ?? 0;
    $('#metricRevenue').textContent=money(metrics.recognized_sales_pkr||0);
    const mb=$('#metricBundles'); if(mb) mb.textContent=boxes.total ?? (boxes.boxes||[]).length ?? '—';
    const revenueCard=$('#metricRevenue')?.closest('.metric-card'); if(revenueCard){const small=revenueCard.querySelector('small');if(small)small.textContent='Recognized sales · 30 days';}
    $('#orderNavCount').textContent=dashOrders.length;
    let panel=$('#needsAttentionPanel'); if(!panel){panel=document.createElement('section');panel.id='needsAttentionPanel';panel.className='panel';$('#view-dashboard').appendChild(panel);} const rows=attention.needs_attention||[];
    panel.innerHTML=`<div class="panel-head"><div><h2>Needs attention</h2><p>Only exceptions that need owner/staff action.</p></div><button class="text-btn" id="refreshAttention">Refresh</button></div>${rows.length?`<div class="attention-list">${rows.slice(0,12).map(x=>`<button class="attention-row" data-open-order="${esc(x.id)}"><span class="attention-dot ${esc(x.reason)}"></span><div><b>${esc(x.order_number)} · ${esc(x.customer_name)}</b><small>${esc(x.reason.replaceAll('_',' '))} · ${x.age_minutes} min · ${money(x.total)}</small></div><span>Open →</span></button>`).join('')}</div>`:'<div class="empty-mini">Nothing urgent right now.</div>'}`;
    $('#refreshAttention')?.addEventListener('click',loadDashboard); $$('[data-open-order]',panel).forEach(b=>b.onclick=()=>openOrder(b.dataset.openOrder));
  }

  function wireOrderFilters(){
    const q=$('#orderSearch'),f=$('#orderStatusFilter'); if(q){q.disabled=false;q.addEventListener('input',debounce(loadOrders,250));} if(f){f.disabled=false;f.innerHTML='<option value="">All fulfilment statuses</option><option value="new">New</option><option value="sourcing">Sourcing</option><option value="packed">Packed</option><option value="dispatched">Dispatched</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option>';f.addEventListener('change',loadOrders);}
    const exportBtn=$('#view-orders .toolbar .btn.secondary'); if(exportBtn){exportBtn.disabled=false;exportBtn.onclick=async()=>{try{const t=await token();const r=await fetch('/api/admin/orders/export.csv',{headers:{Authorization:`Bearer ${t}`}});if(!r.ok)throw new Error('Export failed');const blob=await r.blob();const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='chaskabox-orders.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}catch(e){toast(e.message)}}}
  }
  function debounce(fn,ms){let t;return()=>{clearTimeout(t);t=setTimeout(fn,ms)}}
  async function loadOrders(){
    const q=$('#orderSearch')?.value?.trim()||'', status=$('#orderStatusFilter')?.value||''; const sp=new URLSearchParams({per_page:'50'}); if(q)sp.set('q',q);if(status)sp.set('fulfilment_status',status);
    const data=await api('/api/admin/orders?'+sp);orders=data.orders||[];
    const target=$('#view-orders .empty-backend')||$('#view-orders .live-table-wrap')?.parentElement||$('#orderListWrap');
    if(!target) return;
    target.classList.remove('empty-backend'); target.innerHTML=orders.length?`<div class="live-table-wrap"><table class="live-table"><thead><tr><th>Order</th><th>Customer</th><th>Payment</th><th>Fulfilment</th><th>Total</th><th></th></tr></thead><tbody>${orders.map(o=>`<tr><td><b>${esc(o.order_number)}</b><small>${fmtDate(o.created_at)}</small></td><td>${esc(o.customer_name)}<small>${esc(o.customer_phone)}</small></td><td><span class="status-pill">${esc(o.payment_status)}</span><small>${esc(o.payment_method)}</small></td><td><span class="status-pill ${esc(o.fulfilment_status)}">${esc(o.fulfilment_status)}</span></td><td><b>${money(o.total)}</b></td><td><button class="btn secondary compact" data-order="${esc(o.id)}">Manage</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-mini">No matching orders.</div>';
    $$('[data-order]',target).forEach(b=>b.onclick=()=>openOrder(b.dataset.order));
  }
  async function openOrder(id){
    const data=await api(`/api/admin/orders/${encodeURIComponent(id)}`),o=data.order, items=data.items||[];
    let modal=$('#liveOrderModal'); if(!modal){modal=document.createElement('div');modal.id='liveOrderModal';modal.className='admin-modal';document.body.appendChild(modal);} modal.classList.add('open');
    const flow=['new','sourcing','packed','dispatched','delivered']; const idx=flow.indexOf(o.fulfilment_status); const next=idx>=0&&idx<flow.length-1?flow[idx+1]:null;
    modal.innerHTML=`<div class="modal-backdrop" data-close-order></div><section class="admin-modal-card live-order-card"><div class="modal-head"><div><small>ORDER</small><h2>${esc(o.order_number)}</h2></div><button class="icon-btn" data-close-order>×</button></div><div class="order-detail-grid"><section><h3>Customer</h3><p><b>${esc(o.customer_name)}</b><br>${esc(o.customer_phone)}<br>${esc(o.customer_address)}, ${esc(o.customer_city)}</p><h3>Items</h3><div class="order-items">${items.map(i=>`<div><span>${esc(i.product_name)} · ${esc(i.pack)} × ${i.quantity}</span><b>${money(i.line_total)}</b></div>`).join('')}</div></section><section><h3>Payment</h3><p>${esc(o.payment_method)} · <b>${esc(o.payment_status)}</b>${o.transaction_reference?`<br>Ref: ${esc(o.transaction_reference)}`:''}</p><h3>Total</h3><p>Subtotal ${money(o.subtotal)}<br>Delivery ${money(o.delivery_fee)}<br><b>${money(o.total)}</b></p><h3>Actions</h3><div class="order-actions">${next?`<button class="btn primary" data-status="${next}">Move to ${esc(next)}</button>`:''}${!['delivered','cancelled'].includes(o.fulfilment_status)?'<button class="btn danger" data-status="cancelled">Cancel</button>':''}${['payment_submitted','awaiting_payment'].includes(o.payment_status)?'<button class="btn secondary" data-pay="verified">Verify payment</button><button class="btn secondary" data-pay="rejected">Reject payment</button>':''}<button class="btn secondary" data-retry>Retry notification</button></div><h3>Status history</h3><div class="history-list">${(data.history||[]).map(h=>`<div><b>${esc(h.action)}</b><small>${fmtDate(h.created_at)} · ${esc(h.actor_role)}</small></div>`).join('')||'<small>No audit events yet.</small>'}</div></section></div></section>`;
    $$('[data-close-order]',modal).forEach(x=>x.onclick=()=>modal.classList.remove('open'));
    $$('[data-status]',modal).forEach(b=>b.onclick=async()=>{try{const st=b.dataset.status;let body={fulfilment_status:st};if(st==='cancelled'){const reason=prompt('Cancellation reason (required):');if(!reason)return;body.cancel_reason=reason;}await api(`/api/admin/orders/${id}/status`,{method:'PATCH',body});toast('Order updated');modal.classList.remove('open');await Promise.all([loadOrders(),loadDashboard()]);}catch(e){toast(e.message)}});
    $$('[data-pay]',modal).forEach(b=>b.onclick=async()=>{try{await api(`/api/admin/orders/${id}/payment/verify`,{method:'POST',body:{decision:b.dataset.pay}});toast('Payment updated');modal.classList.remove('open');await Promise.all([loadOrders(),loadDashboard()]);}catch(e){toast(e.message)}});
    $('[data-retry]',modal).onclick=async()=>{try{await api(`/api/admin/orders/${id}/notifications/retry`,{method:'POST',body:{}});toast('Notification queued for retry')}catch(e){toast(e.message)}};
    // Print invoice / packing slip
    const printBar = document.createElement('div');
    printBar.style.cssText = 'display:flex;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)';
    printBar.innerHTML = `<button class="btn secondary" id="printInvoiceBtn">🖨️ Print Invoice</button><button class="btn secondary" id="printPackingBtn">📦 Packing Slip</button>`;
    modal.querySelector('.live-order-card').appendChild(printBar);
    $('#printInvoiceBtn').onclick = () => printInvoice(o, items, false);
    $('#printPackingBtn').onclick = () => printInvoice(o, items, true);
  }

  function printInvoice(o, items, isPacking){
    const w = window.open('', '_blank', 'width=800,height=900');
    const rows = items.map((i,idx)=>`<tr><td>${idx+1}</td><td>${esc(i.product_name)}<br><small>${esc(i.pack||'')}</small></td><td>${i.quantity}</td>${isPacking?'':`<td style="text-align:right">${money(i.line_total)}</td>`}</tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>${isPacking?'Packing Slip':'Invoice'} ${esc(o.order_number)}</title><style>
      body{font-family:Arial,sans-serif;max-width:700px;margin:20px auto;padding:20px;color:#222}
      .head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1a2b5c;padding-bottom:12px;margin-bottom:16px}
      .head h1{margin:0;color:#1a2b5c;font-size:24px}
      table{width:100%;border-collapse:collapse;margin:16px 0}
      th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:14px}
      th{background:#f4f6fb}
      .totals{text-align:right;margin-top:12px}
      .totals p{margin:4px 0}
      .addr{background:#f9fafb;padding:12px;border-radius:8px;margin:12px 0;font-size:14px}
      @media print{.no-print{display:none} body{margin:0}}
    </style></head><body>
      <div class="head"><div><h1>🍬 ChaskaBox</h1><small>Pakistani Snacks · chaskabox.online</small></div><div style="text-align:right"><b>${isPacking?'PACKING SLIP':'INVOICE'}</b><br>${esc(o.order_number)}<br>${new Date(o.created_at).toLocaleDateString('en-PK')}</div></div>
      <div class="addr"><b>Ship to:</b><br>${esc(o.customer_name)}<br>${esc(o.customer_phone)}<br>${esc(o.customer_address)}, ${esc(o.customer_city)}</div>
      <table><tr><th>#</th><th>Item</th><th>Qty</th>${isPacking?'':'<th style="text-align:right">Amount</th>'}</tr>${rows}</table>
      ${isPacking?`<p><b>Total items: ${items.reduce((s,i)=>s+Number(i.quantity||0),0)}</b></p>`:`<div class="totals"><p>Subtotal: ${money(o.subtotal)}</p><p>Delivery: ${money(o.delivery_fee)}</p><p style="font-size:18px"><b>Total: ${money(o.total)}</b></p><p>Payment: ${esc(o.payment_method)} (${esc(o.payment_status)})</p></div>`}
      <p class="no-print" style="margin-top:24px"><button onclick="window.print()" style="padding:10px 24px;font-size:16px;cursor:pointer">🖨️ Print</button></p>
    </body></html>`);
    w.document.close();
  }

  let productPage = 1, productTotalPages = 1, productTotal = 0;
  const PRODUCT_PER_PAGE = 50;
  async function loadProducts(page){
    productPage = page || 1;
    const data=await api(`/api/admin/products?per_page=${PRODUCT_PER_PAGE}&page=${productPage}`); products=data.products||[];
    productTotal = data.total ?? products.length;
    productTotalPages = data.total_pages ?? 1;
    $('#metricProducts').textContent=productTotal; $('#productNavCount').textContent=productTotal;
    renderFilteredProducts();
    renderProductPagination();
  }
  function renderProductPagination(){
    let pag = $('#productPagination');
    if(!pag){
      const grid = $('#productAdminGrid');
      if(!grid) return;
      pag = document.createElement('div');
      pag.id = 'productPagination';
      pag.className = 'admin-pagination';
      grid.after(pag);
    }
    if(productTotalPages <= 1){ pag.innerHTML=''; pag.style.display='none'; return; }
    pag.style.display='flex';
    let btns = '';
    if(productPage > 1) btns += `<button data-pg="${productPage-1}">← Prev</button>`;
    // Page numbers (window of 5)
    const start = Math.max(1, productPage - 2), end = Math.min(productTotalPages, start + 4);
    for(let i=start; i<=end; i++) btns += `<button data-pg="${i}" class="${i===productPage?'active':''}">${i}</button>`;
    if(productPage < productTotalPages) btns += `<button data-pg="${productPage+1}">Next →</button>`;
    pag.innerHTML = `<span>Page ${productPage} of ${productTotalPages} (${productTotal} products)</span><div class="pg-btns">${btns}</div>`;
    pag.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { loadProducts(Number(b.dataset.pg)); window.scrollTo({top:0,behavior:'smooth'}); });
  }
  function getProductFilters(){
    const q=($('#productSearch')?.value||'').trim().toLowerCase();
    const cat=($('#productCategory')?.value||'').trim();
    const vis=$('#productVisibility')?.value||'';
    return {q, cat, vis};
  }
  function renderFilteredProducts(){
    const {q, cat, vis}=getProductFilters();
    const normCat=s=>(s||'').trim();
    const filtered=products.filter(p=>{
      if(vis==='archived' && p.visibility!=='archived') return false;
      if(vis!=='archived' && p.visibility==='archived') return false;
      if(q && !`${p.name||''} ${p.category||''} ${p.pack||''}`.toLowerCase().includes(q)) return false;
      if(cat && normCat(p.category)!==cat) return false;
      if(vis==='visible' && p.visibility!=='visible') return false;
      if(vis==='hidden' && p.visibility!=='hidden') return false;
      if(vis==='bundle' && !p.is_bundle) return false;
      return true;
    });
    const grid=$('#productAdminGrid'); if(!grid)return; grid.innerHTML=filtered.map(p=>`<article class="admin-product-card" data-product-id="${p.id}"><span class="visibility-chip ${p.visibility==='visible'?'':'hidden-product'}">${esc(p.visibility)}</span><div class="admin-product-image">${p.image_url?`<img src="${esc(p.image_url)}" alt="">`:'<span class="placeholder">🍿</span>'}</div><div class="admin-product-body"><h3>${esc(p.name)}</h3><div class="admin-product-meta">${esc(p.category)} · ${esc(p.pack||'')}</div><div class="admin-product-price"><strong>${money(p.price)}</strong>${p.old_price?`<del>${money(p.old_price)}</del>`:''}</div><div class="admin-card-actions"><button data-live-edit="${p.id}">Edit</button><button data-live-vis="${p.id}">${p.visibility==='visible'?'Hide':'Show'}</button></div></div></article>`).join('') || '<div class="panel"><p class="muted">No matching products.</p></div>';
    $('#productResultCount').textContent=`Showing ${filtered.length} of ${products.length} products`; $('#loadMoreProducts').style.display='none';
    $$('[data-live-edit]',grid).forEach(b=>b.onclick=()=>openLiveProduct(b.dataset.liveEdit)); $$('[data-live-vis]',grid).forEach(b=>b.onclick=async()=>{const p=products.find(x=>String(x.id)===String(b.dataset.liveVis));try{await api(`/api/admin/products/${p.id}`,{method:'PATCH',body:{visibility:p.visibility==='visible'?'hidden':'visible'}});toast('Visibility updated');loadProducts()}catch(e){toast(e.message)}});
    // Wire filter inputs to re-render (if not already wired)
    if(!renderFilteredProducts._wired){
      renderFilteredProducts._wired=true;
      ['productSearch','productCategory','productVisibility'].forEach(id=>{
        $('#'+id)?.addEventListener(id==='productSearch'?'input':'change',()=>renderFilteredProducts());
      });
      $('#resetFiltersBtn')?.addEventListener('click',()=>{
        $('#productSearch').value=''; $('#productCategory').value=''; $('#productVisibility').value='';
        renderFilteredProducts();
      });
    }
  }
  function openLiveProduct(id){
    const p=products.find(x=>String(x.id)===String(id)); if(!p)return; $('#editProductId').value=p.id;$('#editName').value=p.name||'';$('#editPrice').value=p.price||'';$('#editOldPrice').value=p.old_price||'';$('#editCategory').value=p.category||'';$('#editPack').value=p.pack||'';$('#editBadge').value=p.badge||'';$('#editVisibility').value=p.visibility==='visible'?'visible':'hidden';$('#editDescription').value=p.description||'';$('#editImage').value=p.image_url||'';$('#editBundle').checked=!!p.is_bundle;
    $('#editSeoTitle').value=p.seo_title||'';$('#editSeoDesc').value=p.seo_description||'';$('#editOgImage').value=p.og_image||'';$('#editCanonical').value=p.canonical_url||'';
    $('#productEditorTitle').textContent='Edit '+p.name;$('#productEditor').classList.add('open');$('#productEditor').setAttribute('aria-hidden','false');
  }
  function wireLiveProductEditor(){
    const form=$('#productForm'); if(!form)return; form.addEventListener('submit',async e=>{if(!me||!roleAllows('owner','manager','content'))return;e.preventDefault();e.stopImmediatePropagation();const id=$('#editProductId').value;const body={name:$('#editName').value.trim(),price:Number($('#editPrice').value||0),old_price:$('#editOldPrice').value?Number($('#editOldPrice').value):null,category:$('#editCategory').value,pack:$('#editPack').value.trim(),badge:$('#editBadge').value,description:$('#editDescription').value.trim(),image_url:$('#editImage').value.trim(),visibility:$('#editVisibility').value,seo_title:$('#editSeoTitle').value.trim()||null,seo_description:$('#editSeoDesc').value.trim()||null,og_image:$('#editOgImage').value.trim()||null,canonical_url:$('#editCanonical').value.trim()||null};try{const saved=id?await api(`/api/admin/products/${id}`,{method:'PATCH',body}):await api('/api/admin/products',{method:'POST',body});const savedId=saved?.product?.id||id;toast('Product saved');$('#productEditor').classList.remove('open');await loadProducts();if(savedId){api('/api/admin/ai-reindex',{method:'POST',body:{product_ids:[Number(savedId)],stale_only:false,limit:1}}).catch(()=>{});}}catch(x){toast(x.message)}},true);
    // Inline AI: improve description
    $('#aiImproveProduct')?.addEventListener('click',async()=>{
      const name=$('#editName').value.trim();
      if(!name){toast('Enter product name first');return;}
      const btn=$('#aiImproveProduct'); const old=btn.textContent; btn.disabled=true; btn.textContent='✦ Thinking…';
      try{
        const data=await api('/api/admin/ai',{method:'POST',body:{task:'product_description',context:{instructions:`Write a concise appetizing description (40-70 words) for: ${name}, ${$('#editCategory').value}, ${$('#editPack').value}. Roman Urdu-friendly tone.`}}});
        const draft=data.draft||'';
        if(confirm(`AI suggestion:\n\n${draft.slice(0,400)}\n\nUse this description? (You can edit it after)`)){
          $('#editDescription').value=draft;
          toast('Description updated — review and Save');
        }
      }catch(e){toast(e.message||'AI unavailable');}
      finally{btn.disabled=false;btn.textContent=old;}
    });
    $('#productHistoryBtn')?.addEventListener('click',()=>{
      const id=$('#editProductId').value;
      if(!id){toast('Save the product first');return;}
      const panel=$('#productHistoryPanel');
      if(panel.style.display==='block'){panel.style.display='none';return;}
      loadProductHistory(id);
    });
    $('#archiveProduct')?.addEventListener('click',async e=>{const id=$('#editProductId').value;if(!id||!me)return;e.preventDefault();e.stopImmediatePropagation();if(!confirm('Archive this product?'))return;try{await api(`/api/admin/products/${id}/archive`,{method:'POST',body:{}});toast('Product archived');$('#productEditor').classList.remove('open');loadProducts()}catch(x){toast(x.message)}},true);
  }

  async function loadCustomers(){
    const d=await api('/api/admin/customers?per_page=100'), view=$('#view-customers');view.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Customers</h2><p>Order history and recognized customer value.</p></div></div><div class="live-table-wrap"><table class="live-table"><thead><tr><th>Name</th><th>Phone</th><th>Orders</th><th>Recognized spend</th><th>Last order</th></tr></thead><tbody>${(d.customers||[]).map(c=>`<tr><td><b>${esc(c.name||'—')}</b></td><td>${esc(c.phone||'—')}</td><td>${c.order_count||0}</td><td>${money(c.lifetime_spend)}</td><td>${esc(c.last_order_number||'—')}<small>${c.last_order_at?fmtDate(c.last_order_at):''}</small></td></tr>`).join('')}</tbody></table></div></div>`;
  }
  async function loadReviews(){
    const d=await api('/api/admin/reviews?per_page=100'),view=$('#view-reviews');view.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Review moderation</h2><p>Only real customer submissions; no fabricated ratings.</p></div></div><div class="review-list">${(d.reviews||[]).map(r=>`<article class="review-admin-row"><div><b>${'★'.repeat(Number(r.rating||0))}</b><p>${esc(r.review_text)}</p><small>${esc(r.moderation_status)}${r.verified_purchase?' · verified purchase':''}</small></div><div>${r.moderation_status==='pending'?`<button class="btn primary compact" data-review="${r.id}" data-review-action="approve">Approve</button><button class="btn secondary compact" data-review="${r.id}" data-review-action="reject">Reject</button>`:''}</div></article>`).join('')||'<div class="empty-mini">No reviews.</div>'}</div></div>`;$$('[data-review]',view).forEach(b=>b.onclick=async()=>{try{await api(`/api/admin/reviews/${b.dataset.review}`,{method:'PATCH',body:{action:b.dataset.reviewAction}});toast('Review updated');loadReviews()}catch(e){toast(e.message)}});
  }
  function wireHomepage(){}
  async function loadHomepage(){
    const d=await api('/api/admin/homepage'),view=$('#view-homepage'); view.innerHTML=`<div class="admin-grid two"><section class="panel"><div class="panel-head"><div><h2>Homepage sections</h2><p>Visibility and headings save immediately; curated product lists publish explicitly.</p></div></div><div class="section-manager">${(d.sections||[]).map(s=>`<div data-home-key="${esc(s.section_key)}"><span class="drag">⋮⋮</span><b>${esc(s.section_key.replaceAll('_',' '))}</b><em>${esc(s.heading||'')}</em><button class="home-toggle ${s.enabled?'on':''}" data-home-toggle="${esc(s.section_key)}">${s.enabled?'On':'Off'}</button></div>`).join('')}</div></section><section class="panel"><div class="panel-head"><div><h2>Edit selected section</h2><p>Save draft, preview, then publish.</p></div></div><label>Section<select id="homeKey">${(d.sections||[]).map(s=>`<option value="${esc(s.section_key)}">${esc(s.section_key)}</option>`).join('')}</select></label><label>Heading<input id="homeHeading"></label><label>Subheading<textarea id="homeSub" rows="4"></textarea></label><label>Featured product IDs <small>(optional, comma-separated)</small><input id="homeProductIds" placeholder="e.g. 30, 54, 179"></label><div class="action-row"><button class="btn secondary" id="homeSave">Save</button>${roleAllows('owner','manager')?'<button class="btn primary" id="homePublish">Publish curated products</button>':''}</div></section></div>`;
    const rows=d.sections||[];function hydrate(){const x=rows.find(r=>r.section_key===$('#homeKey').value)||{};$('#homeHeading').value=x.heading||'';$('#homeSub').value=x.subheading||'';const ids=(x.draft_config?.product_ids||x.config?.product_ids||[]);$('#homeProductIds').value=Array.isArray(ids)?ids.join(', '):'';}hydrate();$('#homeKey').onchange=hydrate;
    $$('[data-home-toggle]',view).forEach(b=>b.onclick=async()=>{const row=rows.find(r=>r.section_key===b.dataset.homeToggle);try{await api('/api/admin/homepage',{method:'PATCH',body:{sections:[{section_key:row.section_key,enabled:!row.enabled}]}});toast('Homepage visibility saved');loadHomepage()}catch(e){toast(e.message)}});
    $('#homeSave').onclick=async()=>{try{const ids=$('#homeProductIds').value.split(',').map(x=>Number(x.trim())).filter(x=>Number.isInteger(x)&&x>0);const current=rows.find(r=>r.section_key===$('#homeKey').value)||{};const draft={...(current.draft_config||current.config||{}),product_ids:ids};await api('/api/admin/homepage',{method:'PATCH',body:{sections:[{section_key:$('#homeKey').value,heading:$('#homeHeading').value.trim(),subheading:$('#homeSub').value.trim(),draft_config:draft}]}});toast('Homepage changes saved; publish curated products when ready');await loadHomepage()}catch(e){toast(e.message)}};
    if($('#homePublish'))$('#homePublish').onclick=async()=>{try{await api('/api/admin/homepage/publish',{method:'POST',body:{keys:[$('#homeKey').value]}});toast('Homepage section published');loadHomepage()}catch(e){toast(e.message)}};
  }

  function wireMedia(){}
  async function loadMedia(){
    const d=await api('/api/admin/media?per_page=100'),view=$('#view-media'); view.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Media library</h2><p>JPEG, PNG, WebP, AVIF · max 5MB · server-sniffed. Upload URLs can be copied straight into a product.</p></div><label class="btn primary media-upload-btn">Upload image<input id="mediaUpload" type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden></label></div><div class="media-grid">${(d.media||[]).map(m=>`<article>${m.url?`<img src="${esc(m.url)}" alt="" loading="lazy">`:'<div class="media-placeholder">▣</div>'}<small>${esc(m.object_path)}</small><b>${Math.round(Number(m.size_bytes||0)/1024)} KB</b>${m.url?`<button class="btn secondary compact" data-copy-media="${esc(m.url)}">Copy URL</button>`:''}</article>`).join('')||'<div class="empty-mini">No uploaded media yet.</div>'}</div></div>`;
    $$('[data-copy-media]',view).forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copyMedia);toast('Image URL copied')}catch{toast('Could not copy URL')}});
    $('#mediaUpload').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;const fd=new FormData();fd.append('file',file);try{const saved=await api('/api/admin/media',{method:'POST',body:fd});if(saved?.url)try{await navigator.clipboard.writeText(saved.url);toast('Image uploaded — URL copied')}catch{toast('Image uploaded')}else toast('Image uploaded');loadMedia()}catch(x){toast(x.message)}};
  }
  function wireSettings(){}
  async function loadSettings(){
    const d=await api('/api/admin/settings'), map=Object.fromEntries((d.settings||[]).map(x=>[x.key,x.value])),view=$('#view-settings');view.innerHTML=`<div class="admin-grid two"><section class="panel"><div class="panel-head"><div><h2>Commerce settings</h2><p>Validated public-safe values. Secrets stay in Cloudflare.</p></div></div><label>COD delivery fee (PKR)<input id="setCodFee" type="number" min="0" max="100000" value="${esc(map.cod_delivery_fee_pkr??300)}"></label><label>Prepaid delivery fee (PKR)<input id="setPreFee" type="number" min="0" max="100000" value="${esc(map.prepaid_delivery_fee_pkr??300)}"></label><label>Free prepaid threshold (PKR)<input id="setThreshold" type="number" min="0" max="1000000" value="${esc(map.prepaid_free_delivery_threshold_pkr??5000)}"></label><label>Delivery estimate<input id="setEstimate" maxlength="80" value="${esc(map.delivery_estimate??'4-7 days')}"></label><hr><h3>Storefront contact & promo</h3><label>Support WhatsApp<input id="setSupportWhatsApp" maxlength="25" value="${esc(map.support_whatsapp??'0332-0005381')}"></label><label>Support email<input id="setSupportEmail" type="email" maxlength="254" value="${esc(map.support_email??'Chaskabox.mzg@gmail.com')}"></label><label>Store address<textarea id="setStoreAddress" rows="3" maxlength="300">${esc(map.store_address??'Near Ahmad Drink Corner, Railway Road, Bhatti Hussainabad, Muzaffargarh, Pakistan')}</textarea></label><label>Announcement / promo bar<input id="setPromo" maxlength="180" value="${esc(map.promo_text??'Original sealed packs · Pakistan-wide delivery · COD + prepaid')}"></label><button class="btn primary" id="saveSettings">Save settings</button></section><section class="panel"><div class="panel-head"><div><h2>Payment availability</h2></div></div><label class="checkline"><input id="setCod" type="checkbox" ${map.cod_enabled!==false?'checked':''}> Cash on Delivery</label><label class="checkline"><input id="setJazz" type="checkbox" ${map.jazzcash_enabled!==false?'checked':''}> JazzCash</label><label class="checkline"><input id="setBank" type="checkbox" ${map.bank_transfer_enabled!==false?'checked':''}> Bank Transfer</label><hr><h3>Prepaid receiving details</h3><label>JazzCash Till ID<input id="setJazzTill" maxlength="40" value="${esc(map.jazzcash_till_id??'981716438')}"></label><label>JazzCash QR URL<input id="setJazzQr" maxlength="500" value="${esc(map.jazzcash_qr_url??'/images/jazzcash-qr.webp')}"></label><label>Bank<input id="setBankName" maxlength="100" value="${esc(map.bank_transfer_details?.bank??'Punjab Bank')}"></label><label>Account title<input id="setBankTitle" maxlength="120" value="${esc(map.bank_transfer_details?.account_title??'RAMEEZ ASLAM')}"></label><label>Account number<input id="setBankAccount" maxlength="80" value="${esc(map.bank_transfer_details?.account_number??'6050435151500017')}"></label><hr><h3>Free AI features</h3><label class="checkline"><input id="setAiHelp" type="checkbox" ${map.ai_customer_assistant_enabled!==false?'checked':''}> Customer Chaska Help AI</label><label class="checkline"><input id="setAiSearch" type="checkbox" ${map.ai_semantic_search_enabled!==false?'checked':''}> Semantic product search</label><p class="safe-note">AI uses the Cloudflare Workers AI free allocation. Checkout/orders never depend on AI.</p><p class="safe-note">All values are validated again by the API and database. Test checkout after meaningful pricing changes.</p></section></div>`;
    $('#saveSettings').onclick=async()=>{try{
      // Get real values from masked fields
      const getVal=id=>{const el=document.getElementById(id);return el.getRealValue?el.getRealValue():el.value;};
      await api('/api/admin/settings',{method:'PATCH',body:{settings:{cod_delivery_fee_pkr:Number($('#setCodFee').value),prepaid_delivery_fee_pkr:Number($('#setPreFee').value),prepaid_free_delivery_threshold_pkr:Number($('#setThreshold').value),delivery_estimate:$('#setEstimate').value.trim(),support_whatsapp:getVal('setSupportWhatsApp'),support_email:$('#setSupportEmail').value.trim(),store_address:$('#setStoreAddress').value.trim(),promo_text:$('#setPromo').value.trim(),jazzcash_till_id:getVal('setJazzTill'),jazzcash_qr_url:$('#setJazzQr').value.trim(),bank_transfer_details:{bank:$('#setBankName').value.trim(),account_title:getVal('setBankTitle'),account_number:getVal('setBankAccount')},cod_enabled:$('#setCod').checked,jazzcash_enabled:$('#setJazz').checked,bank_transfer_enabled:$('#setBank').checked,ai_customer_assistant_enabled:$('#setAiHelp').checked,ai_semantic_search_enabled:$('#setAiSearch').checked}}});toast('Settings saved and storefront will refresh automatically')}catch(e){toast(e.message)}};
    // Mask sensitive fields by default
    wireSensitiveField('setJazzTill', map.jazzcash_till_id);
    wireSensitiveField('setBankTitle', map.bank_transfer_details?.account_title);
    wireSensitiveField('setBankAccount', map.bank_transfer_details?.account_number);
    wireSensitiveField('setSupportWhatsApp', map.support_whatsapp);
  }

  async function loadSecurity(){
    const view=$('#view-security');
    const [auditR,staffR]=await Promise.allSettled([api('/api/admin/audit?per_page=50'),api('/api/admin/staff')]);
    const audit=auditR.status==='fulfilled'?auditR.value:{events:[]};
    const staff=staffR.status==='fulfilled'?staffR.value:{staff:[]};
    const auditErr=auditR.status==='rejected'?String(auditR.reason?.message||auditR.reason):'';
    const staffErr=staffR.status==='rejected'?String(staffR.reason?.message||staffR.reason):'';view.innerHTML=`<div class="admin-grid two"><section class="panel"><div class="panel-head"><div><h2>Staff roles</h2><p>Least-privilege access. Owner-only changes.</p></div></div><div class="staff-list">${staffErr?`<p class="muted">Could not load staff list: ${esc(staffErr)}</p>`:(staff.staff||[]).map(s=>`<div><code>${esc(s.user_id)}</code><b>${esc(s.role)}</b><span class="pill ${s.active?'on':''}">${s.active?'Active':'Disabled'}</span></div>`).join('')}</div><hr><h3>Invite staff</h3><div class="form-two"><label>Email<input id="staffEmail" type="email"></label><label>Role<select id="staffRole"><option>content</option><option>fulfilment</option><option>manager</option><option>owner</option></select></label></div><button class="btn primary" id="inviteStaff">Send invite</button></section><section class="panel"><div class="panel-head"><div><h2>Recent audit log</h2><p>Who changed what and when.</p></div></div>${auditErr?`<p class="muted">Could not load audit history: ${esc(auditErr)}</p>`:`<div class="history-list">${(audit.events||[]).map(a=>`<div><b>${esc(a.action)}</b><small>${fmtDate(a.created_at)} · ${esc(a.actor_role)} · ${esc(a.entity_type)} ${esc(a.entity_id)}</small></div>`).join('')||'<small>No audit events.</small>'}</div>`}</section></div>
    <section class="panel" style="margin-top:16px"><div class="panel-head"><div><h2>🔐 Two-Factor (MFA)</h2><p>Protect your admin account with an authenticator app</p></div></div><div id="mfaSection"><p class="muted">Loading…</p></div></section>
    <section class="panel" style="margin-top:16px"><div class="panel-head"><div><h2>📱 Sessions</h2><p>Manage your login sessions</p></div></div><div style="padding:8px"><button class="btn danger" id="signOutAllBtn">Sign out all devices</button><p class="muted" style="font-size:12px;margin-top:8px">This will sign you out everywhere. You'll need to sign in again.</p></div></section>`;$('#inviteStaff').onclick=async()=>{try{await api('/api/admin/staff',{method:'POST',body:{email:$('#staffEmail').value.trim(),role:$('#staffRole').value}});toast('Staff invite sent');loadSecurity()}catch(e){toast(e.message)}};
    loadMFAStatus();
    $('#signOutAllBtn').onclick=async()=>{
      if(!confirm('Sign out from all devices?')) return;
      try{await SB.auth.signOut({scope:'global'});toast('Signed out everywhere');location.reload();}catch(e){toast(e.message);}
    };
  }

  async function loadMFAStatus(){
    const el=$('#mfaSection'); if(!el||!SB) return;
    try{
      const {data,error}=await SB.auth.mfa.listFactors();
      if(error) throw error;
      const factors=data?.totp||[];
      if(factors.length){
        el.innerHTML=`<p>✅ MFA is <b>enabled</b> (${factors.length} authenticator${factors.length>1?'s':''})</p><button class="btn secondary" id="disableMfaBtn">Disable MFA</button>`;
        $('#disableMfaBtn').onclick=async()=>{
          if(!confirm('Disable two-factor authentication?')) return;
          const {error}=await SB.auth.mfa.unenroll({factorId:factors[0].id});
          if(error) toast(error.message); else {toast('MFA disabled');loadMFAStatus();}
        };
      }else{
        el.innerHTML=`<p class="muted">MFA is not enabled. Add an extra layer of security.</p><button class="btn primary" id="enableMfaBtn">Enable MFA</button><div id="mfaEnroll" style="display:none;margin-top:12px"></div>`;
        $('#enableMfaBtn').onclick=startMFAEnroll;
      }
    }catch(e){el.innerHTML=`<p class="muted">MFA unavailable: ${esc(e.message)}</p>`;}
  }

  async function startMFAEnroll(){
    const box=$('#mfaEnroll'); box.style.display='block'; box.innerHTML='<p class="muted">Setting up…</p>';
    try{
      const {data,error}=await SB.auth.mfa.enroll({factorType:'totp',friendlyName:'Admin phone'});
      if(error) throw error;
      box.innerHTML=`
        <p><b>Step 1:</b> Scan this QR with Google Authenticator / Authy:</p>
        <div style="background:#fff;padding:12px;display:inline-block;border-radius:8px"><img src="${data.totp.qr_code}" alt="MFA QR" style="width:180px;height:180px"></div>
        <p style="margin-top:8px"><b>Step 2:</b> Enter the 6-digit code:</p>
        <div style="display:flex;gap:8px"><input id="mfaCode" placeholder="000000" maxlength="6" style="padding:8px;border:1px solid var(--border);border-radius:8px;width:120px"><button class="btn primary" id="verifyMfaBtn">Verify</button></div>`;
      $('#verifyMfaBtn').onclick=async()=>{
        const code=$('#mfaCode').value.trim();
        const {data:ch,error:chErr}=await SB.auth.mfa.challenge({factorId:data.id});
        if(chErr){toast(chErr.message);return;}
        const {error:vErr}=await SB.auth.mfa.verify({factorId:data.id,challengeId:ch.id,code});
        if(vErr) toast(vErr.message); else {toast('MFA enabled!');loadMFAStatus();}
      };
    }catch(e){box.innerHTML=`<p class="muted">Failed: ${esc(e.message)}</p>`;}
  }

  let editingBoxId = null;

  function wireBoxLive(){
    $('#saveBoxDraftBtn')?.addEventListener('click',async e=>{if(!me||!roleAllows('owner','manager','content'))return;e.preventDefault();e.stopImmediatePropagation();
      const seen=new Map(); $$('#boxSelectedItems .builder-item').forEach(row=>{const ctl=row.querySelector('[data-id]');const q=Number(row.querySelector('.qty-controls b')?.textContent||0);if(ctl&&q>0)seen.set(Number(ctl.dataset.id),q);});
      const items=[...seen].map(([product_id,quantity])=>({product_id,quantity})); const title=$('#boxName')?.value.trim()||'', selling_price=Number($('#boxPrice')?.value||0);
      if(!title||!items.length||!Number.isInteger(selling_price)||selling_price<0){toast('Box name, selling price and at least one product are required');return;}
      try{
        const body={title,description:$('#boxDescription')?.value.trim()||'',selling_price,items,visibility:'draft'};
        if(editingBoxId){
          await api(`/api/admin/boxes/${encodeURIComponent(editingBoxId)}`,{method:'PATCH',body});
          toast('Chaska Box updated'); editingBoxId=null;
          $('#saveBoxDraftBtn').textContent='Save Chaska Box';
        }else{
          await api('/api/admin/boxes',{method:'POST',body});
          toast('Chaska Box saved securely as draft');
        }
        // Clear form
        $('#boxName').value=''; $('#boxDescription').value=''; $('#boxPrice').value='';
        if(typeof window.chaskaLoadBoxItems==='function') window.chaskaLoadBoxItems([]);
        await loadProducts(); await loadExistingBoxes();
      }catch(x){toast(x.message)}
    },true);
    // Clear edit state button
    $('#boxName')?.addEventListener('input',()=>{
      if(editingBoxId && !$('#boxName').value){ editingBoxId=null; $('#saveBoxDraftBtn').textContent='Save Chaska Box'; }
    });
  }
  async function enableBoxBuilder(){
    const d=await api('/api/admin/boxes?per_page=100');
    const panel=$('#view-boxes .builder-summary');
    if(panel&&!$('#liveBoxList')) panel.insertAdjacentHTML('beforeend',`<div id="liveBoxList" class="safe-note" style="margin-top:12px">${(d.boxes||[]).length} secure box draft(s)/product(s) currently in database.</div>`);
    // Load existing boxes list
    await loadExistingBoxes();
    $('#refreshBoxList')?.addEventListener('click',loadExistingBoxes);
  }
  async function loadExistingBoxes(){
    const listEl=$('#existingBoxList'); if(!listEl) return;
    listEl.innerHTML='<p class="muted">Loading…</p>';
    try{
      const d=await api('/api/admin/boxes?per_page=100');
      const boxes=d.boxes||[];
      if(!boxes.length){listEl.innerHTML='<p class="muted">No boxes created yet. Build one above!</p>';return;}
      listEl.innerHTML=boxes.map(b=>{
        const vis=(b.visibility||'draft').toLowerCase();
        const visClass=vis==='visible'?'visible':(vis==='hidden'?'hidden':'');
        const itemCount=b.item_count ?? (b.items||[]).length;
        const countLabel = itemCount > 0 ? `${itemCount} items` : '⚠️ No items — edit to add';
        return `
        <div class="existing-box-card">
          <h4>${esc(b.title||b.name||'Untitled Box')}</h4>
          <div class="box-meta">
            <span class="box-price">${money(b.selling_price||b.price||0)}</span>
            <span>·</span><span>${countLabel}</span>
            <span class="box-badge ${visClass}">${esc(b.visibility||'draft')}</span>
          </div>
          <div class="box-actions">
            <button class="btn secondary compact" data-edit-box="${esc(b.id)}">✏️ Edit</button>
          </div>
        </div>`;}).join('');
      listEl.querySelectorAll('[data-edit-box]').forEach(btn=>{
        btn.onclick=async()=>{
          const boxId=btn.dataset.editBox;
          btn.disabled=true; btn.textContent='⏳…';
          try{
            // Fetch full box details with items
            const d=await api(`/api/admin/boxes/${encodeURIComponent(boxId)}`);
            const box=d.box||d;
            const items=d.items||box.items||box.products||[];
            // Track editing state
            editingBoxId=boxId;
            $('#saveBoxDraftBtn').textContent='Update Chaska Box';
            // Load box into builder form for editing
            $('#boxName').value=box.title||box.name||'';
            $('#boxDescription').value=box.description||'';
            $('#boxPrice').value=box.selling_price||box.price||'';
            $('#boxBadge').value=box.badge||'';
            // Load box items/products into the builder
            // API returns items as {component_product_id, quantity, product}
            const normalized=items.map(it=>({
              product_id: it.component_product_id||it.product_id||it.id,
              quantity: it.quantity||it.qty||1
            }));
            if(typeof window.chaskaLoadBoxItems==='function'){
              window.chaskaLoadBoxItems(normalized);
            }
            toast(`Editing box — ${normalized.length} product(s) loaded. Save to update.`);
            $('#boxName').focus();
            $('#boxName').scrollIntoView({behavior:'smooth',block:'center'});
          }catch(e){toast('Failed to load box: '+e.message);}
          finally{btn.disabled=false;btn.innerHTML='✏️ Edit';}
        };
      });
    }catch(e){listEl.innerHTML=`<p class="muted">Failed to load: ${esc(e.message)}</p>`;}
  }

  async function init(){
    // Safety net: never leave the console stuck on "Verifying admin session…".
    setTimeout(()=>{ if(!bootDone) showBootError('Session check is taking too long. Please reload and try again.'); }, 25000);
    if(!(await ensureClient())){showLogin('Public Supabase configuration could not be loaded.');return;}
    const {data}=await SB.auth.getSession();session=data?.session||null;if(!session){showLogin();return;}await bootAuthenticated();
  }

  // ============ CATEGORIES ============
  let categoriesCache = [];
  async function loadCategories(){
    const listEl=$('#categoryList'); if(!listEl) return;
    listEl.innerHTML='<p class="muted">Loading…</p>';
    try{
      const d=await api('/api/admin/categories');
      categoriesCache=d.categories||[];
      if(!categoriesCache.length){listEl.innerHTML='<p class="muted">No categories yet. Click "+ New Category".</p>';return;}
      listEl.innerHTML=categoriesCache.map(c=>`
        <div class="existing-box-card">
          <h4>${esc(c.name)}</h4>
          <div class="box-meta">
            <span>/${esc(c.slug)}</span><span>·</span>
            <span>${c.product_count||0} products</span>
            <span class="box-badge ${c.is_visible?'visible':'hidden'}">${c.is_visible?'Visible':'Hidden'}</span>
            ${c.show_on_homepage?'<span class="box-badge">Homepage</span>':''}
          </div>
          <div class="box-actions">
            <button class="btn secondary compact" data-edit-cat="${esc(c.id)}">✏️ Edit</button>
            <button class="btn secondary compact" data-toggle-cat="${esc(c.id)}">${c.is_visible?'👁️ Hide':'👁️ Show'}</button>
          </div>
        </div>`).join('');
      listEl.querySelectorAll('[data-edit-cat]').forEach(b=>b.onclick=()=>openCategoryEditor(b.dataset.editCat));
      listEl.querySelectorAll('[data-toggle-cat]').forEach(b=>b.onclick=async()=>{
        const id=b.dataset.toggleCat;
        const cat=categoriesCache.find(x=>String(x.id)===id);
        await api(`/api/admin/categories/${id}`,{method:'PATCH',body:{is_visible:!cat.is_visible}});
        toast(cat.is_visible?'Category hidden':'Category visible'); loadCategories();
      });
    }catch(e){listEl.innerHTML=`<p class="muted">Failed: ${esc(e.message)}</p>`;}
  }
  function openCategoryEditor(id){
    const c=id?categoriesCache.find(x=>String(x.id)===String(id)):null;
    $('#catId').value=c?.id||'';
    $('#catName').value=c?.name||'';
    $('#catSlug').value=c?.slug||'';
    $('#catDescription').value=c?.description||'';
    $('#catImage').value=c?.image_url||'';
    $('#catMobileImage').value=c?.mobile_image_url||'';
    $('#catSeoTitle').value=c?.seo_title||'';
    $('#catSeoDesc').value=c?.seo_description||'';
    $('#catBoxStyle').value=c?.box_style||'default';
    $('#catPosition').value=c?.position||0;
    $('#catVisible').checked=c?.is_visible!==false;
    $('#catHomepage').checked=c?.show_on_homepage!==false;
    $('#catHideEmpty').checked=c?.hide_if_empty!==false;
    $('#categoryEditorTitle').textContent=c?'Edit '+c.name:'New category';
    $('#deleteCategoryBtn').style.display=c?'':'none';
    $('#deleteCategoryBtn').onclick=()=>deleteCategory(c.id,c.name);
    $('#categoryEditor').classList.add('open');
    $('#categoryEditor').setAttribute('aria-hidden','false');
  }
  function closeCategoryEditor(){
    $('#categoryEditor').classList.remove('open');
    $('#categoryEditor').setAttribute('aria-hidden','true');
  }
  async function deleteCategory(id,name){
    if(!confirm(`Delete category "${name}"? Products will NOT be deleted.`)) return;
    try{
      await api(`/api/admin/categories/${id}`,{method:'DELETE'});
      toast('Category deleted'); closeCategoryEditor(); loadCategories();
    }catch(e){toast(e.message);}
  }
  function wireCategoryEditor(){
    document.querySelectorAll('[data-close-cat-modal]').forEach(b=>b.addEventListener('click',closeCategoryEditor));
    $('#refreshCategories')?.addEventListener('click',()=>loadCategories());
    $('#addCategoryBtn')?.addEventListener('click',()=>openCategoryEditor(null));
    $('#refreshBrands')?.addEventListener('click',()=>loadBrands());
    $('#addBrandBtn')?.addEventListener('click',()=>{
      const name=prompt('Brand name:'); if(!name?.trim()) return;
      api('/api/admin/brands',{method:'POST',body:{name:name.trim()}}).then(()=>{toast('Brand added');loadBrands();}).catch(e=>toast(e.message));
    });
    $('#refreshResolutions')?.addEventListener('click',()=>loadResolutions());
    $('#refreshAnalytics')?.addEventListener('click',()=>loadAnalytics());
    initBackup();
    $('#refreshCoupons')?.addEventListener('click',()=>loadCoupons());
    $('#addCouponBtn')?.addEventListener('click',()=>{
      const code=prompt('Coupon code (e.g. CHASKA10):'); if(!code?.trim()) return;
      const type=prompt('Type: percent or fixed','percent'); if(!['percent','fixed'].includes(type)) return;
      const value=prompt(type==='percent'?'Discount % (max 90):':'Discount Rs.:'); if(!value) return;
      const min=prompt('Minimum order Rs. (0 for none):','0');
      api('/api/admin/coupons',{method:'POST',body:{code, discount_type:type, discount_value:Number(value), min_order:Number(min)||0}})
        .then(()=>{toast('Coupon created');loadCoupons();}).catch(e=>toast(e.message));
    });
    $('#refreshShipping')?.addEventListener('click',()=>loadShipping());
    $('#addZoneBtn')?.addEventListener('click',()=>{
      const name=prompt('Zone name:'); if(!name?.trim()) return;
      const fee=prompt('Delivery fee Rs.:','300'); if(fee===null) return;
      const freeAbove=prompt('Free delivery above Rs. (blank for none):','');
      api('/api/admin/shipping-zones',{method:'POST',body:{name:name.trim(), fee:Number(fee)||0, free_above:freeAbove?Number(freeAbove):null}})
        .then(()=>{toast('Zone added');loadShipping();}).catch(e=>toast(e.message));
    });
    $('#resolutionStatusFilter')?.addEventListener('change',()=>loadResolutions());
    $('#addResolutionBtn')?.addEventListener('click',()=>{
      const issue_type=prompt('Issue type (refund/replacement/complaint/damaged/missing_item/late_delivery/other):','complaint');
      if(!issue_type) return;
      const description=prompt('Describe the issue:'); if(!description) return;
      const order_number=prompt('Order number (optional):')||null;
      const customer_name=prompt('Customer name (optional):')||null;
      api('/api/admin/resolutions',{method:'POST',body:{issue_type,description,order_number,customer_name}}).then(()=>{toast('Case created');loadResolutions();}).catch(e=>toast(e.message));
    });
    $('#saveThemeBtn')?.addEventListener('click',async()=>{
      try{await api('/api/admin/theme',{method:'PUT',body:{settings:collectTheme()}});toast('Theme saved');}catch(e){toast(e.message);}
    });
    $('#previewThemeBtn')?.addEventListener('click',previewTheme);
    $('#resetThemeBtn')?.addEventListener('click',async()=>{
      if(!confirm('Reset theme to defaults?')) return;
      const defaults={primary_color:'#1a2b5c',accent_color:'#f59e0b',background_color:'#ffffff',text_color:'#1f2937',font_family:'system-ui',border_radius:'12',logo_url:'/logo.png',favicon_url:'/favicon.ico',announcement_enabled:'false',announcement_text:''};
      try{await api('/api/admin/theme',{method:'PUT',body:{settings:defaults}});toast('Theme reset');loadTheme();}catch(e){toast(e.message);}
    });
    $('#categoryForm')?.addEventListener('submit',async e=>{
      e.preventDefault();
      const id=$('#catId').value;
      const body={
        name:$('#catName').value.trim(),
        slug:$('#catSlug').value.trim()||undefined,
        description:$('#catDescription').value.trim(),
        image_url:$('#catImage').value.trim(),
        mobile_image_url:$('#catMobileImage').value.trim(),
        seo_title:$('#catSeoTitle').value.trim(),
        seo_description:$('#catSeoDesc').value.trim(),
        box_style:$('#catBoxStyle').value,
        position:Number($('#catPosition').value||0),
        is_visible:$('#catVisible').checked,
        show_on_homepage:$('#catHomepage').checked,
        hide_if_empty:$('#catHideEmpty').checked,
      };
      try{
        if(id) await api(`/api/admin/categories/${id}`,{method:'PATCH',body});
        else await api('/api/admin/categories',{method:'POST',body});
        toast(id?'Category updated':'Category created');
        closeCategoryEditor(); loadCategories();
      }catch(err){toast(err.message);}
    });
  }
  // Wire on boot
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',wireCategoryEditor);
  else wireCategoryEditor();

  // ============ NAVIGATION ============
  async function loadNavigation(){
    try{
      const d=await api('/api/admin/navigation');
      const nav=d.navigation||{header:[],footer:[],mobile:[]};
      const render=(items,elId)=>{
        const el=$(elId); if(!el) return;
        el._navItems=items;
        el.innerHTML=items.length?items.map((i,idx)=>`
          <div class="nav-row" data-id="${esc(i.id)}"><span class="drag">⋮⋮</span><b>${esc(i.label)}</b><em>${esc(i.url)}</em>
          <span class="nav-move"><button data-nav-up="${idx}" aria-label="Move up" title="Move up">↑</button><button data-nav-down="${idx}" aria-label="Move down" title="Move down">↓</button></span>
          <button data-nav-toggle="${esc(i.id)}" aria-label="Toggle enabled">${i.is_enabled?'✓':'✗'}</button></div>`).join('')
          :'<p class="muted">No items. Click + Add.</p>';
      };
      const persistOrder=async(el)=>{
        const items=el._navItems||[];
        try{
          await api('/api/admin/navigation',{method:'PATCH',body:JSON.stringify({items:items.map((i,idx)=>({id:i.id,position:idx+1}))})});
        }catch(e){ toast('Reorder failed: '+e.message); }
      };
      const move=(el,idx,dir)=>{
        const items=el._navItems||[];
        const j=idx+dir;
        if(j<0||j>=items.length) return;
        [items[idx],items[j]]=[items[j],items[idx]];
        render(items,'#'+el.id);
        persistOrder(el);
      };
      render(nav.header,'#headerNavList'); render(nav.footer,'#footerNavList');
      const navView=$('#view-navigation');
      if(navView && !navView._navWired){
        navView._navWired=true;
        navView.addEventListener('click',async(e)=>{
          const up=e.target.closest('[data-nav-up]'), down=e.target.closest('[data-nav-down]'), tog=e.target.closest('[data-nav-toggle]');
          if(up){ const el=up.closest('.nav-row').parentElement; move(el,Number(up.dataset.navUp),-1); }
          else if(down){ const el=down.closest('.nav-row').parentElement; move(el,Number(down.dataset.navDown),1); }
          else if(tog){
            const el=tog.closest('.nav-row').parentElement;
            const items=el._navItems||[];
            const it=items.find(x=>String(x.id)===tog.dataset.navToggle);
            if(!it) return;
            const next=!it.is_enabled;
            tog.disabled=true;
            try{ await api('/api/admin/navigation',{method:'PATCH',body:JSON.stringify({items:[{id:it.id,is_enabled:next}]})}); it.is_enabled=next; tog.textContent=next?'✓':'✗'; }
            catch(err){ toast('Toggle failed: '+err.message); }
            tog.disabled=false;
          }
        });
      }
    }catch(e){toast(e.message);}
  }

  // ============ NOTIFICATIONS ============
  async function loadNotifications(){
    try{
      const d=await api('/api/admin/notifications');
      const st=$('#notifServiceStatus');
      if(st){
        const r=d.resend||{}, w=d.waha||{};
        st.innerHTML=`
          <div style="display:grid;gap:10px">
            <div><b>📧 Resend Email</b><br>
              <span class="box-badge ${r.configured?'visible':'hidden'}">${r.configured?'Configured':'Not configured'}</span>
              ${!r.has_api_key?'<br><small class="muted">RESEND_API_KEY missing</small>':''}
              ${!r.has_owner_email?'<br><small class="muted">OWNER_ORDER_EMAIL missing</small>':''}
            </div>
            <div><b>📱 WhatsApp/WAHA</b><br>
              <span class="box-badge ${w.configured?'visible':'hidden'}">${w.configured?'Configured':'Not configured'}</span>
            </div>
          </div>`;
      }
      const ob=$('#notifOutboxStats');
      if(ob){
        const o=d.owner_outbox||{}, c=d.customer_outbox||{};
        ob.innerHTML=`
          <div style="display:grid;gap:8px;font-size:12px">
            <div><b>Owner outbox:</b> ${o.pending||0} pending · ${o.sent||0} sent · ${o.failed||0} failed</div>
            <div><b>Customer outbox:</b> ${c.pending||0} pending · ${c.sent||0} sent · ${c.failed||0} failed</div>
          </div>`;
      }
      const fl=$('#notifFailures');
      if(fl){
        const fails=d.recent_failures||[];
        fl.innerHTML=fails.length?fails.map(f=>`
          <div class="box-product-row"><div style="flex:1">
            <h4>Order ${esc(f.order_id||'—')}</h4>
            <small>${esc(f.error||f.last_error||'Failed')}</small></div>
            <button class="btn secondary compact" onclick="toast('Retry via Orders → Retry notification')">Retry</button>
          </div>`).join(''):'<p class="muted">No failures. 🎉</p>';
      }
    }catch(e){toast(e.message);}
    $('#refreshNotifStatus')?.addEventListener('click',loadNotifications,{once:true});
    $('#refreshTemplates')?.addEventListener('click',loadTemplates);
    loadTemplates();
  }

  // ============ SYSTEM HEALTH ============
  async function loadHealth(){
    const grid=$('#healthGrid'); if(grid) grid.innerHTML='<p class="muted">Checking…</p>';
    try{
      const h=await api('/api/admin/health');
      const services=[
        ['🗄️ Supabase',h.supabase?.status],
        ['🛡️ Turnstile',h.turnstile?.status],
        ['📧 Resend',h.resend?.status],
        ['✦ AI',h.ai?.status],
        ['⚡ Functions',h.functions?.status],
      ];
      if(grid) grid.innerHTML=services.map(([name,st])=>{
        const ok=st==='connected'||st==='configured'||st==='ok';
        const warn=st==='not_configured'||st==='missing';
        return `<div class="existing-box-card"><h4>${name}</h4>
          <span class="box-badge ${ok?'visible':warn?'':'hidden'}">${esc(st||'unknown')}</span></div>`;
      }).join('');
      const di=$('#deployInfo');
      if(di) di.innerHTML=`<div style="font-size:12px;display:grid;gap:6px">
        <div><b>Commit:</b> <code>${esc(h.deployment?.commit||'unknown')}</code></div>
        <div><b>Branch:</b> ${esc(h.deployment?.branch||'unknown')}</div>
        <div><b>Checked:</b> ${esc(h.timestamp||'')}</div></div>`;
    }catch(e){ if(grid) grid.innerHTML=`<p class="muted">Failed: ${esc(e.message)}</p>`; }
    $('#refreshHealth')?.addEventListener('click',loadHealth,{once:true});
  }

  // ============ AI CENTER ============
  async function loadAICenter(){
    // AI Center enhancements: health indicator
    try{
      const h=await api('/api/admin/health').catch(()=>null);
      const aiStatus=h?.ai?.status||'unknown';
      const banner=$('#view-assistant .panel-head');
      if(banner && !$('#aiHealthBadge')){
        banner.insertAdjacentHTML('beforeend',
          `<span id="aiHealthBadge" class="box-badge ${aiStatus==='connected'?'visible':'hidden'}">AI: ${esc(aiStatus)}</span>`);
      }
    }catch{}
  }

  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();

  /* ============ BRANDS ============ */
  async function loadBrands(){
    const listEl=$('#brandList'); if(!listEl) return;
    listEl.innerHTML='<div class="admin-loading"><div class="spinner"></div><p>Loading brands…</p></div>';
    try{
      const d=await api('/api/admin/brands');
      const brands=d.brands||[];
      if(!brands.length){listEl.innerHTML='<p class="muted">No brands found.</p>';return;}
      listEl.innerHTML=brands.map(b=>`
        <div class="existing-box-card">
          <h4>${esc(b.name)} ${b._auto?'<small style="opacity:.6">(auto-detected)</small>':''}</h4>
          <div class="box-meta">
            <span>/${esc(b.slug||'')}</span><span>·</span>
            <span>${b.product_count||0} products</span>
            <span class="box-badge ${b.is_visible?'visible':'hidden'}">${b.is_visible?'Visible':'Hidden'}</span>
          </div>
          ${b.description?`<p class="muted" style="font-size:12px">${esc(b.description)}</p>`:''}
          <div class="box-actions">
            ${b.id?`<button class="btn secondary compact" data-edit-brand="${b.id}">✏️ Edit</button>
            <button class="btn secondary compact" data-toggle-brand="${b.id}">${b.is_visible?'👁️ Hide':'👁️ Show'}</button>`:`
            <button class="btn primary compact" data-add-brand="${esc(b.name)}">+ Add brand</button>`}
          </div>
        </div>`).join('');
      listEl.querySelectorAll('[data-toggle-brand]').forEach(btn=>btn.onclick=async()=>{
        const id=btn.dataset.toggleBrand;
        const b=brands.find(x=>String(x.id)===String(id));
        await api(`/api/admin/brands/${id}`,{method:'PATCH',body:{is_visible:!b.is_visible}});
        toast(b.is_visible?'Brand hidden':'Brand visible'); loadBrands();
      });
      listEl.querySelectorAll('[data-add-brand]').forEach(btn=>btn.onclick=async()=>{
        const name=btn.dataset.addBrand;
        await api('/api/admin/brands',{method:'POST',body:{name}});
        toast('Brand added'); loadBrands();
      });
      listEl.querySelectorAll('[data-edit-brand]').forEach(btn=>btn.onclick=()=>openBrandEditor(btn.dataset.editBrand, brands));
    }catch(e){listEl.innerHTML=`<p class="muted">Failed: ${esc(e.message)}</p>`;}
  }
  function openBrandEditor(id, brands){
    const b=(brands||[]).find(x=>String(x.id)===String(id)); if(!b) return;
    const name=prompt('Brand name:', b.name); if(!name) return;
    const desc=prompt('Description (optional):', b.description||'');
    const logo=prompt('Logo URL (optional):', b.logo_url||'');
    api(`/api/admin/brands/${id}`,{method:'PATCH',body:{name:name.trim(),description:desc,logo_url:logo}}).then(()=>{toast('Brand updated');loadBrands();}).catch(e=>toast(e.message));
  }

  /* ============ NOTIFICATION TEMPLATES ============ */
  async function loadTemplates(){
    const el=$('#templateList'); if(!el) return;
    el.innerHTML='<p class="muted">Loading…</p>';
    try{
      const d=await api('/api/admin/notification-templates');
      const templates=d.templates||[];
      if(!templates.length){el.innerHTML='<p class="muted">No templates found. Run migration 024.</p>';return;}
      el.innerHTML=templates.map(t=>`
        <div class="existing-box-card" style="margin-bottom:12px">
          <h4>${esc(t.name)} <span class="box-badge">${esc(t.channel)}</span> ${t.is_active?'':'<span class="box-badge hidden">Disabled</span>'}</h4>
          ${t.subject?`<div style="margin:6px 0"><label style="font-size:12px">Subject:</label><input data-tpl-subject="${t.id}" value="${esc(t.subject)}" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:6px"></div>`:''}
          <div style="margin:6px 0"><label style="font-size:12px">Body:</label><textarea data-tpl-body="${t.id}" rows="4" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:6px;font-family:inherit">${esc(t.body)}</textarea></div>
          <div style="font-size:11px;color:var(--muted)">Variables: ${(t.variables||[]).map(v=>`{{${v}}}`).join(', ')}</div>
          <div class="box-actions" style="margin-top:8px">
            <button class="btn primary compact" data-save-tpl="${t.id}">💾 Save</button>
            <button class="btn secondary compact" data-toggle-tpl="${t.id}">${t.is_active?'Disable':'Enable'}</button>
          </div>
        </div>`).join('');
      el.querySelectorAll('[data-save-tpl]').forEach(b=>b.onclick=async()=>{
        const id=b.dataset.saveTpl;
        const subject=document.querySelector(`[data-tpl-subject="${id}"]`)?.value;
        const body=document.querySelector(`[data-tpl-body="${id}"]`).value;
        await api(`/api/admin/notification-templates/${id}`,{method:'PATCH',body:{subject,body}});
        toast('Template saved'); loadTemplates();
      });
      el.querySelectorAll('[data-toggle-tpl]').forEach(b=>b.onclick=async()=>{
        const id=b.dataset.toggleTpl;
        const t=templates.find(x=>String(x.id)===String(id));
        await api(`/api/admin/notification-templates/${id}`,{method:'PATCH',body:{is_active:!t.is_active}});
        toast(t.is_active?'Template disabled':'Template enabled'); loadTemplates();
      });
    }catch(e){el.innerHTML=`<p class="muted">Failed: ${esc(e.message)}</p>`;}
  }

  /* ============ RESOLUTIONS ============ */
  async function loadResolutions(){
    const el=$('#resolutionList'); if(!el) return;
    el.innerHTML='<div class="admin-loading"><div class="spinner"></div><p>Loading cases…</p></div>';
    try{
      const status=$('#resolutionStatusFilter')?.value;
      const d=await api('/api/admin/resolutions'+(status?`?status=${status}`:''));
      const cases=d.cases||[];
      if(!cases.length){el.innerHTML='<p class="muted">No cases. Click "+ New Case" to create one.</p>';return;}
      const typeEmoji={refund:'💰',replacement:'🔄',complaint:'😟',damaged:'📦',missing_item:'❓',late_delivery:'🚚',other:'📝'};
      const statusColor={open:'#dc2626',in_progress:'#d97706',resolved:'#16a34a',rejected:'#6b7280'};
      el.innerHTML=cases.map(c=>`
        <div class="existing-box-card" style="margin-bottom:12px;border-left:4px solid ${statusColor[c.status]||'#ccc'}">
          <h4>${typeEmoji[c.issue_type]||'📝'} ${esc(c.issue_type.replace('_',' '))} ${c.order_number?`<small>· ${esc(c.order_number)}</small>`:''}</h4>
          <div class="box-meta"><span>${esc(c.customer_name||'—')}</span><span>·</span><span>${esc(c.customer_phone||'')}</span><span>·</span><span class="box-badge">${esc(c.status.replace('_',' '))}</span>${c.refund_amount?`<span>· Rs.${c.refund_amount} refund</span>`:''}</div>
          <p style="font-size:13px;margin:8px 0">${esc(c.description)}</p>
          ${c.resolution?`<p style="font-size:13px;background:#f0fdf4;padding:8px;border-radius:6px"><b>Resolution:</b> ${esc(c.resolution)}</p>`:''}
          <div class="box-actions">
            ${c.status==='open'?`<button class="btn secondary compact" data-res-status="${c.id}|in_progress">▶️ Start</button>`:''}
            ${['open','in_progress'].includes(c.status)?`<button class="btn primary compact" data-res-resolve="${c.id}">✅ Resolve</button><button class="btn secondary compact" data-res-status="${c.id}|rejected">✖️ Reject</button>`:''}
          </div>
        </div>`).join('');
      el.querySelectorAll('[data-res-status]').forEach(b=>b.onclick=async()=>{
        const [id,st]=b.dataset.resStatus.split('|');
        await api(`/api/admin/resolutions/${id}`,{method:'PATCH',body:{status:st}});
        toast('Case updated'); loadResolutions();
      });
      el.querySelectorAll('[data-res-resolve]').forEach(b=>b.onclick=async()=>{
        const id=b.dataset.resResolve;
        const resolution=prompt('Resolution details:'); if(!resolution) return;
        const refund=prompt('Refund amount (Rs., 0 if none):','0');
        await api(`/api/admin/resolutions/${id}`,{method:'PATCH',body:{status:'resolved',resolution,refund_amount:Number(refund)||0}});
        toast('Case resolved'); loadResolutions();
      });
    }catch(e){el.innerHTML=`<p class="muted">Failed: ${esc(e.message)}</p>`;}
  }

  /* ============ THEME STUDIO ============ */
  let themeCache = {};
  async function loadTheme(){
    try{
      const d=await api('/api/admin/theme');
      themeCache=d.theme||{};
      $('#themePrimary').value=themeCache.primary_color||'#1a2b5c';
      $('#themeAccent').value=themeCache.accent_color||'#f59e0b';
      $('#themeBg').value=themeCache.background_color||'#ffffff';
      $('#themeText').value=themeCache.text_color||'#1f2937';
      $('#themeFont').value=themeCache.font_family||'system-ui';
      $('#themeRadius').value=themeCache.border_radius||'12';
      $('#themeLogo').value=themeCache.logo_url||'';
      $('#themeFavicon').value=themeCache.favicon_url||'';
      $('#themeAnnEnabled').checked=themeCache.announcement_enabled==='true';
      $('#themeAnnText').value=themeCache.announcement_text||'';
    }catch(e){toast('Failed to load theme: '+e.message);}
  }
  function collectTheme(){
    return {
      primary_color: $('#themePrimary').value,
      accent_color: $('#themeAccent').value,
      background_color: $('#themeBg').value,
      text_color: $('#themeText').value,
      font_family: $('#themeFont').value,
      border_radius: $('#themeRadius').value,
      logo_url: $('#themeLogo').value,
      favicon_url: $('#themeFavicon').value,
      announcement_enabled: $('#themeAnnEnabled').checked?'true':'false',
      announcement_text: $('#themeAnnText').value,
    };
  }
  function previewTheme(){
    const t=collectTheme();
    const style=document.getElementById('themePreviewStyle')||document.createElement('style');
    style.id='themePreviewStyle';
    style.textContent=`:root{--primary:${t.primary_color};--accent:${t.accent_color};--bg:${t.background_color};--text:${t.text_color};--radius:${t.border_radius}px} body{font-family:${t.font_family}}`;
    document.head.appendChild(style);
    toast('Preview applied (not saved)');
  }

  /* ============ COUPONS ============ */
  async function loadCoupons(){
    const el=$('#couponList'); if(!el) return;
    el.innerHTML='<div class="admin-loading"><div class="spinner"></div><p>Loading…</p></div>';
    try{
      const d=await api('/api/admin/coupons');
      const coupons=d.coupons||[];
      if(!coupons.length){el.innerHTML='<p class="muted">No coupons yet. Click "+ New Coupon".</p>';return;}
      el.innerHTML=coupons.map(c=>`
        <div class="existing-box-card" style="margin-bottom:10px">
          <h4 style="font-family:monospace;font-size:18px">${esc(c.code)} <span class="box-badge ${c.is_active?'visible':'hidden'}">${c.is_active?'Active':'Disabled'}</span></h4>
          <div class="box-meta">
            <span>${c.discount_type==='percent'?c.discount_value+'% off':'Rs.'+c.discount_value+' off'}</span><span>·</span>
            ${c.min_order?`<span>Min Rs.${c.min_order}</span><span>·</span>`:''}
            <span>${c.used_count}${c.max_uses?'/'+c.max_uses:''} used</span>
            ${c.valid_until?`<span>·</span><span>Until ${new Date(c.valid_until).toLocaleDateString()}</span>`:''}
          </div>
          <div class="box-actions">
            <button class="btn secondary compact" data-toggle-coupon="${c.id}">${c.is_active?'Disable':'Enable'}</button>
            <button class="btn danger compact" data-del-coupon="${c.id}">Delete</button>
          </div>
        </div>`).join('');
      el.querySelectorAll('[data-toggle-coupon]').forEach(b=>b.onclick=async()=>{
        const id=b.dataset.toggleCoupon;
        const c=coupons.find(x=>String(x.id)===String(id));
        await api(`/api/admin/coupons/${id}`,{method:'PATCH',body:{is_active:!c.is_active}});
        toast('Coupon updated'); loadCoupons();
      });
      el.querySelectorAll('[data-del-coupon]').forEach(b=>b.onclick=async()=>{
        if(!confirm('Delete this coupon?')) return;
        await api(`/api/admin/coupons/${b.dataset.delCoupon}`,{method:'DELETE'});
        toast('Coupon deleted'); loadCoupons();
      });
    }catch(e){el.innerHTML=`<p class="muted">Failed: ${esc(e.message)}</p>`;}
  }

  /* ============ SHIPPING ZONES ============ */
  async function loadShipping(){
    const el=$('#shippingList'); if(!el) return;
    el.innerHTML='<div class="admin-loading"><div class="spinner"></div><p>Loading…</p></div>';
    try{
      const d=await api('/api/admin/shipping-zones');
      const zones=d.zones||[];
      if(!zones.length){el.innerHTML='<p class="muted">No zones. Click "+ New Zone".</p>';return;}
      el.innerHTML=zones.map(z=>`
        <div class="existing-box-card" style="margin-bottom:10px">
          <h4>${esc(z.name)} <span class="box-badge ${z.is_active?'visible':'hidden'}">${z.is_active?'Active':'Disabled'}</span></h4>
          <div class="box-meta">
            <span>Fee: Rs.${z.fee}</span><span>·</span>
            ${z.free_above?`<span>Free above Rs.${z.free_above}</span><span>·</span>`:''}
            <span>${(z.cities||[]).length?esc(z.cities.join(', ')):'All cities'}</span>
          </div>
        </div>`).join('');
    }catch(e){el.innerHTML=`<p class="muted">Failed: ${esc(e.message)}</p>`;}
  }

  /* ============ ANALYTICS ============ */
  async function loadAnalytics(){
    const el=$('#analyticsContent'); if(!el) return;
    el.innerHTML='<div class="admin-loading"><div class="spinner"></div><p>Loading analytics…</p></div>';
    try{
      const [m7, m30] = await Promise.all([
        api('/api/admin/metrics?days=7'),
        api('/api/admin/metrics?days=30'),
      ]);
      const bar=(label,val,max,color)=>`
        <div style="margin:8px 0"><div style="display:flex;justify-content:space-between;font-size:13px"><span>${label}</span><b>${val}</b></div>
        <div style="background:#f1f5f9;border-radius:6px;height:10px;margin-top:4px"><div style="width:${Math.min(100,(val/max)*100)}%;background:${color};height:10px;border-radius:6px"></div></div></div>`;

      el.innerHTML=`
        <div class="admin-grid two" style="margin-bottom:16px">
          <div class="existing-box-card"><h4>Last 7 days</h4><div class="box-meta"><span>${m7.orders||0} orders</span><span>·</span><span>${money(m7.recognized_sales_pkr||0)} sales</span></div></div>
          <div class="existing-box-card"><h4>Last 30 days</h4><div class="box-meta"><span>${m30.orders||0} orders</span><span>·</span><span>${money(m30.recognized_sales_pkr||0)} sales</span></div></div>
        </div>
        <h3 style="margin:16px 0 8px">Order Status (30d)</h3>
        ${bar('New', m30.new_orders||0, m30.orders||1, '#3b82f6')}
        ${bar('Delivered', m30.delivered_orders||0, m30.orders||1, '#16a34a')}
        ${bar('Cancelled', m30.cancelled_orders||0, m30.orders||1, '#dc2626')}
        <h3 style="margin:16px 0 8px">Revenue Breakdown (30d)</h3>
        ${bar('Verified prepaid', m30.verified_prepaid_sales_pkr||0, m30.recognized_sales_pkr||1, '#8b5cf6')}
        ${bar('Delivered COD', m30.delivered_cod_sales_pkr||0, m30.recognized_sales_pkr||1, '#f59e0b')}
        ${bar('Pending payment', m30.pending_prepaid_value_pkr||0, m30.gross_order_value_pkr||1, '#6b7280')}
        <p class="muted" style="margin-top:16px;font-size:12px">Recognized sales = verified prepaid + delivered COD (refunds excluded).</p>
        <h3 style="margin:24px 0 8px">\U0001f50d SEO Health</h3>
        <div id="seoHealth"><p class="muted">Checking…</p></div>`;
    }catch(e){el.innerHTML=`<p class="muted">Failed: ${esc(e.message)}</p>`;}
    try{ await checkSeoHealth(); }catch(e){}
  }

  async function checkSeoHealth(){
    const el=$('#seoHealth'); if(!el) return;
    const checks=[];
    const check=async(name,url,validate)=>{
      try{
        const r=await fetch(url,{cache:'no-store'});
        const t=await r.text();
        const ok=r.ok&&validate(t);
        checks.push({name,ok,detail:r.ok?(ok?'OK':'Content issue'):('HTTP '+r.status)});
      }catch(e){ checks.push({name,ok:false,detail:'Fetch failed'}); }
    };
    await Promise.all([
      check('robots.txt','/robots.txt',t=>t.includes('sitemap-products.xml')),
      check('Main sitemap','/sitemap.xml',t=>(t.match(/<url>/g)||[]).length>=10),
      check('Product sitemap (static)','/sitemap-products.xml',t=>(t.match(/<url>/g)||[]).length>=100),
      check('Product sitemap (dynamic)','/api/product-sitemap',t=>(t.match(/<url>/g)||[]).length>=100),
    ]);
    el.innerHTML='<div style="display:grid;gap:8px">'+checks.map(c=>
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid var(--border);border-radius:8px">'
      +'<span>'+(c.ok?'\u2705':'\u274c')+' '+c.name+'</span><small class="muted">'+c.detail+'</small></div>'
    ).join('')+'</div><p class="muted" style="font-size:11px;margin-top:8px">Static product pages include Product + Offer + Breadcrumb schema. Dynamic ?id= URLs redirect to static pages.</p>';
  }

  /* ============ BACKUP ============ */
  function initBackup(){
    $('#downloadBackupBtn')?.addEventListener('click', async ()=>{
      try{
        toast('Preparing backup…');
        const bt=await token();
        const res = await fetch('/api/admin/backup', {
          headers: { 'Authorization': `Bearer ${bt}` },
        });
        if(!res.ok) throw new Error('Backup failed');
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `chaskabox-backup-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        toast('Backup downloaded');
      }catch(e){toast(e.message);}
    });
    $('#restoreBackupBtn')?.addEventListener('click', async ()=>{
      const file = $('#restoreFileInput')?.files?.[0];
      if(!file){toast('Select a backup file first');return;}
      if(!confirm('⚠️ This will OVERWRITE catalogue data. Continue?')) return;
      const confirm2 = prompt('Type RESTORE to confirm:');
      if(confirm2 !== 'RESTORE'){toast('Cancelled');return;}
      try{
        const text = await file.text();
        const backup = JSON.parse(text);
        await api('/api/admin/backup', { method:'POST', body:{ confirm:'RESTORE', backup } });
        toast('Restore complete');
      }catch(e){toast(e.message);}
    });
  }

  /* ============ PRODUCT VERSION HISTORY ============ */
  async function loadProductHistory(productId){
    const panel=$('#productHistoryPanel'), list=$('#productHistoryList');
    if(!panel||!list) return;
    panel.style.display='block';
    list.innerHTML='<p class="muted">Loading…</p>';
    try{
      const d=await api(`/api/admin/product-versions?product_id=${productId}`);
      const versions=d.versions||[];
      if(!versions.length){list.innerHTML='<p class="muted">No history yet. Changes will appear here.</p>';return;}
      list.innerHTML=versions.map(v=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid var(--border);font-size:13px">
          <span>${new Date(v.created_at).toLocaleString()} · ${esc(v.changed_by||'')} · ${esc(v.change_type)}</span>
          <button class="btn secondary compact" data-revert-version="${v.id}">↩️ Revert</button>
        </div>`).join('');
      list.querySelectorAll('[data-revert-version]').forEach(b=>b.onclick=async()=>{
        if(!confirm('Revert to this version? Current state will be saved as a new version.')) return;
        await api(`/api/admin/product-versions`,{method:'POST',body:{product_id:productId,version_id:b.dataset.revertVersion}});
        toast('Reverted'); loadProducts(); panel.style.display='none';
      });
    }catch(e){list.innerHTML=`<p class="muted">Failed: ${esc(e.message)}</p>`;}
  }

  /* ============ SENSITIVE FIELD MASKING ============ */
  function maskValue(val){
    if(!val) return '';
    const s=String(val);
    if(s.length<=4) return '••••';
    return '••••••••'+s.slice(-4);
  }
  function wireSensitiveField(inputId, realValue){
    const input=document.getElementById(inputId);
    if(!input) return;
    // Store real value, show masked
    input.dataset.realValue=realValue||'';
    input.value=maskValue(realValue);
    input.readOnly=true;
    input.style.background='#f8fafc';
    // Add reveal button
    const btn=document.createElement('button');
    btn.type='button'; btn.className='btn secondary compact'; btn.textContent='👁️ Reveal';
    btn.style.marginLeft='8px';
    input.parentNode.style.display='flex';
    input.parentNode.style.alignItems='center';
    input.style.flex='1';
    input.parentNode.appendChild(btn);
    let revealed=false;
    btn.onclick=()=>{
      revealed=!revealed;
      if(revealed){
        input.value=input.dataset.realValue;
        input.readOnly=false;
        input.style.background='';
        btn.textContent='🙈 Hide';
      }else{
        // Save any edits back to real value
        input.dataset.realValue=input.value;
        input.value=maskValue(input.value);
        input.readOnly=true;
        input.style.background='#f8fafc';
        btn.textContent='👁️ Reveal';
      }
    };
    // When saving, use the real value
    input.getRealValue=()=>input.dataset.realValue;
  }

  /* ============ AI IMAGE STUDIO ============ */
  let lastGeneratedImage = null;
  let studioRefImageData = null;
  // ChaskaBox product photo style presets (match site standards)
  const STUDIO_PRESETS = {
    chaskabox: 'Professional product photography, Pakistani snack packaging, clean white background, studio lighting, sharp focus, centered, e-commerce product shot, high detail',
    boxitem: 'Product box with single item pack beside it, clean white background, professional studio lighting, clear and close, e-commerce style, sharp focus',
    single: 'Single snack pack product shot, clean white background, professional studio lighting, centered, sharp focus, e-commerce product photography',
  };
  function initImageStudio(){
    // Style presets
    document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click', ()=>{
      const p=STUDIO_PRESETS[b.dataset.preset];
      if(p){
        const cur=$('#studioPrompt').value.trim();
        $('#studioPrompt').value = cur ? cur + ', ' + p : p;
        toast('Style preset added');
      }
    }));
    // Reference image upload
    $('#studioRefImage')?.addEventListener('change', e=>{
      const file=e.target.files?.[0];
      if(!file) return;
      if(file.size>4*1024*1024){toast('Image 4MB se choti honi chahiye');return;}
      const reader=new FileReader();
      reader.onload=ev=>{
        studioRefImageData=ev.target.result;
        $('#studioRefImg').src=studioRefImageData;
        $('#studioRefPreview').style.display='block';
      };
      reader.readAsDataURL(file);
    });
    $('#clearRefBtn')?.addEventListener('click', ()=>{
      studioRefImageData=null;
      $('#studioRefImage').value='';
      $('#studioRefPreview').style.display='none';
    });
    $('#generateImageBtn')?.addEventListener('click', async ()=>{
      const prompt=$('#studioPrompt').value.trim();
      if(!prompt||prompt.length<10){toast('Prompt likhen (min 10 chars)');return;}
      const btn=$('#generateImageBtn'); const old=btn.textContent;
      btn.disabled=true; btn.textContent='✨ Generating…';
      $('#studioPreview').innerHTML='<div class="admin-loading"><div class="spinner"></div><p>AI image bana raha hai…</p></div>';
      $('#studioActions').style.display='none';
      try{
        const data=await api('/api/admin/ai-image',{method:'POST',body:{
          prompt, type:$('#studioType').value, style:$('#studioStyle').value,
          reference_image: studioRefImageData,
        }});
        lastGeneratedImage=data.image_url;
        $('#studioPreview').innerHTML=`<img src="${data.image_url}" alt="Generated" style="max-width:100%;border-radius:8px"><p class="muted" style="font-size:11px;margin-top:8px">Via ${esc(data.source)}</p>`;
        $('#studioActions').style.display='flex';
        if(data.warnings) toast(data.warnings[0]);
      }catch(e){toast(e.message||'Generation failed');$('#studioPreview').innerHTML='<p class="muted">Failed. Try again.</p>';}
      finally{btn.disabled=false;btn.textContent=old;}
    });
    $('#downloadImageBtn')?.addEventListener('click', ()=>{
      if(!lastGeneratedImage) return;
      const a=document.createElement('a');
      a.href=lastGeneratedImage;
      a.download=`chaskabox-ai-${Date.now()}.png`;
      a.click();
      toast('Downloaded');
    });
    $('#newVariationBtn')?.addEventListener('click', ()=>$('#generateImageBtn').click());
    // Use generated image for a product: upload to media library + set as product image
    $('#useForProductBtn')?.addEventListener('click', async ()=>{
      if(!lastGeneratedImage){toast('Pehle image generate karen');return;}
      const q=prompt('Kis product ke liye? (naam ya ID likhen):');
      if(!q?.trim()) return;
      try{
        toast('Upload ho raha hai…');
        // Find product
        const sData=await api(`/api/admin/products?per_page=5&q=${encodeURIComponent(q.trim())}`);
        const prods=sData.products||[];
        if(!prods.length){toast('Product nahi mila');return;}
        let p=prods[0];
        if(prods.length>1){
          const ch=prods.map((x,i)=>`${i+1}. ${x.name}`).join('\n');
          const sel=prompt(`Kaunsa?\n${ch}\n\nNumber likhen:`,'1');
          p=prods[Number(sel)-1]||prods[0];
        }
        // Convert data URL → Blob → upload to media library
        let imageBlob;
        if(lastGeneratedImage.startsWith('data:')){
          const res=await fetch(lastGeneratedImage);
          imageBlob=await res.blob();
        }else{
          // Remote URL (Pollinations) — fetch and upload
          const res=await fetch(lastGeneratedImage);
          imageBlob=await res.blob();
        }
        const fd=new FormData();
        fd.append('file', imageBlob, `ai-product-${p.id}-${Date.now()}.png`);
        const up=await api('/api/admin/media',{method:'POST',body:fd});
        const imageUrl=up?.url;
        if(!imageUrl){toast('Upload fail');return;}
        // Confirm and apply
        if(!confirm(`"${p.name}" ki image update karen?\n\nNayi: ${imageUrl}\n\n(Purani version history mein save ho jayegi)`)) return;
        await api(`/api/admin/products/${p.id}`,{method:'PATCH',body:{image_url:imageUrl}});
        toast(`✅ ${p.name} ki image update ho gayi!`);
      }catch(e){toast(e.message||'Failed');}
    });
  }
})();
