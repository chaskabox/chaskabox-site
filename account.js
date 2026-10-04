/* ChaskaBox — customer accounts (Supabase email OTP + Google) */
let ACCT = { user:null, orders:[], addresses:[], wishlist:[], tab:'orders', sbReady:false };
const LS_WISHLIST_KEY = 'chaskabox-wishlist';

/* ---------- init ---------- */
async function initAccount(){
  ACCT.sbReady = (typeof initSupabase === 'function') && initSupabase();
  // local wishlist cache (works even logged out)
  try{ ACCT.wishlist = JSON.parse(localStorage.getItem(LS_WISHLIST_KEY)||'[]'); }catch(e){ ACCT.wishlist=[]; }
  if(!ACCT.sbReady || !SB) { updateAcctBtn(); return; }
  const { data } = await SB.auth.getSession();
  if(data && data.session) await onSignedIn(data.session.user);
  SB.auth.onAuthStateChange(async (event, session)=>{
    if(session && session.user) await onSignedIn(session.user);
    else onSignedOut();
  });
  updateAcctBtn();
}
function acctConfigured(){ return ACCT.sbReady && !!SB; }

/* ---------- header button ---------- */
function toggleAccount(){
  if(!acctConfigured()){
    openAuthModal(true);
    return;
  }
  if(ACCT.user) showView('account');
  else openAuthModal();
}
function updateAcctBtn(){
  const btn = document.getElementById('acctBtn');
  if(!btn) return;
  if(ACCT.user){
    const initial = (ACCT.user.email||'?').trim().charAt(0).toUpperCase();
    btn.innerHTML = '<span class="acct-avatar">'+esc(initial)+'</span>';
    btn.classList.add('loggedin');
    btn.title = ACCT.user.email;
  }else{
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg>';
    btn.classList.remove('loggedin');
    btn.title = 'Account';
  }
}

/* ---------- auth modal ---------- */
let pendingEmail = '';
function openAuthModal(notConfigured){
  const m = $('#acctmodal');
  if(notConfigured){
    $('#abody').innerHTML =
      '<div class="amsg bot" style="text-align:center;padding:8px 0">'
      + '👤 <b>Customer accounts</b> jald aa rahe hain!<br><br>'
      + '<small style="opacity:.75">Setup pending hai — Rameez ko Supabase keys lagani hain (SUPABASE-SETUP.md dekhein).</small></div>';
  }else{
    renderEmailStep();
  }
  m.classList.add('open');
}
function closeAuthModal(){ $('#acctmodal').classList.remove('open'); }
function renderEmailStep(msg){
  $('#abody').innerHTML =
    '<h3 style="margin:0 0 4px">👋 Welcome to ChaskaBox</h3>'
    + '<p class="amut">Google se login karein — fast aur secure! 🔒</p>'
    + (msg ? '<div class="aerr">'+esc(msg)+'</div>' : '')
    + '<button class="abtn gbtn" onclick="googleLogin()"><span class="gg">G</span> Continue with Google</button>'
    + '<p class="amut sm">Login karke aapke orders, addresses aur wishlist save rahenge. 🔒</p>';
}
async function sendOTP(){
  const email = ($('#aemail').value||'').trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ renderEmailStep('Sahi email likhein, please.'); return; }
  const btn = document.querySelector('#abody .abtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Bhej rahe hain...'; }
  try{
    const { error } = await SB.auth.signInWithOtp({ email, options:{ shouldCreateUser:true } });
    if(error) throw error;
    pendingEmail = email;
    renderOTPStep();
  }catch(e){
    renderEmailStep('Error: ' + (e.message||'dobara try karein'));
  }
}
function renderOTPStep(msg){
  $('#abody').innerHTML =
    '<h3 style="margin:0 0 4px">✉️ Code check karein</h3>'
    + '<p class="amut"><b>'+esc(pendingEmail)+'</b> par 6-digit code bheja gaya hai.</p>'
    + (msg ? '<div class="aerr">'+esc(msg)+'</div>' : '')
    + '<label class="alab">6-digit code</label>'
    + '<input id="aotp" class="ainp otp" maxlength="6" inputmode="numeric" placeholder="••••••" autocomplete="one-time-code">'
    + '<button class="abtn" onclick="verifyOTP()">✅ Verify & Login</button>'
    + '<button class="alink" onclick="renderEmailStep()">← Email change karein</button> '
    + '<button class="alink" onclick="sendOTPResend()">Code dobara bhejein</button>';
  setTimeout(()=>{ const e=$('#aotp'); if(e) e.focus(); }, 50);
}
async function sendOTPResend(){
  try{ await SB.auth.signInWithOtp({ email:pendingEmail, options:{ shouldCreateUser:true } }); }
  catch(e){}
  renderOTPStep('Naya code bhej diya gaya hai! 📨');
}
async function verifyOTP(){
  const token = ($('#aotp').value||'').trim();
  if(token.length < 6){ renderOTPStep('Poora 6-digit code likhein.'); return; }
  try{
    const { data, error } = await SB.auth.verifyOtp({ email:pendingEmail, token, type:'email' });
    if(error) throw error;
    await onSignedIn(data.user);
    closeAuthModal();
    showView('account');
  }catch(e){
    renderOTPStep('Ghalat ya expire code. Dobara try karein.');
  }
}
async function googleLogin(){
  try{
    const { error } = await SB.auth.signInWithOAuth({
      provider:'google',
      options:{ redirectTo: window.location.origin + window.location.pathname }
    });
    if(error) throw error;
  }catch(e){
    renderEmailStep('Google login error: ' + (e.message||'dobara try karein'));
  }
}
async function logout(){
  try{ if(SB) await SB.auth.signOut(); }catch(e){}
  onSignedOut();
  showView('home');
}

