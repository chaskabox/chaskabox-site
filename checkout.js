/* ChaskaBox checkout logic — V3 review build */
let DELIVERY_FEE = 300;
let PREPAID_DELIVERY_FEE = 300;
let FREE_ABOVE = 5000;
const PREPAID_METHODS = new Set(['jazzcash','bank_transfer']);
const PAYMENT_LABELS = {
  cod: 'Cash on Delivery',
  jazzcash: 'JazzCash (Advance)',
  bank_transfer: 'Bank Transfer (Advance)'
};
let PRODUCTS = [], CART = {}, PAY = 'cod', placingOrder = false;
let PAYMENT_ENABLED = {cod:true,jazzcash:true,bank_transfer:true};
const $ = s => document.querySelector(s);
const fmt = n => 'Rs. ' + Number(n).toLocaleString('en-PK');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function init() {
  try {
    if(typeof window.chaskaTrack==='function') window.chaskaTrack('checkout_start',{});
    const cfg = await fetch('/api/storefront-config', {cache:'no-cache'}).then(r=>r.ok?r.json():null);
    const st = cfg?.settings || {};
    const settingNumber = (value, fallback) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };
    DELIVERY_FEE = settingNumber(st.cod_delivery_fee_pkr, 300);
    PREPAID_DELIVERY_FEE = settingNumber(st.prepaid_delivery_fee_pkr, 300);
    FREE_ABOVE = settingNumber(st.prepaid_free_delivery_threshold_pkr, 5000);
    PAYMENT_ENABLED = {
      cod: st.cod_enabled !== false,
      jazzcash: st.jazzcash_enabled !== false,
      bank_transfer: st.bank_transfer_enabled !== false
    };
    document.querySelectorAll('[data-dynamic-delivery]').forEach(el=>el.textContent='Rs. '+DELIVERY_FEE.toLocaleString('en-PK'));
    document.querySelectorAll('[data-dynamic-threshold]').forEach(el=>el.textContent='Rs. '+FREE_ABOVE.toLocaleString('en-PK'));
    applyPaymentAvailability(st);
  } catch(e){}
  try { CART = JSON.parse(localStorage.getItem('chaskabox-cart') || '{}'); } catch (e) { CART = {}; }
  try {
    let loaded=null;
    for (const url of ['/api/products?fresh=1','/products.json']) {
      try { const r=await fetch(url,{cache:'no-cache'}); if(!r.ok) throw new Error('HTTP '+r.status); const rows=await r.json(); if(Array.isArray(rows)){loaded=rows;break;} } catch(e) {}
    }
    if(!loaded) throw new Error('Could not load product catalogue');
    PRODUCTS=loaded;
  } catch (e) {
    showOrderError('We could not load the current product catalogue.', () => location.reload());
    return;
  }

  if (!Object.keys(CART).length) {
    $('#coMain').innerHTML = '<div class="co-card"><div class="empty">Your bag is empty.<br><br><a class="cta" href="/shop/">← Back to shop</a></div></div>';
    return;
  }

  document.querySelectorAll('input[name="pay"]').forEach(radio => {
    radio.addEventListener('change', e => setPay(e.target.value));
  });
  $('#placeBtn')?.addEventListener('click', placeOrder);
  $('#copyBankBtn')?.addEventListener('click', copyBankAccount);
  $('#f_phone')?.addEventListener('blur', () => { $('#f_phone').value = normalizePhone($('#f_phone').value); });

  const fv = $('#f_video');
  if (fv) fv.addEventListener('change', () => $('#videoOpt').classList.toggle('sel', fv.checked));

  renderSummary();
  // prefillFromAccount removed - autofillCustomerDetails handles it
  // Init completed: enable Place Order (it starts disabled in HTML).
  // applyPaymentAvailability() may have disabled it when no payment method
  // is enabled — respect that and keep it disabled in that case.
  const placeBtnEl = document.getElementById('placeBtn');
  if (placeBtnEl && Object.values(PAYMENT_ENABLED).some(Boolean)) placeBtnEl.disabled = false;
}



