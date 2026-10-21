/* ChaskaBox customer account — Supabase Auth + own-row RLS only. */
let ACCOUNT_SESSION=null, ACCOUNT_RECOVERY=false, ACCOUNT_RENDER_SEQ=0, ACCOUNT_AUTH_SUBSCRIBED=false, ACCOUNT_RETURN_FOCUS=null;
try{ACCOUNT_RECOVERY=new URLSearchParams(location.hash.slice(1)).get('type')==='recovery'||sessionStorage.getItem('cb_password_recovery')==='1';}catch{}
const aesc = (s) => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const afmt = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-PK');

async function initAccount(){
 if(!(await initSupabase())||!SB)return false;
 if(!ACCOUNT_AUTH_SUBSCRIBED){ACCOUNT_AUTH_SUBSCRIBED=true;SB.auth.onAuthStateChange((event,session)=>{
  const previous=ACCOUNT_SESSION?.user?.id;ACCOUNT_SESSION=session||null;
  if(event==='PASSWORD_RECOVERY'){ACCOUNT_RECOVERY=true;try{sessionStorage.setItem('cb_password_recovery','1');}catch{}}
  if(event==='SIGNED_OUT'){ACCOUNT_RECOVERY=false;try{sessionStorage.removeItem('cb_password_recovery');localStorage.removeItem('chaskabox-wishlist');localStorage.removeItem('chaskabox-wishlist-owner');}catch{}}
  if(location.pathname==='/account/'&&(event==='PASSWORD_RECOVERY'||event==='SIGNED_OUT'||previous!==session?.user?.id))setTimeout(()=>renderAccountView(),0);
 });}
 const {data,error}=await SB.auth.getSession();if(error)throw error;ACCOUNT_SESSION=data?.session||null;return true;
}
function closeAuthModal(){
 const m=document.getElementById('acctmodal');if(!m)return;
 m.classList.remove('open');m.setAttribute('aria-hidden','true');document.body.style.overflow='';
 if(ACCOUNT_RETURN_FOCUS?.focus){const target=ACCOUNT_RETURN_FOCUS;ACCOUNT_RETURN_FOCUS=null;target.focus();}
}
function prepareAccountModal(m){
 if(!document.querySelector('link[href^="/account.css"]')){const css=document.createElement('link');css.rel='stylesheet';css.href='/account.css?v=20261021-portal1';document.head.append(css);}
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
  <form id="authForm">${signup?'<label>Full name<input id="authName" autocomplete="name" required minlength="2" maxlength="100"></label><label>Phone (optional)<input id="authPhone" inputmode="tel" autocomplete="tel" maxlength="25"></label>':''}
  <label>Email<input id="authEmail" type="email" autocomplete="email" required maxlength="254"></label><label>Password<input id="authPass" type="password" autocomplete="${signup?'new-password':'current-password'}" required ${signup?'minlength="8"':''}></label>
  <div id="authErr" class="order-error" role="alert" hidden></div><button type="submit" class="cta" id="authSubmit">${signup?'Create account':'Sign in'}</button></form>
  <button type="button" class="text-btn" id="authSwitch">${signup?'Already have an account? Sign in':'New here? Create account'}</button></div>`;
  prepareAccountModal(m);
  // Move keyboard focus into the modal for accessibility
  setTimeout(()=>{ const f=b.querySelector('input'); if(f) f.focus(); },50);
  if(!signup){const reset=document.createElement('button');reset.className='text-btn';reset.type='button';reset.textContent='Forgot password?';reset.onclick=openResetRequest;b.querySelector('.auth-card').append(reset);}
  document.getElementById('authSwitch').onclick=()=>openAuthModal(signup?'signin':'signup');
  document.getElementById('authForm').onsubmit=async event=>{
    event.preventDefault();
    const email=document.getElementById('authEmail').value.trim(), password=document.getElementById('authPass').value;
    const err=document.getElementById('authErr'),submit=document.getElementById('authSubmit');if(submit.disabled)return;submit.disabled=true;err.hidden=true;
    try{
      if(!(await initSupabase())) throw new Error('Account service is not configured.');
      let res;
      if(signup){
        const name=document.getElementById('authName').value.trim(), phone=document.getElementById('authPhone').value.trim();
        const {profileInput}=await import('/account-portal-contract.js?v=20261021-portal1');profileInput({name,phone});
        res=await SB.auth.signUp({email,password,options:{data:{name,phone}}});
        if(res.error) throw res.error;
        if(res.data?.session&&res.data.user){const saved=await SB.from('profiles').upsert({id:res.data.user.id,name,phone,updated_at:new Date().toISOString()});if(saved.error)throw new Error('Account created, but profile save failed. Sign in and save your profile again.');}
        if(!res.data?.session){err.textContent='If confirmation is required, check your email before signing in.';err.hidden=false;return;}
      }else{
        res=await SB.auth.signInWithPassword({email,password}); if(res.error) throw res.error;
      }
      closeAuthModal(); const {data}=await SB.auth.getSession(); ACCOUNT_SESSION=data?.session||null;if(document.getElementById('acctbody'))renderAccountView();else location.href='/account/';
    }catch(e){err.textContent=e.message||'Could not continue.';err.hidden=false;}finally{submit.disabled=false;}
  };
}
async function renderAccountView(){
 if(!document.getElementById('acctbody'))return;
 try{const portal=await import('/account-portal.js?v=20261021-portal1');await portal.renderAccountPortal();}
 catch{const body=document.getElementById('acctbody');if(body)body.innerHTML='<div class="account-card" role="alert">Account could not be loaded. <button type="button" class="account-button secondary" onclick="renderAccountView()">Try again</button></div>';}
}

/* ============ PASSWORD RESET ============ */
async function sendPasswordReset(){openResetRequest(ACCOUNT_SESSION?.user?.email||'');}
function openResetRequest(email=''){
 const m=document.getElementById('acctmodal'),b=document.getElementById('abody');if(!m||!b)return;
 b.innerHTML='<div class="auth-card"><h2>Reset password</h2><p>Enter your email to request a secure reset link.</p><form id="resetForm"><label>Email<input id="resetEmail" type="email" autocomplete="email" required maxlength="254" value="'+aesc(typeof email==='string'?email:'')+'"></label><p id="resetStatus" role="status" aria-live="polite"></p><button type="submit" class="cta" id="resetSend">Send reset link</button></form><button type="button" class="text-btn" id="resetBack">Back to sign in</button></div>';
 prepareAccountModal(m);document.getElementById('resetEmail').focus();
 document.getElementById('resetBack').onclick=()=>openAuthModal('signin');
 document.getElementById('resetForm').onsubmit=async event=>{
  event.preventDefault();
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
 body.innerHTML='<section class="account-card"><h2>Choose a new password</h2><form class="account-form" id="recoveryForm"><label>New password<input id="recoveryPass" type="password" autocomplete="new-password" minlength="8" required></label><label>Confirm new password<input id="recoveryConfirm" type="password" autocomplete="new-password" minlength="8" required></label><p id="recoveryStatus" role="status" aria-live="polite"></p><button type="submit" class="account-button" id="saveRecovery">Update password</button></form></section>';
 document.getElementById('recoveryPass').focus();
 document.getElementById('recoveryForm').onsubmit=async event=>{
  event.preventDefault();
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
