/* ChaskaBox customer account — Supabase Auth + own-row RLS only. */
let ACCOUNT_SESSION=null, ACCOUNT_RECOVERY=false, ACCOUNT_RENDER_SEQ=0, ACCOUNT_AUTH_SUBSCRIBED=false, ACCOUNT_RETURN_FOCUS=null;
try{ACCOUNT_RECOVERY=new URLSearchParams(location.hash.slice(1)).get('type')==='recovery'||sessionStorage.getItem('cb_password_recovery')==='1';}catch{}
const aesc = (s) => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const afmt = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-PK');

async function initAccount(){
 if(!(await initSupabase())||!SB)return false;
 if(!ACCOUNT_AUTH_SUBSCRIBED){ACCOUNT_AUTH_SUBSCRIBED=true;SB.auth.onAuthStateChange((event,session)=>{
  ACCOUNT_SESSION=session||null;
  if(event==='PASSWORD_RECOVERY'){ACCOUNT_RECOVERY=true;try{sessionStorage.setItem('cb_password_recovery','1');}catch{}}
  if(event==='SIGNED_OUT'){ACCOUNT_RECOVERY=false;try{sessionStorage.removeItem('cb_password_recovery');}catch{}}
  if(location.pathname==='/account/')setTimeout(()=>renderAccountView(),0);
 });}
 const {data,error}=await SB.auth.getSession();if(error)throw error;ACCOUNT_SESSION=data?.session||null;return true;
}
function closeAuthModal(){
 const m=document.getElementById('acctmodal');if(!m)return;
 m.classList.remove('open');m.setAttribute('aria-hidden','true');document.body.style.overflow='';
 if(ACCOUNT_RETURN_FOCUS?.focus){const target=ACCOUNT_RETURN_FOCUS;ACCOUNT_RETURN_FOCUS=null;target.focus();}
}
function prepareAccountModal(m){
 if(!m.classList.contains('open'))ACCOUNT_RETURN_FOCUS=document.activeElement;
 m.setAttribute('role','dialog');m.setAttribute('aria-label','ChaskaBox account');m.setAttribute('aria-modal','true');m.classList.add('open');m.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
}
async function toggleAccount(){
  // Clicking before idle Auth initialization must still detect an existing session.
  if(!ACCOUNT_SESSION){
    try{await initAccount();}catch(e){console.warn('account init',e);}
  }
  if(ACCOUNT_SESSION){ location.href='/account/'; return; }
  openAuthModal('signin');
}
function openAuthModal(mode='signin'){
  const m=document.getElementById('acctmodal'), b=document.getElementById('abody'); if(!m||!b)return;
  const signup=mode==='signup';
  b.innerHTML=`<div class="auth-card"><span class="eyebrow">${signup?'CREATE ACCOUNT':'WELCOME BACK'}</span><h2>${signup?'Create your ChaskaBox account':'Sign in'}</h2><p class="amut">Track orders and save your details securely.</p>
  ${signup?'<label>Full name<input id="authName" autocomplete="name"></label><label>Phone<input id="authPhone" inputmode="tel" autocomplete="tel"></label>':''}
  <label>Email<input id="authEmail" type="email" autocomplete="email"></label><label>Password<input id="authPass" type="password" autocomplete="'+(signup?'new-password':'current-password')+'"></label>
  <div id="authErr" class="order-error" role="alert" hidden></div><button class="cta" id="authSubmit">${signup?'Create account':'Sign in'}</button>
  <button class="text-btn" id="authSwitch">${signup?'Already have an account? Sign in':'New here? Create account'}</button></div>`;
  prepareAccountModal(m);
  // Move keyboard focus into the modal for accessibility
  setTimeout(()=>{ const f=b.querySelector('input'); if(f) f.focus(); },50);
  if(!signup){const reset=document.createElement('button');reset.className='text-btn';reset.type='button';reset.textContent='Forgot password?';reset.onclick=openResetRequest;b.querySelector('.auth-card').append(reset);}
  document.getElementById('authSwitch').onclick=()=>openAuthModal(signup?'signin':'signup');
  document.getElementById('authSubmit').onclick=async()=>{
    const email=document.getElementById('authEmail').value.trim(), password=document.getElementById('authPass').value;
    const err=document.getElementById('authErr'),submit=document.getElementById('authSubmit');if(submit.disabled)return;submit.disabled=true;err.hidden=true;
    try{
      if(!(await initSupabase())) throw new Error('Account service is not configured.');
      let res;
      if(signup){
        const name=document.getElementById('authName').value.trim(), phone=document.getElementById('authPhone').value.trim();
        if(name.length<2) throw new Error('Please enter your full name.');
        res=await SB.auth.signUp({email,password,options:{data:{name,phone}}});
        if(res.error) throw res.error;
        if(res.data?.session&&res.data.user){const saved=await SB.from('profiles').upsert({id:res.data.user.id,name,phone,updated_at:new Date().toISOString()});if(saved.error)throw new Error('Account created, but profile save failed. Sign in and save your profile again.');}
        if(!res.data?.session){err.textContent='If confirmation is required, check your email before signing in.';err.hidden=false;return;}
      }else{
        res=await SB.auth.signInWithPassword({email,password}); if(res.error) throw res.error;
      }
      closeAuthModal(); const {data}=await SB.auth.getSession(); ACCOUNT_SESSION=data?.session||null; renderAccountView();
    }catch(e){err.textContent=e.message||'Could not continue.';err.hidden=false;}finally{submit.disabled=false;}
  };
}
async function renderAccountView(){
  const seq=++ACCOUNT_RENDER_SEQ;
  const body=document.getElementById('acctbody'), nameEl=document.getElementById('acctName'); if(!body)return;
  body.innerHTML='<div class="empty-mini">Loading account…</div>';
  if(!(await initSupabase())||!SB){ body.innerHTML='<div class="empty-mini">Account service is not configured yet.</div>'; return; }
  const {data,error:sessionError}=await SB.auth.getSession();if(seq!==ACCOUNT_RENDER_SEQ)return;
  if(sessionError){body.innerHTML='<p role="alert">Account could not be loaded. Please refresh and try again.</p>';return;}
  ACCOUNT_SESSION=data?.session||null;
  if(ACCOUNT_RECOVERY){renderPasswordRecovery(body);return;}
  if(!ACCOUNT_SESSION){
    if(nameEl)nameEl.textContent='Sign in to view your orders';
    body.innerHTML='<div class="acct-signin"><h3>Your orders in one place</h3><p>Sign in or create an account. Guest checkout still works.</p><div class="confirm-actions"><button class="cta" id="acctSignIn">Sign in</button><button class="cta secondary" id="acctSignUp">Create account</button><button class="text-btn" id="acctForgot">Forgot password?</button></div></div>';
    document.getElementById('acctSignIn').onclick=()=>openAuthModal('signin'); document.getElementById('acctSignUp').onclick=()=>openAuthModal('signup');document.getElementById('acctForgot').onclick=openResetRequest;return;
  }
  const uid=ACCOUNT_SESSION.user.id;
  const [{data:profile,error:perr},{data:orders,error:oerr}]=await Promise.all([
    SB.from('profiles').select('name,phone').eq('id',uid).maybeSingle(),
    SB.from('orders').select('id,order_number,total,payment_method,payment_status,fulfilment_status,created_at,order_items(product_id,products(name))').eq('user_id',uid).order('created_at',{ascending:false}).limit(50)
  ]);
  if(seq!==ACCOUNT_RENDER_SEQ||ACCOUNT_SESSION?.user?.id!==uid)return;
  const displayName=profile?.name||ACCOUNT_SESSION.user.user_metadata?.name||ACCOUNT_SESSION.user.email||'Customer'; if(nameEl)nameEl.textContent=displayName;
  const cards=(orders||[]).map(o=>{
    const isDelivered = (o.fulfilment_status||'').toLowerCase()==='delivered';
    const items = o.order_items||[];
    const reviewLinks = isDelivered && items.length
      ? `<div class="review-links" style="margin-top:8px"><small>Review: </small>` + items.slice(0,5).map(it=>`<a href="/product/${it.product_id}/#reviews" class="text-btn">${aesc(it.products?.name||('Product '+it.product_id))}</a>`).join(' · ') + `</div>`
      : '';
    return `<article class="acct-order"><div><b>${aesc(o.order_number)}</b><small>${new Date(o.created_at).toLocaleDateString('en-PK')}</small></div><div><strong>${afmt(o.total)}</strong><small>${aesc(String(o.fulfilment_status||'new').replaceAll('_',' '))} · ${aesc(String(o.payment_status||'').replaceAll('_',' '))}</small></div><div class="order-actions"><a href="/track-order.html?order=${encodeURIComponent(o.order_number)}">Track</a><button class="text-btn" onclick="reOrder('${o.id}')">Re-order</button></div>${reviewLinks}</article>`;
  }).join('');
  body.innerHTML=`<section class="co-card"><div class="panel-head"><div><h2>Profile</h2><p>${aesc(ACCOUNT_SESSION.user.email||'')}</p></div><div><button class="text-btn" onclick="sendPasswordReset()">Reset password</button> <button class="text-btn" id="acctLogout">Sign out</button></div></div><div class="form-two"><label>Name<input id="acctProfileName" value="${aesc(profile?.name||'')}"></label><label>Phone<input id="acctProfilePhone" value="${aesc(profile?.phone||ACCOUNT_SESSION.user.user_metadata?.phone||'')}" inputmode="tel"></label></div><div class="confirm-actions"><button class="cta secondary" id="acctSaveProfile">Save profile</button><button class="cta secondary" id="linkOrdersBtn" onclick="linkGuestOrders()">Link past orders</button></div></section><section class="co-card" style="margin-top:16px"><h2>My Orders</h2>${oerr?'<p>Orders could not be loaded.</p>':(cards||'<div class="empty-mini">No account orders yet.</div>')}</section><section class="co-card" style="margin-top:16px"><h2>Saved Addresses</h2><div id="addrList"><p class="amut">Loading…</p></div><div class="form-two" style="margin-top:12px"><label>Label<input id="newAddrLabel" placeholder="Home"></label><label>City<input id="newAddrCity" placeholder="Muzaffargarh"></label></div><label>Address<input id="newAddrText" placeholder="Street, area"></label><button class="cta secondary" id="addAddrBtn" style="margin-top:8px">Add address</button></section><section class="co-card" style="margin-top:16px"><h2>My Reviews</h2><div id="reviewList"><p class="amut">Loading…</p></div></section>`;
  document.getElementById('acctLogout').onclick=async()=>{const {error}=await SB.auth.signOut();if(error){alert('Sign out failed. Please retry.');return;}ACCOUNT_SESSION=null;ACCOUNT_RECOVERY=false;renderAccountView();};
  document.getElementById('acctSaveProfile').onclick=async()=>{const btn=document.getElementById('acctSaveProfile');btn.disabled=true;try{const {error}=await SB.from('profiles').upsert({id:uid,name:document.getElementById('acctProfileName').value.trim(),phone:document.getElementById('acctProfilePhone').value.trim(),updated_at:new Date().toISOString()});if(error)throw error;btn.textContent='Saved ✓';}catch(error){btn.textContent='Save failed — retry';}setTimeout(()=>{btn.textContent='Save profile';btn.disabled=false},1200);};
  if(perr){const note=document.createElement('p');note.setAttribute('role','alert');note.textContent='Profile could not be loaded. Refresh before editing.';body.prepend(note);document.getElementById('acctSaveProfile').disabled=true;}
  // Add address handler
  document.getElementById('addAddrBtn').onclick=async()=>{
    const label=document.getElementById('newAddrLabel').value.trim()||'Home';
    const city=document.getElementById('newAddrCity').value.trim();
    const addr=document.getElementById('newAddrText').value.trim();
    if(!city||!addr){alert('Enter city and address');return;}
    const btn=document.getElementById('addAddrBtn');if(btn.disabled)return;btn.disabled=true;
    try{const {error}=await SB.from('addresses').insert({user_id:uid,label,address:addr,city});if(error)throw error;
      document.getElementById('newAddrLabel').value='';document.getElementById('newAddrCity').value='';document.getElementById('newAddrText').value='';await renderAddresses();
    }catch(e){alert(e.message||'Address save failed. Your input has been kept.');}finally{btn.disabled=false;}
  };
  // Load addresses and reviews
  renderAddresses();
  loadMyReviews();
  // Sync wishlist on login
  syncWishlist();
}