function applyPaymentAvailability(settings={}) {
  const map={cod:'pay_cod',jazzcash:'pay_jazz',bank_transfer:'pay_bank'};
  for(const [method,id] of Object.entries(map)){
    const label=document.getElementById(id); const radio=label?.querySelector('input[name="pay"]');
    const enabled=PAYMENT_ENABLED[method] !== false;
    if(label){ label.hidden=!enabled; label.setAttribute('aria-hidden', enabled?'false':'true'); }
    if(radio) radio.disabled=!enabled;
  }
  const enabledMethods=Object.keys(map).filter(k=>PAYMENT_ENABLED[k]);
  if(!enabledMethods.length){
    showOrderError('Ordering is temporarily unavailable because no payment method is enabled. Please contact ChaskaBox.');
    const b=document.getElementById('placeBtn'); if(b) b.disabled=true;
    return;
  }
  if(!PAYMENT_ENABLED[PAY]) setPay(enabledMethods[0]);
  const till=String(settings.jazzcash_till_id||'').trim();
  const qr=String(settings.jazzcash_qr_url||'').trim();
  const tillEl=document.querySelector('#jazzBox .tillid'); if(tillEl&&till)tillEl.textContent='Till ID: '+till;
  const qrEl=document.querySelector('#jazzBox img'); if(qrEl&&qr){qrEl.src=qr;qrEl.alt='JazzCash payment QR code';}
  const bank=settings.bank_transfer_details;
  if(bank && typeof bank==='object'){
    const card=document.querySelector('#bankBox .bank-card');
    const rows=card?.querySelectorAll('div');
    if(rows?.[0] && bank.bank) rows[0].querySelector('strong').textContent=bank.bank;
    if(rows?.[1] && bank.account_title) rows[1].querySelector('strong').textContent=bank.account_title;
    if(rows?.[2] && bank.account_number) rows[2].querySelector('strong').textContent=bank.account_number;
  }
}

function productById(id){ return PRODUCTS.find(x => x.id == id); }
function cartSubtotal() {
  return Object.entries(CART).reduce((s, [id, q]) => {
    const p = productById(id);
    return s + (p ? Number(p.price) * Number(q) : 0);
  }, 0);
}
function isPrepaid(){ return PREPAID_METHODS.has(PAY); }
function deliveryFee(sub) { return isPrepaid() ? (sub >= FREE_ABOVE ? 0 : PREPAID_DELIVERY_FEE) : DELIVERY_FEE; }

function setPay(method) {
  const allowed=['cod','jazzcash','bank_transfer'];
  if (!allowed.includes(method) || PAYMENT_ENABLED[method] === false) {
    method = allowed.find(m=>PAYMENT_ENABLED[m]) || 'cod';
  }
  PAY = method;
  $('#pay_cod')?.classList.toggle('sel', method === 'cod');
  $('#pay_jazz')?.classList.toggle('sel', method === 'jazzcash');
  $('#pay_bank')?.classList.toggle('sel', method === 'bank_transfer');
  if ($('#jazzBox')) $('#jazzBox').hidden = method !== 'jazzcash';
  if ($('#bankBox')) $('#bankBox').hidden = method !== 'bank_transfer';
  if ($('#prepaidRef')) $('#prepaidRef').hidden = !isPrepaid();
  if (!isPrepaid() && $('#f_reference')) $('#f_reference').value = '';
  renderSummary();
}

function renderSummary() {
  const box = $('#coItems');
  if (!box) return;
  box.innerHTML = Object.entries(CART).map(([id, q]) => {
    const p = productById(id); if (!p) return '';
    const img = p.img ? `<img src="/${String(p.img).replace(/^\//,'')}" alt="" class="summary-thumb">` : '🍪';
    return `<div class="sumrow"><span class="sum-product">${img}<span>${esc(p.name)} <small>× ${Number(q)}</small></span></span><span>${fmt(Number(p.price) * Number(q))}</span></div>`;
  }).join('');
  const sub = cartSubtotal(), del = deliveryFee(sub);
  const loyalDisc = window._loyaltyDiscount || 0;
  $('#s_sub').textContent = fmt(sub);
  $('#s_del').innerHTML = del === 0 ? '<span class="free">FREE</span>' : fmt(del);
  const loyalRow = $('#loyaltyRow');
  if(loyalRow){
    loyalRow.hidden = !loyalDisc;
    $('#s_loyal').textContent = '-' + fmt(loyalDisc);
  }
  $('#s_tot').textContent = fmt(Math.max(0, sub + del - loyalDisc));
  const hint = $('#freeHint');
  if (!hint) return;
  if (isPrepaid() && sub < FREE_ABOVE) {
    hint.hidden = false;
    hint.innerHTML = `💡 Add <b>${fmt(FREE_ABOVE - sub)}</b> more to unlock <b>FREE prepaid delivery</b> and save ${fmt(PREPAID_DELIVERY_FEE)}.`;
  } else if (isPrepaid()) {
    hint.hidden = false;
    hint.innerHTML = '🎉 <b>FREE prepaid delivery unlocked.</b>';
  } else {
    hint.hidden = true;
  }
}