/* ---------- session ---------- */
async function onSignedIn(user){
  ACCT.user = user;
  updateAcctBtn();
  await syncWishlistOnLogin();
  await loadAccountData();
}
function onSignedOut(){
  ACCT.user = null; ACCT.orders = []; ACCT.addresses = [];
  updateAcctBtn();
  renderAccountView();
}
async function loadAccountData(){
  if(!ACCT.user || !SB) return;
  try{
    const uid = ACCT.user.id;
    const [o, a] = await Promise.all([
      SB.from('orders').select('*').eq('user_id', uid).order('created_at',{ascending:false}).limit(50),
      SB.from('addresses').select('*').eq('user_id', uid).order('is_default',{ascending:false})
    ]);
    if(!o.error) ACCT.orders = o.data || [];
    if(!a.error) ACCT.addresses = a.data || [];
  }catch(e){ console.warn('account data load failed', e); }
  renderAccountView();
}

/* ---------- wishlist ---------- */
function saveLocalWishlist(){ localStorage.setItem(LS_WISHLIST_KEY, JSON.stringify(ACCT.wishlist)); }
function isWished(id){ return ACCT.wishlist.indexOf(Number(id)) !== -1; }
async function toggleWishlist(id, el){
  id = Number(id);
  const i = ACCT.wishlist.indexOf(id);
  if(i >= 0) ACCT.wishlist.splice(i,1); else ACCT.wishlist.push(id);
  saveLocalWishlist();
  if(el) el.classList.toggle('on', i < 0);
  // sync to cloud when logged in
  if(ACCT.user && SB){
    try{
      if(i >= 0) await SB.from('wishlist').delete().eq('user_id', ACCT.user.id).eq('product_id', id);
      else await SB.from('wishlist').upsert({ user_id:ACCT.user.id, product_id:id }, { onConflict:'user_id,product_id' });
    }catch(e){ console.warn('wishlist sync failed', e); }
  }
  if($('#view-account') && $('#view-account').style.display !== 'none' && ACCT.tab === 'wishlist') renderAccountView();
}
async function syncWishlistOnLogin(){
  if(!ACCT.user || !SB) return;
  try{
    const { data } = await SB.from('wishlist').select('product_id').eq('user_id', ACCT.user.id);
    const cloud = (data||[]).map(r=>Number(r.product_id));
    // merge local + cloud
    const merged = [...new Set([...ACCT.wishlist, ...cloud])];
    ACCT.wishlist = merged; saveLocalWishlist();
    // push local-only ones to cloud
    const localOnly = merged.filter(id=>cloud.indexOf(id)===-1);
    for(const pid of localOnly){
      await SB.from('wishlist').upsert({ user_id:ACCT.user.id, product_id:pid }, { onConflict:'user_id,product_id' });
    }
  }catch(e){ console.warn('wishlist merge failed', e); }
}
function wishBtnHTML(p){
  return '<button class="wishbtn'+(isWished(p.id)?' on':'')+'" aria-label="Wishlist" onclick="event.stopPropagation();toggleWishlist('+p.id+',this)">♥</button>';
}

