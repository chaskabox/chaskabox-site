import {portalConfig,profileInput,addressInput,orderLabel,paymentLabel,productIds,reorderCart} from './account-portal-contract.js?v=20261021-portal1';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'Rs. '+Number(n||0).toLocaleString('en-PK');
const date=s=>{const d=new Date(s);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('en-PK',{day:'numeric',month:'short',year:'numeric'});};
const status=id=>'<p id="'+id+'" class="account-feedback" role="status" aria-live="polite"></p>';
const button=(label,attrs='',style='secondary')=>'<button type="button" class="account-button '+style+'" '+attrs+'>'+label+'</button>';
const empty=(title,text,action='')=>'<div class="account-empty"><h3>'+esc(title)+'</h3><p>'+esc(text)+'</p>'+action+'</div>';
const icons={
 overview:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 orders:'<path d="m3 7 9-4 9 4v10l-9 4-9-4Z"/><path d="m3 7 9 4 9-4M12 11v10M7 5l10 4"/>',
 profile:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
 addresses:'<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',
 wishlist:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
 reviews:'<path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
};
const icon=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[name]+'</svg>';
let generation=0, configPromise=null, state=null;
function feedback(id,text,error=false){const el=$(id);if(el){el.textContent=text;el.dataset.error=String(error);}}
function current(uid,el){return ACCOUNT_SESSION?.user?.id===uid&&state?.uid===uid&&el?.isConnected;}
async function config(){
 if(!configPromise)configPromise=fetch('/api/account-portal',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();const data=await r.json();return {...data,portal:portalConfig(data.portal)};}).catch(()=>{configPromise=null;return {portal:portalConfig(),unavailable:true};});
 return configPromise;
}
function retry(el,message,run){
 el.innerHTML='<div class="account-empty"><p role="alert">'+esc(message)+'</p>'+button('Try again','data-retry')+'</div>';
 el.querySelector('[data-retry]').onclick=run;
}
function title(name){if($('acctName'))$('acctName').textContent=name;}
function intro(text){if($('acctIntro'))$('acctIntro').textContent=text;}
function support(c){
 let actions='<a class="account-button secondary" href="/contact/">Contact support</a>';
 if(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.support_email||''))actions+='<a class="text-btn" href="mailto:'+esc(c.support_email)+'">Email us</a>';
 return '<section class="account-card account-support"><div><h3>Need a hand with an order?</h3><p>Keep your order number handy. Our team can help with delivery, payments and returns.</p></div><div class="account-actions">'+actions+'</div></section>';
}
function panel(key,html){return '<section class="account-panel" id="account-'+key+'" aria-labelledby="heading-'+key+'" hidden>'+html+'</section>';}
function wireSections(root){
 root.querySelectorAll('[data-account-section]').forEach(b=>b.onclick=()=>showSection(b.dataset.accountSection,true));
}
function showSection(key,focus=false){
 if(!$('account-'+key))key='overview';
 document.querySelectorAll('.account-panel').forEach(p=>p.hidden=p.id!=='account-'+key);
 document.querySelectorAll('.account-nav button').forEach(b=>{if(b.dataset.accountSection===key)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 if(location.hash!=='#'+key)history.replaceState(null,'',location.pathname+location.search+'#'+key);
 if(focus){const h=$('heading-'+key);h?.focus({preventScroll:true});}
 if(key==='addresses'&&!state.loaded.addresses)renderAddresses();
 if(key==='wishlist'&&!state.loaded.wishlist)renderWishlist();
 if(key==='reviews'&&!state.loaded.reviews)loadReviews();
}
window.addEventListener('hashchange',()=>{if(state)showSection(location.hash.slice(1));});

export async function renderAccountPortal(){
 const seq=++generation,body=$('acctbody');if(!body)return;
 state=null;body.innerHTML='<div class="account-card" role="status">Loading your account…</div>';
 if(!(await initSupabase())||!SB){retry(body,'The account service is unavailable. Your cart is still available.',()=>renderAccountView());return;}
 if(!ACCOUNT_AUTH_SUBSCRIBED){try{await initAccount();}catch{retry(body,'Your session could not be checked. Please try again.',()=>renderAccountView());return;}}
 const {data,error}=await SB.auth.getSession();if(seq!==generation)return;
 if(error){retry(body,'Your session could not be checked. Please try again.',()=>renderAccountView());return;}
 ACCOUNT_SESSION=data?.session||null;
 if(ACCOUNT_RECOVERY){title('Account security');intro('Choose a secure password for your account.');renderPasswordRecovery(body);return;}
 const c=await config();if(seq!==generation)return;
 if(!ACCOUNT_SESSION){
  title('Welcome to your ChaskaBox');intro(c.portal.message);
  body.innerHTML='<section class="account-signin"><div><span class="account-eyebrow">YOUR SNACKS. YOUR SPACE.</span><h2>'+esc(c.portal.heading)+'</h2><p>Sign in to track orders and keep your favourites together. You can still check out as a guest.</p><div class="account-actions">'+button('Sign in','id="acctSignIn"','')+button('Create account','id="acctSignUp"')+'</div><button type="button" class="text-btn" id="acctForgot">Forgot password?</button><p class="account-note">Ordered as a guest? <a href="/track-order.html"><u>Track an order</u></a> without signing in.</p></div><ul class="account-benefits"><li>'+icon('orders')+'<span><b>Follow every order</b><br>Clear updates from order to delivery.</span></li><li>'+icon('wishlist')+'<span><b>Keep your favourites</b><br>Save snacks for your next box.</span></li><li>'+icon('addresses')+'<span><b>Keep details ready</b><br>Manage your profile and delivery addresses.</span></li></ul></section>'+support(c);
  $('acctSignIn').onclick=()=>openAuthModal('signin');$('acctSignUp').onclick=()=>openAuthModal('signup');$('acctForgot').onclick=()=>openResetRequest();return;
 }
 const uid=ACCOUNT_SESSION.user.id,user=ACCOUNT_SESSION.user;
 const result=await SB.from('profiles').select('id,name,phone,updated_at').eq('id',uid).maybeSingle();
 if(seq!==generation||ACCOUNT_SESSION?.user?.id!==uid)return;
 const profile=result.data,metadataName=typeof user.user_metadata?.name==='string'?user.user_metadata.name:'';
 const display=profile?.name||metadataName||'Snack lover';
 state={uid,profile,config:c,loaded:{},addresses:[],orderPage:1,orders:[],orderSeq:0,reviewPage:1,reviewSeq:0};
 title('Hello, '+display.split(/\s+/)[0]+'!');intro(c.portal.message);
 const sections=[['overview','Overview'],['orders','My orders'],['profile','Profile & security'],...(c.portal.show_addresses?[['addresses','Addresses']]:[]),...(c.portal.show_wishlist?[['wishlist','Wishlist']]:[]),...(c.portal.show_reviews?[['reviews','My reviews']]:[])];
 const nav=sections.map(([key,label])=>'<button type="button" data-account-section="'+key+'">'+icon(key)+label+'</button>').join('');
 const latest='<section class="account-card account-latest"><span class="account-eyebrow">YOUR LATEST ORDER</span><div id="accountLatest"><p>Checking your latest order…</p></div></section>';
 const stats='<div class="account-summary"><button class="account-stat" data-account-section="orders"><strong id="accountOrderCount">—</strong>Total orders</button>'+(c.portal.show_addresses?'<button class="account-stat" data-account-section="addresses"><strong>'+icon('addresses')+'</strong>Saved addresses</button>':'<a class="account-stat" href="/shop/"><strong>↗</strong>Explore snacks</a>')+(c.portal.show_wishlist?'<button class="account-stat" data-account-section="wishlist"><strong>♡</strong>Your wishlist</button>':'<a class="account-stat" href="/cart/"><strong>↗</strong>View cart</a>')+'</div>';
 const orderBody='<section class="account-card"><div class="account-card-head"><div><h2 tabindex="-1" id="heading-orders">My orders</h2><p>Track delivery, check payments or shop your favourites again.</p></div><label class="account-filter">Order status<select id="accountOrderFilter"><option value="all">All orders</option><option value="active">In progress</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select></label></div><div id="accountOrderList" aria-live="polite"></div>'+status('orderStatus')+(c.portal.show_link_orders?'<div class="account-actions">'+button('Link past orders','id="linkOrdersBtn"')+'</div><p class="account-note">Find orders placed with your confirmed account email. Orders without an email need support.</p>'+status('linkStatus'):'')+'</section>';
 const profileBody='<section class="account-card"><h2 tabindex="-1" id="heading-profile">Profile &amp; security</h2><p class="amut">Your contact details for future orders. Existing order details stay as placed.</p><form id="accountProfileForm" class="account-form"><div class="form-two"><label>Full name<input id="acctProfileName" autocomplete="name" required minlength="2" maxlength="100" value="'+esc(profile?.name||user.user_metadata?.name||'')+'"></label><label>Phone (optional)<input id="acctProfilePhone" type="tel" autocomplete="tel" maxlength="25" value="'+esc(profile?.phone??user.user_metadata?.phone??'')+'"></label></div><label>Email<input type="email" value="'+esc(user.email||'')+'" disabled></label><p class="account-note">Your sign-in email is protected. Contact support if you need help with it.</p><div class="account-actions"><button type="submit" class="account-button" id="acctSaveProfile" '+(result.error?'disabled':'')+'>Save profile</button></div>'+status('profileStatus')+'</form></section><section class="account-card"><h3>Password &amp; sign-in</h3><p class="account-note">Request a secure reset link at your account email.</p>'+button('Reset password','id="accountReset"')+status('logoutStatus')+'</section>';
 const addressBody='<section class="account-card"><h2 tabindex="-1" id="heading-addresses">Saved addresses</h2><p class="amut">Keep delivery details ready for checkout.</p><div id="addrList"></div>'+status('addressStatus')+'<form class="account-form" id="accountAddressForm"><h3 id="addressFormTitle">Add an address</h3><div class="form-two"><label>Label<input id="newAddrLabel" maxlength="40" placeholder="Home or Work" autocomplete="off"></label><label>City<input id="newAddrCity" autocomplete="address-level2" required minlength="2" maxlength="100"></label></div><label>Street address<textarea id="newAddrText" autocomplete="street-address" required minlength="5" maxlength="440" rows="3"></textarea></label><div class="account-actions"><button type="submit" class="account-button" id="addAddrBtn">Save address</button>'+button('Cancel edit','id="cancelAddrEdit" hidden')+'</div>'+status('addressFormStatus')+'</form></section>';
 body.innerHTML='<div class="account-layout"><aside class="account-sidebar"><div class="account-identity"><span class="account-avatar" id="accountInitial">'+esc(display[0].toUpperCase())+'</span><strong id="accountDisplayName">'+esc(display)+'</strong><small>'+esc(user.email||'')+'</small></div><nav class="account-nav" aria-label="Account sections">'+nav+'</nav><button type="button" id="acctLogout" class="account-signout">↪ Sign out</button></aside><div class="account-content">'+(c.unavailable?'<p class="account-notice">Portal options could not be refreshed. Default options are shown; your account data is loaded separately.</p>':'')+status('accountStatus')+panel('overview','<h2 class="sr-only" tabindex="-1" id="heading-overview">Account overview</h2>'+stats+latest+'<section class="account-card"><h3>Ready for your next snack moment?</h3><p class="amut">Find old favourites or discover something new.</p><a class="account-button gold" href="/shop/">Explore snacks →</a></section>')+panel('orders',orderBody)+panel('profile',profileBody)+(c.portal.show_addresses?panel('addresses',addressBody):'')+(c.portal.show_wishlist?panel('wishlist','<section class="account-card"><h2 tabindex="-1" id="heading-wishlist">Your wishlist</h2><p class="amut">Saved favourites, synced to your account.</p><div id="accountWishlist"></div>'+status('wishlistStatus')+'</section>'):'')+(c.portal.show_reviews?panel('reviews','<section class="account-card"><h2 tabindex="-1" id="heading-reviews">My reviews</h2><p class="amut">Your feedback and its publication status. Review delivered products from My orders.</p><div id="reviewList"></div></section>'):'')+support(c)+'</div></div>';
 wireSections(body);
 $('accountOrderFilter').onchange=()=>loadOrders(1);
 $('acctLogout').onclick=async()=>{const btn=$('acctLogout');if(btn.disabled)return;btn.disabled=true;try{const {error}=await SB.auth.signOut();if(error)throw error;ACCOUNT_SESSION=null;state=null;await renderAccountView();}catch{feedback('accountStatus','Sign out failed. Please try again.',true);btn.disabled=false;}};
 $('accountReset').onclick=()=>sendPasswordReset();
 $('accountProfileForm').onsubmit=saveProfile;
 if(result.error){feedback('profileStatus','Your profile could not be loaded. Reload your account before editing.',true);}
 if(c.portal.show_link_orders)$('linkOrdersBtn').onclick=linkOrders;
 if(c.portal.show_addresses){$('accountAddressForm').onsubmit=saveAddress;$('cancelAddrEdit').onclick=resetAddressForm;}
 showSection(location.hash.slice(1)||'overview');
 await loadOrders(1,true);
}
async function saveProfile(event){
 event.preventDefault();const btn=$('acctSaveProfile'),form=event.currentTarget,uid=state.uid;if(btn.disabled)return;
 feedback('profileStatus','');btn.disabled=true;
 try{
  const values=profileInput({name:$('acctProfileName').value,phone:$('acctProfilePhone').value});
  const payload={...values,updated_at:new Date().toISOString()};
  let query=state.profile?SB.from('profiles').update(payload).eq('id',uid).eq('updated_at',state.profile.updated_at):SB.from('profiles').insert({id:uid,...payload});
  const {data,error}=await query.select('id,name,phone,updated_at').maybeSingle();
  if(error)throw error;if(!data)throw Error('Your profile changed elsewhere. Reload the account before saving again.');
  if(!current(uid,form))return;state.profile=data;$('accountDisplayName').textContent=data.name;$('accountInitial').textContent=data.name[0].toUpperCase();title('Hello, '+data.name.split(/\s+/)[0]+'!');feedback('profileStatus','Profile saved.');
 }catch(e){if(current(uid,form))feedback('profileStatus',e.message||'Profile was not saved. Your input has been kept.',true);}
 finally{if(current(uid,form))btn.disabled=false;}
}
function orderCard(o){
 const items=o.order_items||[],label=orderLabel(o.fulfilment_status),tone=o.fulfilment_status==='delivered'?' success':o.fulfilment_status==='cancelled'?' danger':'';
 const summary=items.slice(0,3).map(it=>esc(it.product_name||it.products?.name||'Snack pack')+' × '+Number(it.quantity||1)).join(' · ')+(items.length>3?' + '+(items.length-3)+' more':'');
 const review=o.fulfilment_status==='delivered'&&state.config.portal.show_reviews?'<div class="account-actions">'+[...new Map(items.filter(it=>Number.isSafeInteger(it.product_id)&&it.product_id>0&&it.products?.visibility==='visible').map(it=>[it.product_id,it])).values()].slice(0,5).map(it=>'<a class="text-btn" href="/product/'+it.product_id+'/#reviews">Review '+esc(it.product_name||it.products?.name||'product')+'</a>').join('')+'</div>':'';
 return '<article class="account-order"><div class="account-order-head"><div><strong>'+esc(o.order_number)+'</strong><time datetime="'+esc(o.created_at)+'">'+date(o.created_at)+'</time></div><span class="account-order-total">'+money(o.total)+'</span></div><div class="account-order-status"><span class="account-pill'+tone+'">'+label+'</span><span class="account-pill '+(['payment_rejected'].includes(o.payment_status)?'warning':'')+'">'+paymentLabel(o.payment_status)+'</span></div><p class="account-order-items">'+summary+'</p><div class="account-actions"><a class="account-button secondary" href="/track-order.html?order='+encodeURIComponent(o.order_number)+'">View &amp; track order</a>'+(state.config.portal.show_reorder?button('Order again','data-reorder="'+esc(o.id)+'"'):'')+'</div>'+status('reorder-'+o.id)+review+'</article>';
}
async function loadOrders(page=1,initial=false){
 const el=$('accountOrderList'),uid=state?.uid;if(!el||!uid)return;
 const seq=++state.orderSeq,filter=$('accountOrderFilter').value;el.innerHTML='<p class="amut" role="status">Loading orders…</p>';
 try{
  let q=SB.from('orders').select('id,order_number,total,payment_method,payment_status,fulfilment_status,created_at,order_items(product_id,product_name,quantity,products(visibility))',{count:'exact'}).eq('user_id',uid).order('created_at',{ascending:false}).order('id',{ascending:false});
  if(filter==='active')q=q.not('fulfilment_status','in','(delivered,cancelled)');
  else if(filter!=='all')q=q.eq('fulfilment_status',filter);
  const {data,error,count}=await q.range((page-1)*10,page*10-1);
  if(!current(uid,el)||seq!==state.orderSeq)return;if(error)throw error;
  state.orderPage=page;state.orders=data||[];
  if(initial){
   $('accountOrderCount').textContent=count??state.orders.length;
   const o=state.orders[0];$('accountLatest').innerHTML=o?'<h2 style="margin-top:10px">'+orderLabel(o.fulfilment_status)+'</h2><p>'+esc(o.order_number)+' · '+date(o.created_at)+' · '+money(o.total)+'</p><div class="account-actions"><a class="account-button gold" href="/track-order.html?order='+encodeURIComponent(o.order_number)+'">View &amp; track order →</a>'+button('All orders','data-account-section="orders"')+'</div>':'<h2 style="margin-top:10px">Your first box is waiting.</h2><p>Your order updates will appear here once you place an order.</p><div class="account-actions"><a class="account-button gold" href="/shop/">Find your favourites →</a></div>';
   wireSections($('accountLatest'));
  }
  const total=count??state.orders.length,pages=Math.max(1,Math.ceil(total/10));
  el.innerHTML=(state.orders.map(orderCard).join('')||empty('No orders here yet',filter==='all'?'Orders placed with your account appear here. You can also link past orders using the same confirmed email.':'No orders match this status.'))+(pages>1?'<div class="account-pagination">'+button('Previous','data-order-page="'+(page-1)+'" '+(page<=1?'disabled':''))+'<span>Page '+page+' of '+pages+' · '+total+' orders</span>'+button('Next','data-order-page="'+(page+1)+'" '+(page>=pages?'disabled':''))+'</div>':'');
  el.querySelectorAll('[data-order-page]').forEach(b=>b.onclick=()=>loadOrders(Number(b.dataset.orderPage)));
  el.querySelectorAll('[data-reorder]').forEach(b=>b.onclick=()=>reorder(b));
 }catch{if(current(uid,el)&&seq===state.orderSeq){retry(el,'Orders could not be loaded.',()=>loadOrders(page,initial));if(initial)retry($('accountLatest'),'Your latest order could not be loaded.',()=>loadOrders(1,true));}}
}
async function reorder(btn){
 if(btn.disabled)return;const uid=state.uid,id=btn.dataset.reorder,el=$('reorder-'+id);btn.disabled=true;
 try{
  const owned=await SB.from('orders').select('id').eq('id',id).eq('user_id',uid).maybeSingle();
  if(owned.error||!owned.data)throw Error('This order is unavailable. Reload your account.');
  const result=await SB.from('order_items').select('product_id,quantity').eq('order_id',id);if(result.error)throw result.error;
  const ids=productIds((result.data||[]).map(it=>it.product_id));if(!ids.length)throw Error('This order has no products available to order again.');
  const products=await SB.from('products').select('id,visibility,stock_state').in('id',ids);if(products.error)throw products.error;
  if(!current(uid,el))return;
  let cart={};try{cart=JSON.parse(localStorage.getItem('chaskabox-cart')||'{}');}catch{}
  const next=reorderCart(cart,result.data,products.data||[]);
  if(!next.added)throw Error('No items added. Products may be unavailable, or your cart has reached the limit of 99 per product.');
  localStorage.setItem('chaskabox-cart',JSON.stringify(next.cart));localStorage.setItem('chaskabox-cart-ts',String(Date.now()));
  feedback(el.id,next.added+' pack(s) added to your cart.'+(next.skipped?' '+next.skipped+' unavailable item(s) skipped.':'')+' Current prices apply at checkout.');
  const link=document.createElement('a');link.className='account-button secondary';link.href='/cart/';link.textContent='Review cart →';el.append(' ',link);
 }catch(e){if(current(uid,el))feedback(el.id,e.message||'Items were not added. Please try again.',true);}
 finally{if(current(uid,el))btn.disabled=false;}
}
async function linkOrders(){
 const btn=$('linkOrdersBtn'),uid=state.uid;if(btn.disabled)return;btn.disabled=true;feedback('linkStatus','Looking for past orders…');
 try{const {data,error}=await SB.rpc('link_guest_orders');if(error)throw error;if(!current(uid,btn))return;feedback('linkStatus',data?.linked?Number(data.linked)+' past order(s) linked.':'No unlinked orders found for your confirmed account email. Contact support for orders without an email.');$('accountOrderFilter').value='all';await loadOrders(1,true);}
 catch(e){if(current(uid,btn))feedback('linkStatus',e.message||'Orders could not be linked. Confirm your checkout email, then retry.',true);}
 finally{if(current(uid,btn))btn.disabled=false;}
}
function resetAddressForm(){
 if(!state)return;state.editAddress=null;$('accountAddressForm').reset();$('addressFormTitle').textContent='Add an address';$('addAddrBtn').textContent='Save address';$('cancelAddrEdit').hidden=true;feedback('addressFormStatus','');
}
async function renderAddresses(){
 const el=$('addrList'),uid=state?.uid;if(!el||!uid)return;el.innerHTML='<p class="amut" role="status">Loading addresses…</p>';
 try{
  const {data,error}=await SB.from('addresses').select('id,label,address,city,is_default,created_at,updated_at').eq('user_id',uid).order('is_default',{ascending:false}).order('created_at',{ascending:false});
  if(!current(uid,el))return;if(error)throw error;state.addresses=data||[];state.loaded.addresses=true;
  el.innerHTML=state.addresses.length?'<div class="account-address-grid">'+state.addresses.map(a=>'<article class="account-address"><h3>'+esc(a.label)+' '+(a.is_default?'<span class="account-pill success">Default</span>':'')+'</h3><p>'+esc(a.address)+'<br>'+esc(a.city)+'</p><div class="account-actions">'+button('Edit','data-address-edit="'+esc(a.id)+'"','text-btn')+(!a.is_default?button('Set default','data-address-default="'+esc(a.id)+'"','text-btn'):'')+button('Delete','data-address-delete="'+esc(a.id)+'"','text-btn danger')+'</div></article>').join('')+'</div>':empty('No saved addresses','Add your home or work address below.');
  el.querySelectorAll('[data-address-edit]').forEach(b=>b.onclick=()=>{const a=state.addresses.find(a=>a.id===b.dataset.addressEdit);state.editAddress=a;$('newAddrLabel').value=a.label;$('newAddrCity').value=a.city;$('newAddrText').value=a.address;$('addressFormTitle').textContent='Edit address';$('addAddrBtn').textContent='Save changes';$('cancelAddrEdit').hidden=false;feedback('addressFormStatus','');$('newAddrLabel').focus();});
  el.querySelectorAll('[data-address-default]').forEach(b=>b.onclick=()=>addressAction(b,'default'));
  el.querySelectorAll('[data-address-delete]').forEach(b=>b.onclick=()=>{if(!b.dataset.confirm){b.dataset.confirm='yes';b.textContent='Confirm delete';const cancel=document.createElement('button');cancel.type='button';cancel.className='text-btn';cancel.textContent='Keep address';cancel.onclick=()=>{delete b.dataset.confirm;b.textContent='Delete';cancel.remove();};b.after(cancel);return;}addressAction(b,'delete');});
 }catch{if(current(uid,el))retry(el,'Saved addresses could not be loaded.',()=>renderAddresses());}
}
async function saveAddress(event){
 event.preventDefault();const form=event.currentTarget,btn=$('addAddrBtn'),uid=state.uid,edit=state.editAddress;if(btn.disabled)return;btn.disabled=true;feedback('addressFormStatus','');
 try{
  const payload={...addressInput({label:$('newAddrLabel').value,city:$('newAddrCity').value,address:$('newAddrText').value}),updated_at:new Date().toISOString()};
  const q=edit?SB.from('addresses').update(payload).eq('id',edit.id).eq('user_id',uid).eq('updated_at',edit.updated_at):SB.from('addresses').insert({...payload,user_id:uid});
  const {data,error}=await q.select('id').maybeSingle();if(error)throw error;if(!data)throw Error('This address changed elsewhere. Reload addresses before editing again.');
  if(!current(uid,form))return;resetAddressForm();await renderAddresses();feedback('addressFormStatus',edit?'Address updated.':'Address saved.');
 }catch(e){if(current(uid,form))feedback('addressFormStatus',e.message||'Address was not saved. Your input has been kept.',true);}
 finally{if(current(uid,form))btn.disabled=false;}
}
async function addressAction(btn,action){
 const uid=state.uid,id=btn.dataset.addressDefault||btn.dataset.addressDelete,el=$('addrList');if(btn.disabled)return;btn.disabled=true;
 try{
  let result;if(action==='default')result=await SB.rpc('customer_address_default',{p_address:id});
  else {const address=state.addresses.find(a=>a.id===id);result=await SB.from('addresses').delete().eq('id',id).eq('user_id',uid).eq('updated_at',address.updated_at).select('id');if(!result.error&&!result.data?.length)throw Error('Address changed elsewhere. Reload before deleting.');}
  if(result.error)throw result.error;if(!current(uid,el))return;
  if(state.editAddress?.id===id)resetAddressForm();await renderAddresses();feedback('addressStatus',action==='default'?'Default address saved.':'Address deleted.');
 }catch(e){if(current(uid,el))feedback('addressStatus',e.message||'The address was not changed. Please retry.',true);}
 finally{if(current(uid,el))btn.disabled=false;}
}
async function renderWishlist(){
 const el=$('accountWishlist'),uid=state?.uid;if(!el||!uid)return;el.innerHTML='<p class="amut" role="status">Loading your wishlist…</p>';
 try{
  const result=await SB.from('wishlists').select('product_id').eq('user_id',uid);if(result.error)throw result.error;
  const server=productIds((result.data||[]).map(r=>r.product_id));let local=[];
  try{const owner=localStorage.getItem('chaskabox-wishlist-owner');if(!owner||owner===uid)local=productIds(JSON.parse(localStorage.getItem('chaskabox-wishlist')||'[]'));}catch{}
  const ids=productIds([...server,...local]);let products=[];
  if(ids.length){const r=await SB.from('products').select('id,name,price,visibility,stock_state').in('id',ids);if(r.error)throw r.error;products=r.data||[];}
  if(!current(uid,el))return;
  const visible=new Set(products.map(p=>Number(p.id))),toUpload=local.filter(id=>!server.includes(id)&&visible.has(id));
  if(toUpload.length){const saved=await SB.from('wishlists').upsert(toUpload.map(id=>({user_id:uid,product_id:id})),{onConflict:'user_id,product_id'});if(saved.error)throw saved.error;}
  if(!current(uid,el))return;
  localStorage.setItem('chaskabox-wishlist',JSON.stringify(productIds([...server,...toUpload])));localStorage.setItem('chaskabox-wishlist-owner',uid);state.loaded.wishlist=true;
  el.innerHTML=products.length?'<div class="account-wishlist-grid">'+products.map(p=>'<article class="account-wish"><h3><a href="/product/'+Number(p.id)+'/">'+esc(p.name)+'</a></h3><p>'+money(p.price)+' · '+(p.stock_state==='unavailable'?'Currently unavailable':'Current price')+'</p><div class="account-actions"><a class="account-button secondary" href="/product/'+Number(p.id)+'/">View snack</a>'+button('Remove','data-wish-remove="'+Number(p.id)+'"','text-btn')+'</div></article>').join('')+'</div>':empty('Save a little chaska for later','Tap the heart on a snack to save it here.','<a class="account-button secondary" href="/shop/">Browse snacks</a>');
  if(server.some(id=>!visible.has(id)))el.insertAdjacentHTML('beforeend','<p class="account-note">Some saved snacks are no longer listed. Your other favourites are shown above.</p>');
  el.querySelectorAll('[data-wish-remove]').forEach(b=>b.onclick=async()=>{if(b.disabled)return;b.disabled=true;try{const id=Number(b.dataset.wishRemove),r=await SB.from('wishlists').delete().eq('user_id',uid).eq('product_id',id).select('product_id');if(r.error)throw r.error;if(!r.data?.length)throw Error('Wishlist changed elsewhere. Reload and try again.');if(!current(uid,el))return;const next=productIds(JSON.parse(localStorage.getItem('chaskabox-wishlist')||'[]')).filter(n=>n!==id);localStorage.setItem('chaskabox-wishlist',JSON.stringify(next));await renderWishlist();feedback('wishlistStatus','Snack removed from your wishlist.');}catch(e){if(current(uid,el))feedback('wishlistStatus',e.message||'Wishlist was not changed. Please retry.',true);}finally{if(current(uid,el))b.disabled=false;}});
 }catch{if(current(uid,el))retry(el,'Your wishlist could not be synced. Your saved favourites have been kept.',()=>renderWishlist());}
}
async function loadReviews(page=1){
 const el=$('reviewList'),uid=state?.uid;if(!el||!uid)return;const seq=++state.reviewSeq;el.innerHTML='<p class="amut" role="status">Loading reviews…</p>';
 try{
  const {data,error,count}=await SB.from('reviews').select('id,product_id,rating,review_text,moderation_status,created_at,products(name)',{count:'exact'}).eq('user_id',uid).order('created_at',{ascending:false}).order('id',{ascending:false}).range((page-1)*10,page*10-1);
  if(!current(uid,el)||seq!==state.reviewSeq)return;if(error)throw error;state.loaded.reviews=true;
  const labels={published:'Published',pending:'Awaiting review',rejected:'Not published',hidden:'Not published',approved:'Published'},pages=Math.max(1,Math.ceil((count??data?.length??0)/10));
  el.innerHTML=(data||[]).map(r=>{const n=Math.min(5,Math.max(1,Math.round(Number(r.rating)||1)));return '<article class="account-review"><h3>'+esc(r.products?.name||'Snack review')+'</h3><span class="account-stars" aria-label="'+n+' out of 5 stars">'+('★'.repeat(n)+'☆'.repeat(5-n))+'</span> <span class="account-pill">'+esc(labels[r.moderation_status]||'Awaiting review')+'</span><p>'+esc(r.review_text)+'</p><small>'+date(r.created_at)+'</small></article>';}).join('')||empty('No reviews yet','Once an order is delivered, open My orders to review its snacks.');
  if(pages>1){el.insertAdjacentHTML('beforeend','<div class="account-pagination">'+button('Previous','data-review-page="'+(page-1)+'" '+(page<=1?'disabled':''))+'<span>Page '+page+' of '+pages+'</span>'+button('Next','data-review-page="'+(page+1)+'" '+(page>=pages?'disabled':''))+'</div>');el.querySelectorAll('[data-review-page]').forEach(b=>b.onclick=()=>loadReviews(Number(b.dataset.reviewPage)));}
 }catch{if(current(uid,el)&&seq===state.reviewSeq)retry(el,'Your reviews could not be loaded.',()=>loadReviews(page));}
}