function getFullPhone(){
  const ccode = $('#f_ccode')?.value || '+92';
  const digits = String($('#f_phone')?.value || '').replace(/\D/g, '');
  return {ccode, digits, full: ccode + digits};
}
function normalizePhone(v) {
  // v is now just digits, ccode from dropdown
  const d = String(v||'').replace(/\D/g,'').slice(0,15);
  return d;
}
function phoneDigits(v){ return String(v||'').replace(/\D/g,'').slice(0,15); }
function validPhone(v) {
  const ccode = $('#f_ccode')?.value || '+92';
  const d = phoneDigits(v);
  if(ccode === '+92'){
    // Strict Pakistan validation
    if(d.length === 11 && d.startsWith('03')) {
      const prefix = d.slice(0, 4);
      const validPrefixes = ['0300','0301','0302','0303','0304','0305','0306','0307','0308','0309',
        '0310','0311','0312','0313','0314','0315','0316','0317','0318','0319',
        '0320','0321','0322','0323','0324','0325','0326','0327','0328','0329',
        '0330','0331','0332','0333','0334','0335','0336','0337','0338','0339',
        '0340','0341','0342','0343','0344','0345','0346','0347','0348','0349',
        '0355','0360'];
      return validPrefixes.includes(prefix);
    }
    // Allow 10 digits starting with 3 (without leading 0)
    if(d.length === 10 && d.startsWith('3')) return true;
    return false;
  }
  // Other countries: lenient (7-15 digits)
  return d.length >= 7 && d.length <= 15;
}
function validEmail(v) {
  v = String(v||'').trim();
  if(!v) return true; // Email is optional
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v);
}

function checkForm() {
  let ok = true;
  // Combine first + last into full name for backend compat
  const fname = ($('#f_fname')?.value || '').trim();
  const lname = ($('#f_lname')?.value || '').trim();
  const fullName = (fname + ' ' + lname).trim();
  const nameInput = $('#f_name');
  if(nameInput) nameInput.value = fullName;
  const need = [
    ['f_fname','e_fname',v=>v.trim().length>=2],
    ['f_lname','e_lname',v=>v.trim().length>=2],
    ['f_phone','e_phone',validPhone],
    ['f_email','e_email',validEmail],
    ['f_addr','e_addr',v=>v.trim().length>=8],
    ['f_city','e_city',v=>v.trim().length>=2]
  ];
  need.forEach(([f,e,fn]) => {
    const good = fn($('#'+f)?.value || '');
    if ($('#'+e)) $('#'+e).style.display = good ? 'none' : 'block';
    if ($('#'+f)) { $('#'+f).setAttribute('aria-invalid', good ? 'false' : 'true'); $('#'+f).setAttribute('aria-describedby', e); }
    if(!good) ok=false;
  });
  if (isPrepaid()) {
    const refGood = ($('#f_reference')?.value || '').trim().length >= 4;
    if ($('#e_reference')) $('#e_reference').style.display = refGood ? 'none' : 'block';
    if (!refGood) ok = false;
  } else if ($('#e_reference')) $('#e_reference').style.display = 'none';
  return ok;
}

function orderNo() {
  const now = new Date(Date.now() + (5*60)*60000 + new Date().getTimezoneOffset()*60000);
  const dd = String(now.getDate()).padStart(2,'0'), mm = String(now.getMonth()+1).padStart(2,'0'), yy = String(now.getFullYear()).slice(2);
  const rnd = String(Math.floor(10000 + Math.random()*90000));
  return `CB-${dd}${mm}${yy}-${rnd}`;
}

function showOrderError(message, retryFn){
  const el = $('#orderError');
  if (!el) return;
  el.textContent = '';
  const span = document.createElement('span');
  span.textContent = message;
  el.appendChild(span);
  if (typeof retryFn === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cta';
    btn.style.marginLeft = '12px';
    btn.textContent = 'Try Again';
    btn.addEventListener('click', () => { clearOrderError(); retryFn(); });
    el.appendChild(btn);
  }
  el.hidden = false;
  el.scrollIntoView({behavior:'smooth',block:'center'});
}
function clearOrderError(){ if ($('#orderError')) { $('#orderError').hidden = true; $('#orderError').textContent=''; } }

