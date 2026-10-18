(() => {
  'use strict';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>`Rs. ${Number(n||0).toLocaleString('en-PK')}`;
  const fmtDate=v=>{try{return new Date(v).toLocaleString('en-PK',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Karachi'})}catch{return String(v||'')}};
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

  async function signOutAdmin(scope='local'){
    if(scope==='global'&&!confirm('Sign out from all devices?'))return;
    const buttons=['#adminSignOut','#adminSidebarSignOut'].map(selector=>$(selector)).filter(Boolean);
    buttons.forEach(button=>button.disabled=true);
    try{
      const {error}=await SB.auth.signOut({scope});if(error)throw error;
      location.assign('/admin/');
    }catch(error){
      toast('Sign out failed: '+(error.message||'Please retry'));
      buttons.forEach(button=>button.disabled=false);
    }
  }

  function showLogin(message='Sign in with an approved staff account.'){
    hideBoot(); // bootstrap gate off — the login form is the only thing shown now
    const challenge=$('#liveAdminMfa');if(challenge)challenge.hidden=true;
    const mfaOverlay=$('#liveAdminMfa');if(mfaOverlay)mfaOverlay.hidden=true;
    let el=$('#liveAdminLogin'); if(!el){el=document.createElement('div');el.id='liveAdminLogin';el.className='live-admin-login';document.body.appendChild(el);} el.hidden=false;
    el.innerHTML=`<form class="live-login-card staff-login-card" id="liveLoginForm" aria-labelledby="staffLoginHeading">
      <div class="staff-login-brand"><img src="/images/logo-approved-20261017.png" alt="ChaskaBox"><div class="staff-login-brandname">CHASKABOX<small>ADMIN CONSOLE</small></div></div>
      <div class="staff-login-shield" aria-hidden="true">✓</div>
      <div class="staff-login-eyebrow"><span>SECURE STAFF ACCESS</span><span>STEP 1 OF 2</span></div>
      <h1 id="staffLoginHeading">Staff sign in</h1>
      <p class="staff-login-intro">${esc(message)}</p>
      <div class="staff-login-fields">
        <label for="liveEmail" class="staff-login-field-label">Work email</label>
        <input id="liveEmail" name="email" type="email" autocomplete="username" inputmode="email" spellcheck="false" autocapitalize="off" placeholder="name@company.com" required>
        <div class="staff-login-password-row"><label for="livePassword" class="staff-login-field-label">Password</label><a href="#" id="forgotPwLink">Forgot password?</a></div>
        <div class="staff-login-password-wrap"><input id="livePassword" name="password" type="password" autocomplete="current-password" required><button id="livePasswordToggle" type="button" aria-label="Show password" aria-pressed="false">Show</button></div>
      </div>
      <div id="liveLoginError" class="live-error staff-login-message" role="alert" hidden></div>
      <div id="liveLoginMsg" class="live-msg staff-login-message" role="status" hidden></div>
      <button class="btn primary staff-login-submit" id="liveLoginSubmit" type="submit">Sign in securely <span aria-hidden="true">→</span></button>
      <div class="staff-login-footer"><span><span aria-hidden="true">◈</span> Authorized staff only</span><a href="/">← Back to storefront</a></div>
      </form>`;
    const passwordInput=$('#livePassword'),passwordToggle=$('#livePasswordToggle');
    passwordToggle.onclick=()=>{
      const showing=passwordInput.type==='password';
      passwordInput.type=showing?'text':'password';
      passwordToggle.textContent=showing?'Hide':'Show';
      passwordToggle.setAttribute('aria-pressed',String(showing));
      passwordToggle.setAttribute('aria-label',showing?'Hide password':'Show password');
    };
    $('#liveLoginForm').onsubmit=async e=>{
      e.preventDefault();
      const err=$('#liveLoginError'),submit=$('#liveLoginSubmit');
      if(submit.disabled)return;
      err.hidden=true;submit.disabled=true;submit.textContent='Signing in…';
      try{
        if(!(await ensureClient()))throw new Error('Supabase public configuration unavailable');
        const res=await SB.auth.signInWithPassword({email:$('#liveEmail').value.trim(),password:$('#livePassword').value});
        if(res.error)throw res.error;
        session=res.data.session;
        const ready=await bootAuthenticated();
        if(ready)el.hidden=true;
      }catch(x){
        err.textContent=x.message||'Sign-in failed';
        err.hidden=false;
      }finally{
        submit.disabled=false;
        submit.innerHTML='Sign in securely <span aria-hidden="true">→</span>';
      }
    };
    $('#forgotPwLink').onclick=async e=>{e.preventDefault();const err=$('#liveLoginError');const msg=$('#liveLoginMsg');err.hidden=true;msg.hidden=true;const email=$('#liveEmail').value.trim();if(!email){err.textContent='Enter your email above first';err.hidden=false;return;}try{if(!(await ensureClient()))throw new Error('Supabase unavailable');const {error}=await SB.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/admin/'});if(error)throw error;msg.textContent='Reset link sent to '+email+'. Check your inbox.';msg.hidden=false;}catch(x){err.textContent=x.message||'Reset failed';err.hidden=false;}};
  }
  async function getMe(){ return await api('/api/admin/me'); }
  function roleAllows(...roles){return me&&roles.includes(me.role)}
  const ROLE_VIEWS={
    dashboard:['owner','manager','fulfilment','content'],
    orders:['owner','manager','fulfilment'],
    couriers:['owner','manager'],
    resolutions:['owner','manager'],
    coupons:['owner','manager'],
    shipping:['owner','manager'],
    analytics:['owner','manager'],
    backup:['owner'],
    studio:['owner','manager','content'],
    products:['owner','manager','content'],
    categories:['owner','manager','content'],
    brands:['owner','manager'],
    boxes:['owner','manager','content'],
    homepage:['owner','manager','content'],
    pages:['owner','manager','content'],
    navigation:['owner','manager','content'],
    theme:['owner','manager'],
    customers:['owner','manager'],
    reviews:['owner','manager','content'],
    media:['owner','manager','content'],
    notifications:['owner','manager'],
    agents:['owner'],
    assistant:['owner','manager','content'],
    health:['owner','manager'],
    preview:['owner','manager','fulfilment','content'],
    settings:['owner'],
    security:['owner','manager','fulfilment','content'],
  };
  function canOpenAdminView(name){return Boolean(me&&ROLE_VIEWS[name]?.includes(me.role));}
  function syncRoleNavigation(){
    $$('.admin-nav-btn').forEach(button=>{
      const allowed=canOpenAdminView(button.dataset.view);
      button.hidden=!allowed;
      button.style.display=allowed?'':'none';
      button.setAttribute('aria-hidden',String(!allowed));
    });
    $$('[data-jump]').forEach(button=>{
      const allowed=canOpenAdminView(button.dataset.jump);
      button.hidden=!allowed;button.style.display=allowed?'':'none';
    });
    for(const id of ['quickAddProductBtn','addProductBtn']){
      const button=$('#'+id);
      if(button){button.hidden=!canOpenAdminView('products');button.style.display=canOpenAdminView('products')?'':'none';}
    }
  }
  function wireNav(){
    $$('.admin-nav-btn').forEach(btn=>btn.addEventListener('click',()=>setTimeout(()=>{ $('#adminSidebar').classList.remove('open'); $('#sidebarBackdrop')?.classList.remove('show'); loadView(btn.dataset.view); },0),true));
  }
  async function loadView(name){
    if(!canOpenAdminView(name)){toast('Your staff role does not allow this panel.');return;}
    try{
      $('#view-'+name)?.querySelector('.admin-view-error')?.remove();
      if(name==='orders') await loadOrders();
      if(name==='couriers' && roleAllows('owner','manager')) await Promise.allSettled([loadCouriers(),loadOnlinePayments()]);
      if(name==='analytics' && roleAllows('owner','manager')) await loadAnalytics();
      if(name==='coupons' && roleAllows('owner','manager')) await loadCoupons();
      if(name==='shipping' && roleAllows('owner','manager')) await loadShipping();
      if(name==='resolutions' && roleAllows('owner','manager')) await loadResolutions();
      if(name==='customers' && roleAllows('owner','manager')) await loadCustomers();
      if(name==='reviews' && roleAllows('owner','manager','content')) await loadReviews();
      if(name==='pages') await (await import('./admin-pages.js?v=20261018-cms1')).mountPageEditor($('#view-pages'),{api,toast,canPublish:roleAllows('owner','manager')});
      if(name==='homepage' && roleAllows('owner','manager','content')) await loadHomepage();
      if(name==='media' && roleAllows('owner','manager','content')) await loadMedia();
      if(name==='settings' && roleAllows('owner')) await loadSettings();
      if(name==='security' && roleAllows('owner','manager','fulfilment','content')) await loadSecurity();
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
      const view=$('#view-'+name);
      if(view){const msg=document.createElement('div');msg.className='admin-view-error';msg.setAttribute('role','alert');msg.textContent='Could not load '+name+': '+(e.message||'Unknown error')+'. ';
        const retry=document.createElement('button');retry.type='button';retry.className='btn secondary compact';retry.textContent='Retry';retry.onclick=()=>loadView(name);msg.append(retry);view.prepend(msg);}
    }
  }
  /* ============ AUTH BOOTSTRAP GATE ============
     The #adminBoot overlay covers the shell until the staff session is verified.
     Signed-out visitors see only the overlay or the staff login form — never
     misleading empty/stale admin data. */
  let bootDone=false;
  function hideBoot(){ const b=$('#adminBoot'); if(b) b.style.display='none'; bootDone=true; try{window.chaskaAdminBooted=true;}catch(e){} try{forceRepaint();}catch(e){} }
  function forceRepaint(){ const d=document.documentElement; d.style.display='none'; void d.offsetHeight; d.style.display=''; }
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
      if(!window.chaskaAdminMfa)throw new Error('MFA login module unavailable');
      const passed=await window.chaskaAdminMfa.gate(SB,()=>bootAuthenticated(),()=>showLogin());
      if(!passed)return false;
      me=await getMe();
      syncRoleNavigation();
    }catch(e){
      if(location.hostname==='127.0.0.1')window.__qaAdminBootError=String(e?.stack||e);
      // A network blip must NEVER destroy a valid session — only real auth
      // failures (401/403) sign out. Anything else shows a retry state.
      if(![401,403].includes(e?.status)){ showBootError('Account verification is unavailable. Reload to retry; your session has been kept.'); return false; }
      try{ await SB?.auth?.signOut(); }catch(se){}
      hideBoot();
      showLogin(e && e.status===403 ? 'This account is not authorized for the ChaskaBox admin panel.' : undefined);
      return false;
    }
    $('#backendState').className='backend-state'; $('#backendState').innerHTML=`<span></span><b>Live backend</b><small>${esc(me.role)} · authenticated</small>`;
    $('#securityNotice').className='security-notice live'; $('#securityNotice').innerHTML=`<strong>Live secure mode:</strong> authenticated as <b>${esc(me.role)}</b>. Every write is re-authorized server-side and audited.`;
    const currentAccount=$('#adminCurrentAccount');if(currentAccount){currentAccount.textContent=me.user?.email||'Signed-in staff';currentAccount.hidden=false;}
    for(const selector of ['#adminSignOut','#adminSidebarSignOut']){const button=$(selector);if(button){button.hidden=false;button.onclick=()=>signOutAdmin('local');}}
    wireNav(); wireOrderFilters(); wireLiveProductEditor(); wireProductBulkActions(); wireBoxPreview(); wireHomepage(); wireMedia(); wireSettings(); wireBoxLive();
    hideBoot(); // session verified — reveal the console; views show their own loaders
    await Promise.allSettled([loadDashboard(),loadProducts()]);
    // Boot legacy admin.js catalogue UI now that we are authenticated.
    try{ await window.chaskaAdminDataBoot?.(); }catch(e){}
    const hash=location.hash||''; if(hash.startsWith('#order-')){ const id=hash.slice(7); document.querySelector('[data-view="orders"]')?.click(); setTimeout(()=>openOrder(id),250); }
    return true;
  }

  async function loadDashboard(){
    const results=await Promise.allSettled([api('/api/admin/attention'),api('/api/admin/orders?per_page=100'),roleAllows('owner','manager')?api('/api/admin/metrics?days=30'):Promise.reject(new Error('Revenue unavailable for this role')),api('/api/admin/boxes?per_page=1')]);
    const value=i=>results[i].status==='fulfilled'?results[i].value:null;
    const attention=value(0),od=value(1),metrics=value(2),boxes=value(3);
    $('#metricOrders').textContent=attention?.counts?.new_orders??'Unavailable';
    $('#metricRevenue').textContent=metrics?money(metrics.recognized_sales_pkr):'Unavailable';
    const mb=$('#metricBundles');if(mb)mb.textContent=boxes?.total??'Unavailable';
    const revenueCard=$('#metricRevenue')?.closest('.metric-card');if(revenueCard){const small=revenueCard.querySelector('small');if(small)small.textContent='Recognized sales · 30 days';}
    $('#orderNavCount').textContent=od?.total??'—';
    let panel=$('#needsAttentionPanel');if(!panel){panel=document.createElement('section');panel.id='needsAttentionPanel';panel.className='panel';$('#view-dashboard').appendChild(panel);}
    const rows=attention?.needs_attention||[];
    const heading='<div class="panel-head"><div><h2>Needs attention</h2><p>Showing '+Math.min(12,rows.length)+' of '+esc(attention?.needs_attention_total??rows.length)+' matching issues.</p></div><button class="text-btn" id="refreshAttention">Refresh</button></div>';
    panel.innerHTML=heading+(!attention?'<p role="alert">Attention status unavailable. Refresh to retry.</p>':rows.length?'<div class="attention-list">'+rows.slice(0,12).map(x=>'<button class="attention-row" data-open-order="'+esc(x.id)+'"><div><b>'+esc(x.order_number)+' · '+esc(x.customer_name)+'</b><small>'+esc(x.reason.replaceAll('_',' '))+' · '+x.age_minutes+' min · '+money(x.total)+'</small></div><span>Open →</span></button>').join('')+'</div>':'<div class="empty-mini">Nothing urgent right now.</div>');
    $('#refreshAttention')?.addEventListener('click',loadDashboard);$$('[data-open-order]',panel).forEach(b=>b.onclick=()=>openOrder(b.dataset.openOrder));
    // Phase 2C: KPI cards open relevant detail
    const cardNav=[
      ['#metricOrders','orders','Open Orders'],
      ['#metricRevenue','analytics','Open Analytics'],
      ['#metricBundles','boxes','Open Chaska Box Builder'],
      ['#metricProducts','products','Open Products'],
    ];
    cardNav.forEach(([sel,view,title])=>{
      const card=$(sel)?.closest('.metric-card');
      if(card&&!card.dataset.linked){card.dataset.linked='1';card.style.cursor='pointer';card.title=title;card.onclick=()=>switchView(view);}
    });
  }

  function collectOrderFilters(){
    const q=$('#orderSearch')?.value?.trim()||'';
    const status=$('#orderStatusFilter')?.value||'';
    const payment=$('#orderPaymentFilter')?.value||'';
    const method=$('#orderMethodFilter')?.value||'';
    const from=$('#orderDateFrom')?.value||'';
    const to=$('#orderDateTo')?.value||'';
    if(from&&to&&from>to)throw new Error('From date must be on or before To date.');
    const sp=new URLSearchParams();
    if(q)sp.set('q',q);
    if(status)sp.set('fulfilment_status',status);
    if(payment)sp.set('payment_status',payment);
    if(method)sp.set('method',method);
    if(from)sp.set('date_from',from);
    if(to)sp.set('date_to',to);
    return sp;
  }
  function syncOrderQuickViews(){
    const status=$('#orderStatusFilter')?.value||'';
    const payment=$('#orderPaymentFilter')?.value||'';
    const method=$('#orderMethodFilter')?.value||'';
    const q=$('#orderSearch')?.value?.trim()||'';
    const dates=Boolean($('#orderDateFrom')?.value||$('#orderDateTo')?.value);
    let view='custom';
    if(!method&&!q&&!dates){
      if(!status&&!payment)view='all';
      else if(status==='new'&&!payment)view='new';
      else if(!status&&payment==='payment_submitted')view='payment_submitted';
      else if(status==='dispatched'&&!payment)view='dispatched';
    }
    $$('[data-order-view]').forEach(button=>{
      const active=button.dataset.orderView===view;
      button.setAttribute('aria-pressed',String(active));
    });
    const note=$('#orderActiveView');
    if(note)note.textContent=view==='custom'?'Custom order filters active.':{
      all:'Showing all orders',new:'Filtering to new orders',
      payment_submitted:'Filtering to submitted payments',dispatched:'Filtering to dispatched orders'
    }[view]+'.';
  }
  function wireOrderFilters(){
    const q=$('#orderSearch');
    if(q){q.disabled=false;q.addEventListener('input',debounce(()=>{syncOrderQuickViews();loadOrders(1);},250));}
    for(const id of ['orderStatusFilter','orderPaymentFilter','orderMethodFilter','orderDateFrom','orderDateTo']){
      const el=$('#'+id);
      if(el){el.disabled=false;el.addEventListener('change',()=>{syncOrderQuickViews();loadOrders(1);});}
    }
    $('#orderResetFilters')?.addEventListener('click',()=>{
      for(const id of ['orderSearch','orderStatusFilter','orderPaymentFilter','orderMethodFilter','orderDateFrom','orderDateTo']){
        const el=$('#'+id);if(el)el.value='';
      }
      syncOrderQuickViews();
      loadOrders(1);
    });
    // Presets set existing secured API query parameters; no writes or message sends.
    $$('[data-order-view]').forEach(button=>{
      button.disabled=false;
      button.addEventListener('click',()=>{
        for(const id of ['orderSearch','orderStatusFilter','orderPaymentFilter','orderMethodFilter','orderDateFrom','orderDateTo']){
          const el=$('#'+id);if(el)el.value='';
        }
        if(button.dataset.orderView==='new')$('#orderStatusFilter').value='new';
        if(button.dataset.orderView==='payment_submitted')$('#orderPaymentFilter').value='payment_submitted';
        if(button.dataset.orderView==='dispatched')$('#orderStatusFilter').value='dispatched';
        syncOrderQuickViews();
        loadOrders(1);
      });
    });
    syncOrderQuickViews();
    const exportBtn=$('#orderExportCsv');
    if(exportBtn){
      const allowed=roleAllows('owner','manager');
      exportBtn.hidden=!allowed;
      exportBtn.disabled=!allowed;
      exportBtn.onclick=async()=>{
        if(!allowed)return;
        const feedback=$('#orderFilterFeedback');
        try{
          const filters=collectOrderFilters();
          if(feedback)feedback.textContent='';
          exportBtn.disabled=true;exportBtn.textContent='Exporting…';
          const t=await token();
          const url='/api/admin/orders/export.csv'+(filters.size?'?'+filters:'');
          const r=await fetch(url,{headers:{Authorization:`Bearer ${t}`}});
          if(!r.ok)throw new Error('CSV export unavailable ('+r.status+'). Narrow the date range or retry.');
          const blob=await r.blob();
          const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='chaskabox-orders.csv';a.click();
          setTimeout(()=>URL.revokeObjectURL(u),1000);
          if(feedback)feedback.textContent='Filtered export prepared.';
        }catch(e){if(feedback)feedback.textContent=e.message;toast(e.message);}
        finally{exportBtn.disabled=false;exportBtn.textContent='Export filtered CSV';}
      };
    }
  }
  function debounce(fn,ms){let t;return()=>{clearTimeout(t);t=setTimeout(fn,ms)}}
  let orderRequestSequence=0;
  async function loadOrders(page=1){
    const feedback=$('#orderFilterFeedback');
    let filters;
    try{filters=collectOrderFilters();if(feedback)feedback.textContent='';}
    catch(e){if(feedback)feedback.textContent=e.message;return;}
    const sp=new URLSearchParams({per_page:'50',page:String(Number.isSafeInteger(page)&&page>0?page:1)});
    for(const [k,v] of filters)sp.set(k,v);
    const sequence=++orderRequestSequence;
    const data=await api('/api/admin/orders?'+sp);
    if(sequence!==orderRequestSequence)return;
    orders=data.orders||[];
    const target=$('#view-orders .empty-backend')||$('#view-orders .live-table-wrap')?.parentElement||$('#orderListWrap');
    if(!target) return;
    target.classList.remove('empty-backend'); target.innerHTML=orders.length?`<div class="live-table-wrap"><table class="live-table"><thead><tr><th>Order</th><th>Customer</th><th>Payment</th><th>Fulfilment</th><th>Total</th><th></th></tr></thead><tbody>${orders.map(o=>`<tr><td><b>${esc(o.order_number)}</b><small>${fmtDate(o.created_at)}</small></td><td>${esc(o.customer_name)}<small>${esc(o.customer_phone)}</small></td><td><span class="status-pill">${esc(o.payment_status)}</span><small>${esc(o.payment_method)}</small></td><td><span class="status-pill ${esc(o.fulfilment_status)}">${esc(o.fulfilment_status)}</span></td><td><b>${money(o.total)}</b></td><td><button class="btn secondary compact" data-order="${esc(o.id)}">Manage</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-mini">No matching orders.</div>';
    wirePager(target,data,loadOrders);
    $$('[data-order]',target).forEach(b=>b.onclick=()=>openOrder(b.dataset.order));
  }
  async function askForOrderDecision(title,description){
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog');dialog.className='admin-ops-dialog order-decision-dialog';
      const form=document.createElement('form');form.noValidate=true;
      const heading=document.createElement('h2');heading.textContent=title;
      const note=document.createElement('p');note.className='muted';note.textContent=description;
      const label=document.createElement('label');label.className='admin-ops-field';label.textContent='Evidence / reason (required)';
      const field=document.createElement('textarea');field.required=true;field.rows=3;field.maxLength=500;label.append(field);
      const actions=document.createElement('div');actions.className='admin-ops-actions';
      const cancel=document.createElement('button');cancel.type='button';cancel.className='btn secondary';cancel.textContent='Cancel';
      const save=document.createElement('button');save.type='submit';save.className='btn primary';save.textContent='Confirm';
      actions.append(cancel,save);form.append(heading,note,label,actions);dialog.append(form);document.body.append(dialog);
      let finished=false;const close=v=>{if(finished)return;finished=true;dialog.remove();resolve(v);};
      cancel.onclick=()=>close(null);dialog.oncancel=e=>{e.preventDefault();close(null);};
      form.onsubmit=e=>{e.preventDefault();const v=field.value.trim();if(v.length<3){field.setCustomValidity('Please provide at least three characters.');field.reportValidity();return;}close(v);};
      field.oninput=()=>field.setCustomValidity('');
      if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
      field.focus();
    });
  }

  async function openOrder(id){
    const data=await api(`/api/admin/orders/${encodeURIComponent(id)}`),o=data.order, items=data.items||[],shipment=data.courier_shipment,advance=data.cod_advance||{required_pkr:0,received_pkr:0,remaining_pkr:0,courier_cod_pkr:Number(o.total||0),receipts:[]};
    let modal=$('#liveOrderModal'); if(!modal){modal=document.createElement('div');modal.id='liveOrderModal';modal.className='admin-modal';document.body.appendChild(modal);} modal.classList.add('open');
    const flow=['new','sourcing','packed','dispatched','delivered']; const idx=flow.indexOf(o.fulfilment_status); const next=idx>=0&&idx<flow.length-1?flow[idx+1]:null;
    modal.innerHTML=`<div class="modal-backdrop" data-close-order></div><section class="admin-modal-card live-order-card"><div class="modal-head"><div><small>ORDER</small><h2>${esc(o.order_number)}</h2></div><button class="icon-btn" data-close-order>×</button></div><div class="order-detail-grid"><section><h3>Customer</h3><p><b>${esc(o.customer_name)}</b><br>${esc(o.customer_phone)}<br>${esc(o.customer_address)}, ${esc(o.customer_city)}</p><h3>Items</h3><div class="order-items">${items.map(i=>`<div><span>${esc(i.product_name)} · ${esc(i.pack)} × ${i.quantity}</span><b>${money(i.line_total)}</b></div>`).join('')}</div></section><section><h3>Payment</h3><p>${esc(o.payment_method)} · <b>${esc(o.payment_status)}</b>${o.transaction_reference?`<br>Ref: ${esc(o.transaction_reference)}`:''}</p><h3>Total</h3><p>Subtotal ${money(o.subtotal)}<br>Delivery ${money(o.delivery_fee)}<br><b>${money(o.total)}</b></p><h3>COD advance</h3><p>${o.payment_method==='cod'?(Number(advance.required_pkr)>0?'Required: '+money(advance.required_pkr)+' · Verified: '+money(advance.received_pkr)+' · Remaining advance: '+money(advance.remaining_pkr)+' · Courier COD: '+money(advance.courier_cod_pkr):'No advance required on this order'):'Not applicable to fully prepaid orders'}</p>
        ${Number(advance.required_pkr)>0?'<p class="safe-note">Verify the actual JazzCash/bank statement before recording advance. Packing and dispatch are blocked until full advance is verified.</p>':''}
        ${(advance.receipts||[]).map(r=>'<small>'+esc(r.channel)+' · '+money(r.amount_pkr)+' · Ref: '+esc(r.reference)+' · '+esc(r.received_on)+'</small>').join('<br>')}
        ${Number(advance.remaining_pkr)>0&&roleAllows('owner','manager')?'<p><button class="btn secondary" id="recordCodAdvanceBtn" type="button">Record verified COD advance</button></p>':''}
        <h3>Courier dispatch</h3><p>${shipment?esc(shipment.courier_name_snapshot)+(shipment.tracking_number?' · Tracking: '+esc(shipment.tracking_number):'')+' · Settlement: '+shipment.settlement_days_snapshot+' days after delivery':'Not assigned yet'}</p><h3>Actions</h3><div class="order-actions">${next?`<button class="btn primary" data-status="${next}">Move to ${esc(next)}</button>`:''}${!['delivered','cancelled'].includes(o.fulfilment_status)?'<button class="btn danger" data-status="cancelled">Cancel</button>':''}${['payment_submitted','awaiting_payment'].includes(o.payment_status)?'<button class="btn secondary" data-pay="verified">Verify payment</button><button class="btn secondary" data-pay="rejected">Reject payment</button>':''}<button class="btn secondary" data-retry>Retry notification</button></div><h3>Status history</h3><div class="history-list">${(data.history||[]).map(h=>`<div><b>${esc(h.action)}</b><small>${fmtDate(h.created_at)} · ${esc(h.actor_role)}</small></div>`).join('')||'<small>No audit events yet.</small>'}</div></section></div></section>`;
    const advanceButton=$('#recordCodAdvanceBtn');
    if(advanceButton)advanceButton.onclick=async()=>{
      const max=Number(advance.remaining_pkr);
      const verified=await courierDialog('Verify COD advance · '+o.order_number,[
        {id:'amount_pkr',type:'number',label:'Verified advance received (PKR)',required:true,min:1,max,value:max},
        {id:'channel',type:'select',label:'Paid through',required:true,options:[
          {value:'jazzcash',label:'JazzCash'},{value:'bank_transfer',label:'Bank Transfer'}
        ]},
        {id:'received_on',type:'date',label:'Bank/wallet statement date',required:true,value:pkToday()},
        {id:'reference',label:'Actual statement / transaction reference',required:true,maxLength:120}
      ],async v=>{
        const amount=Number(v.amount_pkr);
        if(!Number.isSafeInteger(amount)||amount<1||amount>max)throw Error('Advance exceeds amount required');
        if(!/^\d{4}-\d{2}-\d{2}$/.test(v.received_on)||v.received_on>pkToday())throw Error('Enter a valid receipt date, not in the future');
        if(String(v.reference).trim().length<3)throw Error('Verify and enter the actual statement reference');
        return api('/api/admin/orders/'+encodeURIComponent(id)+'/cod-advance',{method:'POST',body:{
          amount_pkr:amount,channel:v.channel,received_on:v.received_on,reference:v.reference.trim()
        }});
      });
      if(verified){toast('Verified COD advance recorded');await openOrder(id);await loadOrders();}
    };
    $$('[data-close-order]',modal).forEach(x=>x.onclick=()=>modal.classList.remove('open'));
    $$('[data-status]',modal).forEach(b=>b.onclick=async()=>{
      if(b.disabled)return;
      const st=b.dataset.status,body={fulfilment_status:st,expected_updated_at:o.updated_at};
      if(st==='cancelled'){
        const reason=await askForOrderDecision('Cancel '+o.order_number,'Cancellation is irreversible. Record the reason.');
        if(!reason)return;body.cancel_reason=reason;
      }else if(st==='dispatched'){
        const assignment=await chooseCourierForDispatch(o.order_number);
        if(!assignment)return;
        body.courier_id=assignment.courier_id;
        body.tracking_number=assignment.tracking_number;
      }else if(!confirm('Advance order '+o.order_number+' to '+st+'?'))return;
      b.disabled=true;
      try{await api('/api/admin/orders/'+encodeURIComponent(id)+'/status',{method:'PATCH',body});toast('Order updated');modal.classList.remove('open');await Promise.allSettled([loadOrders(),loadDashboard()]);}
      catch(e){toast('Order update failed: '+e.message);await openOrder(id).catch(()=>{});}finally{b.disabled=false;}
    });
    $$('[data-pay]',modal).forEach(b=>b.onclick=async()=>{
      if(b.disabled)return;
      const decision=b.dataset.pay;
      if(decision==='verified'&&!String(o.transaction_reference||'').trim()){toast('A transaction reference is required before payment approval.');return;}
      const note=await askForOrderDecision(
        decision==='verified'?'Verify prepaid payment · '+o.order_number:'Reject prepaid payment · '+o.order_number,
        decision==='verified'?'Confirm the reference against your actual receiving account. This decision does not contact the payment provider.':'Record the reason before rejecting payment.'
      );
      if(!note)return;
      const actions=$$('[data-pay], [data-status], [data-retry]',modal);actions.forEach(btn=>btn.disabled=true);
      try{
        await api('/api/admin/orders/'+encodeURIComponent(id)+'/payment/verify',{method:'POST',body:{decision,note,expected_updated_at:o.updated_at}});
        toast('Payment review recorded');modal.classList.remove('open');await Promise.allSettled([loadOrders(),loadDashboard()]);
      }catch(e){toast('Payment review failed: '+e.message);await openOrder(id).catch(()=>{});}
      finally{actions.forEach(btn=>btn.disabled=false);}
    });
    $('[data-retry]',modal).onclick=async e=>{
      const b=e.currentTarget;if(b.disabled)return;b.disabled=true;
      try{
        const r=await api('/api/admin/orders/'+encodeURIComponent(id)+'/notifications/retry',{method:'POST',body:{}});
        toast(r.queued?String(r.queued)+' notification(s) queued; delivery is not yet confirmed':'No safe retries available; review Notifications');
      }catch(err){toast('Notification retry failed: '+err.message);}finally{b.disabled=false;}
    };
    // Print invoice / packing slip
    const printBar = document.createElement('div');
    printBar.style.cssText = 'display:flex;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)';
    printBar.innerHTML = `<button class="btn secondary" id="printInvoiceBtn">🖨️ Print Invoice</button><button class="btn secondary" id="printPackingBtn">📦 Packing Slip</button>`;
    modal.querySelector('.live-order-card').appendChild(printBar);
    $('#printInvoiceBtn').onclick = () => printInvoice(o, items, false, advance);
    $('#printPackingBtn').onclick = () => printInvoice(o, items, true, advance);
  }


  /* COURIER COD CONTROL: settlement forecast and bank-confirmed receipts are separate. */
  function pkToday(){
    const parts=Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const get=t=>parts.find(p=>p.type===t)?.value||'';
    return get('year')+'-'+get('month')+'-'+get('day');
  }
  function courierDialog(title,fields,onSave){
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog');dialog.className='admin-ops-dialog';
      const form=document.createElement('form');form.noValidate=true;
      const h=document.createElement('h2');h.textContent=title;form.append(h);
      const entries={};
      for(const f of fields){
        const wrap=document.createElement('label');wrap.className='admin-ops-field';wrap.textContent=f.label;
        const el=document.createElement(f.type==='select'?'select':'input');
        el.name=f.id;entries[f.id]=el;
        if(f.type==='select'){for(const o of f.options||[]){const option=document.createElement('option');option.value=String(o.value);option.textContent=o.label;el.append(option);}}
        else {el.type=f.type||'text';if(f.min!==undefined)el.min=f.min;if(f.max!==undefined)el.max=f.max;if(f.maxLength)el.maxLength=f.maxLength;}
        if(f.required)el.required=true;
        if(f.type==='checkbox')el.checked=f.value!==false;
        else el.value=String(f.value??'');
        wrap.append(el);form.append(wrap);
      }
      const error=document.createElement('p');error.hidden=true;error.setAttribute('role','alert');form.append(error);
      const actions=document.createElement('div');actions.className='admin-ops-actions';
      const cancel=document.createElement('button');cancel.type='button';cancel.className='btn secondary';cancel.textContent='Cancel';
      const submit=document.createElement('button');submit.type='submit';submit.className='btn primary';submit.textContent='Save';
      actions.append(cancel,submit);form.append(actions);dialog.append(form);document.body.append(dialog);
      let finished=false;
      const finish=r=>{if(finished)return;finished=true;dialog.close();dialog.remove();resolve(r);};
      cancel.onclick=()=>finish(null);
      dialog.oncancel=e=>{e.preventDefault();finish(null)};
      form.onsubmit=async e=>{
        e.preventDefault();if(!form.reportValidity())return;
        const values={};for(const [k,node]of Object.entries(entries))values[k]=node.type==='checkbox'?node.checked:node.value;
        submit.disabled=true;error.hidden=true;
        try{const result=await onSave(values);finish(result);}
        catch(err){error.textContent=err.message||'Not saved';error.hidden=false;}
        finally{submit.disabled=false;}
      };
      dialog.showModal();
    });
  }
  async function chooseCourierForDispatch(orderNumber){
    const response=await api('/api/admin/couriers'),active=(response.couriers||[]).filter(x=>x.is_active);
    if(!active.length){
      toast('No courier configured. Owner/Manager: add one in Courier COD Ledger before dispatch.');
      return null;
    }
    return courierDialog('Dispatch '+orderNumber+' with courier',[
      {id:'courier_id',type:'select',label:'Courier company',required:true,
       options:active.map(c=>({value:c.id,label:c.name+' · pays '+c.settlement_days+' days after delivery'}))},
      {id:'tracking_number',type:'text',label:'Tracking / consignment number (optional)',maxLength:120}
    ],v=>{
      if(!active.some(c=>String(c.id)===String(v.courier_id)))throw Error('Choose an active courier');
      if(v.tracking_number&&!/^[A-Za-z0-9][A-Za-z0-9 /._-]{0,119}$/.test(v.tracking_number))throw Error('Tracking contains invalid characters');
      return {courier_id:Number(v.courier_id),tracking_number:String(v.tracking_number).trim()};
    });
  }
  async function editCourierCompany(company){
    const saved=await courierDialog(company?'Edit courier rule':'Add courier company',[
      {id:'name',label:'Courier company name',required:true,value:company?.name||'',maxLength:100},
      {id:'settlement_days',type:'number',label:'Calendar days after delivery until expected COD payment',required:true,min:0,max:120,value:company?.settlement_days??''},
      {id:'deduction_per_order_pkr',type:'number',label:'Courier deduction per COD order (PKR; enter 0 if courier remits gross)',required:true,min:0,max:100000,value:company?.deduction_per_order_pkr??0},
      {id:'is_active',type:'checkbox',label:'Available for future dispatch',value:company?.is_active??true}
    ],async v=>{
      const days=Number(v.settlement_days),deduction=Number(v.deduction_per_order_pkr),name=String(v.name).trim();
      if(name.length<2||name.length>100||!Number.isInteger(days)||days<0||days>120||!Number.isInteger(deduction)||deduction<0||deduction>100000)
       throw Error('Check company name, settlement days and deduction');
      return api(company?'/api/admin/couriers/'+company.id:'/api/admin/couriers',{method:company?'PATCH':'POST',
       body:{name,settlement_days:days,deduction_per_order_pkr:deduction,is_active:v.is_active}});
    });
    if(saved){toast('Courier settings saved');await loadCouriers();}
  }
  async function recordCourierReceipt(row){
    const max=Number(row.outstanding_pkr);
    if(max<=0)return;
    const saved=await courierDialog('Confirm actual courier COD receipt · '+row.order_number,[
      {id:'amount_pkr',type:'number',label:'Amount received in bank/cash (PKR)',min:1,max,required:true,value:max},
      {id:'received_on',type:'date',label:'Actual date received',required:true,value:pkToday()},
      {id:'reference',label:'Bank/statement reference (required)',required:true,maxLength:120}
    ],async v=>{
      const amount=Number(v.amount_pkr);
      if(!Number.isSafeInteger(amount)||amount<=0||amount>max)throw Error('Amount must not exceed remaining expected COD');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(v.received_on)||v.received_on>pkToday())throw Error('Enter a valid received date, not in the future');
      if(String(v.reference).trim().length<3)throw Error('Bank/statement reference is required');
      return api('/api/admin/couriers/receipts',{method:'POST',body:{
       order_id:row.order_id,amount_pkr:amount,received_on:v.received_on,reference:v.reference.trim()
      }});
    });
    if(saved){toast('Confirmed COD receipt recorded');await loadCouriers();}
  }
  async function loadCouriers(){
    const companies=$('#courierCompanies'),summary=$('#courierCodSummary'),ledger=$('#courierCodLedger');
    if(!companies||!summary||!ledger)return;
    companies.textContent='Loading couriers…';summary.textContent='Calculating…';
    const [c,l]=await Promise.all([api('/api/admin/couriers'),api('/api/admin/couriers/ledger')]);
    const cs=c.couriers||[],rows=l.ledger||[],unassigned=l.unassigned||[];
    companies.innerHTML=cs.length?'<div class="live-table-wrap"><table class="live-table"><thead><tr><th>Courier</th><th>COD settlement</th><th>Deduction per order</th><th>Status</th><th></th></tr></thead><tbody>'+cs.map(x=>'<tr><td><b>'+esc(x.name)+'</b></td><td>'+Number(x.settlement_days)+' calendar days after delivery</td><td>'+money(x.deduction_per_order_pkr)+'</td><td>'+(x.is_active?'Active':'Disabled')+'</td><td><button class="btn secondary compact" data-edit-courier="'+x.id+'">Edit</button></td></tr>').join('')+'</tbody></table></div>':'<p>No courier companies yet. Add each real delivery partner with its COD payment delay.</p>';
    const tod=pkToday();
    const delivered=rows.filter(x=>x.payment_method==='cod'&&x.fulfilment_status==='delivered'&&x.payment_status!=='refunded');
    const sum=key=>delivered.reduce((n,x)=>n+Number(x[key]||0),0);
    const expected=sum('estimated_remittance_pkr'),received=sum('received_pkr'),due=sum('outstanding_pkr');
    const overdue=delivered.filter(x=>x.expected_settlement_on&&x.expected_settlement_on<tod&&Number(x.outstanding_pkr)>0);
    const inTransit=rows.filter(x=>x.payment_method==='cod'&&x.fulfilment_status==='dispatched');
    const badges=[
      ['Delivered COD receivable',money(expected)],
      ['Recorded as actually received',money(received)],
      ['Outstanding',money(due)],
      ['Overdue COD',money(overdue.reduce((n,x)=>n+Number(x.outstanding_pkr),0))],
      ['COD in transit',money(inTransit.reduce((n,x)=>n+Number(x.estimated_remittance_pkr),0))]
    ];
    summary.innerHTML='<div class="metric-grid">'+badges.map(([label,value])=>'<article class="metric-card"><div><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div></article>').join('')+'</div>'+
      (unassigned.length?'<p role="status"><b>'+unassigned.length+' delivered COD orders lack courier assignment.</b> Do not attribute them to a courier without verifying historical records.</p>':'')+
      '<p class="safe-note">Forecast uses original COD total minus the courier deduction captured at dispatch. Receipt is only counted after bank/statement verification and a manual entry; courier deductions and actual statements may differ.</p>';
    const companyGroups=cs.map(c=>{
      const matched=delivered.filter(x=>String(x.courier_id)===String(c.id));
      const total=key=>matched.reduce((n,x)=>n+Number(x[key]||0),0);
      const late=matched.filter(x=>x.expected_settlement_on&&x.expected_settlement_on<tod&&Number(x.outstanding_pkr)>0);
      return {name:c.name,orders:matched.length,estimated:total('estimated_remittance_pkr'),
       received:total('received_pkr'),outstanding:total('outstanding_pkr'),
       overdue:late.reduce((n,x)=>n+Number(x.outstanding_pkr),0)};
    }).filter(x=>x.orders>0);
    const byCompany=companyGroups.length?'<h3>Courier-wise COD settlement</h3><div class="live-table-wrap"><table class="live-table"><thead><tr><th>Courier</th><th>Delivered COD</th><th>Expected net</th><th>Received</th><th>Outstanding</th><th>Overdue</th></tr></thead><tbody>'+
      companyGroups.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+x.orders+'</td><td>'+money(x.estimated)+'</td><td>'+money(x.received)+'</td><td>'+money(x.outstanding)+'</td><td>'+money(x.overdue)+'</td></tr>').join('')+'</tbody></table></div>':'';
    ledger.innerHTML=byCompany+(rows.length?'<div class="live-table-wrap"><table class="live-table"><thead><tr><th>Order</th><th>Courier / tracking</th><th>Delivery</th><th>Expected receipt</th><th>Expected net</th><th>Received</th><th>Outstanding</th><th></th></tr></thead><tbody>'+
      rows.map(x=>'<tr><td><b>'+esc(x.order_number)+'</b><small>'+esc(x.fulfilment_status)+'</small></td><td>'+esc(x.courier_name)+(x.tracking_number?'<small>'+esc(x.tracking_number)+'</small>':'')+'</td><td>'+esc(x.delivered_at?String(x.delivered_at).slice(0,10):'In transit')+'</td><td>'+esc(x.expected_settlement_on||'After delivery')+(x.expected_settlement_on&&x.expected_settlement_on<tod&&Number(x.outstanding_pkr)>0?' · OVERDUE':'')+'</td><td>'+money(x.estimated_remittance_pkr)+'</td><td>'+money(x.received_pkr)+'</td><td>'+money(x.outstanding_pkr)+'</td><td>'+((x.payment_method==='cod'&&x.fulfilment_status==='delivered'&&Number(x.outstanding_pkr)>0)?'<button class="btn secondary compact" data-cod-receipt="'+esc(x.order_id)+'">Record receipt</button>':'—')+'</td></tr>').join('')+'</tbody></table></div>':'<p>No courier dispatch records yet. Assign a courier when moving an order from Packed to Dispatched.</p>');
    if(l.warning)ledger.insertAdjacentHTML('afterbegin','<p role="alert">'+esc(l.warning)+'</p>');
    companies.querySelectorAll('[data-edit-courier]').forEach(b=>b.onclick=()=>editCourierCompany(cs.find(x=>String(x.id)===b.dataset.editCourier)));
    ledger.querySelectorAll('[data-cod-receipt]').forEach(b=>b.onclick=()=>recordCourierReceipt(rows.find(x=>x.order_id===b.dataset.codReceipt)));
    $('#addCourierCompany').onclick=()=>editCourierCompany(null);
    $('#refreshCourierLedger').onclick=loadCouriers;
  }


  /* ONLINE PAYMENT RECONCILIATION: customer verification does not create bank receipts. */
  async function editOnlineAccount(account){
    const saved=await courierDialog('Online payment account · '+account.display_name,[
      {id:'account_label',label:'Wallet / destination account label (optional; no account or card numbers)',value:account.account_label||'',maxLength:100},
      {id:'settlement_days',type:'number',label:'Expected calendar days after payment verification (blank = unknown)',min:0,max:120,value:account.settlement_days??''}
    ],async v=>{
      const days=v.settlement_days.trim()===''?null:Number(v.settlement_days);
      const label=v.account_label.trim();
      if((days!==null&&(!Number.isSafeInteger(days)||days<0||days>120))||(label&&label.length<2)||label.length>100)throw Error('Enter a valid account label or 0–120 days');
      return api('/api/admin/online-payments/accounts',{method:'PATCH',body:{
       method:account.method,account_label:label,settlement_days:days
      }});
    });
    if(saved){toast('Online payment account settings saved');await loadOnlinePayments();}
  }
  async function recordOnlineReceipt(row){
    const max=Number(row.unreconciled_pkr);
    if(max<1)return;
    const result=await courierDialog('Record verified online payout · '+row.order_number,[
      {id:'amount_pkr',type:'number',label:'Actual amount credited to wallet/bank (PKR)',required:true,min:1,max,value:max},
      {id:'processing_fee_pkr',type:'number',label:'Processor fees/deductions applied to this order (PKR)',required:true,min:0,max,value:0},
      {id:'received_on',type:'date',label:'Actual credit/settlement date',required:true,value:pkToday()},
      {id:'reference',type:'text',label:'Bank/wallet statement reference (required)',required:true,maxLength:120}
    ],async v=>{
      const amount=Number(v.amount_pkr),fee=Number(v.processing_fee_pkr);
      if(!Number.isSafeInteger(amount)||amount<1||!Number.isSafeInteger(fee)||fee<0||amount+fee>max)
        throw Error('Payout and fee together cannot exceed remaining order amount');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(v.received_on)||v.received_on>pkToday())
        throw Error('Enter a valid settlement date not in the future');
      if(String(v.reference).trim().length<3)throw Error('Statement reference must be at least 3 characters');
      return api('/api/admin/online-payments/receipts',{method:'POST',body:{
        order_id:row.order_id,amount_pkr:amount,processing_fee_pkr:fee,
        received_on:v.received_on,reference:v.reference.trim()
      }});
    });
    if(result){toast('Online payment payout recorded');await loadOnlinePayments();}
  }
  async function loadOnlinePayments(){
    const accountsEl=$('#onlinePaymentAccounts'),summaryEl=$('#onlinePaymentSummary'),tableEl=$('#onlinePaymentTable'),cardEl=$('#cardGatewayControl');
    if(!accountsEl||!summaryEl||!tableEl||!cardEl)return;
    accountsEl.textContent='Loading online payment accounts…';
    try{
      const result=await api('/api/admin/online-payments'),accounts=result.accounts||[],rows=result.ledger||[],card=result.card_gateway||{};
      const verified=rows.filter(r=>r.payment_status==='payment_verified'&&r.fulfilment_status!=='cancelled');
      const sum=(list,key)=>list.reduce((n,r)=>n+Number(r[key]||0),0),today=pkToday();
      const methods=[['jazzcash','JazzCash'],['bank_transfer','Bank Transfer']];
      const blocks=methods.map(([method,label])=>{
        const account=accounts.find(a=>a.method===method),all=rows.filter(r=>r.payment_method===method),
         ok=verified.filter(r=>r.payment_method===method);
        return '<article class="metric-card"><div><small>'+esc(label)+' · '+all.length+' orders</small><strong>'+money(sum(ok,'verified_gross_pkr'))+'</strong><em>Verified orders · Credited '+money(sum(ok,'received_pkr'))+' · Pending reconciliation '+money(sum(ok,'unreconciled_pkr'))+'</em>'+(account?'<button type="button" class="btn secondary compact" data-online-account="'+method+'">Account rules</button>':'')+'</div></article>';
      });
      blocks.push('<article class="metric-card"><div><small>BOP card gateway</small><strong>'+(card.effective_enabled?'Active':'Disabled')+'</strong><em>'+Number(card.transactions?.length||0)+' provider transactions recorded · Merchant verification required before activating</em></div></article>');
      const unreconciled=sum(verified,'unreconciled_pkr'),received=sum(verified,'received_pkr');
      const awaiting=rows.filter(r=>['payment_submitted','awaiting_payment'].includes(r.payment_status));
      const overdue=verified.filter(r=>r.expected_settlement_on&&r.expected_settlement_on<today&&Number(r.unreconciled_pkr)>0);
      const companyOptions=accounts.map(a=>'<tr><td>'+esc(a.display_name)+'</td><td>'+esc(a.account_label||'Not set')+'</td><td>'+esc(a.settlement_days===null?'Not configured':a.settlement_days+' days after verification')+'</td><td><button class="btn secondary compact" data-online-account="'+esc(a.method)+'">Edit</button></td></tr>').join('');
      accountsEl.innerHTML='<p class="safe-note">JazzCash wallet/account and bank transfer are supported. Account labels are optional internal names, not banking credentials. Card payments remain disabled until a real gateway is connected.</p><div class="live-table-wrap"><table class="live-table"><thead><tr><th>Channel</th><th>Account label</th><th>Expected payout</th><th></th></tr></thead><tbody>'+companyOptions+'</tbody></table></div>';
      const cardHistory=card.transactions||[];
      const cardTotals=cardHistory.filter(x=>x.status==='settled').reduce((n,x)=>n+Number(x.net_settled_pkr||0),0);
      const cardFlag=Boolean(card.requested_enabled),canCardActivate=Boolean(card.can_activate);
      const cardOptions='<section class="panel" style="margin-top:14px"><h3>BOP debit / credit card gateway</h3>'+
        '<p class="safe-note">Card checkout is not connected. This is a future activation control, NOT a payment processor. BOP credentials must be stored as private Cloudflare secrets after bank approval; never enter card details here.</p>'+
        '<p><b>Status:</b> '+(card.effective_enabled?'Enabled':'Disabled')+' · <b>Gateway tested:</b> '+(card.integration_verified?'Yes':'No')+' · <b>Credentials configured:</b> '+(card.credentials_configured?'Yes':'No')+' · <b>Backend ready:</b> '+(card.processor_connected?'Yes':'No')+'</p>'+
        '<p class="safe-note">'+esc(card.readiness_reason||'Gateway not configured')+'</p>'+
        '<label class="checkline"><input type="checkbox" id="setCardGatewayEnabled" '+(cardFlag?'checked':'')+' '+(!canCardActivate&&!cardFlag?'disabled':'')+'> Accept card payments after gateway verification</label>'+
        '<label>Expected card settlement (calendar days; optional)<input type="number" min="0" max="120" id="setCardSettlementDays" value="'+esc(card.settlement_days??'')+'" placeholder="Not agreed yet"></label>'+
        '<label>Agreed percentage processing fee (basis points; optional, 100 = 1%)<input type="number" min="0" max="10000" id="setCardFeeBps" value="'+esc(card.fee_bps??'')+'" placeholder="Bank quote pending"></label>'+
        '<label>Agreed fixed per-transaction fee in PKR (optional)<input type="number" min="0" max="100000" id="setCardFixedFee" value="'+esc(card.fixed_fee_pkr??'')+'" placeholder="Bank quote pending"></label>'+
        (roleAllows('owner')?'<button class="btn primary" type="button" id="saveCardGateway">Save card gateway settings</button>':'<p>Owner access required to change card controls.</p>')+
        '<p class="safe-note">Settlement journal: '+cardHistory.length+' records · Confirmed net bank settlement: '+money(cardTotals)+'. No card number, CVV, expiry or PIN is stored.</p>'+
        (cardHistory.length?'<div class="live-table-wrap"><table class="live-table"><thead><tr><th>Provider transaction</th><th>Status</th><th>Gross</th><th>Fees</th><th>Net settled</th><th>Settled on</th></tr></thead><tbody>'+
          cardHistory.map(x=>'<tr><td>'+esc(x.provider_transaction_id)+'</td><td>'+esc(x.status)+'</td><td>'+money(x.gross_amount_pkr)+'</td><td>'+money(x.fee_amount_pkr)+'</td><td>'+money(x.net_settled_pkr)+'</td><td>'+esc(x.settled_on||'—')+'</td></tr>').join('')+'</tbody></table></div>':'')+'</section>';
      cardEl.innerHTML=cardOptions;
      const cardSave=$('#saveCardGateway');
      if(cardSave)cardSave.onclick=async()=>{
        const optNumber=id=>{
          const raw=String($('#'+id).value||'').trim();
          if(raw==='')return null;
          const value=Number(raw);
          if(!Number.isSafeInteger(value)||value<0)throw Error('Enter a non-negative whole number or leave blank');
          return value;
        };
        try{
          const enabled=$('#setCardGatewayEnabled').checked;
          if(enabled&&!card.can_activate)throw Error('BOP gateway must be connected and verified before enabling card checkout');
          const payload={enabled,settlement_days:optNumber('setCardSettlementDays'),
            fee_bps:optNumber('setCardFeeBps'),fixed_fee_pkr:optNumber('setCardFixedFee')};
          if(payload.settlement_days!==null&&payload.settlement_days>120)throw Error('Settlement must be 0–120 days');
          if(payload.fee_bps!==null&&payload.fee_bps>10000)throw Error('Percentage fee must be 0–100%');
          if(payload.fixed_fee_pkr!==null&&payload.fixed_fee_pkr>100000)throw Error('Fixed fee exceeds 100000 PKR');
          cardSave.disabled=true;
          await api('/api/admin/online-payments/card-gateway',{method:'PATCH',body:payload});
          toast('BOP card settings saved. Card checkout remains locked until provider integration is verified.');
          await loadOnlinePayments();
        }catch(e){toast('Card settings not saved: '+e.message);}
        finally{if(cardSave.isConnected)cardSave.disabled=false;}
      };
      summaryEl.innerHTML='<div class="metric-grid">'+blocks.join('')+'</div><p class="safe-note"><b>Total verified online:</b> '+money(sum(verified,'verified_gross_pkr'))+' · <b>Actual payout recorded:</b> '+money(received)+' · <b>Processing fees:</b> '+money(sum(verified,'processing_fees_pkr'))+' · <b>Unreconciled:</b> '+money(unreconciled)+' · <b>Pending verification:</b> '+awaiting.length+' orders · <b>Overdue:</b> '+money(sum(overdue,'unreconciled_pkr'))+'. Verification is NOT a confirmed payout.</p>';
      tableEl.innerHTML=rows.length?'<div class="live-table-wrap"><table class="live-table"><thead><tr><th>Order</th><th>Method</th><th>Payment status</th><th>Order total</th><th>Expected payout</th><th>Recorded payout</th><th>Fees</th><th>Unreconciled</th><th></th></tr></thead><tbody>'+
       rows.map(r=>'<tr><td><b>'+esc(r.order_number)+'</b><small>Ref: '+esc(r.transaction_reference||'—')+'</small></td><td>'+esc(r.display_name||r.payment_method)+'</td><td>'+esc(r.payment_status)+'</td><td>'+money(r.order_total_pkr)+'</td><td>'+esc(r.expected_settlement_on||'Not set')+'</td><td>'+money(r.received_pkr)+'</td><td>'+money(r.processing_fees_pkr)+'</td><td>'+money(r.unreconciled_pkr)+'</td><td>'+(r.payment_status==='payment_verified'&&r.fulfilment_status!=='cancelled'&&Number(r.unreconciled_pkr)>0?'<button class="btn secondary compact" data-online-receipt="'+esc(r.order_id)+'">Record payout</button>':'—')+'</td></tr>').join('')+'</tbody></table></div>':'<p>No JazzCash or Bank Transfer orders have been recorded yet. Future orders appear automatically after checkout.</p>';
      if(result.warning)tableEl.insertAdjacentHTML('afterbegin','<p role="alert">'+esc(result.warning)+'</p>');
      accountsEl.querySelectorAll('[data-online-account]').forEach(b=>b.onclick=()=>editOnlineAccount(accounts.find(a=>a.method===b.dataset.onlineAccount)));
      summaryEl.querySelectorAll('[data-online-account]').forEach(b=>b.onclick=()=>editOnlineAccount(accounts.find(a=>a.method===b.dataset.onlineAccount)));
      tableEl.querySelectorAll('[data-online-receipt]').forEach(b=>b.onclick=()=>recordOnlineReceipt(rows.find(r=>r.order_id===b.dataset.onlineReceipt)));
      $('#refreshOnlinePayments').onclick=loadOnlinePayments;
    }catch(e){
      accountsEl.textContent='Unable to load online ledger: '+e.message;
      summaryEl.textContent='';cardEl.textContent='Gateway controls unavailable; card checkout is disabled.';tableEl.textContent='No confirmed online amounts available.';
    }
  }

  function printInvoice(o, items, isPacking, advance){
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
      ${isPacking?`<p><b>Total items: ${items.reduce((s,i)=>s+Number(i.quantity||0),0)}</b></p><p><b>Courier COD to collect: ${o.payment_method==='cod'?money(Math.max(0,Number(o.total)-Number(o.cod_advance_required_pkr||0))):'Prepaid'}</b></p>${Number(advance?.remaining_pkr||0)>0?'<p style="color:#c00"><b>DO NOT DISPATCH: COD advance not verified</b></p>':''}`:`<div class="totals"><p>Subtotal: ${money(o.subtotal)}</p><p>Delivery: ${money(o.delivery_fee)}</p><p style="font-size:18px"><b>Order total: ${money(o.total)}</b></p>${o.payment_method==='cod'?'<p>Required advance: '+money(o.cod_advance_required_pkr||0)+' · Verified: '+money(advance?.received_pkr||0)+'</p><p><b>Courier COD remaining: '+money(Math.max(0,Number(o.total)-Number(o.cod_advance_required_pkr||0)))+'</b></p>':''}<p>Payment: ${esc(o.payment_method)} (${esc(o.payment_status)})</p></div>`}
      <p class="no-print" style="margin-top:24px"><button onclick="window.print()" style="padding:10px 24px;font-size:16px;cursor:pointer">🖨️ Print</button></p>
    </body></html>`);
    w.document.close();
  }

  let productPage = 1, productTotalPages = 1, productTotal = 0;
  const bulkSelectedIds=new Set();
  const PRODUCT_PER_PAGE = 1000; // All products on one page (no pagination)
  async function loadProducts(page){
    productPage = page || 1;
    const data=await api(`/api/admin/products?per_page=${PRODUCT_PER_PAGE}&page=${productPage}`); products=data.products||[];
    productTotal = data.total ?? products.length;
    productTotalPages = data.total_pages ?? 1;
    const validIds=new Set(products.map(p=>Number(p.id)));
    for(const id of bulkSelectedIds)if(!validIds.has(id))bulkSelectedIds.delete(id);
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
    const quality=$('#productQuality')?.value||'';
    const sort=$('#productSort')?.value||'recent';
    return {q, cat, vis, quality, sort};
  }
  function renderFilteredProducts(){
    const {q, cat, vis, quality, sort}=getProductFilters();
    const normCat=s=>(s||'').trim();
    const filtered=products.filter(p=>{
      if(vis==='archived' && p.visibility!=='archived') return false;
      if(vis!=='archived' && p.visibility==='archived') return false;
      const searchable=[p.name,p.brand,p.slug,p.category,p.pack,...(Array.isArray(p.tags)?p.tags:[])].map(v=>String(v||'')).join(' ').toLowerCase();
      if(q && !searchable.includes(q)) return false;
      if(cat && normCat(p.category)!==cat) return false;
      if(vis==='visible' && p.visibility!=='visible') return false;
      if(vis==='hidden' && p.visibility!=='hidden') return false;
      if(vis==='bundle' && !p.is_bundle) return false;
      if(quality==='missing_image' && String(p.image_url||'').trim())return false;
      if(quality==='missing_seo' && String(p.seo_title||'').trim() && String(p.seo_description||'').trim())return false;
      return true;
    });
    // The protected API returns at most 1000 rows per page. Sorting here is
    // intentionally page-scoped; never claim a global ordered catalogue.
    const nameOf=p=>String(p.name||'');
    const compareName=(a,b)=>nameOf(a).localeCompare(nameOf(b),'en',{sensitivity:'base'});
    const priceOf=p=>Number(p.price)||0;
    if(sort==='name_asc')filtered.sort(compareName);
    else if(sort==='name_desc')filtered.sort((a,b)=>compareName(b,a));
    else if(sort==='price_asc')filtered.sort((a,b)=>priceOf(a)-priceOf(b)||compareName(a,b));
    else if(sort==='price_desc')filtered.sort((a,b)=>priceOf(b)-priceOf(a)||compareName(a,b));
    const grid=$('#productAdminGrid'); if(!grid)return; grid.innerHTML=filtered.map(p=>`<article class="admin-product-card" data-product-id="${p.id}"><label class="live-select-label"><input type="checkbox" data-live-select="${p.id}" aria-label="Select ${esc(p.name)}" ${bulkSelectedIds.has(Number(p.id))?'checked':''}> Select</label><span class="visibility-chip ${p.visibility==='visible'?'':'hidden-product'}">${esc(p.visibility)}</span><div class="admin-product-image">${p.image_url?`<img src="${esc(p.image_url)}" alt="${esc(p.name||'ChaskaBox product')}">`:'<span class="placeholder">🍿</span>'}</div><div class="admin-product-body"><h3>${esc(p.name)}</h3><div class="admin-product-meta">${esc(p.category)} · ${esc(p.pack||'')}</div><div class="admin-product-price"><strong>${money(p.price)}</strong>${p.old_price?`<del>${money(p.old_price)}</del>`:''}</div><div class="admin-card-actions"><button data-live-edit="${p.id}">Edit</button><button data-live-vis="${p.id}">${p.visibility==='archived'?'Restore':p.visibility==='visible'?'Hide':'Show'}</button></div></div></article>`).join('') || '<div class="panel"><p class="muted">No matching products.</p></div>';
    $('#productResultCount').textContent=`Showing ${filtered.length} matching of ${products.length} loaded on page ${productPage} (${productTotal} catalogue items total).${productTotalPages>1?' Filters and sorting apply only to this loaded page.':''}`; $('#loadMoreProducts').style.display='none';
    $$('[data-live-select]',grid).forEach(b=>b.onchange=()=>{const id=Number(b.dataset.liveSelect);b.checked?bulkSelectedIds.add(id):bulkSelectedIds.delete(id);updateProductBulkBar();});
    updateProductBulkBar();
    $$('[data-live-edit]',grid).forEach(b=>b.onclick=()=>openLiveProduct(b.dataset.liveEdit)); $$('[data-live-vis]',grid).forEach(b=>b.onclick=async()=>{const p=products.find(x=>String(x.id)===String(b.dataset.liveVis));try{await api(`/api/admin/products/${p.id}`,{method:'PATCH',body:{visibility:p.visibility==='archived'?'hidden':p.visibility==='visible'?'hidden':'visible'}});toast('Visibility updated');loadProducts()}catch(e){toast(e.message)}});
    // Wire filter inputs to re-render (if not already wired)
    if(!renderFilteredProducts._wired){
      renderFilteredProducts._wired=true;
      ['productSearch','productCategory','productVisibility','productQuality','productSort'].forEach(id=>{
        $('#'+id)?.addEventListener(id==='productSearch'?'input':'change',()=>renderFilteredProducts());
      });
      $('#resetFiltersBtn')?.addEventListener('click',()=>{
        $('#productSearch').value=''; $('#productCategory').value=''; $('#productVisibility').value='';
        if($('#productQuality'))$('#productQuality').value='';
        if($('#productSort'))$('#productSort').value='recent';
        renderFilteredProducts();
      });
    }
  }
  function openLiveProduct(id){
    const selector=$('#editCategory');
    const categories=[...new Set(products.map(p=>String(p.category||'').trim()).filter(Boolean))];
    for(const category of categories) if(selector && ![...selector.options].some(o=>o.value===category)) selector.add(new Option(category,category));
    const p=products.find(x=>String(x.id)===String(id)); if(!p)return; $('#editProductId').value=p.id;$('#editName').value=p.name||'';$('#editPrice').value=p.price||'';$('#editOldPrice').value=p.old_price||'';$('#editCategory').value=p.category||'';$('#editPack').value=p.pack||'';$('#editBadge').value=p.badge||'';$('#editVisibility').value=p.visibility==='visible'?'visible':'hidden';$('#editDescription').value=p.description||'';$('#editImage').value=p.image_url||'';$('#editBundle').checked=!!p.is_bundle;
    $('#editBrand').value=p.brand||'';$('#editStock').value=p.stock_state||'sourced_after_order';$('#editTags').value=(p.tags||[]).join(', ');
    $('#editSeoTitle').value=p.seo_title||'';$('#editSeoDesc').value=p.seo_description||'';$('#editOgImage').value=p.og_image||'';$('#editCanonical').value=p.canonical_url||'';
    $('#productEditorTitle').textContent='Edit '+p.name;$('#productEditor').classList.add('open');$('#productEditor').setAttribute('aria-hidden','false');
    // Refresh preview (admin.js listens for input events on the form)
    try{ $('#editImage').dispatchEvent(new Event('input',{bubbles:true})); }catch{}
  }

  function updateProductBulkBar(){
    const bar=$('#bulkBar'),n=bulkSelectedIds.size;
    if(!bar)return;
    bar.classList.toggle('hidden',!n);
    $('#bulkCount').textContent=n+' selected (max 50 per action)';
    const feedback=$('#bulkFeedback');if(feedback)feedback.textContent='';
  }
  function wireProductBulkActions(){
    const bar=$('#bulkBar');if(!bar||bar.dataset.liveBulkWired)return;
    bar.dataset.liveBulkWired='1';
    bar.addEventListener('click',async event=>{
      const button=event.target.closest('[data-bulk]');if(!button)return;
      // The legacy prototype also owns a bubble handler. Stop it so no
      // misleading "disabled" toast appears after real authenticated writes.
      event.preventDefault();event.stopImmediatePropagation();
      const action=button.dataset.bulk;
      if(action==='clear'){bulkSelectedIds.clear();renderFilteredProducts();return;}
      const ids=[...bulkSelectedIds];
      if(!ids.length)return;
      if(ids.length>50){toast('Select at most 50 products per bulk action.');return;}
      if(!['show','hide','archive','restore'].includes(action))return;
      const verb={show:'show',hide:'hide',archive:'archive',restore:'restore as hidden'}[action];
      if(!confirm('Are you sure you want to '+verb+' '+ids.length+' product(s)? All changes will be saved and audited together.'))return;
      const buttons=$$('[data-bulk]',bar);
      buttons.forEach(b=>b.disabled=true);
      const feedback=$('#bulkFeedback');
      if(feedback)feedback.textContent='Saving '+ids.length+' product(s)…';
      try{
        const r=await api('/api/admin/products/bulk',{method:'POST',body:{ids,action}});
        bulkSelectedIds.clear();
        await loadProducts(productPage);
        if(feedback)feedback.textContent=r.changed+' updated, '+r.skipped+' already in target state.';
        toast(r.changed+' products updated');
      }catch(error){if(feedback)feedback.textContent='Not saved: '+error.message;toast(error.message);}
      finally{buttons.forEach(b=>b.disabled=false);}
    },true);
  }

  function wireBoxPreview(){
    const button=$('#previewBoxBtn');if(!button||button.dataset.livePreviewWired)return;
    button.dataset.livePreviewWired='1';
    button.addEventListener('click',event=>{
      event.preventDefault();event.stopImmediatePropagation();
      const rows=$$('#boxSelectedItems .builder-item');
      if(!rows.length){toast('Choose products first');return;}
      const title=$('#boxName').value.trim()||'Untitled Chaska Box';
      const price=Number($('#boxPrice').value||0);
      if(!Number.isSafeInteger(price)||price<0){toast('Enter a valid selling price');return;}
      let pane=$('#boxDraftPreview');
      if(!pane){pane=document.createElement('section');pane.id='boxDraftPreview';pane.className='box-draft-preview';pane.setAttribute('aria-label','Chaska Box draft preview');$('#previewBoxBtn').closest('.builder-summary').append(pane);}
      const summary=rows.map(r=>{
        const name=r.querySelector('span')?.textContent||'Product';
        const qty=Number(r.querySelector('.qty-controls b')?.textContent||0);
        return '<li>'+esc(name)+' × '+qty+'</li>';
      }).join('');
      pane.innerHTML='<h3>'+esc(title)+'</h3><p>'+esc($('#boxDescription').value.trim())+'</p><ul>'+summary+'</ul><p><b>Customer price: '+money(price)+'</b></p><small>Draft preview only. Nothing has been saved or published.</small><div><button type="button" class="btn secondary compact" id="closeBoxDraftPreview">Close preview</button></div>';
      $('#closeBoxDraftPreview').onclick=()=>pane.remove();
      pane.scrollIntoView({behavior:'smooth',block:'nearest'});
    },true);
  }

  function wireLiveProductEditor(){
    const form=$('#productForm'); if(!form)return; form.addEventListener('submit',async e=>{if(!me||!roleAllows('owner','manager','content'))return;e.preventDefault();e.stopImmediatePropagation();const id=$('#editProductId').value;const body={name:$('#editName').value.trim(),price:Number($('#editPrice').value||0),old_price:$('#editOldPrice').value?Number($('#editOldPrice').value):null,category:$('#editCategory').value,pack:$('#editPack').value.trim(),badge:$('#editBadge').value,description:$('#editDescription').value.trim(),image_url:$('#editImage').value.trim(),visibility:$('#editVisibility').value,brand:$('#editBrand').value.trim(),stock_state:$('#editStock').value,tags:$('#editTags').value.split(',').map(t=>t.trim()).filter(Boolean),seo_title:$('#editSeoTitle').value.trim()||null,seo_description:$('#editSeoDesc').value.trim()||null,og_image:$('#editOgImage').value.trim()||null,canonical_url:$('#editCanonical').value.trim()||null};try{const saved=id?await api(`/api/admin/products/${id}`,{method:'PATCH',body}):await api('/api/admin/products',{method:'POST',body});const savedId=saved?.product?.id||id;toast('Product saved');$('#productEditor').classList.remove('open');await loadProducts();}catch(x){toast(x.message)}},true);
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

  function wirePager(view,d,load){
    view.querySelector('[data-page-controls]')?.remove();
    const pages=d.total_pages||0,page=d.page||1;
    const p=document.createElement('div');p.dataset.pageControls='';p.style.cssText='display:flex;gap:12px;align-items:center;padding:16px';
    p.innerHTML=`<button class="btn secondary" data-prev ${page<=1?'disabled':''}>Previous</button><span>Page ${page} of ${Math.max(1,pages)} · ${d.total??0} records</span><button class="btn secondary" data-next ${page>=pages?'disabled':''}>Next</button>`;
    p.querySelector('[data-prev]').onclick=()=>load(page-1).catch(e=>toast(e.message));p.querySelector('[data-next]').onclick=()=>load(page+1).catch(e=>toast(e.message));view.append(p);
  }
  async function loadCustomerDetail(id,page=1){
    const d=await api('/api/admin/customers/'+encodeURIComponent(id)+'?page='+page),view=$('#view-customers');
    view.innerHTML=`<div class="panel"><button class="btn secondary" data-customer-back>Back to customers</button><h2>${esc(d.customer.name||'Customer')}</h2><p>${esc(d.customer.phone||'')} · ${esc(d.customer.email||'')}</p><p>${d.customer.order_count} orders · Recognized spend ${money(d.customer.lifetime_spend)}</p><div class="live-table-wrap"><table class="live-table"><tr><th>Order</th><th>Total</th><th>Status</th></tr>${d.orders.map(o=>`<tr><td>${esc(o.order_number)}</td><td>${money(o.total)}</td><td>${esc(o.fulfilment_status)}</td></tr>`).join('')}</table></div></div>`;
    view.querySelector('[data-customer-back]').onclick=()=>loadCustomers().catch(e=>toast(e.message));wirePager(view,d,p=>loadCustomerDetail(id,p));
  }
  async function loadCustomers(page=1){
    const search=$('#customerSearch')?.value.trim()||'';
    const sp=new URLSearchParams({per_page:'25',page:String(page)});if(search)sp.set('q',search);
    const d=await api('/api/admin/customers?'+sp), view=$('#view-customers');view.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Customers</h2><p>Order history and recognized customer value. Customer identity details are read-only.</p></div></div><label class="admin-search-field">Search customers<input id="customerSearch" type="search" aria-label="Search customers" maxlength="100" placeholder="Name, phone or email" value="${esc(search)}"></label><div class="live-table-wrap"><table class="live-table"><thead><tr><th>Name</th><th>Phone</th><th>Orders</th><th>Recognized spend</th><th>Last order</th></tr></thead><tbody>${(d.customers||[]).map(c=>`<tr><td><button class="btn secondary compact" data-customer="${esc(c.id)}">${esc(c.name||'—')}</button></td><td>${esc(c.phone||'—')}</td><td>${c.order_count||0}</td><td>${money(c.lifetime_spend)}</td><td>${esc(c.last_order_number||'—')}<small>${c.last_order_at?fmtDate(c.last_order_at):''}</small></td></tr>`).join('')}</tbody></table></div></div>`;
    wirePager(view,d,loadCustomers);
    const input=$('#customerSearch');if(input){input.addEventListener('input',debounce(()=>loadCustomers(1),350));input.focus({preventScroll:true});input.setSelectionRange(input.value.length,input.value.length);}
    $$('[data-customer]',view).forEach(b=>b.onclick=()=>loadCustomerDetail(b.dataset.customer).catch(e=>toast(e.message)));
  }
  async function loadReviews(page=1){
    const d=await api('/api/admin/reviews?per_page=100&page='+page),view=$('#view-reviews');
    view.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Review moderation</h2><p>Only real customer submissions. Publish after checking for personal details; unpublish if the customer requests removal.</p></div></div><div class="review-list">${(d.reviews||[]).map(r=>{
      const pname=r.products?.name||('Product #'+r.product_id);
      const reviewer=r.user_id?('User: '+String(r.user_id).slice(0,8)+'…'):'Guest (no account)';
      const replyHtml=r.admin_reply?`<div class="admin-reply" style="margin-top:6px;padding:8px;background:#f0f7ff;border-radius:6px"><b>Your reply:</b> ${esc(r.admin_reply)}</div>`:'';
      const replyForm=`<div style="margin-top:8px;display:flex;gap:6px"><input type="text" placeholder="Write a reply (optional)" data-reply-input="${r.id}" value="${esc(r.admin_reply||'')}" style="flex:1;padding:6px;border:1px solid #ddd;border-radius:6px;font-size:12px"><button class="btn secondary compact" data-reply-save="${r.id}">Save reply</button></div>`;
      return `<article class="review-admin-row" style="border-bottom:1px solid #eee;padding:12px 0"><div><b>${'★'.repeat(Number(r.rating||0))}${'☆'.repeat(5-Number(r.rating||0))}</b> <span style="font-weight:600">${esc(pname)}</span><p style="margin:6px 0">${esc(r.review_text)}</p><small style="color:#666">${esc(r.moderation_status)}${r.verified_purchase?' · ✓ verified purchase':''} · ${esc(reviewer)} · ${new Date(r.created_at).toLocaleDateString('en-PK')}</small>${replyHtml}${replyForm}</div><div style="margin-top:8px">${r.moderation_status!=='approved'?`<button class="btn primary compact" data-review="${r.id}" data-review-action="approve">Approve</button>`:''} ${r.moderation_status!=='rejected'?`<button class="btn secondary compact" data-review="${r.id}" data-review-action="reject">${r.moderation_status==='approved'?'Unpublish':'Reject'}</button>`:''}</div></article>`;
    }).join('')||'<div class="empty-mini">No reviews.</div>'}</div></div>`;
    // Approve/reject
    wirePager(view,d,loadReviews);
    $$('[data-review]',view).forEach(b=>b.onclick=async()=>{
      try{
        const replyInput=view.querySelector(`[data-reply-input="${b.dataset.review}"]`);
        const reply=replyInput?replyInput.value.trim():undefined;
        await api(`/api/admin/reviews/${b.dataset.review}`,{method:'PATCH',body:{action:b.dataset.reviewAction,reply}});
        toast('Review updated');loadReviews();
      }catch(e){toast(e.message)}
    });
    // Save reply without changing status
    $$('[data-reply-save]',view).forEach(b=>b.onclick=async()=>{
      try{
        const id=b.dataset.replySave;
        const replyInput=view.querySelector(`[data-reply-input="${id}"]`);
        const reply=replyInput?replyInput.value.trim():'';
        // Get current status to preserve it
        const review=(d.reviews||[]).find(r=>String(r.id)===String(id));
        const action='reply';
        await api(`/api/admin/reviews/${id}`,{method:'PATCH',body:{action,reply}});
        toast('Reply saved');loadReviews();
      }catch(e){toast(e.message)}
    });
  }
  function wireHomepage(){}
  async function loadHomepage(){
    const {buildHomepageDraft,PRODUCT_SECTIONS}=await import('/homepage-config.js?v=20261018-audit1');
    const d=await api('/api/admin/homepage'),view=$('#view-homepage'); view.innerHTML=`<div class="admin-grid two"><section class="panel"><div class="panel-head"><div><h2>Homepage sections</h2><p>Visibility, order and headings save immediately; content configuration uses Save draft, Preview and Publish.</p></div></div><div class="section-manager">${(d.sections||[]).map(s=>`<div data-home-key="${esc(s.section_key)}"><span class="drag" aria-hidden="true">⋮⋮</span><b>${esc(s.section_key.replaceAll('_',' '))}</b><em>${esc(s.heading||'')}</em><span class="home-position-actions"><button type="button" data-home-move="${esc(s.section_key)}" data-home-direction="-1" ${s.section_key==='announcement_bar'?'disabled':''} aria-label="Move section up">↑</button><button type="button" data-home-move="${esc(s.section_key)}" data-home-direction="1" ${s.section_key==='announcement_bar'?'disabled':''} aria-label="Move section down">↓</button></span><button class="home-toggle ${s.enabled?'on':''}" data-home-toggle="${esc(s.section_key)}">${s.enabled?'On':'Off'}</button></div>`).join('')}</div></section><section class="panel"><div class="panel-head"><div><h2>Edit selected section</h2><p>Save draft, preview, then publish.</p></div></div><label>Section<select id="homeKey">${(d.sections||[]).map(s=>`<option value="${esc(s.section_key)}">${esc(s.section_key)}</option>`).join('')}</select></label><div id="homeCopyFields"><label>Heading<input id="homeHeading" maxlength="500"></label><label>Subheading<textarea id="homeSub" rows="4" maxlength="500"></textarea></label></div><div id="homeProductsField"><label><input type="checkbox" id="homeAutoProducts"> Use automatic product picks</label><label>Featured product IDs <small>(comma-separated; turn automatic off and leave blank for no products)</small><input id="homeProductIds" placeholder="e.g. 30, 54, 179"></label></div><div id="homeHeroFields" hidden><label>First banner button text<input id="homeButtonText" maxlength="160"></label><label>First banner button link<input id="homeButtonUrl" maxlength="500" placeholder="/shop/"></label><label>Banner overrides (JSON, optional)<textarea id="homeSlides" rows="8" maxlength="12000" placeholder='[ {"heading":"Your headline", "href":"/shop/"} ]'></textarea></label><p class="safe-note">Override up to three banners. Omitted fields and banners retain the standard copy. Supported fields: label, kick, eyebrow, heading, highlight, description, primary, href, secondary, secondHref. No HTML.</p></div><div id="homeFaqField" hidden><label>FAQ questions and answers (JSON, optional)<textarea id="homeFaq" rows="8" maxlength="16000" placeholder='[ {"q":"Your question?", "a":"Your answer."} ]'></textarea></label><p class="safe-note">Leave blank for standard answers, or enter [] for no questions. Up to 10 questions; plain text only.</p></div><div id="homePackingField" hidden><label>Original packing video URL<input id="homePackingVideo" maxlength="500" placeholder="ChaskaBox MP4 or YouTube video link"></label><p class="safe-note">Use your original video and permission from anyone shown. Remove customer names, phone numbers and shipping labels. Leave blank to hide. Saving creates a draft; publish this section to make it public.</p></div><div class="action-row"><button class="btn secondary" id="homeSave">Save</button>${roleAllows('owner','manager')?'<button class="btn primary" id="homePublish">Publish section</button>':''}</div></section></div>`;
    const rows=d.sections||[];
    function hydrate(){
      const x=rows.find(r=>r.section_key===$('#homeKey').value)||{},cfg=x.draft_config??x.config??{};
      $('#homeHeading').value=x.heading??'';$('#homeSub').value=x.subheading??'';
      $('#homeCopyFields').hidden=['announcement_bar','trust_bar','promotions','categories'].includes(x.section_key);
      $('#homeProductsField').hidden=!PRODUCT_SECTIONS.has(x.section_key);
      $('#homeProductIds').value=Array.isArray(cfg.product_ids)?cfg.product_ids.join(', '):'';
      $('#homeAutoProducts').checked=!Array.isArray(cfg.product_ids);
      $('#homeProductIds').disabled=$('#homeAutoProducts').checked;
      $('#homeHeroFields').hidden=x.section_key!=='hero';
      $('#homeButtonText').value=cfg.button_text||'';$('#homeButtonUrl').value=cfg.button_url||'';
      $('#homeSlides').value=cfg.slides?JSON.stringify(cfg.slides,null,2):'';
      $('#homeFaqField').hidden=x.section_key!=='faq';$('#homeFaq').value=Array.isArray(cfg.items)?JSON.stringify(cfg.items,null,2):'';
      $('#homePackingField').hidden=x.section_key!=='how_it_works';$('#homePackingVideo').value=cfg.packing_video_url||'';
    }
    hydrate();$('#homeKey').onchange=hydrate;
    $('#homeAutoProducts').onchange=()=>{$('#homeProductIds').disabled=$('#homeAutoProducts').checked;};
    $$('[data-home-move]',view).forEach(button=>button.onclick=async()=>{
      const movable=rows.filter(row=>row.section_key!=='announcement_bar');
      const index=movable.findIndex(row=>row.section_key===button.dataset.homeMove);
      const next=index+Number(button.dataset.homeDirection);
      if(index<0||next<0||next>=movable.length)return;
      const a=movable[index],b=movable[next],pa=Number(a.position),pb=Number(b.position);
      if(!Number.isInteger(pa)||!Number.isInteger(pb)||pa===pb){toast('Section positions need review before reordering.');return;}
      button.disabled=true;
      try{
        await api('/api/admin/homepage',{method:'PATCH',body:{sections:[
          {section_key:a.section_key,position:pb},{section_key:b.section_key,position:pa}
        ]}});
        toast('Homepage section order saved');await loadHomepage();
      }catch(error){toast('Reorder failed: '+error.message);button.disabled=false;}
    });
    $$('[data-home-toggle]',view).forEach(b=>b.onclick=async()=>{const row=rows.find(r=>r.section_key===b.dataset.homeToggle);try{await api('/api/admin/homepage',{method:'PATCH',body:{sections:[{section_key:row.section_key,enabled:!row.enabled}]}});toast('Homepage visibility saved');loadHomepage()}catch(e){toast(e.message)}});
    $('#homeSave').onclick=async()=>{try{
      const key=$('#homeKey').value,current=rows.find(r=>r.section_key===key)||{};
      const draft=buildHomepageDraft(key,current.draft_config??current.config??{}, {
        automaticProducts:$('#homeAutoProducts').checked,productIds:$('#homeProductIds').value,
        buttonText:$('#homeButtonText').value,buttonUrl:$('#homeButtonUrl').value,slides:$('#homeSlides').value,
        faq:$('#homeFaq').value,packingVideo:$('#homePackingVideo').value
      });
      const section={section_key:key,draft_config:draft};
      // Do not turn untouched null headings into empty public headings.
      if($('#homeHeading').value.trim()!==(current.heading??''))section.heading=$('#homeHeading').value.trim();
      if($('#homeSub').value.trim()!==(current.subheading??''))section.subheading=$('#homeSub').value.trim();
      await api('/api/admin/homepage',{method:'PATCH',body:{sections:[section]}});
      toast('Homepage draft saved; preview and publish this section when ready');await loadHomepage();
    }catch(e){toast(e.message)}};
    if($('#homePublish'))$('#homePublish').onclick=async()=>{try{await api('/api/admin/homepage/publish',{method:'POST',body:{keys:[$('#homeKey').value]}});toast('Homepage section published');loadHomepage()}catch(e){toast(e.message)}};
    const preview=document.createElement('button');preview.className='btn secondary';preview.textContent='Preview saved drafts';view.append(preview);
    preview.onclick=()=>{view.querySelector('[data-home-preview]')?.remove();const frame=document.createElement('iframe');frame.dataset.homePreview='';frame.title='Homepage draft preview';frame.style.cssText='width:100%;height:650px;border:1px solid #ddd;margin-top:12px';frame.src='/?cms_preview=1';frame.onload=()=>frame.contentWindow.postMessage({type:'CHASKABOX_HOME_PREVIEW',sections:d.sections.map(s=>({...s,config:s.draft_config??s.config}))},location.origin);view.append(frame);};

  }

  function wireMedia(){}
  async function loadMedia(page=1,operationPage=1){
    const d=await api('/api/admin/media?per_page=100&page='+page),view=$('#view-media'); view.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Media library</h2><p>JPEG, PNG, WebP, AVIF · max 5MB / 4 million pixels. Verified images are resized to 1024px WebP. Use authentic pack photos.</p></div><label class="btn primary media-upload-btn">Upload image<input id="mediaUpload" type="file" ${d.processor_available?'':'disabled'} accept="image/jpeg,image/png,image/webp,image/avif" hidden></label></div><p class="safe-note">${d.processor_available?'Secure image processor ready.':'Uploads paused: the owner must enable the configured secure processor.'} Monthly app admission limit: ${esc(d.monthly_app_limit)} attempts.</p><div class="media-grid">${(d.media||[]).map(m=>`<article>${m.url?`<img src="${esc(m.url)}" alt="" loading="lazy">`:'<div class="media-placeholder">▣</div>'}<small>${esc(m.object_path)}</small><b>${Math.round(Number(m.size_bytes||0)/1024)} KB</b>${m.url?`<button class="btn secondary compact" data-copy-media="${esc(m.url)}">Copy URL</button>${m.bucket==='product-media'?`<button class="btn secondary compact" data-assign-media="${esc(m.id)}">Assign to product</button>`:''}`:''}<small>${esc(m.state)}</small><button class="btn secondary compact" data-delete-media="${esc(m.id)}">${m.state==='deleting'?'Resume deletion':'Delete unused image'}</button></article>`).join('')||'<div class="empty-mini">No uploaded media yet.</div>'}</div></div>`;
    wirePager(view,d,loadMedia);
    $$('[data-copy-media]',view).forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copyMedia);toast('Image URL copied')}catch{toast('Could not copy URL')}});
    $$('[data-assign-media]',view).forEach(b=>b.onclick=async()=>{
      const asset=(d.media||[]).find(m=>String(m.id)===b.dataset.assignMedia);
      if(!asset||!asset.url){toast('This image is not active');return;}
      const raw=prompt('Product ID to receive this verified image (e.g., 186). Confirm the pack photo matches the actual product before assigning:');
      if(raw===null)return;
      const productId=Number(raw.trim());
      if(!Number.isSafeInteger(productId)||productId<1){toast('Enter a valid positive product ID');return;}
      if(!confirm('Assign this exact uploaded photo to product #'+productId+'? Its current product image will be replaced; pack and price will not change.'))return;
      b.disabled=true;
      try{
        const response=await api('/api/admin/media/'+encodeURIComponent(asset.id)+'/assign-product',{method:'POST',body:{product_id:productId}});
        toast(response.changed?'Product image assigned and saved':'Product already uses this image');
        await loadMedia(page);
      }catch(error){toast('Image assignment failed: '+error.message);b.disabled=false;}
    });
    $$('[data-delete-media]',view).forEach(b=>b.onclick=async()=>{if(!confirm('Delete this unused image permanently? Product, CMS and version references are checked first.'))return;b.disabled=true;try{await api('/api/admin/media/'+b.dataset.deleteMedia,{method:'DELETE'});toast('Image deleted');await loadMedia(page)}catch(e){toast(e.message);b.disabled=false}});
    if(roleAllows('owner','manager')){try{const review=await api('/api/admin/media/operations?page='+operationPage);if(review.total){const panel=document.createElement('section');panel.className='panel';panel.innerHTML='<h3>Pending media operations ('+esc(review.total)+')</h3><p>Upload cleanup can be resumed after 15 minutes. Review each operation before retrying.</p>'+review.operations.map(op=>'<p>'+esc(op.object_path)+' · '+esc(op.state)+' <button class="btn secondary compact" data-recover-media="'+esc(op.id)+'">Review and resume</button></p>').join('');view.append(panel);wirePager(panel,review,p=>loadMedia(page,p));$$('[data-recover-media]',panel).forEach(b=>b.onclick=async()=>{if(!confirm('Resume this reviewed storage cleanup or pending deletion?'))return;try{await api('/api/admin/media/operations',{method:'POST',body:{operation_id:b.dataset.recoverMedia,confirm:true}});toast('Media operation recovered');await loadMedia(page)}catch(e){toast(e.message)}});}}catch(e){toast('Media operation status unavailable: '+e.message)}}
    $('#mediaUpload').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;const fd=new FormData();fd.append('file',file);try{const saved=await api('/api/admin/media',{method:'POST',body:fd});if(saved?.url)try{await navigator.clipboard.writeText(saved.url);toast('Image uploaded — URL copied')}catch{toast('Image uploaded')}else toast('Image uploaded');loadMedia()}catch(x){toast(x.message)}};
  }
  function wireSettings(){}
  async function loadSettings(){
    const d=await api('/api/admin/settings'), map=Object.fromEntries((d.settings||[]).map(x=>[x.key,x.value])),view=$('#view-settings');view.innerHTML=`<div class="admin-grid two"><section class="panel"><div class="panel-head"><div><h2>Commerce settings</h2><p>Validated public-safe values. Secrets stay in Cloudflare.</p></div></div><label>COD delivery fee (PKR)<input id="setCodFee" type="number" min="0" max="100000" value="${esc(map.cod_delivery_fee_pkr??300)}"></label><label>Prepaid delivery fee (PKR)<input id="setPreFee" type="number" min="0" max="100000" value="${esc(map.prepaid_delivery_fee_pkr??300)}"></label><label>Free prepaid threshold (PKR)<input id="setThreshold" type="number" min="0" max="1000000" value="${esc(map.prepaid_free_delivery_threshold_pkr??5000)}"></label><label class="checkline"><input id="setPrepaidFree" type="checkbox" ${map.prepaid_free_delivery_enabled!==false?"checked":""}> Enable free delivery for prepaid orders at or above threshold</label><p class="safe-note">Nationwide rates are controlled here. COD always has its specified delivery fee. Shipping Zones can override fees for named cities only; they do not replace nationwide settings.</p><hr><h3>COD advance policy</h3><label class="checkline"><input id="setCodAdvanceEnabled" type="checkbox" ${map.cod_advance_enabled!==false?'checked':''}> Require advance from every NEW Cash on Delivery order</label><label>Advance amount (PKR)<input id="setCodAdvanceAmount" type="number" min="1" max="100000" value="${esc(map.cod_advance_amount_pkr??500)}"></label><p class="safe-note">Advance is part of the order total, not an extra fee. Orders cannot be packed or dispatched until the verified advance is received. If order total is less than the configured advance, only the total is charged. Changes apply only to new COD orders.</p><label>Delivery estimate<input id="setEstimate" maxlength="80" value="${esc(map.delivery_estimate??'4-7 days')}"></label><hr><h3>Storefront contact & promo</h3><label>Support WhatsApp<input id="setSupportWhatsApp" maxlength="25" value="${esc(map.support_whatsapp??'0332-0005381')}"></label><label>Support email<input id="setSupportEmail" type="email" maxlength="254" value="${esc(map.support_email??'Chaskabox.mzg@gmail.com')}"></label><label>Store address<textarea id="setStoreAddress" rows="3" maxlength="300">${esc(map.store_address??'Near Ahmad Drink Corner, Railway Road, Bhatti Hussainabad, Muzaffargarh, Pakistan')}</textarea></label><label>Announcement / promo bar<input id="setPromo" maxlength="180" value="${esc(map.promo_text??'Original sealed packs · Pakistan-wide delivery · COD + prepaid')}"></label><button class="btn primary" id="saveSettings">Save settings</button></section><section class="panel"><div class="panel-head"><div><h2>Payment availability</h2></div></div><label class="checkline"><input id="setCod" type="checkbox" ${map.cod_enabled!==false?'checked':''}> Cash on Delivery</label><label class="checkline"><input id="setJazz" type="checkbox" ${map.jazzcash_enabled!==false?'checked':''}> JazzCash</label><label class="checkline"><input id="setBank" type="checkbox" ${map.bank_transfer_enabled!==false?'checked':''}> Bank Transfer</label><hr><h3>Card gateway · BOP</h3><p class="safe-note">Card payments are OFF. Configure fees, settlement days and the future owner on/off control in Payments &amp; COD Ledger. ON is locked until BOP merchant credentials, secure callbacks and gateway verification are complete.</p><button class="btn secondary compact" type="button" id="manageBopGateway">Manage BOP card setup →</button><hr><h3>Prepaid receiving details</h3><label>JazzCash Till ID <small style="color:#666">(click Reveal to edit)</small><input id="setJazzTill" maxlength="40" value="${esc(map.jazzcash_till_id??'981716438')}"></label><label>JazzCash QR Image<div style="display:flex;gap:8px;align-items:center;margin-top:4px"><img id="qrPreview" src="${esc(map.jazzcash_qr_url??'/images/jazzcash-qr.webp')}" alt="QR preview" style="width:80px;height:80px;object-fit:contain;border:1px solid #ddd;border-radius:8px;background:#fff"><div><input type="file" id="qrUploadInput" accept="image/png,image/jpeg,image/webp" style="display:none"><button type="button" class="btn secondary compact" id="qrUploadBtn">📤 Upload new QR</button><div style="margin-top:4px"><input id="setJazzQr" maxlength="500" value="${esc(map.jazzcash_qr_url??'/images/jazzcash-qr.webp')}" style="width:100%;font-size:11px" placeholder="or paste image URL"></div></div></div></label><label>Bank<input id="setBankName" maxlength="100" value="${esc(map.bank_transfer_details?.bank??'Punjab Bank')}"></label><label>Account title<input id="setBankTitle" maxlength="120" value="${esc(map.bank_transfer_details?.account_title??'RAMEEZ ASLAM')}"></label><label>Account number<input id="setBankAccount" maxlength="80" value="${esc(map.bank_transfer_details?.account_number??'6050435151500017')}"></label><hr><h3>Media upload controls</h3><label class="checkline"><input id="setMediaEnabled" type="checkbox"> Enable secure image uploads</label><label>Monthly app transform limit<input id="setMediaLimit" type="number" min="1" max="1000"></label><p class="safe-note">Uploads require the private image processor and server switch. This limit counts attempts and does not measure total Cloudflare account usage.</p><hr><h3>AI controls</h3><label class="checkline"><input id="setAiEnabled" type="checkbox"> Enable AI globally</label><label class="checkline"><input id="setAiText" type="checkbox"> Text drafts</label><label class="checkline"><input id="setAiImages" type="checkbox"> Decorative image drafts</label><label class="checkline"><input id="setAiEmbeddings" type="checkbox"> Embeddings</label><label>Daily app budget (estimated neurons)<input id="setAiBudget" type="number" min="1" max="8000"></label><p id="aiBudgetState" class="safe-note">Checking AI state…</p><label class="checkline"><input id="setAiHelp" type="checkbox" ${map.ai_customer_assistant_enabled!==false?'checked':''}> Customer Chaska Help AI</label><label class="checkline"><input id="setAiSearch" type="checkbox" ${map.ai_semantic_search_enabled!==false?'checked':''}> Semantic product search</label><p class="safe-note">AI requires the server switch and these controls. Estimates do not measure account billing. Checkout does not depend on AI.</p><p class="safe-note">All values are validated again by the API and database. Test checkout after meaningful pricing changes.</p></section></div>`;
    $('#manageBopGateway')?.addEventListener('click',()=>switchView('couriers'));
    for(const [id,key]of [['setAiEnabled','ai_enabled'],['setAiText','ai_text_enabled'],['setAiImages','ai_images_enabled'],['setAiEmbeddings','ai_embeddings_enabled']])document.getElementById(id).checked=map[key]===true;
    document.getElementById('setMediaEnabled').checked=map.media_upload_enabled===true;document.getElementById('setMediaLimit').value=map.media_monthly_transform_limit??1000;
    document.getElementById('setAiBudget').value=map.ai_daily_budget_neurons??8000;
    try{const state=await api('/api/admin/ai-status');document.getElementById('aiBudgetState').textContent=(state.enabled?'AI enabled. ':'AI paused. ')+'App estimate: '+state.budget.accounted_neuron_estimate+' / '+state.budget.policy_budget+' neurons. Index remaining: '+state.index.remaining+'.';}
    catch{document.getElementById('aiBudgetState').textContent='AI state unavailable; do not assume quota or index completion.';}

    $('#saveSettings').onclick=async()=>{const saveBtn=$('#saveSettings');if(saveBtn.disabled)return;saveBtn.disabled=true;saveBtn.textContent='Saving…';try{
      // Get real values from masked fields
      const getVal=id=>{const el=document.getElementById(id);return el.getRealValue?el.getRealValue():el.value;};
      await api('/api/admin/settings',{method:'PATCH',body:{settings:{cod_delivery_fee_pkr:Number($('#setCodFee').value),prepaid_delivery_fee_pkr:Number($('#setPreFee').value),prepaid_free_delivery_threshold_pkr:Number($('#setThreshold').value),prepaid_free_delivery_enabled:$('#setPrepaidFree').checked,cod_advance_enabled:$('#setCodAdvanceEnabled').checked,cod_advance_amount_pkr:Number($('#setCodAdvanceAmount').value),delivery_estimate:$('#setEstimate').value.trim(),support_whatsapp:getVal('setSupportWhatsApp'),support_email:$('#setSupportEmail').value.trim(),store_address:$('#setStoreAddress').value.trim(),promo_text:$('#setPromo').value.trim(),jazzcash_till_id:getVal('setJazzTill'),jazzcash_qr_url:$('#setJazzQr').value.trim(),bank_transfer_details:{bank:$('#setBankName').value.trim(),account_title:getVal('setBankTitle'),account_number:getVal('setBankAccount')},cod_enabled:$('#setCod').checked,jazzcash_enabled:$('#setJazz').checked,bank_transfer_enabled:$('#setBank').checked,media_upload_enabled:$('#setMediaEnabled').checked,media_monthly_transform_limit:Number($('#setMediaLimit').value),ai_enabled:$('#setAiEnabled').checked,ai_text_enabled:$('#setAiText').checked,ai_images_enabled:$('#setAiImages').checked,ai_embeddings_enabled:$('#setAiEmbeddings').checked,ai_daily_budget_neurons:Number($('#setAiBudget').value),ai_customer_assistant_enabled:$('#setAiHelp').checked,ai_semantic_search_enabled:$('#setAiSearch').checked}}});await loadSettings();toast('Settings saved and verified by reloading from database')}catch(e){toast(e.message)}finally{const b=$('#saveSettings');if(b){b.disabled=false;b.textContent='Save settings';}}};
    // Mask sensitive fields by default
    wireSensitiveField('setJazzTill', map.jazzcash_till_id);
    wireSensitiveField('setBankTitle', map.bank_transfer_details?.account_title);
    wireSensitiveField('setBankAccount', map.bank_transfer_details?.account_number);
    wireSensitiveField('setSupportWhatsApp', map.support_whatsapp);
    // QR image upload
    const qrBtn=document.getElementById('qrUploadBtn'), qrInput=document.getElementById('qrUploadInput');
    if(qrBtn&&qrInput){
      qrBtn.onclick=()=>qrInput.click();
      qrInput.onchange=async()=>{
        const file=qrInput.files[0]; if(!file) return;
        qrBtn.disabled=true; qrBtn.textContent='Uploading…';
        try{
          const fd=new FormData(); fd.append('file',file);
          const res=await api('/api/admin/qr-upload',{method:'POST',body:fd});
          if(res.url){
            document.getElementById('setJazzQr').value=res.url;
            document.getElementById('qrPreview').src=res.url;
            toast('QR uploaded! Click "Save settings" to apply.');
          }
        }catch(e){ toast('Upload failed: '+(e.message||e)); }
        finally{ qrBtn.disabled=false; qrBtn.textContent='📤 Upload new QR'; qrInput.value=''; }
      };
    }
  }


  const STAFF_PERMISSIONS={
    owner:'All settings, staff, orders, payments and security',
    manager:'Orders, products, customers, media and reports',
    fulfilment:'Order fulfilment, payment review and notes',
    content:'Products, homepage, media and catalogue content'
  };

  async function loadStaffAccess(){
    const root=$('#staffAccessList');if(!root)return;
    root.textContent='Loading team access…';
    try{
      const data=await api('/api/admin/staff');
      const staff=Array.isArray(data.staff)?data.staff:[];
      root.replaceChildren();
      const summary=document.createElement('p');
      summary.className='muted';
      summary.textContent=staff.length+' assigned account(s). Select a role, change Active, then save. Permission changes require MFA.';
      root.append(summary);

      const form=document.createElement('form');
      form.className='staff-invite-form';
      form.setAttribute('aria-label','Grant staff access');
      const emailLabel=document.createElement('label');emailLabel.textContent='Email address';
      const email=document.createElement('input');email.type='email';email.required=true;email.maxLength=254;email.autocomplete='email';email.placeholder='person@example.com';
      emailLabel.append(email);
      const roleLabel=document.createElement('label');roleLabel.textContent='Access level';
      const role=document.createElement('select');
      for(const name of ['content','fulfilment','manager','owner']){
        const option=document.createElement('option');option.value=name;
        option.textContent=name.charAt(0).toUpperCase()+name.slice(1);
        role.append(option);
      }
      roleLabel.append(role);
      const grant=document.createElement('button');grant.type='submit';grant.className='btn primary';grant.textContent='Grant access / Send invite';
      const feedback=document.createElement('p');feedback.className='staff-action-feedback';feedback.setAttribute('role','status');
      form.append(emailLabel,roleLabel,grant,feedback);
      root.append(form);
      const explanation=document.createElement('p');explanation.className='muted';explanation.textContent='Existing users get access immediately. New users receive an email invitation; delivery must be confirmed separately.';
      root.append(explanation);
      form.addEventListener('submit',async event=>{
        event.preventDefault();if(!form.reportValidity())return;
        grant.disabled=true;grant.textContent='Saving…';feedback.textContent='';
        try{
          const result=await api('/api/admin/staff',{method:'POST',body:{email:email.value.trim(),role:role.value}});
          feedback.textContent=result.message||'Access saved';
          toast(result.invitation_requested?'Invitation requested':'Existing account access updated');
          await loadStaffAccess();
        }catch(error){feedback.textContent=error.message||'Access could not be saved';}
        finally{grant.disabled=false;grant.textContent='Grant access / Send invite';}
      });

      const legend=document.createElement('details');legend.className='staff-role-legend';
      const legendTitle=document.createElement('summary');legendTitle.textContent='What each access level allows';
      legend.append(legendTitle);
      for(const [name,description] of Object.entries(STAFF_PERMISSIONS)){
        const item=document.createElement('p');item.textContent=name.charAt(0).toUpperCase()+name.slice(1)+': '+description;legend.append(item);
      }
      root.append(legend);

      const listing=document.createElement('div');listing.className='staff-list';listing.setAttribute('aria-label','Current team members');
      root.append(listing);
      if(!staff.length){const empty=document.createElement('p');empty.textContent='No staff access assigned';listing.append(empty);}
      for(const member of staff){
        const row=document.createElement('div');row.className='staff-access-row';
        const identity=document.createElement('div');identity.className='staff-identity';
        const address=document.createElement('strong');address.textContent=member.email||'Account email unavailable';
        const meta=document.createElement('small');
        const isSelf=member.user_id===me?.user?.id;
        meta.textContent=(member.invite_pending?'Invitation pending':'Account')+(isSelf?' · You':'');
        identity.append(address,meta);
        const memberRoleLabel=document.createElement('label');memberRoleLabel.textContent='Role';
        const memberRole=document.createElement('select');memberRole.setAttribute('aria-label','Role for '+(member.email||'account'));
        for(const name of ['owner','manager','fulfilment','content']){
          const option=document.createElement('option');option.value=name;
          option.textContent=name.charAt(0).toUpperCase()+name.slice(1);
          option.selected=member.role===name;memberRole.append(option);
        }
        memberRoleLabel.append(memberRole);
        const activeLabel=document.createElement('label');activeLabel.className='staff-active-label';
        activeLabel.textContent='Active';
        const active=document.createElement('input');active.type='checkbox';active.checked=Boolean(member.active);
        active.setAttribute('aria-label','Active access for '+(member.email||'account'));activeLabel.append(active);
        const save=document.createElement('button');save.type='button';save.className='btn secondary';save.textContent='Save access';
        const resultLabel=document.createElement('small');resultLabel.className='staff-row-feedback';resultLabel.setAttribute('role','status');
        const actions=document.createElement('div');actions.className='staff-row-actions';actions.append(save,resultLabel);
        row.append(identity,memberRoleLabel,activeLabel,actions);listing.append(row);
        save.onclick=async()=>{
          if(memberRole.value===member.role && active.checked===Boolean(member.active)){
            resultLabel.textContent='No changes to save';return;
          }
          const who=member.email||'this account';
          if(!confirm('Update '+who+' to '+memberRole.value+' ('+(active.checked?'active':'disabled')+')?'))return;
          save.disabled=true;resultLabel.textContent='Saving…';
          try{
            await api('/api/admin/staff',{method:'PATCH',body:{user_id:member.user_id,role:memberRole.value,active:active.checked}});
            toast('Access updated for '+who);
            await loadStaffAccess();
          }catch(error){resultLabel.textContent=error.message||'Save failed';save.disabled=false;}
        };
      }
    }catch(error){
      root.textContent='Staff access unavailable: '+(error.message||'Please retry');
      const retry=document.createElement('button');retry.type='button';retry.className='btn secondary';retry.textContent='Retry';
      retry.onclick=loadStaffAccess;root.append(retry);
    }
  }

  async function loadSecurity(){
    const view=$('#view-security');if(!view)return;
    let ownerPanel='';
    if(roleAllows('owner')){
      ownerPanel='<section class="panel"><h2>Team & Staff Access</h2><p>Manage both owners and every staff email here. Role changes require MFA. The last active owner is protected.</p><div id="staffAccessList">Loading team access…</div></section>';
    }
    if(roleAllows('owner','manager')){
      try{const data=await api('/api/admin/audit?per_page=50');ownerPanel+=`<section class="panel"><h2>Recent audit history</h2><div class="history-list">${(data.events||[]).map(a=>`<div><b>${esc(a.action)}</b><small>${fmtDate(a.created_at)} · ${esc(a.actor_role)}</small></div>`).join('')||'<p>No audit events.</p>'}</div></section>`;}catch(e){ownerPanel+=`<section class="panel"><p>Audit history unavailable: ${esc(e.message)}</p></section>`;}
    }
    view.innerHTML=ownerPanel+`<section class="panel" style="margin-top:16px"><h2>Authenticator and recovery</h2><p>Verify your session before saving changes, exporting orders or downloading a backup.</p><div id="mfaSection">Loading…</div><p>Keep a second verified authenticator on a separate device. If all factors are lost, contact another active owner and follow the documented identity verification process. A password reset does not remove MFA.</p></section><section class="panel" style="margin-top:16px"><h2>Sessions</h2><button class="btn danger" id="signOutAllBtn">Sign out all devices</button></section>`;
    if(roleAllows('owner')) await loadStaffAccess();
    $('#signOutAllBtn').onclick=()=>signOutAdmin('global');
    const localSignOut=document.createElement('button');localSignOut.type='button';localSignOut.className='btn secondary';localSignOut.textContent='Sign out this device';localSignOut.onclick=()=>signOutAdmin('local');$('#signOutAllBtn').before(localSignOut);
    await loadMFAStatus();
  }

  async function loadMFAStatus(){
    const el=$('#mfaSection');if(!el||!SB)return;
    try{
      const {data,error}=await SB.auth.mfa.listFactors();if(error)throw error;
      const factors=(data?.totp||[]).filter(f=>f.status==='verified');
      const {data:assurance,error:aalError}=await SB.auth.mfa.getAuthenticatorAssuranceLevel();if(aalError)throw aalError;
      el.innerHTML=`<p>${factors.length} verified authenticator(s). Session: <b>${esc(assurance?.currentLevel||'unknown')}</b>.</p>${factors.length?`<label>Authenticator<select id="mfaFactor">${factors.map(f=>`<option value="${esc(f.id)}">${esc(f.friendly_name||'Authenticator')}</option>`).join('')}</select></label><label>Code<input id="mfaStepCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></label><button class="btn primary" id="mfaStepVerify">Verify session</button><button class="btn secondary" id="removeMfaBtn" ${factors.length<2?'disabled':''}>Remove selected authenticator</button><p>Verify a replacement authenticator before removing an existing one.</p>`:'<p>Add an authenticator to enable protected actions.</p>'}<button class="btn secondary" id="enableMfaBtn">${factors.length?'Add backup authenticator':'Enable MFA'}</button><div id="mfaEnroll" hidden></div>`;
      $('#enableMfaBtn').onclick=startMFAEnroll;
      $('#mfaStepVerify')?.addEventListener('click',async()=>{
        const code=$('#mfaStepCode').value.trim(),factorId=$('#mfaFactor').value;
        if(!/^\d{6}$/.test(code)){toast('Enter a 6-digit authenticator code');return;}
        const button=$('#mfaStepVerify');button.disabled=true;
        try{const {error}=await SB.auth.mfa.challengeAndVerify({factorId,code});if(error)throw error;$('#mfaStepCode').value='';me=await getMe();toast('Session verified. Retry your action.');await loadMFAStatus();}catch(e){toast(e.message);button.disabled=false;}
      });
      $('#removeMfaBtn')?.addEventListener('click',async()=>{
        if(factors.length<2||!confirm('Remove this authenticator? Keep your replacement device available.'))return;
        const {error}=await SB.auth.mfa.unenroll({factorId:$('#mfaFactor').value});if(error)toast(error.message);else{toast('Authenticator removed. Verify your current session again if requested.');await loadMFAStatus();}
      });
    }catch(e){el.textContent='MFA unavailable: '+e.message;}
  }

  async function startMFAEnroll(){
    const box=$('#mfaEnroll'); box.hidden=false; box.innerHTML='<p class="muted">Setting up…</p>';
    try{
      const {data,error}=await SB.auth.mfa.enroll({factorType:'totp',friendlyName:'Authenticator '+new Date().toISOString().slice(0,19)});
      if(error) throw error;
      box.innerHTML=`
        <p><b>Step 1:</b> Scan this QR with Google Authenticator / Authy:</p>
        <div style="background:#fff;padding:12px;display:inline-block;border-radius:8px"><img src="${esc(data.totp.qr_code)}" alt="MFA QR" style="width:180px;height:180px"></div>
        <p style="margin-top:8px"><b>Step 2:</b> Enter the 6-digit code:</p>
        <div style="display:flex;gap:8px"><input id="mfaCode" placeholder="000000" maxlength="6" style="padding:8px;border:1px solid var(--border);border-radius:8px;width:120px"><button class="btn primary" id="verifyMfaBtn">Verify</button></div>`;
      $('#verifyMfaBtn').onclick=async()=>{
        const code=$('#mfaCode').value.trim();
        if(!/^\d{6}$/.test(code)){toast('Enter a 6-digit authenticator code');return;}
        const {data:ch,error:chErr}=await SB.auth.mfa.challenge({factorId:data.id});
        if(chErr){toast(chErr.message);return;}
        const {error:vErr}=await SB.auth.mfa.verify({factorId:data.id,challengeId:ch.id,code});
        if(vErr) toast(vErr.message); else {toast('MFA enabled!');loadMFAStatus();}
      };
    }catch(e){box.innerHTML=`<p class="muted">Failed: ${esc(e.message)}</p>`;}
  }

  let editingBoxId = null,editingBoxUpdatedAt=null;

  function wireBoxLive(){
    $('#saveBoxDraftBtn')?.addEventListener('click',async e=>{if(!me||!roleAllows('owner','manager','content'))return;e.preventDefault();e.stopImmediatePropagation();
      const seen=new Map(); $$('#boxSelectedItems .builder-item').forEach(row=>{const ctl=row.querySelector('[data-id]');const q=Number(row.querySelector('.qty-controls b')?.textContent||0);if(ctl&&q>0)seen.set(Number(ctl.dataset.id),q);});
      const items=[...seen].map(([product_id,quantity])=>({product_id,quantity})); const title=$('#boxName')?.value.trim()||'', selling_price=Number($('#boxPrice')?.value||0);
      if(!title||!items.length||!Number.isInteger(selling_price)||selling_price<0){toast('Box name, selling price and at least one product are required');return;}
      try{
        const body={title,description:$('#boxDescription')?.value.trim()||'',selling_price,items,visibility:'draft'};
        if(editingBoxId){
          body.expected_updated_at=editingBoxUpdatedAt;
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
            <button class="btn secondary compact" data-edit-box="${esc(b.id)}">✏️ Edit</button>${roleAllows('owner','manager')?`<button class="btn secondary compact" data-publish-box="${esc(b.id)}">${b.visibility==='visible'?'Hide':'Publish'}</button>`:''}
          </div>
        </div>`;}).join('');
      listEl.querySelectorAll('[data-publish-box]').forEach(b=>b.onclick=async()=>{try{const box=boxes.find(x=>String(x.id)===b.dataset.publishBox);await api('/api/admin/boxes/'+box.id,{method:'PATCH',body:{visibility:box.visibility==='visible'?'hidden':'visible',expected_updated_at:box.updated_at}});toast('Box visibility saved');await loadExistingBoxes();}catch(e){toast(e.message)}});
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
            editingBoxId=boxId;editingBoxUpdatedAt=box.updated_at;
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

  // Cloudflare Pages branch previews deliberately have no Supabase credentials.
  // Never present real password fields on these unconfigured design-review hosts.
  // The live, MFA-protected owner login remains at the canonical production site.
  function isDesignPreviewHost(){
    return /^[a-z0-9-]+\.chaskabox-site\.pages\.dev$/i.test(location.hostname);
  }
  function showDesignPreviewGate(){
    hideBoot();
    const mfa=$('#liveAdminMfa');if(mfa)mfa.hidden=true;
    let el=$('#liveAdminLogin');
    if(!el){el=document.createElement('div');el.id='liveAdminLogin';el.className='live-admin-login';document.body.appendChild(el);}
    el.hidden=false;
    el.innerHTML=`<section class="live-login-card staff-login-card" aria-labelledby="staffLoginHeading">
      <div class="staff-login-brand"><img src="/images/logo-approved-20261017.png" alt="ChaskaBox"><div class="staff-login-brandname">CHASKABOX<small>ADMIN CONSOLE V4</small></div></div>
      <div class="staff-login-shield" aria-hidden="true">✓</div>
      <div class="staff-login-eyebrow"><span>SAFE DESIGN PREVIEW</span><span>NO LIVE DATA</span></div>
      <h1 id="staffLoginHeading">Preview without signing in</h1>
      <p class="staff-login-intro">This preview has no staging Supabase connection. For your security, staff passwords and MFA are not accepted here.</p>
      <p class="staff-login-message" role="status">Design review uses synthetic sample data. Real orders, settings and messages stay protected.</p>
      <p><a class="btn primary staff-login-submit" href="/admin-v4-demo.html">Explore Admin V4 demo →</a></p>
      <p style="text-align:center;margin-top:16px"><a href="https://chaskabox.online/admin.html">Open secure production admin sign-in</a></p>
      <div class="staff-login-footer"><span>◈ No account credentials required</span><a href="/">← Back to storefront</a></div>
    </section>`;
  }
  const recoveryHint=location.hash.includes('type=recovery');
  async function init(){
    if(isDesignPreviewHost()){showDesignPreviewGate();return;}
    // Safety net: never leave the console stuck on "Verifying admin session…".
    setTimeout(()=>{ if(!bootDone) showBootError('Session check is taking too long. Please reload and try again.'); }, 25000);
    if(!(await ensureClient())){showLogin('Public Supabase configuration could not be loaded.');return;}
    // Password recovery: user clicked reset link in email
    if(recoveryHint){
      showResetPassword();
      return;
    }
    const {data}=await SB.auth.getSession();session=data?.session||null;if(!session){showLogin();return;}await bootAuthenticated();
  }

  function showResetPassword(){
    hideBoot();
    let el=$('#liveAdminLogin');
    if(!el){el=document.createElement('div');el.id='liveAdminLogin';el.className='live-admin-login';document.body.appendChild(el);}
    el.innerHTML=`<form class="live-login-card" id="resetPwForm"><img src="/images/logo-approved-20261017.png" alt="ChaskaBox"><span class="eyebrow">SECURE ADMIN</span><h1>Set new password</h1><p>Enter your new password below.</p><label>New password<input id="newPw1" type="password" autocomplete="new-password" required minlength="8"></label><label>Confirm password<input id="newPw2" type="password" autocomplete="new-password" required minlength="8"></label><div id="resetPwError" class="live-error" hidden></div><div id="resetPwMsg" class="live-msg" hidden></div><button class="btn primary" type="submit">Update password</button></form>`;
    el.hidden=false;
    $('#resetPwForm').onsubmit=async e=>{
      e.preventDefault();
      const err=$('#resetPwError');const msg=$('#resetPwMsg');err.hidden=true;msg.hidden=true;
      const p1=$('#newPw1').value,p2=$('#newPw2').value;
      if(p1!==p2){err.textContent='Passwords do not match';err.hidden=false;return;}
      if(p1.length<8){err.textContent='Password must be at least 8 characters';err.hidden=false;return;}
      try{
        const {error}=await SB.auth.updateUser({password:p1});
        if(error)throw error;
        msg.textContent='Password updated! Redirecting to sign in…';msg.hidden=false;
        await SB.auth.signOut();
        setTimeout(()=>{location.hash='';location.reload();},1500);
      }catch(x){err.textContent=x.message||'Update failed';err.hidden=false;}
    };
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
        if(b.disabled)return;
        const id=b.dataset.toggleCat;
        const cat=categoriesCache.find(x=>String(x.id)===id);
        if(!cat)return toast('Category no longer exists; refresh and retry.');
        b.disabled=true;
        try{
          await api(`/api/admin/categories/${encodeURIComponent(id)}`,{method:'PATCH',body:{is_visible:!cat.is_visible}});
          toast(cat.is_visible?'Category hidden':'Category visible');
          await loadCategories();
        }catch(e){toast('Category visibility was not changed: '+e.message);}
        finally{b.disabled=false;}
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
    const mayDelete=Boolean(c)&&roleAllows('owner','manager');
    $('#deleteCategoryBtn').hidden=!mayDelete;
    $('#deleteCategoryBtn').style.display=mayDelete?'':'none';
    $('#deleteCategoryBtn').onclick=mayDelete?()=>deleteCategory(c.id,c.name):null;
    $('#categoryEditor').classList.add('open');
    $('#categoryEditor').setAttribute('aria-hidden','false');
  }
  function closeCategoryEditor(){
    $('#categoryEditor').classList.remove('open');
    $('#categoryEditor').setAttribute('aria-hidden','true');
  }
  async function deleteCategory(id,name){
    if(!roleAllows('owner','manager'))return toast('Only Owners or Managers can delete categories.');
    if(!confirm(`Delete category "${name}"? Products will NOT be deleted.`))return;
    const button=$('#deleteCategoryBtn');
    if(button?.disabled)return;
    if(button)button.disabled=true;
    try{
      await api(`/api/admin/categories/${encodeURIComponent(id)}`,{method:'DELETE'});
      toast('Category deleted');closeCategoryEditor();await loadCategories();
    }catch(e){toast('Category delete failed: '+e.message);}
    finally{if(button)button.disabled=false;}
  }

  async function openAdminOperation(kind,endpoint,method,defaults,reload){
    if(!window.chaskaAdminOpsForms)return toast('Admin form unavailable: reload the page');
    try{
      const payload=await window.chaskaAdminOpsForms.show(kind,defaults||{});
      if(!payload)return;
      await api(endpoint,{method,body:payload});
      toast('Saved successfully');await reload();
    }catch(e){toast('Save failed: '+(e.message||'Unexpected error'));}
  }

  function wireCategoryEditor(){
    document.querySelectorAll('[data-close-cat-modal]').forEach(b=>b.addEventListener('click',closeCategoryEditor));
    $('#refreshCategories')?.addEventListener('click',()=>loadCategories());
    $('#addCategoryBtn')?.addEventListener('click',()=>openCategoryEditor(null));
    $('#refreshBrands')?.addEventListener('click',()=>loadBrands());
    $('#addBrandBtn')?.addEventListener('click',()=>openBrandEditor(null,[]));
    $('#refreshResolutions')?.addEventListener('click',()=>loadResolutions());
    $('#refreshAnalytics')?.addEventListener('click',()=>loadAnalytics());
    initBackup();
    $('#refreshCoupons')?.addEventListener('click',()=>loadCoupons());
    $('#addCouponBtn')?.addEventListener('click',()=>openAdminOperation('coupon','/api/admin/coupons','POST',{discount_type:'percent',min_order:0},loadCoupons));
    $('#refreshShipping')?.addEventListener('click',()=>loadShipping());
    $('#addZoneBtn')?.addEventListener('click',()=>openAdminOperation('zone','/api/admin/shipping-zones','POST',{fee:300},loadShipping));
    $('#resolutionStatusFilter')?.addEventListener('change',()=>loadResolutions());
    $('#addResolutionBtn')?.addEventListener('click',()=>openAdminOperation('resolution','/api/admin/resolutions','POST',{issue_type:'complaint'},loadResolutions));
    $('#saveThemeBtn')?.addEventListener('click',async()=>{
      try{await api('/api/admin/theme',{method:'PUT',body:{settings:collectTheme()}});toast('Theme saved');}catch(e){toast(e.message);}
    });
    $('#previewThemeBtn')?.addEventListener('click',previewTheme);
    $('#resetThemeBtn')?.addEventListener('click',async()=>{
      if(!confirm('Reset theme to defaults?')) return;
      const defaults={primary_color:'#1a2b5c',accent_color:'#f59e0b',background_color:'#ffffff',text_color:'#1f2937',font_family:'system-ui',border_radius:'12',logo_url:'/logo.png',favicon_url:'/favicon.ico',announcement_enabled:'false',announcement_text:''};
      try{await api('/api/admin/theme',{method:'PUT',body:{action:'reset'}});$('#themePreviewStyle')?.remove();toast('Theme reset');loadTheme();}catch(e){toast(e.message);}
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
          <button data-nav-edit="${esc(i.id)}" aria-label="Edit ${esc(i.label)}">Edit</button>
          <button data-nav-toggle="${esc(i.id)}" aria-label="Toggle enabled">${i.is_enabled?'✓':'✗'}</button></div>`).join('')
          :'<p class="muted">No items. Click + Add.</p>';
      };
      const persistOrder=async(items)=>api('/api/admin/navigation',{method:'PATCH',body:{
        items:items.map((i,idx)=>({id:i.id,position:idx+1}))}});
      const move=async(el,idx,dir)=>{
        if(el._navSaving)return;
        const previous=(el._navItems||[]).slice(),j=idx+dir;
        if(j<0||j>=previous.length)return;
        const updated=previous.slice();
        [updated[idx],updated[j]]=[updated[j],updated[idx]];
        el._navSaving=true;
        render(updated,'#'+el.id);
        try{await persistOrder(updated);}
        catch(e){render(previous,'#'+el.id);toast('Reorder failed; original menu restored: '+e.message);}
        finally{el._navSaving=false;}
      };
      render(nav.header,'#headerNavList');
      render(nav.footer,'#footerNavList');
      render(nav.mobile,'#mobileNavList');
      // Use a real, accessible form rather than an inert button or prompt().
      const openNavEditor=(item=null,defaultLocation='header')=>{
        if(document.querySelector('[data-nav-editor]'))return;
        const existing=Boolean(item);
        const dialog=document.createElement('dialog');
        dialog.className='admin-ops-dialog';dialog.dataset.navEditor='true';
        dialog.innerHTML=`<form id="navEditForm" novalidate>
          <h2>${existing?'Edit menu link':'Add menu link'}</h2>
          <p class="muted">Menus publish to the storefront after saving. Choose an internal path or a secure external URL.</p>
          <label class="admin-ops-field">Label<input id="navEditLabel" required maxlength="100"></label>
          <label class="admin-ops-field">Destination URL<input id="navEditUrl" required maxlength="500" placeholder="/shop/ or https://example.com"></label>
          <label class="admin-ops-field">Menu location<select id="navEditLocation"><option value="header">Header</option><option value="footer">Footer</option><option value="mobile">Mobile</option></select></label>
          <label class="admin-ops-field">Enabled <input type="checkbox" id="navEditEnabled"></label>
          <p id="navEditError" role="alert" class="admin-ops-error" hidden></p>
          <div class="admin-ops-actions"><button class="btn secondary" type="button" id="navEditCancel">Cancel</button><button class="btn primary" type="submit" id="navEditSave">Save menu link</button></div>
        </form>`;
        document.body.append(dialog);
        const close=()=>{dialog.close?.();dialog.remove();};
        dialog.querySelector('#navEditCancel').onclick=close;
        dialog.oncancel=e=>{e.preventDefault();close();};
        const val=id=>dialog.querySelector(id);
        val('#navEditLabel').value=item?.label||'';
        val('#navEditUrl').value=item?.url||'/';
        val('#navEditLocation').value=item?.location||defaultLocation;
        val('#navEditEnabled').checked=item?.is_enabled!==false;
        val('#navEditForm').onsubmit=async e=>{
          e.preventDefault();
          const label=val('#navEditLabel').value.trim(),url=val('#navEditUrl').value.trim();
          const location=val('#navEditLocation').value,error=val('#navEditError'),save=val('#navEditSave');
          error.hidden=true;
          if(label.length<1||label.length>100||!(/^(\/(?!\/)|https:\/\/|mailto:|tel:|#[a-z0-9_.-]*$)/i.test(url))||/\s/.test(url)){
            error.textContent='Enter a label and a safe /path, HTTPS, email or telephone URL.';
            error.hidden=false;return;
          }
          save.disabled=true;
          try{
            const data={label,url,location,is_enabled:val('#navEditEnabled').checked};
            if(existing)await api('/api/admin/navigation',{method:'PATCH',body:{items:[{id:item.id,...data}]}});
            else await api('/api/admin/navigation',{method:'POST',body:{...data,position:(nav[location]||[]).length+1}});
            close();toast(existing?'Menu link updated':'Menu link added');
            await loadNavigation();
          }catch(err){error.textContent='Menu save failed: '+err.message;error.hidden=false;}
          finally{if(save.isConnected)save.disabled=false;}
        };
        dialog.showModal?.();
        val('#navEditLabel').focus();
      };
      for(const [id,location] of [['addHeaderNav','header'],['addFooterNav','footer'],['addMobileNav','mobile']]){
        const button=$('#'+id);
        if(button)button.onclick=()=>openNavEditor(null,location);
      }
      const navView=$('#view-navigation');
      if(navView && !navView._navWired){
        navView._navWired=true;
        navView.addEventListener('click',async(e)=>{
          const up=e.target.closest('[data-nav-up]'), down=e.target.closest('[data-nav-down]'),
            tog=e.target.closest('[data-nav-toggle]'), edit=e.target.closest('[data-nav-edit]');
          if(edit){
            const list=edit.closest('.nav-row')?.parentElement;
            const item=(list?._navItems||[]).find(x=>String(x.id)===edit.dataset.navEdit);
            if(item)openNavEditor(item,item.location);
          }
          else if(up){ const el=up.closest('.nav-row').parentElement; move(el,Number(up.dataset.navUp),-1); }
          else if(down){ const el=down.closest('.nav-row').parentElement; move(el,Number(down.dataset.navDown),1); }
          else if(tog){
            const el=tog.closest('.nav-row').parentElement;
            const items=el._navItems||[];
            const it=items.find(x=>String(x.id)===tog.dataset.navToggle);
            if(!it) return;
            const next=!it.is_enabled;
            tog.disabled=true;
            try{ await api('/api/admin/navigation',{method:'PATCH',body:{items:[{id:it.id,is_enabled:next}]}}); it.is_enabled=next; tog.textContent=next?'✓':'✗'; }
            catch(err){ toast('Toggle failed: '+err.message); }
            tog.disabled=false;
          }
        });
      }
    }catch(e){toast(e.message);}
  }

  // ============ NOTIFICATIONS ============
  let notificationHistorySeq=0;
  let notificationStatusSeq=0;
  let notificationHistoryPage=1;
  let notificationEnabledChannels=[];
  let notificationChannelsVerified=false;
  async function loadNotificationHistory(page=1){
    const el=$('#notifHistoryRows');
    if(!el)return;
    const view=$('#notifHistoryView')?.value||'all';
    const target=$('#notifHistoryTarget')?.value||'all';
    const seq=++notificationHistorySeq;
    el.setAttribute('aria-busy','true');
    el.innerHTML='<p class="muted">Loading delivery history…</p>';
    const pageLabel=$('#notifHistoryPage');
    const prev=$('#notifHistoryPrev'), next=$('#notifHistoryNext');
    if(prev)prev.disabled=true;
    if(next)next.disabled=true;
    try{
      const params=new URLSearchParams({view,target,page:String(page)});
      const d=await api('/api/admin/notifications/history?'+params.toString());
      if(seq!==notificationHistorySeq)return;
      notificationHistoryPage=d.page;
      const rows=Array.isArray(d.rows)?d.rows:[];
      const channels=new Set(notificationEnabledChannels);
      if(!rows.length){
        el.innerHTML='<p class="muted">No events match these filters. This does not establish provider connectivity.</p>';
      }else{
        const html=rows.map(n=>{
          const order=String(n.order_id||''),shortId=order?order.slice(0,8)+'…':'—';
          const held=notificationChannelsVerified&&['pending','retry'].includes(n.status)&&!channels.has(n.target);
          const sendState=held?'On hold (channel inactive)':String(n.status||'unknown').replaceAll('_',' ');
          const delivered=n.delivery_status==='delivered'?'Confirmed delivered':n.delivery_status==='unknown'?'Not confirmed':String(n.delivery_status||'Not confirmed').replaceAll('_',' ');
          const error=n.error_code?' · '+esc(n.error_code.replaceAll('_',' ')):'';
          const attempted=Number.isInteger(n.attempts)&&n.attempts>=0?n.attempts:'—';
          return `<tr>
            <td><small>${esc(n.event_type||'Event')}</small><br><code title="${esc(order)}">${esc(shortId)}</code></td>
            <td>${esc(n.target||'unknown')}</td>
            <td><b>${esc(sendState)}</b><br><small>${esc(delivered)}${error}</small></td>
            <td>${esc(attempted)}</td>
            <td><small>${esc(n.updated_at?fmtDate(n.updated_at):'—')}</small></td>
          </tr>`;
        }).join('');
        el.innerHTML='<div class="live-table-wrap"><table class="live-table"><thead><tr><th>Event / order</th><th>Channel</th><th>Queue / delivery</th><th>Attempts</th><th>Updated</th></tr></thead><tbody>'+html+'</tbody></table></div>';
      }
      const pages=Number(d.pages)||0;
      if(pageLabel)pageLabel.textContent='Page '+d.page+' / '+Math.max(pages,1)+' · '+(Number(d.total)||0)+' events';
      if(prev)prev.disabled=d.page<=1;
      if(next)next.disabled=d.page>=pages||d.page>=100;
    }catch(error){
      if(seq!==notificationHistorySeq)return;
      el.innerHTML='<p role="alert">Could not load delivery history: '+esc(error.message||'Unknown error')+'. Refresh or try again.</p>';
      if(pageLabel)pageLabel.textContent='History unavailable';
    }finally{
      if(seq===notificationHistorySeq)el.removeAttribute('aria-busy');
    }
  }
  async function loadNotifications(){
    const seq=++notificationStatusSeq;
    const st=$('#notifServiceStatus'), ob=$('#notifOutboxStats'), fl=$('#notifFailures');
    // A refreshing or failed status query must not leave old green health
    // labels or previous channel entitlements visible as current evidence.
    notificationEnabledChannels=[];
    notificationChannelsVerified=false;
    if(st){st.setAttribute('aria-busy','true');st.innerHTML='<p class="muted" role="status">Checking worker and delivery status… No provider result is confirmed yet.</p>';}
    try{
      const d=await api('/api/admin/notifications');
      if(seq!==notificationStatusSeq)return;
      if(!d || typeof d!=='object')throw new Error('Invalid notification status response');
      const state=d.dispatch||{};
      notificationEnabledChannels=Array.isArray(state.configured_targets)?state.configured_targets:[];
      notificationChannelsVerified=Array.isArray(state.configured_targets);
      if(st)st.innerHTML=`<div style="display:grid;gap:8px"><div><b>Queue consumer:</b> ${esc(d.worker_status||'unknown')}</div><div><b>Last completed:</b> ${state.last_completed_at?esc(fmtDate(state.last_completed_at)):'No heartbeat recorded'}</div><div><b>Enabled channels:</b> ${esc((state.configured_targets||[]).join(', ')||'None confirmed')}</div><small class="muted">Channel configuration comes from the consumer heartbeat. Provider availability is not probed here.</small></div>`;
      const p=d.provider_results||{};
      if(ob){const o=d.owner_outbox||{},c=d.customer_outbox||{};
        const queue=(title,q)=>`<div><b>${title}:</b> ${q.pending||0} pending · ${q.processing||0} processing · ${q.retry||0} retry · ${q.blocked||0} blocked · ${q.uncertain||0} uncertain · ${q.dead||0} dead</div>`;
        const legacy=q=>Object.values(q||{}).reduce((n,v)=>n+Number(v),0);
        ob.innerHTML=`<div style="display:grid;gap:8px;font-size:12px">${queue('Owner alerts',o)}${queue('Customer updates',c)}<div><b>Provider results:</b> ${p.accepted||0} accepted · ${p.delivered||0} confirmed delivered · ${p.delivery_failed||0} delivery failed · ${p.complaints||0} complaints · ${p.unconfirmed||0} awaiting confirmation</div><div><b>Historical review:</b> ${legacy(d.legacy_owner)} old owner jobs · ${legacy(d.legacy_customer)} old customer jobs · ${d.excluded_before_cutoff||0} before activation cutoff</div><div>${d.inactive_channel_pending||0} jobs on inactive channels</div><small class="muted">${esc(d.note||'Provider acceptance does not confirm delivery.')}</small></div>`;
      }
      if(fl){const fails=d.recent_failures||[];
        fl.innerHTML=fails.length?fails.map(f=>`<div class="box-product-row"><div style="flex:1"><h4>Order ${esc(f.order_id||'—')}</h4><small>${esc(f.target)} · ${esc(f.status)} · ${esc(f.last_error||f.delivery_status)}</small></div></div>`).join(''):'<p class="muted">No recorded issues in the new queue. Check consumer status and historical jobs above.</p>';
      }
    }catch(e){
      if(seq!==notificationStatusSeq)return;
      notificationEnabledChannels=[];
      notificationChannelsVerified=false;
      if(st)st.innerHTML='<p role="alert"><b>Notification status unavailable.</b> Worker health and enabled channels cannot be verified. No message was sent. Refresh to retry.</p>';
      if(ob)ob.innerHTML='<p role="status">Queue and delivery totals unavailable — do not assume messages were delivered.</p>';
      if(fl)fl.innerHTML='<p role="status">Review records unavailable until the status service recovers.</p>';
      toast('Notification status unavailable: '+(e.message||'Please retry'));
    }finally{
      if(seq===notificationStatusSeq)st?.removeAttribute('aria-busy');
    }
    if($('#refreshNotifStatus'))$('#refreshNotifStatus').onclick=loadNotifications;
    if($('#refreshTemplates'))$('#refreshTemplates').onclick=loadTemplates;
    if($('#refreshNotifHistory'))$('#refreshNotifHistory').onclick=()=>loadNotificationHistory(notificationHistoryPage);
    for(const id of ['#notifHistoryView','#notifHistoryTarget']){
      const select=$(id);if(select)select.onchange=()=>loadNotificationHistory(1);
    }
    if($('#notifHistoryPrev'))$('#notifHistoryPrev').onclick=()=>loadNotificationHistory(Math.max(1,notificationHistoryPage-1));
    if($('#notifHistoryNext'))$('#notifHistoryNext').onclick=()=>loadNotificationHistory(notificationHistoryPage+1);
    loadTemplates();
    await loadNotificationHistory(1);
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
    if($('#refreshHealth'))$('#refreshHealth').onclick=loadHealth;
  }

  // ============ AI CENTER ============
  async function loadAICenter(){
    await (await import('./admin-ai-center.js?v=20261018-cms1')).mountAIStatus($('#view-assistant'),{api,toast,canManage:roleAllows('owner')});
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
            <button class="btn secondary compact" data-toggle-brand="${b.id}">${b.is_visible?'👁️ Hide':'👁️ Show'}</button>
            ${roleAllows('owner')?`<button class="btn danger compact" data-del-brand="${b.id}">🗑️ Delete</button>`:''}`:`
            <button class="btn primary compact" data-add-brand="${esc(b.name)}">+ Add brand</button>`}
          </div>
        </div>`).join('');
      listEl.querySelectorAll('[data-toggle-brand]').forEach(btn=>btn.onclick=async()=>{
        if(btn.disabled)return;
        const id=btn.dataset.toggleBrand;
        const b=brands.find(x=>String(x.id)===String(id));
        if(!b)return toast('Brand no longer exists; refresh and retry.');
        btn.disabled=true;
        try{
          await api(`/api/admin/brands/${encodeURIComponent(id)}`,{method:'PATCH',body:{is_visible:!b.is_visible}});
          toast(b.is_visible?'Brand hidden':'Brand visible');await loadBrands();
        }catch(e){toast('Brand visibility was not changed: '+e.message);}
        finally{btn.disabled=false;}
      });
      listEl.querySelectorAll('[data-add-brand]').forEach(btn=>btn.onclick=()=>openBrandEditor(null,[],btn.dataset.addBrand));
      listEl.querySelectorAll('[data-edit-brand]').forEach(btn=>btn.onclick=()=>openBrandEditor(btn.dataset.editBrand, brands));
      listEl.querySelectorAll('[data-del-brand]').forEach(btn=>btn.onclick=async()=>{
        if(!roleAllows('owner'))return toast('Only Owners can delete brands.');
        if(btn.disabled)return;
        const id=btn.dataset.delBrand;
        const b=brands.find(x=>String(x.id)===String(id));
        if(!confirm(`Delete brand "${b?b.name:id}"? Products will NOT be deleted, only the brand entry.`))return;
        btn.disabled=true;
        try{await api(`/api/admin/brands/${encodeURIComponent(id)}`,{method:'DELETE'});
          toast('Brand deleted');await loadBrands();}
        catch(e){toast('Brand delete failed: '+e.message);}
        finally{btn.disabled=false;}
      });
    }catch(e){listEl.innerHTML=`<p class="muted">Failed: ${esc(e.message)}</p>`;}
  }
  function openBrandEditor(id, brands=[], initialName=''){
    const creating=id===null||id===undefined;
    const b=creating?{name:initialName,slug:'',is_visible:false,featured_product_ids:[]}:brands.find(x=>String(x.id)===String(id));
    if(!b) return;
    let modal=$('#brandEditorModal');
    if(!modal){modal=document.createElement('div');modal.id='brandEditorModal';modal.className='admin-modal';document.body.appendChild(modal);}
    modal.classList.add('open');
    const featIds=(b.featured_product_ids||[]).join(', ');
    modal.innerHTML=`<div class="modal-backdrop" data-close-brand></div>
    <section class="admin-modal-card"><div class="modal-head"><div><small>BRAND</small><h2>${creating?'Add a brand':esc(b.name)+' — Edit'}</h2></div><button class="icon-btn" data-close-brand>×</button></div>
    <div style="padding:18px;display:grid;gap:14px">
      <div class="form-two">
        <label>Brand name<input id="beName" value="${esc(b.name||'')}"></label>
        <label>Slug (auto)<input id="beSlug" value="${esc(b.slug||'')}" placeholder="auto-generated"></label>
      </div>
      <div class="form-two">
        <label>Logo URL<input id="beLogo" value="${esc(b.logo_url||'')}" placeholder="https://…"><input type="file" id="beLogoFile" accept="image/*" style="margin-top:4px"></label>
        <label>Hero / banner URL<input id="beHero" value="${esc(b.hero_image_url||'')}"><input type="file" id="beHeroFile" accept="image/*" style="margin-top:4px"></label>
      </div>
      <label>Short description<input id="beShort" value="${esc(b.short_description||'')}" maxlength="160"></label>
      <label>Long description<textarea id="beLong" rows="4">${esc(b.long_description||b.description||'')}</textarea></label>
      <div class="form-two">
        <label>SEO title<input id="beSeoTitle" value="${esc(b.seo_title||'')}"></label>
        <label>OG image URL<input id="beOg" value="${esc(b.og_image_url||'')}"></label>
      </div>
      <label>Meta description<textarea id="beSeoDesc" rows="2">${esc(b.seo_description||'')}</textarea></label>
      <div class="form-two">
        <label>Featured product IDs (comma-separated)<input id="beFeat" value="${esc(featIds)}" placeholder="12, 45, 78"></label>
        <label>Sort order<input id="beSort" type="number" value="${b.sort_order??b.position??0}"></label>
      </div>
      <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="beVisible" ${b.is_visible?'checked':''} style="width:auto"> Visible on storefront</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn secondary" id="beAiDesc">✨ Generate description</button>
        <button class="btn secondary" id="beAiSeo">✨ Generate SEO</button>
        <button class="btn secondary" id="beAiFeat">✨ Suggest featured</button>
        <button class="btn secondary" id="beAiFaq">✨ FAQ ideas</button>
        <button class="btn secondary" id="bePreview">👁 Preview page</button>
      </div>
      <div id="beAiFaqOut" style="display:none;background:var(--bg-soft);border-radius:8px;padding:12px;font-size:13px"></div>
      <div class="action-row">
        <button class="btn secondary" data-close-brand>Cancel</button>
        <button class="btn secondary" id="beDraft">📝 Save draft</button>
        <button class="btn primary" id="beSave">🚀 Publish</button>
      </div>
    </div></section>`;
    modal.querySelectorAll('[data-close-brand]').forEach(x=>x.onclick=()=>modal.classList.remove('open'));
    const val=id=>modal.querySelector(id)?.value.trim()||'';
    modal.querySelector('#bePreview').onclick=()=>{const slug=val('#beSlug')||b.slug;if(slug)window.open(`/brand/${encodeURIComponent(slug)}/`,'_blank');};
    // File upload handlers
    const uploadFile=async(file,type)=>{
      if(!file) return;
      try{toast('Uploading…');
        const fd=new FormData(); fd.append('file',file); fd.append('type',type);
        const d=await api('/api/admin/brand-upload',{method:'POST',body:fd});
        if(d.ok&&d.url){ modal.querySelector(type==='logo'?'#beLogo':'#beHero').value=d.url; toast('Uploaded!'); }
        else toast('Upload failed');
      }catch(e){toast(e.message)}
    };
    modal.querySelector('#beLogoFile').onchange=e=>uploadFile(e.target.files[0],'logo');
    modal.querySelector('#beHeroFile').onchange=e=>uploadFile(e.target.files[0],'hero');
    modal.querySelector('#beAiDesc').onclick=async()=>{
      try{toast('Generating…');const r=await api('/api/admin/ai',{method:'POST',body:{task:'brand_description',context:{brand:val('#beName')||b.name}}});
      const t=r.draft||'';if(t){modal.querySelector('#beLong').value=t;toast('Description generated — review before saving');}}catch(e){toast(e.message)}};
    modal.querySelector('#beAiSeo').onclick=async()=>{
      try{toast('Generating…');const r=await api('/api/admin/ai',{method:'POST',body:{task:'brand_seo',context:{brand:b.name}}});
      if(r.structured?.seo_title)modal.querySelector('#beSeoTitle').value=r.structured.seo_title;
      if(r.structured?.seo_description)modal.querySelector('#beSeoDesc').value=r.structured.seo_description;
      toast('SEO generated — review before saving');}catch(e){toast(e.message)}};
    modal.querySelector('#beAiFeat').onclick=async()=>{
      try{toast('Suggesting…');const r=await api('/api/admin/ai',{method:'POST',body:{task:'brand_featured',context:{brand:b.name}}});
      const ids=r.structured?.featured_ids||[];if(ids.length){modal.querySelector('#beFeat').value=ids.join(', ');toast('Featured suggestions applied — review before saving');}else toast('No suggestions');}catch(e){toast(e.message)}};
    modal.querySelector('#beAiFaq').onclick=async()=>{
      try{toast('Generating…');const r=await api('/api/admin/ai',{method:'POST',body:{task:'brand_faq',context:{brand:b.name}}});
      const out=modal.querySelector('#beAiFaqOut');const faqs=r.structured?.faqs||[];
      if(faqs.length){out.style.display='block';out.innerHTML='<b>FAQ suggestions (copy what you like):</b><br>'+faqs.map(f=>`• <b>${esc(f.q||f)}</b>${f.a?`<br><span style="color:var(--muted)">${esc(f.a)}</span>`:''}`).join('<br><br>');}
      else toast('No suggestions');}catch(e){toast(e.message)}};
    const collectBrandBody=(forceVisible)=>{
      const feat=val('#beFeat').split(',').map(s=>parseInt(s.trim())).filter(n=>n>0);
      return {name:val('#beName'),slug:val('#beSlug')||undefined,logo_url:val('#beLogo')||null,
        hero_image_url:val('#beHero')||null,short_description:val('#beShort')||null,
        long_description:val('#beLong')||null,seo_title:val('#beSeoTitle')||null,
        seo_description:val('#beSeoDesc')||null,og_image_url:val('#beOg')||null,
        featured_product_ids:feat,sort_order:parseInt(val('#beSort'))||0,
        is_visible:forceVisible!==undefined?forceVisible:modal.querySelector('#beVisible').checked};
    };
    modal.querySelector('#beDraft').onclick=async()=>{
      try{const body=collectBrandBody(false);
        if(b.id) await api(`/api/admin/brands/${b.id}`,{method:'PATCH',body});
        else await api('/api/admin/brands',{method:'POST',body});
        toast('Draft saved (hidden from storefront)');modal.classList.remove('open');loadBrands();}catch(e){toast(e.message)}};
    modal.querySelector('#beSave').onclick=async()=>{
      const body=collectBrandBody(true);
      if(!body.name){toast('Brand name required');return;}
      try{
        if(creating) await api('/api/admin/brands',{method:'POST',body});
        else await api(`/api/admin/brands/${id}`,{method:'PATCH',body});
        toast(creating?'Brand created and published':'Brand updated');
        modal.classList.remove('open');loadBrands();
      }catch(e){toast('Brand save failed: '+e.message)}
    };
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
          <h4>${esc(t.name)} <span class="box-badge">${esc(t.channel)}</span> <small>Version ${Number(t.version||1)}</small> ${t.is_active?'':'<span class="box-badge hidden">Disabled</span>'}</h4>
          ${t.subject?`<div style="margin:6px 0"><label style="font-size:12px">Subject:</label><input data-tpl-subject="${t.id}" value="${esc(t.subject)}" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:6px"></div>`:''}
          <div style="margin:6px 0"><label style="font-size:12px">Body:</label><textarea data-tpl-body="${t.id}" rows="4" style="width:100%;padding:6px;border:1px solid var(--border);border-radius:6px;font-family:inherit">${esc(t.body)}</textarea></div>
          <div style="font-size:11px;color:var(--muted)">Variables: ${(t.variables||[]).map(v=>`{{${v}}}`).join(', ')}</div>
          <div class="box-actions" style="margin-top:8px">
            <button class="btn secondary compact" data-preview-tpl="${t.id}">Preview</button><button class="btn primary compact" data-save-tpl="${t.id}">💾 Save</button>
            <button class="btn secondary compact" data-toggle-tpl="${t.id}">${t.is_active?'Disable':'Enable'}</button>
          </div>
        </div>`).join('');
      el.querySelectorAll('[data-preview-tpl]').forEach(b=>b.onclick=async()=>{
        const id=Number(b.dataset.previewTpl);
        try{
          const subject=el.querySelector('[data-tpl-subject="'+id+'"]')?.value;
          const body=el.querySelector('[data-tpl-body="'+id+'"]').value;
          const result=await api('/api/admin/notification-templates/preview',{method:'POST',body:{id,subject,body}});
          let preview=b.closest('.existing-box-card').querySelector('.template-preview');
          if(!preview){preview=document.createElement('pre');preview.className='template-preview';preview.style.whiteSpace='pre-wrap';b.closest('.existing-box-card').appendChild(preview);}
          preview.textContent=(result.preview.subject||'')+'\n'+result.preview.text+'\nPreview only; nothing sent.';
        }catch(e){toast(e.message);}
      });
      el.querySelectorAll('[data-save-tpl]').forEach(b=>b.onclick=async()=>{
        const id=b.dataset.saveTpl;
        const subject=document.querySelector(`[data-tpl-subject="${id}"]`)?.value;
        const body=document.querySelector(`[data-tpl-body="${id}"]`).value;
        await api(`/api/admin/notification-templates/${id}`,{method:'PATCH',body:{subject,body,expected_updated_at:templates.find(t=>String(t.id)===String(id)).updated_at}});
        toast('Template saved'); loadTemplates();
      });
      el.querySelectorAll('[data-toggle-tpl]').forEach(b=>b.onclick=async()=>{
        const id=b.dataset.toggleTpl;
        const t=templates.find(x=>String(x.id)===String(id));
        await api(`/api/admin/notification-templates/${id}`,{method:'PATCH',body:{is_active:!t.is_active,expected_updated_at:t.updated_at}});
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
        b.disabled=true;
        try{
          const [id,status]=b.dataset.resStatus.split('|');
          if(status==='rejected'&&!confirm('Reject the case without issuing a refund?'))return;
          await api('/api/admin/resolutions/'+encodeURIComponent(id),{method:'PATCH',body:{status}});
          toast('Case updated');await loadResolutions();
        }catch(e){toast('Update failed: '+e.message);}finally{b.disabled=false;}
      });
      el.querySelectorAll('[data-res-resolve]').forEach(b=>b.onclick=()=>openAdminOperation(
        'resolve','/api/admin/resolutions/'+encodeURIComponent(b.dataset.resResolve),'PATCH',{refund_amount:0},loadResolutions));
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
  // Isolated iframe preview: never styles the authenticated admin chrome or writes to the CMS.
  async function previewTheme(){
    let t;
    try{t=(await import('/theme-contract.js?v=6')).validateTheme(collectTheme());}
    catch(e){toast('Theme preview validation failed: '+e.message);return;}
    const view=$('#view-theme');
    if(!view)return;
    let host=$('#themeStorefrontPreview');
    if(!host){
      host=document.createElement('section');
      host.id='themeStorefrontPreview';
      host.className='panel admin-theme-preview';
      const heading=document.createElement('h2');heading.textContent='Unsaved storefront theme preview';
      const note=document.createElement('p');note.textContent='This preview is local to this browser tab. No theme, product or payment change is saved.';
      const bar=document.createElement('div');bar.className='admin-theme-preview-actions';
      const route=document.createElement('select');route.id='themePreviewRoute';route.setAttribute('aria-label','Preview storefront page');
      for(const [value,name] of [['/','Homepage'],['/shop/','Shop'],['/bundles/','Chaska Boxes']]){
        const option=document.createElement('option');option.value=value;option.textContent=name;route.append(option);
      }
      const size=document.createElement('select');size.id='themePreviewSize';size.setAttribute('aria-label','Preview width');
      for(const [value,name] of [['100%','Desktop'],['768px','Tablet'],['390px','Mobile']]){
        const option=document.createElement('option');option.value=value;option.textContent=name;size.append(option);
      }
      const reset=document.createElement('button');reset.type='button';reset.className='btn secondary';reset.textContent='Close unsaved preview';
      reset.onclick=()=>host.remove();
      const status=document.createElement('p');status.id='themePreviewStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
      const frame=document.createElement('iframe');frame.id='themePreviewFrame';frame.title='Unsaved storefront theme preview';frame.loading='lazy';
      const wrap=document.createElement('div');wrap.className='admin-theme-frame';wrap.append(frame);
      bar.append(route,size,reset);host.append(heading,note,bar,status,wrap);view.append(host);
      route.onchange=()=>{frame.src=route.value;};
      size.onchange=()=>{frame.style.width=size.value;};
    }
    const frame=host.querySelector('#themePreviewFrame');
    const status=host.querySelector('#themePreviewStatus');
    const css=`:root{--primary:${t.primary_color};--navy:${t.primary_color};--gold:${t.accent_color};--accent:${t.accent_color};--bg:${t.background_color};--text:${t.text_color};--ink:${t.text_color};--radius:${t.border_radius}px}body{font-family:${t.font_family}}`;
    const apply=()=>{
      try{
        const doc=frame.contentDocument;
        if(!doc||!doc.head)throw Error('Frame unavailable');
        let style=doc.getElementById('adminThemePreviewStyle');
        if(!style){style=doc.createElement('style');style.id='adminThemePreviewStyle';doc.head.append(style);}
        style.textContent=css;
        status.textContent='Unsaved design preview applied. Review desktop and mobile before saving separately.';
      }catch(error){status.textContent='Preview unavailable in this browser: '+error.message+'. No changes were saved.';}
    };
    frame.onload=apply;
    const src=host.querySelector('#themePreviewRoute').value;
    if(new URL(frame.src||'about:blank',location.origin).pathname!==src)frame.src=src;
    else apply();
    host.scrollIntoView({block:'start',behavior:'auto'});
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
            <button class="btn secondary compact" data-edit-coupon="${c.id}">Edit</button>
            <button class="btn secondary compact" data-toggle-coupon="${c.id}">${c.is_active?'Disable':'Enable'}</button>
            ${roleAllows("owner")?`<button class="btn danger compact" data-del-coupon="${c.id}">Delete</button>`:""}
          </div>
        </div>`).join('');
      el.querySelectorAll('[data-edit-coupon]').forEach(b=>b.onclick=()=>{
        const c=coupons.find(c=>String(c.id)===b.dataset.editCoupon);
        if(c)openAdminOperation('coupon','/api/admin/coupons/'+encodeURIComponent(c.id),'PATCH',c,loadCoupons);
      });
      el.querySelectorAll('[data-toggle-coupon]').forEach(b=>b.onclick=async()=>{
        b.disabled=true;
        try{
          const c=coupons.find(c=>String(c.id)===b.dataset.toggleCoupon);
          if(!c)throw new Error('Coupon not found');
          await api('/api/admin/coupons/'+encodeURIComponent(c.id),{method:'PATCH',body:{is_active:!c.is_active}});
          toast('Coupon updated');await loadCoupons();
        }catch(e){toast('Coupon update failed: '+e.message);}finally{b.disabled=false;}
      });
      el.querySelectorAll('[data-del-coupon]').forEach(b=>b.onclick=async()=>{
        if(!roleAllows('owner'))return toast('Only Owners can delete coupons');
        if(!confirm('Permanently delete coupon? Historical orders remain unchanged.'))return;
        b.disabled=true;
        try{await api('/api/admin/coupons/'+encodeURIComponent(b.dataset.delCoupon),{method:'DELETE'});toast('Coupon deleted');await loadCoupons();}
        catch(e){toast('Coupon delete failed: '+e.message);}finally{b.disabled=false;}
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
      if(!zones.length){el.innerHTML='<p class="muted">No city-specific zones. Nationwide charges are managed in Store Settings.</p>';return;}
      el.innerHTML='<p class="safe-note">City-specific overrides only. Nationwide COD, prepaid fees and free-delivery threshold are controlled in Store Settings; empty-city legacy zones are ignored by checkout.</p>'+zones.map(z=>`
        <div class="existing-box-card" style="margin-bottom:10px">
          <h4>${esc(z.name)} <span class="box-badge ${z.is_active?'visible':'hidden'}">${z.is_active?'Active':'Disabled'}</span></h4>
          <div class="box-meta">
            <span>Fee: Rs.${z.fee}</span><span>·</span>
            ${z.free_above?`<span>Free above Rs.${z.free_above}</span><span>·</span>`:''}
            <span>${(z.cities||[]).length?esc(z.cities.join(', ')):'Legacy catch-all (ignored by checkout)'}</span>
          </div><div class="box-actions"><button class="btn secondary compact" data-edit-zone="${z.id}">Edit</button><button class="btn secondary compact" data-toggle-zone="${z.id}" ${(z.cities||[]).length?'':'disabled title="Add specific cities before enabling this zone"'}>${z.is_active?'Disable':'Enable'}</button><button class="btn danger compact" data-delete-zone="${z.id}">Delete</button></div>
        </div>`).join('');
      el.querySelectorAll('[data-toggle-zone]').forEach(b=>b.onclick=async()=>{try{const z=zones.find(x=>String(x.id)===b.dataset.toggleZone);await api('/api/admin/shipping-zones/'+z.id,{method:'PATCH',body:{is_active:!z.is_active}});await loadShipping();}catch(e){toast(e.message)}});
      el.querySelectorAll('[data-delete-zone]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this shipping zone?'))return;try{await api('/api/admin/shipping-zones/'+b.dataset.deleteZone,{method:'DELETE'});await loadShipping();}catch(e){toast(e.message)}});
      el.querySelectorAll('[data-edit-zone]').forEach(b=>b.onclick=()=>{const z=zones.find(x=>String(x.id)===b.dataset.editZone);if(z)openAdminOperation('zone','/api/admin/shipping-zones/'+encodeURIComponent(z.id),'PATCH',z,loadShipping);});
    }catch(e){el.innerHTML=`<p class="muted">Failed: ${esc(e.message)}</p>`;}
  }

  /* ============ ANALYTICS ============ */
  const ANALYTICS_RANGES=[
    {id:'today',label:'Today'},{id:'yesterday',label:'Yesterday'},{id:'7d',label:'Last 7 days'},
    {id:'30d',label:'Last 30 days'},{id:'month',label:'This month'},{id:'prevmonth',label:'Previous month'},{id:'custom',label:'Custom'}];
  let analyticsRange='30d', analyticsCustomFrom='', analyticsCustomTo='';
  function analyticsDates(){
    const f=d=>d.toISOString().slice(0,10);
    const now=new Date(); const t=new Date(now); const y=new Date(now); y.setDate(y.getDate()-1);
    switch(analyticsRange){
      case 'today': return {from:f(t),to:f(t)};
      case 'yesterday': return {from:f(y),to:f(y)};
      case '7d': {const s=new Date();s.setDate(s.getDate()-6);return {from:f(s),to:f(t)};}
      case '30d': {const s=new Date();s.setDate(s.getDate()-29);return {from:f(s),to:f(t)};}
      case 'month': return {from:f(new Date(now.getFullYear(),now.getMonth(),1)),to:f(t)};
      case 'prevmonth': {const s=new Date(now.getFullYear(),now.getMonth()-1,1);const e=new Date(now.getFullYear(),now.getMonth(),0);return {from:f(s),to:f(e)};}
      case 'custom': return {from:analyticsCustomFrom,to:analyticsCustomTo};
      default: {const s=new Date();s.setDate(s.getDate()-29);return {from:f(s),to:f(t)};}
    }
  }
  async function loadAnalytics(){
    const el=$('#analyticsContent'); if(!el) return;
    const {from,to}=analyticsDates();
    el.innerHTML='<div class="admin-loading"><div class="spinner"></div><p>Loading analytics…</p></div>';
    const q=`?from=${from}&to=${to}`;
    try{
      const [rev, over, attn] = await Promise.all([
        api('/api/admin/analytics/revenue'+q).catch(e=>({ok:false,error:e.message})),
        api('/api/admin/analytics/overview'+q).catch(e=>({ok:false,error:e.message})),
        api('/api/admin/analytics/attention'+q).catch(e=>({ok:false,error:e.message})),
      ]);
      const tip=t=>`<span title="${esc(t)}" style="cursor:help;border-bottom:1px dotted">ⓘ</span>`;
      const card=(label,val,def)=>`<div class="existing-box-card"><h4>${label} ${def?tip(def):''}</h4><div style="font-size:22px;font-weight:800;color:var(--navy)">${val}</div></div>`;
      const R=(rev.ok&&rev.data)||{};
      const O=(over.ok&&over.data?.cards)||{};
      const defs=(R.definitions)||{};
      el.innerHTML=`
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center">
          ${ANALYTICS_RANGES.map(r=>`<button class="btn ${analyticsRange===r.id?'primary':'secondary'} compact" data-arange="${r.id}">${r.label}</button>`).join('')}
          ${analyticsRange==='custom'?`<input type="date" id="aFrom" value="${analyticsCustomFrom}" style="padding:8px;border:1px solid var(--border);border-radius:8px"><input type="date" id="aTo" value="${analyticsCustomTo}" style="padding:8px;border:1px solid var(--border);border-radius:8px"><button class="btn primary compact" id="aApply">Apply</button>`:''}
        </div>
        ${!rev.ok?`<p class="muted">Revenue: ${esc(rev.error||'unavailable')}${(rev.error||'').includes('not installed')?' — run migration 031 in Supabase SQL Editor.':''}</p>`:`
        <h3>Revenue</h3>
        <div class="metric-grid" style="margin-bottom:16px">
          ${card('Gross Order Value',money(R.gross_order_value||0),defs.gross_order_value)}
          ${card('Recognized Revenue',money(R.recognized_revenue||0),defs.recognized_revenue)}
          ${card('Pending COD',money(R.pending_cod||0),defs.pending_cod)}
          ${card('Confirmed Prepaid',money(R.confirmed_prepaid||0),defs.confirmed_prepaid)}
        </div>`}
        ${!over.ok?`<p class="muted">Overview: ${esc(over.error||'unavailable')}</p>`:`
        <h3>Overview</h3>
        <div class="metric-grid" style="margin-bottom:16px">
          ${card('Orders',O.orders||0)}${card('Avg Order Value',money(O.average_order_value||0))}
          ${card('New Customers',O.new_customers||0)}${card('Repeat Customers',O.repeat_customers||0)}
          ${card('Cancellation Rate',Number(O.cancellation_rate||0).toFixed(1)+'%')}
          ${card('Delivered COD',money(O.delivered_cod||0),defs.delivered_cod)}
        </div>`}
        <div class="admin-grid two" style="margin-bottom:16px">
          <div class="existing-box-card"><h4>⚠️ Needs Attention</h4><div id="attnList"><p class="muted">Loading…</p></div></div>
          <div class="existing-box-card"><h4>✨ Ask Chaska AI</h4>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
              <button class="btn secondary compact" data-aiq="Why did sales change this week?">Sales change?</button>
              <button class="btn secondary compact" data-aiq="Which products are underperforming?">Underperformers?</button>
              <button class="btn secondary compact" data-aiq="What needs my attention today?">Attention?</button>
            </div>
            <div id="aiInsightOut" class="ai-output" style="min-height:80px"><span class="muted">Pick a question or type below.</span></div>
            <div style="display:flex;gap:6px;margin-top:8px"><input id="aiInsightQ" placeholder="Ask about your data…" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:8px"><button class="btn primary compact" id="aiInsightAsk">Ask</button></div>
          </div>
        </div>
        <div id="analyticsTabs" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
          ${['products','categories','brands','customers','search','funnel','notifications','shipping','issues','geography','coupons','refunds','boxes','boxevents','filters','wishlist'].map(t=>`<button class="btn secondary compact" data-atab="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}
        </div>
        <div id="analyticsTabContent"><p class="muted">Pick a tab above.</p></div>
        <h3 style="margin:24px 0 8px">🔍 SEO Health</h3><div id="seoHealth"><p class="muted">Checking…</p></div>`;
      el.querySelectorAll('[data-arange]').forEach(b=>b.onclick=()=>{analyticsRange=b.dataset.arange;loadAnalytics();});
      const ap=el.querySelector('#aApply'); if(ap) ap.onclick=()=>{analyticsCustomFrom=el.querySelector('#aFrom').value;analyticsCustomTo=el.querySelector('#aTo').value;loadAnalytics();};
      // Attention
      const attnEl=el.querySelector('#attnList');
      if(!attn.ok||!Array.isArray(attn.data?.items)){attnEl.innerHTML='<p role="alert">Attention status unavailable. Refresh to retry.</p>';}else if(attn.data.items.length){
        attnEl.innerHTML=attn.data.items.slice(0,8).map(i=>`<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:12px"><b>${esc(i.title)}</b><br><span class="muted">${esc(i.detail||'')}</span></div>`).join('');
      } else attnEl.innerHTML='<p class="muted">All clear — no issues detected. ✅</p>';
      // AI insights
      const askAI=async(q)=>{
        const out=el.querySelector('#aiInsightOut'); out.innerHTML='<span class="muted">Thinking…</span>';
        try{const r=await api('/api/admin/ai',{method:'POST',body:{task:'analytics_insight',context:{question:q,range:{from,to}}}});
          out.textContent=r.draft||'No insight returned.';}catch(e){out.textContent='Error: '+e.message}};
      el.querySelectorAll('[data-aiq]').forEach(b=>b.onclick=()=>askAI(b.dataset.aiq));
      el.querySelector('#aiInsightAsk').onclick=()=>{const q=el.querySelector('#aiInsightQ').value.trim();if(q)askAI(q);};
      // Tabs
      el.querySelectorAll('[data-atab]').forEach(b=>b.onclick=async()=>{
        const t=b.dataset.atab; const c=el.querySelector('#analyticsTabContent');
        c.innerHTML='<p class="muted">Loading…</p>';
        try{const r=await api(`/api/admin/analytics/${t}${q}`);
          if(!r.ok||r.available===false){c.innerHTML=`<p class="muted">${esc(r.reason||'No data available yet.')}</p>`;return;}
          c.innerHTML=renderAnalyticsTable(t,r.data);
        }catch(e){c.innerHTML=`<p class="muted">Failed: ${esc(e.message)}</p>`;}
      });
    }catch(e){el.innerHTML=`<p class="muted">Failed: ${esc(e.message)}</p>`;}
    try{ await checkSeoHealth(); }catch(e){}
  }
  function renderAnalyticsTable(type,data){
    if(type==='notifications'){
      const rows=['owner_outbox','customer_outbox'].map(key=>`<tr><td>${key==='owner_outbox'?'Owner alerts':'Customer updates'}</td>${['pending','retry','accepted','blocked','uncertain','dead'].map(status=>`<td>${Number(data[key]?.[status]||0)}</td>`).join('')}</tr>`).join('');
      const p=data.provider_results||{};
      return `<div class="live-table-wrap"><table class="live-table"><tr><th>Queue</th><th>Pending</th><th>Retry</th><th>Accepted</th><th>Blocked</th><th>Uncertain</th><th>Dead</th></tr>${rows}</table></div><p>${p.delivered||0} confirmed delivered · ${p.delivery_failed||0} delivery failed · ${p.complaints||0} complaints · ${p.unconfirmed||0} awaiting confirmation</p><p class="muted">${esc(data.note||'Delivered requires a verified provider receipt.')}</p>`;
    }
    // Types with custom data shape (not rows/items)
    if(type==='search'){const d=data;return `<div class="metric-grid" style="margin-bottom:12px"><div class="existing-box-card"><h4>Total searches</h4><div style="font-size:22px;font-weight:800">${d.total_searches||0}</div></div><div class="existing-box-card"><h4>No-result rate</h4><div style="font-size:22px;font-weight:800">${((d.no_result_rate||0)*100).toFixed(1)}%</div></div><div class="existing-box-card"><h4>Click-through</h4><div style="font-size:22px;font-weight:800">${((d.click_through_rate||0)*100).toFixed(1)}%</div><small>${d.total_clicks||0} clicks</small></div></div><h4>Top queries</h4><div class="live-table-wrap"><table class="live-table"><tr><th>Query</th><th>Count</th><th>No-result</th><th>Clicks</th></tr>${(d.top_queries||[]).map(q=>`<tr><td>${esc(q.query)}</td><td>${q.count}</td><td>${q.noResult||0}</td><td>${q.clicks||0}</td></tr>`).join('')}</table></div>`;}
    if(type==='funnel'){const steps=data.steps||[];return `<div style="display:grid;gap:8px">${steps.map((s,i)=>{const pct=s.count&&steps[0].count?Math.round(s.count/steps[0].count*100):0;return `<div><div style="display:flex;justify-content:space-between;font-size:12px"><span><b>${i+1}. ${esc(s.label)}</b></span><span>${s.count.toLocaleString()} (${pct}%)${i>0?` · drop-off ${Number(s.dropoff??Math.max(0,steps[i-1].count-s.count)).toLocaleString()}`:''}</span></div><div style="background:#f1f5f9;border-radius:6px;height:12px;margin-top:4px"><div style="width:${pct}%;background:#3b82f6;height:12px;border-radius:6px"></div></div></div>`}).join('')}</div><p class="muted" style="font-size:11px;margin-top:8px">${esc(data.note||'')}</p>`;}
    if(type==='filters'){if(!data.total_uses)return '<p class="muted">No filter usage tracked yet. Tracking starts from now — data will appear as customers use filters.</p>';return `<div class="metric-grid" style="margin-bottom:12px"><div class="existing-box-card"><h4>Total filter uses</h4><div style="font-size:22px;font-weight:800">${data.total_uses||0}</div></div></div><h4>By type</h4><div class="live-table-wrap"><table class="live-table"><tr><th>Filter</th><th>Uses</th></tr>${(data.by_type||[]).map(f=>`<tr><td><b>${esc(f.type)}</b></td><td>${f.uses}</td></tr>`).join('')}</table></div><h4 style="margin-top:12px">Top values</h4><div class="live-table-wrap"><table class="live-table"><tr><th>Type</th><th>Value</th><th>Uses</th></tr>${(data.by_value||[]).slice(0,15).map(f=>`<tr><td>${esc(f.type)}</td><td>${esc(f.value||'—')}</td><td>${f.uses}</td></tr>`).join('')}</table></div>`;}
    if(type==='wishlist'){if(!data.total_adds&&!data.to_cart)return '<p class="muted">No wishlist activity tracked yet. Tracking starts from now — data will appear as customers use wishlist.</p>';const conv=data.total_adds?Math.round((data.to_cart||0)/data.total_adds*100):0;return `<div class="metric-grid" style="margin-bottom:12px"><div class="existing-box-card"><h4>Total adds</h4><div style="font-size:22px;font-weight:800">${data.total_adds||0}</div></div><div class="existing-box-card"><h4>Removes</h4><div style="font-size:22px;font-weight:800">${data.total_removes||0}</div></div><div class="existing-box-card"><h4>Wishlist → Cart</h4><div style="font-size:22px;font-weight:800">${data.to_cart||0}</div><small>${conv}% conversion</small></div></div><h4>Most wishlisted</h4><div class="live-table-wrap"><table class="live-table"><tr><th>Product ID</th><th>Adds</th></tr>${(data.top_products||[]).map(p=>`<tr><td><b>${p.product_id}</b></td><td>${p.adds}</td></tr>`).join('')}</table></div>`;}
    if(type==='boxevents'){const d=data;if(!d.total_views&&!d.total_adds)return '<p class="muted">No box view/add-to-cart tracked yet. Tracking starts from now.</p>';const conv2=d.total_views?Math.round((d.total_adds||0)/d.total_views*100):0;return `<div class="metric-grid" style="margin-bottom:12px"><div class="existing-box-card"><h4>Box page views</h4><div style="font-size:22px;font-weight:800">${d.total_views||0}</div></div><div class="existing-box-card"><h4>Box add-to-cart</h4><div style="font-size:22px;font-weight:800">${d.total_adds||0}</div><small>${conv2}% conversion</small></div></div><h4>Per box</h4><div class="live-table-wrap"><table class="live-table"><tr><th>Box</th><th>Views</th><th>Adds</th></tr>${(d.by_box||[]).map(b=>`<tr><td><b>${esc(b.box_name||'—')}</b></td><td>${b.views||0}</td><td>${b.adds||0}</td></tr>`).join('')}</table></div>`;}
    if(type==='shipping'){const d=data;if(!d.orders_in_range)return `<p class="muted">${esc(d.note||'No fulfillment data for this range.')}</p>`;const h=v=>v==null?'—':Number(v).toFixed(1)+'h';return `<div class="metric-grid" style="margin-bottom:12px"><div class="existing-box-card"><h4>Order → Packed</h4><div style="font-size:22px;font-weight:800">${h(d.avg_hours_order_to_packed)}</div><small>${d.orders_reaching_packed||0} orders</small></div><div class="existing-box-card"><h4>Packed → Dispatched</h4><div style="font-size:22px;font-weight:800">${h(d.avg_hours_packed_to_dispatched)}</div><small>${d.orders_reaching_dispatched||0} orders</small></div><div class="existing-box-card"><h4>Dispatched → Delivered</h4><div style="font-size:22px;font-weight:800">${h(d.avg_hours_dispatched_to_delivered)}</div><small>${d.orders_reaching_delivered||0} orders</small></div><div class="existing-box-card"><h4>Total fulfillment</h4><div style="font-size:22px;font-weight:800">${h(d.avg_hours_total_fulfillment)}</div><small>${d.orders_in_range||0} orders in range</small></div></div><p class="muted" style="font-size:11px">${esc(d.note||'')}</p>`;}
    const rows=Array.isArray(data)?data:(data.rows||data.items||data[type]||data.top_customers||[]);
    if(['products','categories','brands','customers'].includes(type)&&!rows.length)return '<p class="muted">No data for this range.</p>';
    if(type==='products') return `<div class="live-table-wrap"><table class="live-table"><tr><th>Product</th><th>Units</th><th>Orders</th><th>Gross</th><th>Recognized</th><th>Trend</th></tr>${rows.slice(0,25).map(p=>{const pid=p.id||p.product_id;return `<tr><td><a href="/product/${pid}/" target="_blank" style="color:inherit;text-decoration:underline">${esc(p.name||p.product_name)}</a><small>${esc(pid||'')}</small></td><td>${p.units||0}</td><td>${p.orders||p.order_count||0}</td><td>${money(p.gross||p.gross_value)}</td><td>${money(p.recognized||p.recognized_revenue)}</td><td>${p.trend>0?'📈':p.trend<0?'📉':'➖'}</td></tr>`}).join('')}</table></div>`;
    if(type==='categories') return `<div class="live-table-wrap"><table class="live-table"><tr><th>Name</th><th>Orders</th><th>Units</th><th>Revenue</th><th>AOV</th></tr>${rows.slice(0,25).map(r=>`<tr><td>${esc(r.name||r.category||r.brand)}</td><td>${r.orders||0}</td><td>${r.units||0}</td><td>${money(r.revenue||r.gross_value)}</td><td>${money(r.aov)}</td></tr>`).join('')}</table></div>`;
    if(type==='brands') return `<div class="live-table-wrap"><table class="live-table"><tr><th>Brand</th><th>Orders</th><th>Units</th><th>Revenue</th><th>AOV</th><th>Links</th></tr>${rows.slice(0,25).map(r=>{const slug=(r.slug||r.name||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');return `<tr><td><b>${esc(r.name||r.brand||r.category)}</b></td><td>${r.orders||0}</td><td>${r.units||0}</td><td>${money(r.revenue||r.gross_value)}</td><td>${money(r.aov)}</td><td style="white-space:nowrap"><a href="/brand/${encodeURIComponent(slug)}/" target="_blank" title="View storefront page" style="text-decoration:none">🔗 Store</a> · <a href="#" onclick="document.querySelector('[data-view=brands]')?.click();return false;" title="Open brand editor" style="text-decoration:none">✏️ Edit</a></td></tr>`}).join('')}</table></div>`;
    if(type==='customers') return `<div class="live-table-wrap"><table class="live-table"><tr><th>Customer</th><th>Orders</th><th>Recognized Spend</th><th>Last Order</th></tr>${rows.slice(0,25).map(r=>`<tr><td>${esc(r.name||'—')}<small>${esc(r.phone||'')}</small></td><td>${r.orders||0}</td><td>${money(r.spend||r.recognized_spend)}</td><td>${esc(r.last_order||r.last_purchase||'—')}</td></tr>`).join('')}</table></div>`;
    if(type==='geography'){const cities=Array.isArray(data)?data:(data.rows||[]);if(!cities.length)return '<p class="muted">No city data for this range.</p>';return `<div class="live-table-wrap"><table class="live-table"><tr><th>City</th><th>Orders</th><th>Revenue</th><th>Cancelled</th><th>Cancel Rate</th></tr>${cities.slice(0,25).map(c=>`<tr><td><b>${esc(c.city)}</b></td><td>${c.orders||0}</td><td>${money(c.revenue)}</td><td>${c.cancelled||0}</td><td>${c.cancellation_rate||0}%</td></tr>`).join('')}</table></div>`;}
    if(type==='coupons'){if(data.available===false)return `<p class="muted">${esc(data.reason||'No coupon data.')}</p>`;const cs=data.coupons||[];if(!cs.length)return '<p class="muted">No coupon usage for this range.</p>';return `<div class="live-table-wrap"><table class="live-table"><tr><th>Code</th><th>Uses</th><th>Discount</th></tr>${cs.map(c=>`<tr><td><b>${esc(c.code)}</b></td><td>${c.uses||0}</td><td>${money(c.discount)}</td></tr>`).join('')}</table></div>`;}
    if(type==='refunds'){if(data.available===false)return `<p class="muted">${esc(data.reason||'No refund data.')}</p>`;return `<div class="metric-grid" style="margin-bottom:12px"><div class="existing-box-card"><h4>Total cases</h4><div style="font-size:22px;font-weight:800">${data.total_cases||0}</div></div><div class="existing-box-card"><h4>Open</h4><div style="font-size:22px;font-weight:800">${data.open_cases||0}</div></div><div class="existing-box-card"><h4>Total refund</h4><div style="font-size:22px;font-weight:800">${money(data.total_refund)}</div></div></div>`;}
    if(type==='boxes'){const bx=Array.isArray(data)?data:(data.rows||[]);if(!bx.length)return '<p class="muted">No box data for this range.</p>';return `<div class="live-table-wrap"><table class="live-table"><tr><th>Box</th><th>Orders</th><th>Units</th><th>Revenue</th></tr>${bx.map(b=>`<tr><td><b>${esc(b.box_name)}</b></td><td>${b.orders||0}</td><td>${b.units||0}</td><td>${money(b.revenue)}</td></tr>`).join('')}</table></div>`;}
    return `<pre class="muted" style="font-size:11px;max-height:300px;overflow:auto">${esc(JSON.stringify(rows.slice(0,10),null,1))}</pre>`;
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
      check('robots.txt','/robots.txt',t=>t.includes('/api/product-sitemap')),
      check('Main sitemap','/sitemap.xml',t=>(t.match(/<url>/g)||[]).length>=10),
      check('Product sitemap (dynamic)','/api/product-sitemap',t=>t.includes('<urlset')&&t.includes('chaskabox.online/product/')),
    ]);
    el.innerHTML='<div style="display:grid;gap:8px">'+checks.map(c=>
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid var(--border);border-radius:8px">'
      +'<span>'+(c.ok?'\u2705':'\u274c')+' '+c.name+'</span><small class="muted">'+c.detail+'</small></div>'
    ).join('')+'</div><p class="muted" style="font-size:11px;margin-top:8px">Product URLs are rendered from the live catalogue with one Product schema, one Breadcrumb schema and a canonical URL. Legacy ?id= URLs redirect to these pages.</p>';
  }

  /* ============ BACKUP ============ */
  function initBackup(){
    const button=$('#downloadBackupBtn');
    button?.addEventListener('click', async ()=>{
      if(button.disabled)return;
      const label=button.textContent;
      button.disabled=true;button.textContent='Preparing snapshot…';
      let objectUrl;
      try{
        const snapshot=await api('/api/admin/backup');
        const tables=snapshot?.tables, counts=snapshot?.manifest?.row_counts;
        if(snapshot?.version!==2 || snapshot.kind!=='catalogue_configuration' || snapshot.scope?.full_database_backup!==false || snapshot.scope?.complete_catalogue_scope!==true || snapshot.consistency?.exact_counts_verified!==true || !tables || !counts || !Object.keys(tables).length || Object.keys(counts).length!==Object.keys(tables).length || Object.entries(tables).some(([name,rows])=>!Array.isArray(rows)||!Number.isSafeInteger(counts[name])||counts[name]!==rows.length)){
          throw new Error('Snapshot validation failed. No file downloaded.');
        }
        const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'});
        const a = document.createElement('a');
        objectUrl=URL.createObjectURL(blob);a.href=objectUrl;
        a.download = `chaskabox-catalogue-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        toast('Catalogue snapshot downloaded. Orders and photo files are excluded.');
      }catch(e){toast(e.message || 'Snapshot failed.');}
      finally{
        if(objectUrl)setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
        button.disabled=false;button.textContent=label;
      }
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
      list.querySelectorAll('[data-revert-version]').forEach(b=>{b.disabled=!roleAllows('owner','manager')||!!versions.find(v=>String(v.id)===b.dataset.revertVersion)?.reverted_at;b.onclick=async()=>{
        if(!confirm('Revert to this version? Current state will be saved as a new version.')) return;
        try{await api(`/api/admin/product-versions`,{method:'POST',body:{product_id:Number(productId),version_id:Number(b.dataset.revertVersion),confirm:true,expected_updated_at:d.expected_updated_at}});
        toast('Reverted'); loadProducts(); panel.style.display='none';}catch(e){toast(e.message);}
      };});
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
    const originalValue=realValue==null?input.value:String(realValue);
    input.dataset.realValue=originalValue;
    input.value=maskValue(originalValue);
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
    input.getRealValue=()=>revealed?input.value:input.dataset.realValue;
  }

  /* ============ AI IMAGE STUDIO ============ */
  let lastGeneratedImage=null,lastGeneratedMime='image/jpeg';
  const STUDIO_PRESETS={chaskabox:'Colorful snack-inspired abstract shapes, studio lighting, decorative background, no logos or readable packaging',boxitem:'Festive abstract gift shapes, clean backdrop, decorative art, no brand labels',single:'Minimal colorful geometric snack-inspired illustration, no product packaging or logos'};
  function initImageStudio(){
    const view=$('#view-studio');if(view?.dataset.studioReady==='true')return;if(view)view.dataset.studioReady='true';
    document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{$('#studioPrompt').value=STUDIO_PRESETS[b.dataset.preset]||'';}));
    $('#generateImageBtn')?.addEventListener('click',async()=>{
      const prompt=$('#studioPrompt').value.trim(),button=$('#generateImageBtn'),label=button.textContent;
      if(prompt.length<10||prompt.length>500){toast('Prompt 10–500 characters ka hona chahiye');return;}
      button.disabled=true;button.textContent='Generating…';$('#studioActions').style.display='none';$('#studioPreview').textContent='Decorative draft ban raha hai…';lastGeneratedImage=null;
      try{
        const result=await api('/api/admin/ai-image',{method:'POST',body:{prompt,type:$('#studioType').value,style:$('#studioStyle').value}});
        lastGeneratedImage=result.image_url;lastGeneratedMime=result.mime;
        const img=document.createElement('img');img.src=result.image_url;img.alt='AI decorative draft';img.style.maxWidth='100%';img.style.borderRadius='8px';
        const note=document.createElement('p');note.className='muted';note.textContent=result.width+' × '+result.height+' · '+result.source+' · Draft only';
        $('#studioPreview').replaceChildren(img,note);$('#studioActions').style.display='flex';toast(result.warnings[0]);
      }catch(e){$('#studioPreview').textContent=e.message||'AI draft unavailable.';}
      finally{button.disabled=false;button.textContent=label;}
    });
    $('#downloadImageBtn')?.addEventListener('click',()=>{
      if(!lastGeneratedImage)return;
      const a=document.createElement('a');a.href=lastGeneratedImage;a.download='chaskabox-decoration-'+Date.now()+'.'+(lastGeneratedMime==='image/png'?'png':lastGeneratedMime==='image/webp'?'webp':'jpg');a.click();
    });
    $('#newVariationBtn')?.addEventListener('click',()=>$('#generateImageBtn').click());
  }

})();