async function loadMyReviews(){
  const el=document.getElementById('reviewList'); if(!el||!SB||!ACCOUNT_SESSION) return;
  const {data,error}=await SB.from('reviews').select('id,rating,review_text,moderation_status,created_at,products(name)').eq('user_id',ACCOUNT_SESSION.user.id).order('created_at',{ascending:false}).limit(20);
  if(error){el.innerHTML='<p role="alert">Reviews could not be loaded. Refresh to retry.</p>';return;}
  el.innerHTML=(data||[]).map(r=>`<div class="review-row"><div><b>${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</b> <span class="pill">${aesc(r.moderation_status)}</span><p>${aesc(r.review_text)}</p><small>${aesc(r.products?.name||'')} · ${new Date(r.created_at).toLocaleDateString('en-PK')}</small></div></div>`).join('')||'<p class="amut">No reviews yet.</p>';
}

/* ============ WISHLIST SYNC (cross-device) ============ */
async function syncWishlist(){
  if(!ACCOUNT_SESSION || !SB) return;
  const uid = ACCOUNT_SESSION.user.id;
  try {
    // Get server wishlist
    const {data: server} = await SB.from('wishlists').select('product_id').eq('user_id', uid);
    const serverIds = new Set((server||[]).map(r => r.product_id));
    // Get local wishlist
    let local = [];
    try { local = JSON.parse(localStorage.getItem('chaskabox-wishlist')||'[]'); } catch {}
    // Merge: upload local items not on server
    const toUpload = local.filter(id => !serverIds.has(id));
    if (toUpload.length) {
      await SB.from('wishlists').upsert(toUpload.map(pid => ({user_id: uid, product_id: pid})), {onConflict: 'user_id,product_id'});
    }
    // Update local with full server list
    const allIds = [...new Set([...serverIds, ...local])];
    localStorage.setItem('chaskabox-wishlist', JSON.stringify(allIds));
    if (typeof updateWishCount === 'function') updateWishCount();
  } catch(e) { /* sync is best-effort */ }
}