/* ---------- account dashboard view ---------- */
function setAcctTab(t){ ACCT.tab = t; renderAccountView(); }
function renderAccountView(){
  const box = $('#acctbody');
  if(!box) return;
  if(!ACCT.user){
    box.innerHTML = '<div class="empty">Login karke apne orders aur wishlist dekhein. 🔒<br><br><button class="abtn" onclick="openAuthModal()">Login / Sign up</button></div>';
    const nm = $('#acctName'); if(nm) nm.textContent = 'My Account';
    return;
  }
  const email = ACCT.user.email || '';
  const nm = $('#acctName'); if(nm) nm.textContent = email;
  const tabs = [['orders','📦 Orders'],['wishlist','♥ Wishlist'],['addresses','📍 Addresses'],['refer','🎁 Refer'],['profile','👤 Profile']];
  let h = '<div class="atabs">' + tabs.map(t=>'<button class="atab'+(ACCT.tab===t[0]?' on':'')+'" onclick="setAcctTab(\''+t[0]+'\')">'+t[1]+'</button>').join('') + '</div><div class="atabbody">';
  if(ACCT.tab === 'orders') h += acctOrdersHTML();
  else if(ACCT.tab === 'wishlist') h += acctWishlistHTML();
  else if(ACCT.tab === 'addresses') h += acctAddressesHTML();
  else if(ACCT.tab === 'refer') h += acctReferHTML();
  else h += acctProfileHTML();
  box.innerHTML = h + '</div>';
  if(ACCT.tab === 'profile') loadProfileIntoForm();
}
function acctOrdersHTML(){
  if(!ACCT.orders.length)
    return '<div class="empty">Abhi tak koi order nahi. 🛒<br><small>Checkout par login rahenge to orders yahan save honge.</small><br><br><button class="abtn" onclick="showView(\'shop\')">Shop Now</button></div>';
  return ACCT.orders.map(o=>{
    const items = Array.isArray(o.items) ? o.items : [];
    const names = items.slice(0,3).map(i=>esc(i.name||'')).join(', ') + (items.length>3 ? ' +' + (items.length-3) + ' more' : '');
    const d = o.created_at ? new Date(o.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '';
    const vchip = o.video_requested ? '<span class="vchip">🎬 Packing video</span>' : '';
    return '<div class="aord"><div class="aord-top"><b>#' + o.id + '</b><span class="astatus">'+orderStatusLabel(o.status)+'</span>'+vchip+'</div>'
      + '<div class="amut sm">'+esc(d)+' · '+esc(o.pay_method||'COD')+'</div>'
      + '<div class="aord-items">'+names+'</div>'
      + '<div class="aord-bot"><b>'+fmt(o.total||0)+'</b>'
      + (items.length ? ' <button class="alink" onclick="reorder('+o.id+')">🔁 Dobara mangwao</button>' : '')
      + '</div></div>';
  }).join('');
}
/* Order status → friendly label. Journey: 🕐 → ✅ → 📦 → 🎬 → 🚚 → 📬 */
function orderStatusLabel(s){
  const map = {
    'pending':   '🕐 Pending',
    'confirmed': '✅ Confirmed',
    'packed':    '📦 Packed',
    'video_sent':'🎬 Video sent',
    'shipped':   '🚚 Shipped',
    'delivered': '📬 Delivered',
    'cancelled': '❌ Cancelled'
  };
  const key = String(s||'pending').toLowerCase();
  return esc(map[key] || s || 'pending');
}
function reorder(orderId){
  const o = ACCT.orders.find(x=>x.id===orderId);
  if(!o || !Array.isArray(o.items)) return;
  o.items.forEach(i=>{ if(i.id) CART[i.id] = (CART[i.id]||0) + (Number(i.qty)||1); });
  saveCart(); openDrawer();
}
function acctWishlistHTML(){
  const prods = ACCT.wishlist.map(id=>PRODUCTS.find(p=>p.id==id)).filter(Boolean);
  if(!prods.length)
    return '<div class="empty">Wishlist khaali hai. ♥<br><small>Products par ♥ dabayein — yahan save rahenge.</small><br><br><button class="abtn" onclick="showView(\'shop\')">Discover Snacks</button></div>';
  return '<div class="grid agw">' + prods.map(p=>cardHTML(p)).join('') + '</div>';
}
function acctAddressesHTML(){
  let h = '<button class="abtn" onclick="addrForm()">+ Naya Address</button><div id="addrform"></div><div class="alist">';
  if(!ACCT.addresses.length) h += '<div class="empty sm">Koi saved address nahi. Checkout tez karne ke liye add karein. 📍</div>';
  h += ACCT.addresses.map(a=>
    '<div class="aaddr"><b>'+esc(a.label||'Home')+'</b>'+(a.is_default?' <span class="adef">DEFAULT</span>':'')+'<br>'
    + esc(a.full_name||'') + (a.phone?' · '+esc(a.phone):'') + '<br>'
    + esc(a.address||'') + (a.city?', '+esc(a.city):'') + '<br>'
    + '<button class="alink" onclick="addrForm('+a.id+')">Edit</button> '
    + '<button class="alink danger" onclick="addrDelete('+a.id+')">Delete</button>'
    + (a.is_default?'':' <button class="alink" onclick="addrDefault('+a.id+')">Set default</button>')
    + '</div>'
  ).join('') + '</div>';
  return h;
}
function addrForm(id){
  const a = id ? ACCT.addresses.find(x=>x.id===id) : null;
  $('#addrform').innerHTML =
    '<div class="aform"><h4>'+(a?'Edit':'Naya')+' Address</h4>'
    + '<div class="arow"><div><label class="alab">Label</label><select id="af_label" class="ainp"><option'+(a&&a.label==='Home'?' selected':'')+'>Home</option><option'+(a&&a.label==='Office'?' selected':'')+'>Office</option><option'+(a&&a.label==='Other'?' selected':'')+'>Other</option></select></div>'
    + '<div><label class="alab">Full name</label><input id="af_name" class="ainp" value="'+esc(a?a.full_name||'':'')+'"></div></div>'
    + '<div class="arow"><div><label class="alab">Phone</label><input id="af_phone" class="ainp" inputmode="tel" value="'+esc(a?a.phone||'':'')+'"></div>'
    + '<div><label class="alab">City</label><input id="af_city" class="ainp" value="'+esc(a?a.city||'':'')+'"></div></div>'
    + '<label class="alab">Full address</label><input id="af_addr" class="ainp" value="'+esc(a?(a.address||''):'')+'" placeholder="House, street, area">'
    + '<label class="alab" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="af_def"'+(a&&a.is_default?' checked':'')+'> Default address banayein</label>'
    + '<button class="abtn" onclick="addrSave('+(a?a.id:'null')+')">💾 Save Address</button> '
    + '<button class="alink" onclick="$(\'#addrform\').innerHTML=\'\'">Cancel</button></div>';
}
async function addrSave(id){
  if(!ACCT.user || !SB){ alert('Login required'); return; }
  const row = {
    user_id: ACCT.user.id,
    label: $('#af_label').value,
    full_name: $('#af_name').value.trim(),
    phone: $('#af_phone').value.trim(),
    city: $('#af_city').value.trim(),
    address: $('#af_addr').value.trim(),
    is_default: $('#af_def').checked
  };
  if(!row.address){ alert('Address likhein'); return; }
  try{
    if(row.is_default) await SB.from('addresses').update({is_default:false}).eq('user_id', ACCT.user.id);
    if(id) await SB.from('addresses').update(row).eq('id', id).eq('user_id', ACCT.user.id);
    else await SB.from('addresses').insert(row);
    await loadAccountData();
  }catch(e){ alert('Error: ' + (e.message||'dobara try karein')); }
}
async function addrDelete(id){
  if(!confirm('Ye address delete karein?')) return;
  try{ await SB.from('addresses').delete().eq('id', id).eq('user_id', ACCT.user.id); await loadAccountData(); }
  catch(e){ alert('Error: ' + (e.message||'')); }
}
async function addrDefault(id){
  try{
    await SB.from('addresses').update({is_default:false}).eq('user_id', ACCT.user.id);
    await SB.from('addresses').update({is_default:true}).eq('id', id).eq('user_id', ACCT.user.id);
    await loadAccountData();
  }catch(e){}
}
/* ---------- refer & earn ---------- */
function acctReferHTML(){
  let code = 'CHASKA-GUEST';
  try{ if(typeof getReferralCode === 'function') code = getReferralCode(); }catch(e){}
  let count = 0;
  try{ count = (JSON.parse(localStorage.getItem('cb_referrals')||'{"count":0}').count)||0; }catch(e){}
  return '<div class="refer">'
    + '<div class="refer-hero">🎁<h3>Dost ko bhejo, dono ko inaam!</h3>'
    + '<p class="amut sm">Apna referral code share karein. Jab dost signup karke order karega, <b>aap dono ko Rs.150 ka inaam</b> milega! 🎉</p></div>'
    + '<div class="rcodebox"><span class="rcodelab">Aapka code</span><b class="rcode">'+esc(code)+'</b>'
    + '<button class="abtn sm" onclick="copyReferral()">📋 Copy</button></div>'
    + '<button class="abtn wa" onclick="shareReferralWA()">💬 WhatsApp par Share karein</button>'
    + '<div class="rstats"><div class="rstat"><b>'+count+'</b><small>dost join hue</small></div>'
    + '<div class="rstat"><b>Rs.'+(count*150)+'</b><small>inaam kamaya</small></div></div>'
    + '<p class="amut sm" style="text-align:center">📝 Note: Full referral tracking (auto-rewards) jald aa raha hai. Abhi codes manually verify honge.</p>'
    + '</div>';
}
function acctProfileHTML(){
  const email = ACCT.user.email || '';
  return '<div class="aform"><h4>Profile</h4>'
    + '<label class="alab">Email</label><input class="ainp" value="'+esc(email)+'" disabled>'
    + '<label class="alab">Name</label><input id="pf_name" class="ainp" placeholder="Aapka naam">'
    + '<label class="alab">Phone (WhatsApp)</label><input id="pf_phone" class="ainp" inputmode="tel" placeholder="03XX-XXXXXXX">'
    + '<label class="alab">Birthday 🎂 <small class="amut">(special gift milega!)</small></label><input id="pf_birthday" type="date" class="ainp">'
    + '<button class="abtn" onclick="saveProfile()">💾 Save Profile</button></div>'
    + '<button class="abtn danger" onclick="logout()">🚪 Logout</button>'
    + '<p class="amut sm">Supabase setup pending ho to kuch features kaam nahi karenge.</p>';
}
async function saveProfile(){
  const bday = $('#pf_birthday') ? $('#pf_birthday').value : '';
  // Birthday always saved locally (works even without Supabase / for guests)
  if(bday){ try{ localStorage.setItem('cb_birthday', JSON.stringify(bday)); }catch(e){} }
  else { try{ localStorage.removeItem('cb_birthday'); }catch(e){} }
  if(!ACCT.user || !SB){ alert('Birthday save ho gaya! 🎂'); return; }
  try{
    await SB.from('profiles').upsert({
      id: ACCT.user.id,
      email: ACCT.user.email,
      name: $('#pf_name').value.trim(),
      phone: $('#pf_phone').value.trim(),
      birthday: bday || null
    }, { onConflict:'id' });
    alert('Profile save ho gaya! ✅');
    loadProfileIntoForm();
  }catch(e){ alert('Error: ' + (e.message||'')); }
}
async function loadProfileIntoForm(){
  // local fallback first (works without Supabase)
  try{
    const lb = JSON.parse(localStorage.getItem('cb_birthday')||'null');
    if(lb && $('#pf_birthday')) $('#pf_birthday').value = lb;
  }catch(e){}
  if(!ACCT.user || !SB) return;
  try{
    const { data } = await SB.from('profiles').select('name,phone,birthday').eq('id', ACCT.user.id).single();
    if(data){
      if($('#pf_name') && data.name) $('#pf_name').value = data.name;
      if($('#pf_phone') && data.phone) $('#pf_phone').value = data.phone;
      if($('#pf_birthday') && data.birthday){
        $('#pf_birthday').value = data.birthday;
        try{ localStorage.setItem('cb_birthday', JSON.stringify(data.birthday)); }catch(e){}
      }
    }
  }catch(e){}
}