async function copyBankAccount(){
  const value = $('#bankAccount')?.textContent?.trim() || '';
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    const b = $('#copyBankBtn'); if (b) { const old=b.textContent; b.textContent='Copied ✓'; setTimeout(()=>b.textContent=old,1600); }
  } catch(e) {
    window.prompt('Copy account number:', value);
  }
}

async function placeOrderViaAPI(payload) {
  // Server-authoritative order creation via Cloudflare Function.
  // Returns {ok, data} — data is the API response on success.
  try {
    const headers = { 'Content-Type': 'application/json' };
    try {
      if (typeof initSupabase === 'function' && await initSupabase() && SB) {
        const { data } = await SB.auth.getSession();
        if (data?.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
      }
    } catch(e){}
    const res = await fetch('/api/orders', { method: 'POST', headers, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, data };
    // Surface validation errors clearly
    const msg = data?.error?.message || 'Order could not be placed. Please try again.';
    return { ok: false, error: msg, details: data?.error?.details };
  } catch (e) {
    return { ok: false, error: 'Network error. Please check your connection and try again.' };
  }
}

function uuidv4() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  const a=new Uint8Array(16); crypto.getRandomValues(a); a[6]=(a[6]&15)|64; a[8]=(a[8]&63)|128;
  return [...a].map((b,i)=>(i===4||i===6||i===8||i===10?'-':'')+b.toString(16).padStart(2,'0')).join('');
}


function saveLocalPurchaseSummary(order){
  // Intentionally excludes customer name, phone and address. This supports reorder UX without persisting PII.
  try {
    const orders = JSON.parse(localStorage.getItem('cb_orders')||'[]');
    orders.push({
      no:order.no,
      date:new Date().toISOString(),
      items:order.items,
      sub:order.sub,
      del:order.del,
      total:order.total,
      pay:PAYMENT_LABELS[PAY],
      payment_status:isPrepaid()?'awaiting_verification':'pending',
      video:order.video
    });
    localStorage.setItem('cb_orders', JSON.stringify(orders.slice(-10)));
  } catch(e){}
}

function celebrateOrder(){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer=document.createElement('div'); layer.className='order-confetti'; layer.setAttribute('aria-hidden','true');
  const colors=['#1a2b5c','#c62828','#f2b705','#2a9d8f','#e8722a'];
  for(let i=0;i<18;i++){
    const bit=document.createElement('i');
    bit.style.setProperty('--x',(6+Math.random()*88).toFixed(1)+'%');
    bit.style.setProperty('--c',colors[i%colors.length]);
    bit.style.setProperty('--r',(Math.random()*180-90).toFixed(0)+'deg');
    bit.style.setProperty('--d',(1.15+Math.random()*.7).toFixed(2)+'s');
    bit.style.setProperty('--delay',(Math.random()*.22).toFixed(2)+'s');
    bit.style.setProperty('--drift',((Math.random()-.5)*120).toFixed(0)+'px');
    layer.appendChild(bit);
  }
  document.body.appendChild(layer);
  setTimeout(()=>layer.remove(),2200);
}

async function placeOrder() {
  if (placingOrder) return;
  clearOrderError();
  if (!checkForm()) {
    document.querySelector('.err[style=""]')?.closest('.field')?.querySelector('input,textarea')?.focus();
    window.scrollTo({top:0,behavior:'smooth'});
    return;
  }

  const btn = $('#placeBtn'); placingOrder = true; btn.disabled = true; btn.textContent = 'Placing order...';
  const sub = cartSubtotal(), del = deliveryFee(sub), total = sub + del;
  const ono = orderNo();
  const itemRows = Object.entries(CART).map(([id,q]) => {
    const p = productById(id)||{};
    return {id:Number(id),name:p.name||'',pack:p.pack||'',price:Number(p.price)||0,qty:Number(q)};
  }).filter(i=>i.name && i.qty>0);

  if (!itemRows.length) {
    showOrderError('Your bag no longer contains valid products. Please return to the shop and try again.');
    placingOrder=false; btn.disabled=false; btn.textContent='Place Order →'; return;
  }

  const items = itemRows.map(i => `${i.name} (${i.pack}) × ${i.qty} = Rs. ${(i.price*i.qty).toLocaleString('en-PK')}`);
  const payLabel = PAYMENT_LABELS[PAY];
  const reference = isPrepaid() ? ($('#f_reference').value.trim()) : '';
  const wantVideo = !!$('#f_video')?.checked;
  const note = ($('#f_note')?.value || '').trim();
  const _ph = getFullPhone();
  let phone;
  if(_ph.ccode === '+92'){
    let d = phoneDigits($('#f_phone').value);
    // Normalize: 3013085381 (10 digits) -> 03013085381 (11 digits)
    if(d.length === 10 && d.startsWith('3')) d = '0' + d;
    phone = d;
  } else {
    phone = _ph.full;
  }
  const turnstileToken = (typeof turnstile !== 'undefined' && turnstile.getResponse) ? turnstile.getResponse() : '';

  // Build server-authoritative API payload (contract §4).
  // Prices/totals are IGNORED by the server — it recalculates from the DB.
  const apiPayload = {
    idempotency_key: uuidv4(),
    items: itemRows.map(i => ({ product_id: i.id, qty: i.qty })),
    customer: {
      name: $('#f_name').value.trim(),
      phone: phone,
      email: $('#f_email').value.trim() || undefined,
      address: $('#f_addr').value.trim(),
      city: $('#f_city').value.trim()
    },
    payment_method: PAY === 'cod' ? 'cod' : (PAY === 'jazzcash' ? 'jazzcash' : 'bank_transfer'),
    transaction_reference: reference,
    turnstile_token: turnstileToken,
    customer_note: (wantVideo ? (note ? note + ' ' : '') + '[Packing video requested]' : note) || undefined,
    loyalty_phone: window._loyaltyPhone || undefined,
    loyalty_points: window._loyaltyDiscount || 0
  };

  // Server-authoritative order creation. Cart is cleared ONLY on API success.
  const apiResult = await placeOrderViaAPI(apiPayload);

  if (!apiResult.ok) {
    showOrderError(apiResult.error || 'We could not safely record your order. Your bag has NOT been cleared. Please retry, or WhatsApp 0332-0005381 for help.');
    placingOrder = false; btn.disabled = false; btn.textContent = 'Place Order →';
    return;
  }

  // Success — use server-returned order number and total (authoritative).
  const srv = apiResult.data;
  const finalOrderNo = srv.order_number || ono;
  const finalTotal = typeof srv.total === 'number' ? srv.total : total;

  const order = {
    no: finalOrderNo, name: $('#f_name').value.trim(), phone,
    addr: $('#f_addr').value.trim(), city: $('#f_city').value.trim(),
    items: itemRows, sub, del, total: finalTotal,
    pay_method: PAY === 'cod' ? 'COD' : (PAY === 'jazzcash' ? 'JazzCash' : 'Bank Transfer'),
    payment_reference: reference, video: wantVideo, note,
    payment_status: srv.payment_status, fulfilment_status: srv.fulfilment_status
  };

  saveLocalPurchaseSummary(order);
  // Save customer details for autofill (profile if logged in, localStorage if guest)
  saveCustomerDetails({
    name: $('#f_name').value.trim(),
    phone: normalizePhone($('#f_phone').value),
    email: $('#f_email').value.trim(),
    address: $('#f_addr').value.trim(),
    city: $('#f_city').value.trim()
  });
  CART = {}; localStorage.removeItem('chaskabox-cart'); localStorage.removeItem('chaskabox-cart-ts');
  $('#coMain').style.display = 'none'; $('#coDone').style.display = '';
  $('#doneNo').textContent = finalOrderNo;
  if ($('#doneTotal')) $('#doneTotal').textContent = fmt(finalTotal);
  if ($('#donePayment')) $('#donePayment').textContent = PAYMENT_LABELS[PAY] || PAY;
  if ($('#doneStatus')) $('#doneStatus').textContent = isPrepaid() ? 'Awaiting payment verification' : 'Order received · COD pending';
  if ($('#doneWhatsApp')) $('#doneWhatsApp').href = 'https://wa.me/923320005381?text=' + encodeURIComponent('Salam ChaskaBox, I need help with order '+finalOrderNo);
  const track = document.getElementById('doneTrack'); if (track) track.href = '/track-order.html?order=' + encodeURIComponent(finalOrderNo) + '&phone=' + encodeURIComponent(phone);

  if (PAY === 'cod') {
    $('#doneMsg').innerHTML = `We'll contact <b>${esc(phone)}</b> if confirmation is needed, then prepare your order for dispatch. Amount due on delivery: <b>${fmt(finalTotal)}</b>.`;
  } else if (PAY === 'jazzcash') {
    $('#doneMsg').innerHTML = `Your JazzCash reference <b>${esc(reference)}</b> has been submitted for verification. Amount: <b>${fmt(finalTotal)}</b>. We'll prepare the order after payment is verified.`;
  } else {
    $('#doneMsg').innerHTML = `Your bank-transfer reference <b>${esc(reference)}</b> has been submitted for verification. Amount: <b>${fmt(finalTotal)}</b>. We'll prepare the order after payment is verified.`;
  }
  if (wantVideo) $('#doneMsg').innerHTML += '<br><br>🎬 <b>Packing video requested.</b> We will try to send a short clip on WhatsApp if operations allow.';
  if(typeof window.chaskaTrack==='function') window.chaskaTrack('order_complete',{total:finalTotal,payment:payMethod});
  celebrateOrder();
  // Offer account creation to guest customers (optional, never mandatory)
  if(typeof ACCOUNT_SESSION !== 'undefined' && !ACCOUNT_SESSION && typeof openAuthModal === 'function'){
    const offerEl = document.getElementById('doneAccountOffer');
    if(offerEl){
      offerEl.style.display = '';
      offerEl.querySelector('button').onclick = () => openAuthModal('signup');
    }
  }
  window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}

document.addEventListener('DOMContentLoaded', init);

/* ---------- Loyalty points ---------- */
window._loyaltyDiscount = 0;
window._loyaltyPhone = '';
document.addEventListener('DOMContentLoaded', () => {
  const checkBtn = document.getElementById('loyalCheck');
  const applyBtn = document.getElementById('loyalApply');
  if(!checkBtn) return;
  checkBtn.addEventListener('click', async () => {
    const phone = document.getElementById('loyalPhone').value.trim();
    const msg = document.getElementById('loyalMsg');
    if(!phone){ msg.textContent = 'Please enter your phone number.'; return; }
    msg.textContent = 'Checking…';
    try{
      const r = await fetch(`/api/loyalty?phone=${encodeURIComponent(phone)}`);
      const d = await r.json();
      if(!r.ok) throw new Error(d?.error?.message || 'Error');
      if(d.points > 0){
        msg.textContent = `You have ${d.points} points = Rs. ${d.points} off!`;
        applyBtn.style.display = '';
        applyBtn.dataset.points = d.points;
        applyBtn.dataset.phone = d.phone;
        applyBtn.textContent = `Apply ${d.points} points (Rs. ${d.points} off)`;
      } else {
        msg.textContent = 'No points yet. Points are earned on every order!';
        applyBtn.style.display = 'none';
      }
    }catch(e){ msg.textContent = 'Could not check points. Try again.'; }
  });
  applyBtn.addEventListener('click', () => {
    const pts = Number(applyBtn.dataset.points || 0);
    if(pts <= 0) return;
    window._loyaltyDiscount = pts;
    window._loyaltyPhone = applyBtn.dataset.phone || '';
    document.getElementById('loyalMsg').textContent = `✓ ${pts} points applied (Rs. ${pts} off)`;
    applyBtn.style.display = 'none';
    if(typeof renderSummary === 'function') renderSummary();
    else location.reload();
  });
});

/* ============ CUSTOMER DETAILS SAVE & AUTOFILL ============ */
async function saveCustomerDetails(d){
  // Only save if user checked "Save this information"
  const saveChecked = $('#f_saveinfo')?.checked !== false;
  if(!saveChecked) return;
  // Save to localStorage for autofill (guests)
  try {
    localStorage.setItem('cb_customer', JSON.stringify(d));
  } catch(e){}
  // Save to profile if logged in
  try {
    if(typeof ACCOUNT_SESSION !== 'undefined' && ACCOUNT_SESSION && typeof SB !== 'undefined' && SB){
      const uid = ACCOUNT_SESSION.user.id;
      await SB.from('profiles').upsert({
        id: uid,
        name: d.name,
        phone: d.phone,
        updated_at: new Date().toISOString()
      });
    }
  } catch(e){}
}

async function autofillCustomerDetails(){
  const fillName = (fullName) => {
    if(!fullName) return;
    const parts = fullName.trim().split(/\s+/);
    if($('#f_fname') && !$('#f_fname').value) $('#f_fname').value = parts[0] || '';
    if($('#f_lname') && !$('#f_lname').value) $('#f_lname').value = parts.slice(1).join(' ') || '';
    if($('#f_name')) $('#f_name').value = fullName;
  };
  // Logged in? Use profile + default address
  try {
    if(typeof ACCOUNT_SESSION !== 'undefined' && ACCOUNT_SESSION && typeof SB !== 'undefined' && SB){
      const uid = ACCOUNT_SESSION.user.id;
      const [{data: profile}, {data: addrs}] = await Promise.all([
        SB.from('profiles').select('name,phone').eq('id', uid).maybeSingle(),
        SB.from('addresses').select('address,city').eq('user_id', uid).eq('is_default', true).maybeSingle()
      ]);
      if(profile?.name) fillName(profile.name);
      if(profile?.phone && $('#f_phone') && !$('#f_phone').value) $('#f_phone').value = profile.phone;
      if(ACCOUNT_SESSION.user.email && $('#f_email') && !$('#f_email').value) $('#f_email').value = ACCOUNT_SESSION.user.email;
      if(addrs){
        if($('#f_addr') && !$('#f_addr').value) $('#f_addr').value = addrs.address || '';
        if($('#f_city') && !$('#f_city').value) $('#f_city').value = addrs.city || '';
      }
      return;
    }
  } catch(e){}
  // Guest? Use localStorage
  try {
    const saved = JSON.parse(localStorage.getItem('cb_customer')||'{}');
    if(saved.name) fillName(saved.name);
    if(saved.phone && $('#f_phone') && !$('#f_phone').value) $('#f_phone').value = saved.phone;
    if(saved.email && $('#f_email') && !$('#f_email').value) $('#f_email').value = saved.email;
    if(saved.address && $('#f_addr') && !$('#f_addr').value) $('#f_addr').value = saved.address;
    if(saved.city && $('#f_city') && !$('#f_city').value) $('#f_city').value = saved.city;
  } catch(e){}
}

// Auto-fill on page load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(autofillCustomerDetails, 500);
});