/* ============ ADDRESSES ============ */
async function loadAddresses(){
  if(!ACCOUNT_SESSION || !SB) return [];
  const {data,error} = await SB.from('addresses').select('*').eq('user_id', ACCOUNT_SESSION.user.id).order('is_default', {ascending:false});
  if(error)throw error;return data || [];
}
async function renderAddresses(){
  const el = document.getElementById('addrList'); if(!el) return;
  let addrs;try{addrs=await loadAddresses();}catch{el.innerHTML='<p role="alert">Addresses could not be loaded. Refresh to retry.</p>';return;}
  el.innerHTML = addrs.map(a => `<div class="addr-card"><b>${aesc(a.label)}</b>${a.is_default?' <span class="pill">Default</span>':''}<p>${aesc(a.address)}, ${aesc(a.city)}</p><div class="addr-actions"><button class="text-btn" onclick="setDefaultAddr('${a.id}')">Set default</button><button class="text-btn danger" onclick="deleteAddr('${a.id}')">Delete</button></div></div>`).join('') || '<p class="amut">No saved addresses.</p>';
}
async function setDefaultAddr(id){
 if(!SB||!ACCOUNT_SESSION)return;
 try{const {error}=await SB.rpc('customer_address_default',{p_address:id});if(error)throw error;await renderAddresses();}
 catch(e){alert(e.message||'Default address was not saved. Please retry.');}
}
async function deleteAddr(id){
 if(!SB||!ACCOUNT_SESSION||!confirm('Delete this address?'))return;
 try{const {data,error}=await SB.from('addresses').delete().eq('id',id).eq('user_id',ACCOUNT_SESSION.user.id).select('id');if(error)throw error;if(!data?.length)throw new Error('Address no longer available. Refresh and try again.');await renderAddresses();}
 catch(e){alert(e.message||'Address deletion failed. Please retry.');}
}

