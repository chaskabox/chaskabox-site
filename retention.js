/* Local cart reminders. Unsupported rewards are explicitly paused. */
(function(){
'use strict';

/* ---------- tiny storage helpers ---------- */
function lsGet(k, d){ try{ const v = localStorage.getItem(k); return v==null ? d : JSON.parse(v); }catch(e){ return d; } }
function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
function lsDel(k){ try{ localStorage.removeItem(k); }catch(e){} }
function todayStr(){ return new Date().toISOString().slice(0,10); }

/* ---------- slim dismissible banner (under header) ---------- */
function showSlimBanner(html, id, opts){
  opts = opts || {};
  if(id && lsGet('cb_banner_hide_'+id, '') === todayStr()) return; // dismissed today
  if(document.getElementById('retain-'+id)) return;
  const bar = document.createElement('div');
  bar.className = 'retain-banner' + (opts.cls ? ' '+opts.cls : '');
  bar.id = 'retain-'+id;
  bar.innerHTML = '<div class="retain-inner">'+html
    + '<button class="retain-x" aria-label="Band karein">✕</button></div>';
  const promo = document.querySelector('.promo');
  if(promo && promo.parentNode) promo.parentNode.insertBefore(bar, promo.nextSibling);
  else document.body.insertBefore(bar, document.body.firstChild);
  bar.querySelector('.retain-x').onclick = function(){
    lsSet('cb_banner_hide_'+id, todayStr());
    bar.remove();
  };
}

/* ============================================================
   1. ABANDONED CART RECOVERY
   - records when the user leaves with items in cart
   - on next visit: if 30+ min passed and cart still has items,
     show a friendly nudge (max once per day)
   ============================================================ */
function cartCount(){
  try{
    const c = JSON.parse(localStorage.getItem('chaskabox-cart')||'{}');
    return Object.keys(c).length;
  }catch(e){ return 0; }
}
function markAbandon(){
  if(cartCount() > 0) lsSet('cb_cart_abandoned_at', Date.now());
  else lsDel('cb_cart_abandoned_at');
}
function checkAbandonedCart(){
  const at = lsGet('cb_cart_abandoned_at', 0);
  if(!at) return;
  if(cartCount() === 0){ lsDel('cb_cart_abandoned_at'); return; }
  const THIRTY_MIN = 30*60*1000;
  if(Date.now() - at < THIRTY_MIN) return;
  if(lsGet('cb_nudge_date','') === todayStr()) return; // once per day
  lsSet('cb_nudge_date', todayStr());
  lsDel('cb_cart_abandoned_at'); // only once per abandon cycle
  openCartNudge();
}
function openCartNudge(){
  closeCartNudge();
  const m = document.createElement('div');
  m.className = 'modal open'; m.id = 'cartnudge';
  m.innerHTML =
    '<div class="mbox nudgebox" role="dialog" aria-label="Cart reminder">'
    + '<button class="mclose" onclick="closeCartNudge()">✕</button>'
    + '<div class="nudge-emoji">🛒</div>'
    + '<h3>Bhool gaye? 😊</h3>'
    + '<p>Aapki snack bag abhi bhi wait kar rahi hai!<br><small class="amut">Current price aur delivery fee checkout par confirm karein.</small></p>'
    + '<button class="abtn" onclick="closeCartNudge();openDrawer()">🛒 Complete Order</button>'
    + '<button class="alink" onclick="closeCartNudge()">Baad mein</button> '
    + '<button class="alink danger" onclick="if(confirm(\'Cart clear karein?\')){CART={};saveCart();}closeCartNudge()">Clear cart</button>'
    + '</div>';
  m.addEventListener('click', function(e){ if(e.target===m) closeCartNudge(); });
  document.body.appendChild(m);
}
window.closeCartNudge = function(){ const m=document.getElementById('cartnudge'); if(m) m.remove(); };

/* Weekly pick is owned by app.js so a late retention init cannot replace
   its photo-eligible native product link with a separate renderer. */

/* Rewards require verified ownership, server attribution/ledger, approved rules
   and consent. None is operational. Old client-only codes/DOB are not retained. */
window.CHASKABOX_REWARD_AVAILABILITY=Object.freeze({loyalty:false,referral:false,birthday:false,push:false});
window.saveBirthday=window.copyReferral=window.shareReferralWA=window.enablePush=function(){return false;};
function pauseUnsupportedRewards(){
  for(const key of ['cb_birthday','cb_referral_code','cb_referred_by','cb_referrals','cb_device_id','cb_push_asked'])lsDel(key);
  for(const id of ['retain-push','retain-bday0','retain-bday7'])document.getElementById(id)?.remove();
  try{
    const url=new URL(location.href);
    if(url.searchParams.has('ref')){url.searchParams.delete('ref');history.replaceState(null,'',url.pathname+url.search+url.hash);}
  }catch{}
}

/* ============================================================
   6. REORDER REMINDERS — 7 days after last order
   Uses localStorage 'cb_orders' (guest + logged-in all land there)
   ============================================================ */
function checkReorderReminder(){
  const orders = lsGet('cb_orders', []);
  if(!orders.length) return;
  const last = orders[orders.length-1];
  if(!last || !last.date) return;
  if(!Array.isArray(last.items) || !last.items.some(i=>i && typeof i==='object' && i.id)) return;
  const days = Math.floor((Date.now() - new Date(last.date).getTime()) / 86400000);
  if(days < 7) return;
  const key = 'cb_reorder_shown_' + (last.no || last.date);
  if(lsGet(key, false)) return; // shown once per order
  lsSet(key, true);
  const firstName = (last.items && last.items[0] && last.items[0].name) || 'snacks';
  showSlimBanner('🔁 <b>'+esc(firstName.split('—')[0].split('|')[0].trim().slice(0,28))+' khatam ho gaya?</b> Dobara mangwao — ek click mein!'
    + ' <button class="alink" onclick="reorderLast()">Reorder ›</button>', 'reorder', {});
}
window.reorderLast = function(){
  const orders = lsGet('cb_orders', []);
  const last = orders[orders.length-1];
  if(!last || !Array.isArray(last.items)) return;
  last.items.forEach(function(i){ if(i.id) CART[i.id] = (CART[i.id]||0) + (Number(i.qty)||1); });
  if(typeof saveCart === 'function') saveCart();
  if(typeof openDrawer === 'function') openDrawer();
  const b = document.getElementById('retain-reorder'); if(b) b.remove();
};

/* ============================================================
   INIT
   ============================================================ */
function initRetention(){
  pauseUnsupportedRewards();

  checkAbandonedCart();
  checkReorderReminder();

  // track abandon when leaving the page with items in cart
  window.addEventListener('pagehide', markAbandon);
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'hidden') markAbandon();
  });
}

/* run after the main app is ready (products loaded) */
function retentionProductsReady(){
  try{ return (typeof activeProducts === 'function') && (typeof PRODUCTS !== 'undefined') && PRODUCTS.length > 0; }
  catch(e){ return false; }
}
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', function(){
    if(retentionProductsReady()) initRetention();
    else {
      // wait for products (app.js loads them async)
      let tries = 0;
      const t = setInterval(function(){
        tries++;
        if(retentionProductsReady() || tries > 40){ clearInterval(t); initRetention(); }
      }, 250);
    }
  });
}else{
  initRetention();
}

})();