/* ============ COUNTRY CODES ============ */
const COUNTRY_CODES = [["AF","🇦🇫","+93"],["AL","🇦🇱","+355"],["DZ","🇩🇿","+213"],["US","🇺🇸","+1"],["AD","🇦🇩","+376"],["AO","🇦🇴","+244"],["AR","🇦🇷","+54"],["AM","🇦🇲","+374"],["AU","🇦🇺","+61"],["AT","🇦🇹","+43"],["AZ","🇦🇿","+994"],["BH","🇧🇭","+973"],["BD","🇧🇩","+880"],["BY","🇧🇾","+375"],["BE","🇧🇪","+32"],["BZ","🇧🇿","+501"],["BJ","🇧🇯","+229"],["BT","🇧🇹","+975"],["BO","🇧🇴","+591"],["BA","🇧🇦","+387"],["BW","🇧🇼","+267"],["BR","🇧🇷","+55"],["BN","🇧🇳","+673"],["BG","🇧🇬","+359"],["BF","🇧🇫","+226"],["BI","🇧🇮","+257"],["KH","🇰🇭","+855"],["CM","🇨🇲","+237"],["CA","🇨🇦","+1"],["CV","🇨🇻","+238"],["CF","🇨🇫","+236"],["TD","🇹🇩","+235"],["CL","🇨🇱","+56"],["CN","🇨🇳","+86"],["CO","🇨🇴","+57"],["KM","🇰🇲","+269"],["CG","🇨🇬","+242"],["CD","🇨🇩","+243"],["CK","🇨🇰","+682"],["CR","🇨🇷","+506"],["HR","🇭🇷","+385"],["CU","🇨🇺","+53"],["CY","🇨🇾","+357"],["CZ","🇨🇿","+420"],["DK","🇩🇰","+45"],["DJ","🇩🇯","+253"],["EC","🇪🇨","+593"],["EG","🇪🇬","+20"],["SV","🇸🇻","+503"],["GQ","🇬🇶","+240"],["ER","🇪🇷","+291"],["EE","🇪🇪","+372"],["ET","🇪🇹","+251"],["FJ","🇫🇯","+679"],["FI","🇫🇮","+358"],["FR","🇫🇷","+33"],["GA","🇬🇦","+241"],["GM","🇬🇲","+220"],["GE","🇬🇪","+995"],["DE","🇩🇪","+49"],["GH","🇬🇭","+233"],["GR","🇬🇷","+30"],["GT","🇬🇹","+502"],["GN","🇬🇳","+224"],["GW","🇬🇼","+245"],["GY","🇬🇾","+592"],["HT","🇭🇹","+509"],["HN","🇭🇳","+504"],["HU","🇭🇺","+36"],["IS","🇮🇸","+354"],["IN","🇮🇳","+91"],["ID","🇮🇩","+62"],["IR","🇮🇷","+98"],["IQ","🇮🇶","+964"],["IE","🇮🇪","+353"],["IL","🇮🇱","+972"],["IT","🇮🇹","+39"],["CI","🇨🇮","+225"],["JP","🇯🇵","+81"],["JO","🇯🇴","+962"],["KZ","🇰🇿","+7"],["KE","🇰🇪","+254"],["KI","🇰🇮","+686"],["KW","🇰🇼","+965"],["KG","🇰🇬","+996"],["LA","🇱🇦","+856"],["LV","🇱🇻","+371"],["LB","🇱🇧","+961"],["LS","🇱🇸","+266"],["LR","🇱🇷","+231"],["LY","🇱🇾","+218"],["LI","🇱🇮","+423"],["LT","🇱🇹","+370"],["LU","🇱🇺","+352"],["MK","🇲🇰","+389"],["MG","🇲🇬","+261"],["MW","🇲🇼","+265"],["MY","🇲🇾","+60"],["MV","🇲🇻","+960"],["ML","🇲🇱","+223"],["MT","🇲🇹","+356"],["MH","🇲🇭","+692"],["MR","🇲🇷","+222"],["MU","🇲🇺","+230"],["MX","🇲🇽","+52"],["MD","🇲🇩","+373"],["MC","🇲🇨","+377"],["MN","🇲🇳","+976"],["ME","🇲🇪","+382"],["MA","🇲🇦","+212"],["MZ","🇲🇿","+258"],["MM","🇲🇲","+95"],["NA","🇳🇦","+264"],["NR","🇳🇷","+674"],["NP","🇳🇵","+977"],["NL","🇳🇱","+31"],["NZ","🇳🇿","+64"],["NI","🇳🇮","+505"],["NE","🇳🇪","+227"],["NG","🇳🇬","+234"],["KP","🇰🇵","+850"],["NO","🇳🇴","+47"],["OM","🇴🇲","+968"],["PK","🇵🇰","+92"],["PS","🇵🇸","+970"],["PA","🇵🇦","+507"],["PY","🇵🇾","+595"],["PE","🇵🇪","+51"],["PH","🇵🇭","+63"],["PL","🇵🇱","+48"],["PT","🇵🇹","+351"],["QA","🇶🇦","+974"],["RO","🇷🇴","+40"],["RU","🇷🇺","+7"],["RW","🇷🇼","+250"],["SA","🇸🇦","+966"],["SN","🇸🇳","+221"],["RS","🇷🇸","+381"],["SC","🇸🇨","+248"],["SL","🇸🇱","+232"],["SG","🇸🇬","+65"],["SK","🇸🇰","+421"],["SI","🇸🇮","+386"],["SB","🇸🇧","+677"],["SO","🇸🇴","+252"],["ZA","🇿🇦","+27"],["KR","🇰🇷","+82"],["SS","🇸🇸","+211"],["ES","🇪🇸","+34"],["LK","🇱🇰","+94"],["SD","🇸🇩","+249"],["SR","🇸🇷","+597"],["SZ","🇸🇿","+268"],["SE","🇸🇪","+46"],["CH","🇨🇭","+41"],["SY","🇸🇾","+963"],["TW","🇹🇼","+886"],["TJ","🇹🇯","+992"],["TZ","🇹🇿","+255"],["TH","🇹🇭","+66"],["TG","🇹🇬","+228"],["TO","🇹🇴","+676"],["TN","🇹🇳","+216"],["TR","🇹🇷","+90"],["TM","🇹🇲","+993"],["TV","🇹🇻","+688"],["UG","🇺🇬","+256"],["UA","🇺🇦","+380"],["AE","🇦🇪","+971"],["GB","🇬🇧","+44"],["UY","🇺🇾","+598"],["UZ","🇺🇿","+998"],["VU","🇻🇺","+678"],["VE","🇻🇪","+58"],["VN","🇻🇳","+84"],["YE","🇾🇪","+967"],["ZM","🇿🇲","+260"],["ZW","🇿🇼","+263"]];
function populateCountryCodes(){
  const sel = document.getElementById('f_ccode');
  if(!sel) return;
  const seen = new Set(['+92']);
  COUNTRY_CODES.forEach(([cc, flag, code]) => {
    if(seen.has(code)) return;
    seen.add(code);
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = `${flag} ${code}`;
    sel.appendChild(opt);
  });
}
document.addEventListener('DOMContentLoaded', populateCountryCodes);