/* ============ RE-ORDER ============ */
async function reOrder(orderId){
  if(!SB) return;
  const {data: items} = await SB.from('order_items').select('product_id, quantity').eq('order_id', orderId);
  if(!items?.length) { alert('No items found in this order.'); return; }
  // Add to cart via localStorage (works without app.js)
  try {
    let cart = {};
    try { cart = JSON.parse(localStorage.getItem('chaskabox-cart')||'{}'); } catch {}
    for(const it of items){
      const pid = String(it.product_id);
      cart[pid] = (cart[pid]||0) + (it.quantity||1);
    }
    localStorage.setItem('chaskabox-cart', JSON.stringify(cart));
    localStorage.setItem('chaskabox-cart-ts', String(Date.now()));
  } catch(e){}
  alert(`${items.length} item(s) added to cart!`);
  location.href = '/';
}

/* ============ GUEST ORDER LINKING ============ */
async function linkGuestOrders(){
  if(!SB || !ACCOUNT_SESSION) return;
  const btn = document.getElementById('linkOrdersBtn'); if(btn) btn.disabled = true;
  try {
    const {data, error} = await SB.rpc('link_guest_orders');
    if(error) throw error;
    alert(data?.linked ? `${data.linked} past order(s) linked to your account!` : 'No unlinked orders found for your confirmed account email. For older orders without an email, contact support.');
    renderAccountView();
  } catch(e) {
    alert(e.message || 'Could not link orders. Confirm the same email you used at checkout, then try again.');
  }
  if(btn) btn.disabled = false;
}

/* ============ PASSWORD RESET ============ */
async function sendPasswordReset(){openResetRequest(ACCOUNT_SESSION?.user?.email||'');}
function openResetRequest(email=''){
 const m=document.getElementById('acctmodal'),b=document.getElementById('abody');if(!m||!b)return;
 b.innerHTML='<div class="auth-card"><h2>Reset password</h2><p>Enter your email to request a secure reset link.</p><label>Email<input id="resetEmail" type="email" autocomplete="email" value="'+aesc(typeof email==='string'?email:'')+'"></label><p id="resetStatus" role="status" aria-live="polite"></p><button class="cta" id="resetSend">Send reset link</button><button class="text-btn" id="resetBack">Back to sign in</button></div>';
 prepareAccountModal(m);document.getElementById('resetEmail').focus();
 document.getElementById('resetBack').onclick=()=>openAuthModal('signin');
 document.getElementById('resetSend').onclick=async()=>{
  const btn=document.getElementById('resetSend'),status=document.getElementById('resetStatus'),value=document.getElementById('resetEmail').value.trim();
  if(btn.disabled)return;if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)){status.textContent='Enter a valid email address.';return;}
  btn.disabled=true;try{
   if(!(await initSupabase())||!SB)throw new Error('Account service unavailable.');
   const {error}=await SB.auth.resetPasswordForEmail(value,{redirectTo:location.origin+'/account/'});if(error)throw error;
   status.textContent='If an account uses this email, a reset link will arrive. Check your inbox and spam folder.';btn.textContent='Link requested';
  }catch(e){status.textContent=e.message||'Reset request failed. Please retry.';btn.disabled=false;}
 };
}
function renderPasswordRecovery(body){
 if(!ACCOUNT_SESSION){body.innerHTML='<section class="co-card"><h2>Reset link unavailable</h2><p>This link may have expired. Request a new link and open it in this browser.</p><button class="cta" id="retryReset">Request a new link</button></section>';document.getElementById('retryReset').onclick=openResetRequest;return;}
 body.innerHTML='<section class="co-card"><h2>Choose a new password</h2><label>New password<input id="recoveryPass" type="password" autocomplete="new-password" minlength="8"></label><label>Confirm new password<input id="recoveryConfirm" type="password" autocomplete="new-password" minlength="8"></label><p id="recoveryStatus" role="status" aria-live="polite"></p><button class="cta" id="saveRecovery">Update password</button></section>';
 document.getElementById('recoveryPass').focus();
 document.getElementById('saveRecovery').onclick=async()=>{
  const btn=document.getElementById('saveRecovery'),status=document.getElementById('recoveryStatus'),password=document.getElementById('recoveryPass').value,confirmation=document.getElementById('recoveryConfirm').value;
  if(btn.disabled)return;if(password.length<8||password!==confirmation){status.textContent='Use at least 8 characters and matching passwords.';return;}
  btn.disabled=true;try{
   const {error}=await SB.auth.updateUser({password});if(error)throw error;
   ACCOUNT_RECOVERY=false;try{sessionStorage.removeItem('cb_password_recovery');}catch{}
   history.replaceState(null,'',location.pathname+location.search);await renderAccountView();alert('Password updated.');
  }catch(e){status.textContent=e.message||'Password update failed. Please retry.';btn.disabled=false;}
 };
}
document.addEventListener('keydown',event=>{
 if(typeof getOpenDialog==='function')return;
 const modal=document.getElementById('acctmodal');if(!modal?.classList.contains('open'))return;
 if(event.key==='Escape'){closeAuthModal();return;}if(event.key!=='Tab')return;
 const nodes=[...modal.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href]')].filter(n=>n.offsetParent!==null);
 const first=nodes[0],last=nodes[nodes.length-1];if(!first)return;
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});
