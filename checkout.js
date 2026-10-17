/* ChaskaBox checkout logic — V3 review build */
let DELIVERY_FEE = 300;
let PREPAID_DELIVERY_FEE = 300;
let FREE_ABOVE = 5000;
let FREE_PREPAID_ENABLED = true;
const PREPAID_METHODS = new Set(['jazzcash','bank_transfer']);
const PAYMENT_LABELS = {
  cod: 'Cash on Delivery',
  jazzcash: 'JazzCash (Advance)',
  bank_transfer: 'Bank Transfer (Advance)'
};
let PRODUCTS = [], CART = {}, PAY = 'cod', placingOrder = false;
let PAYMENT_ENABLED = {cod:true,jazzcash:true,bank_transfer:true};
let checkoutStep = 1, furthestCheckoutStep = 1, checkoutNavigating = false;
let checkoutTurnstileWidgetId = null;
const CHECKOUT_REGIONS = Object.freeze(['Punjab','Sindh','Khyber Pakhtunkhwa','Balochistan','Islamabad','Azad Kashmir','Gilgit Baltistan']);
let checkoutSelectedRegion = '';
const $ = s => document.querySelector(s);
const fmt = n => 'Rs. ' + Number(n).toLocaleString('en-PK');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const CHECKOUT_INTENT_KEY = 'chaskabox-checkout-intent-v1';
let pendingCheckoutIntent = null;
function trackCheckoutEvent(name, data) {
  try { const result = window.chaskaTrack?.(name, data); if (result?.catch) result.catch(() => {}); }
  catch { /* Analytics must not interrupt checkout. */ }
}
function checkoutAssetUrl(value) {
  const src=String(value||'');
  return /^(?:https?:\/\/|\/)/i.test(src)?src:'/'+src.replace(/^\.\//,'');
}
async function checkoutIdempotencyKey(payload) {
  const intent={
    items:payload.items.map(i=>({product_id:Number(i.product_id),qty:Number(i.qty)})).sort((a,b)=>a.product_id-b.product_id),
    customer:{
      name:String(payload.customer.name||'').trim(), phone:String(payload.customer.phone||'').replace(/\D/g,''),
      email:String(payload.customer.email||'').trim().toLowerCase(), address:String(payload.customer.address||'').trim(),
      city:String(payload.customer.city||'').trim(), country:String(payload.customer.country||'Pakistan').trim().toLowerCase()
    }, coupon_code:payload.coupon_code||'',payment_method:payload.payment_method,
    transaction_reference:payload.transaction_reference||'', customer_note:payload.customer_note||'',
    whatsapp_opt_in:payload.whatsapp_opt_in===true
  };
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(intent)));
  const fingerprint=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(!pendingCheckoutIntent){try{pendingCheckoutIntent=JSON.parse(localStorage.getItem(CHECKOUT_INTENT_KEY)||'null');}catch{}}
  if(!pendingCheckoutIntent || pendingCheckoutIntent.fingerprint!==fingerprint
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pendingCheckoutIntent.key||'')){
    pendingCheckoutIntent={fingerprint,key:uuidv4()};
  }
  const stored=JSON.stringify(pendingCheckoutIntent);
  localStorage.setItem(CHECKOUT_INTENT_KEY,stored);
  if(localStorage.getItem(CHECKOUT_INTENT_KEY)!==stored)throw new Error('Checkout attempt could not be retained');
  return pendingCheckoutIntent.key;
}
function clearCheckoutIntent(){pendingCheckoutIntent=null;try{localStorage.removeItem(CHECKOUT_INTENT_KEY);}catch{}}
function resetCheckoutBotCheck(){
  try{if(typeof turnstile!=='undefined')turnstile.reset(checkoutTurnstileWidgetId ?? undefined);}catch{}
}
function renderCheckoutBotCheck(){
  if(checkoutTurnstileWidgetId!==null || typeof turnstile==='undefined' || typeof turnstile.render!=='function')return;
  const widget=document.querySelector('.cf-turnstile');
  if(!widget)return;
  try{
    checkoutTurnstileWidgetId=turnstile.render(widget,{
      sitekey:widget.dataset.sitekey,
      theme:'light',
      size:widget.dataset.size||'flexible'
    });
  }catch{
    const note=document.querySelector('.checkout-verification-help');
    if(note)note.textContent='Security verification could not load. Refresh this page before placing an order.';
  }
}
function checkoutTurnstileReady(){if(checkoutStep===3)renderCheckoutBotCheck();}

async function init() {
  try {
    trackCheckoutEvent('checkout_start',{});
    const cfg = await fetch('/api/storefront-config', {cache:'no-cache'}).then(r=>r.ok?r.json():null);
    const st = cfg?.settings || {};
    const settingNumber = (value, fallback) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };
    DELIVERY_FEE = settingNumber(st.cod_delivery_fee_pkr, 300);
    PREPAID_DELIVERY_FEE = settingNumber(st.prepaid_delivery_fee_pkr, 300);
    FREE_ABOVE = settingNumber(st.prepaid_free_delivery_threshold_pkr, 5000);
    FREE_PREPAID_ENABLED = st.prepaid_free_delivery_enabled !== false;
    PAYMENT_ENABLED = {
      cod: st.cod_enabled !== false,
      jazzcash: st.jazzcash_enabled !== false,
      bank_transfer: st.bank_transfer_enabled !== false
    };
    document.querySelectorAll('[data-dynamic-delivery]').forEach(el=>el.textContent='Rs. '+DELIVERY_FEE.toLocaleString('en-PK'));
    document.querySelectorAll('[data-dynamic-threshold]').forEach(el=>{
      if(FREE_PREPAID_ENABLED)el.textContent='Rs. '+FREE_ABOVE.toLocaleString('en-PK');
      else if(el.closest('small'))el.closest('small').textContent='Prepaid · Delivery fee shown at checkout';
    });
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
  $('#toPaymentBtn')?.addEventListener('click',()=>goToCheckoutStep(2));
  $('#toReviewBtn')?.addEventListener('click',()=>goToCheckoutStep(3));
  $('#backDeliveryBtn')?.addEventListener('click',()=>goToCheckoutStep(1));
  $('#backPaymentBtn')?.addEventListener('click',()=>goToCheckoutStep(2));
  $('#editDeliveryBtn')?.addEventListener('click',()=>goToCheckoutStep(1));
  $('#editPaymentBtn')?.addEventListener('click',()=>goToCheckoutStep(2));
  document.querySelectorAll('[data-checkout-nav]').forEach(button=>{
    button.addEventListener('click',()=>goToCheckoutStep(Number(button.dataset.checkoutNav)));
  });
  initCheckoutRegions();
  $('#f_city')?.addEventListener('input',()=>scheduleQuote());
  $('#f_coupon')?.addEventListener('input',()=>scheduleQuote());
  $('#applyCoupon')?.addEventListener('click',()=>refreshQuote().catch(e=>{if($('#quoteStatus'))$('#quoteStatus').textContent=e.message}));
  $('#copyBankBtn')?.addEventListener('click', copyBankAccount);
  $('#f_phone')?.addEventListener('blur', () => { $('#f_phone').value = normalizePhone($('#f_phone').value); });

  const fv = $('#f_video');
  if (fv) fv.addEventListener('change', () => $('#videoOpt').classList.toggle('sel', fv.checked));

  renderSummary();
  showCheckoutStep(1,false);
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
function deliveryFee(sub) { return isPrepaid() ? (FREE_PREPAID_ENABLED && sub >= FREE_ABOVE ? 0 : PREPAID_DELIVERY_FEE) : DELIVERY_FEE; }

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

let quoteTimer,quoteSequence=0;
function scheduleQuote(){clearTimeout(quoteTimer);quoteTimer=setTimeout(()=>refreshQuote().catch(e=>{if($('#quoteStatus'))$('#quoteStatus').textContent=e.message;}),350);}
async function refreshQuote(){
 const region=$('#f_province')?.value||'';if(!validCheckoutRegion(region))throw new Error('Select your province or region first.');
 const city=$('#f_city')?.value.trim();if(!city)throw new Error('Enter your delivery city to confirm the total.');
 const seq=++quoteSequence,payload={items:Object.entries(CART).map(([id,qty])=>({product_id:Number(id),qty:Number(qty)})),payment_method:PAY,coupon_code:($('#f_coupon')?.value||'').trim().toUpperCase(),customer:{city,country:$('#f_country')?.value||'Pakistan'}};
 if($('#quoteStatus'))$('#quoteStatus').textContent='Checking your total…';
 const r=await fetch('/api/checkout-quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),data=await r.json();
 if(!r.ok||!data.quote)throw new Error(data.error?.message||'Could not confirm your total. Please retry.');
 if(seq!==quoteSequence)throw new Error('Delivery details changed. Confirm the total again.');
 const q=data.quote;$('#s_sub').textContent=fmt(q.subtotal);$('#s_del').textContent=fmt(q.delivery_fee);$('#s_tot').textContent=fmt(q.total);if($('#s_discount'))$('#s_discount').textContent=fmt(q.discount);
 if($('#quoteStatus'))$('#quoteStatus').textContent='Total confirmed for '+city+'.';
 if($('#checkoutTotalLabel'))$('#checkoutTotalLabel').textContent='Verified total';
 if($('#freeHint'))$('#freeHint').hidden=true;
 return q;
}

function renderSummary() {
  const box = $('#coItems');
  if (!box) return;
  box.innerHTML = Object.entries(CART).map(([id, q]) => {
    const p = productById(id); if (!p) return '';
    const img = p.img ? `<img src="${esc(checkoutAssetUrl(p.img))}" alt="${esc(p.name)}" class="summary-thumb">` : '🍪';
    return `<div class="sumrow"><span class="sum-product">${img}<span>${esc(p.name)} <small>× ${Number(q)}</small></span></span><span>${fmt(Number(p.price) * Number(q))}</span></div>`;
  }).join('');
  const sub = cartSubtotal(), del = deliveryFee(sub);
  $('#s_sub').textContent = fmt(sub);
  $('#s_del').innerHTML = del === 0 ? '<span class="free">FREE</span>' : fmt(del);
  $('#s_tot').textContent = fmt(sub + del);
  if($('#checkoutTotalLabel'))$('#checkoutTotalLabel').textContent='Estimated total';
  scheduleQuote();
  const hint = $('#freeHint');
  if (!hint) return;
  if (FREE_PREPAID_ENABLED && isPrepaid() && sub < FREE_ABOVE) {
    hint.hidden = false;
    hint.innerHTML = `💡 Add <b>${fmt(FREE_ABOVE - sub)}</b> more to unlock <b>FREE prepaid delivery</b> and save ${fmt(PREPAID_DELIVERY_FEE)}.`;
  } else if (FREE_PREPAID_ENABLED && isPrepaid()) {
    hint.hidden = false;
    hint.innerHTML = '🎉 <b>FREE prepaid delivery unlocked.</b>';
  } else {
    hint.hidden = true;
  }
}

/* Province / region drives local suggestions; unsupported towns remain typeable. */
function validCheckoutRegion(value){return CHECKOUT_REGIONS.includes(String(value||'').trim());}
function citiesForCheckoutRegion(region){
  const list=globalThis.CHASKABOX_PAKISTAN_LOCATIONS?.[region];
  return Array.isArray(list)?list:[];
}
function regionForCheckoutCity(city){
  const name=String(city||'').trim().toLocaleLowerCase('en');
  if(!name)return '';
  const matches=CHECKOUT_REGIONS.filter(r=>citiesForCheckoutRegion(r).some(c=>c.toLocaleLowerCase('en')===name));
  return matches.length===1?matches[0]:'';
}
function renderCheckoutCitySuggestions(){
  const city=$('#f_city'),province=$('#f_province'),list=$('#pkCities'),help=$('#cityHelp');
  if(!city||!province||!list)return;
  const region=province.value;
  const options=citiesForCheckoutRegion(region);
  const children=options.map(name=>{
    const element=document.createElement('option');
    element.value=name;
    return element;
  });
  list.replaceChildren(...children);
  city.disabled=!validCheckoutRegion(region);
  city.placeholder=city.disabled?'Select province first':'Search or type your city / town';
  if(help)help.textContent=city.disabled?'Choose a region to see cities and towns.':
    (options.length?options.length+' cities, districts and towns to search.':'No city list loaded.')+' Not listed? Type your city or town.';
}
function setCheckoutRegion(region,cityValue){
  const province=$('#f_province'),city=$('#f_city');
  if(!province||!city)return;
  if(!validCheckoutRegion(region))return;
  province.value=region;
  checkoutSelectedRegion=region;
  renderCheckoutCitySuggestions();
  if(cityValue && !city.value)city.value=cityValue;
  scheduleQuote();
}
function initCheckoutRegions(){
  const province=$('#f_province'),city=$('#f_city');
  if(!province||!city)return;
  checkoutSelectedRegion=province.value;
  province.addEventListener('change',()=>{
    const next=province.value;
    if(checkoutSelectedRegion!==next){
      city.value='';
      checkoutSelectedRegion=next;
      ++quoteSequence;
      if($('#checkoutTotalLabel'))$('#checkoutTotalLabel').textContent='Estimated total';
      if($('#quoteStatus'))$('#quoteStatus').textContent=next?'Enter your delivery city to confirm the total.':'Select a province / region first.';
    }
    renderCheckoutCitySuggestions();
    if(next && city.value)scheduleQuote();
  });
  renderCheckoutCitySuggestions();
}

function getFullPhone(){
  const ccode = $('#f_ccode')?.value || '+92';
  let digits = String($('#f_phone')?.value || '').replace(/\D/g, '');
  // Auto-strip trunk prefix (leading 0) for international format
  // Most countries use 0 as trunk prefix when dialing domestically
  if(ccode !== '+92' && digits.startsWith('0') && digits.length > 1){
    digits = digits.slice(1);
  }
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
  let d = phoneDigits(v);
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
  // Other countries: strip trunk 0, then validate 7-15 digits
  if(d.startsWith('0') && d.length > 1) d = d.slice(1);
  return d.length >= 7 && d.length <= 15;
}
function validEmail(v) {
  const email=String(v||'').trim();const [local]=email.split('@');
  return email.length<=254 && local.length<=64 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function checkForm(scope = 'all') {
  let ok = true;
  // Combine first + last into full name for backend compat
  const fname = ($('#f_fname')?.value || '').trim();
  const lname = ($('#f_lname')?.value || '').trim();
  const fullName = (fname + ' ' + lname).trim();
  const nameInput = $('#f_name');
  if(nameInput) nameInput.value = fullName;
  const need = scope === 'payment' ? [] : [
    ['f_fname','e_fname',v=>v.trim().length>0 && fullName.length>=3 && fullName.length<=100],
    ['f_lname','e_lname',v=>v.trim().length<=100],
    ['f_phone','e_phone',validPhone],
    ['f_email','e_email',validEmail],
    ['f_addr','e_addr',v=>v.trim().length>=8 && v.trim().length<=500 && !/[\u0000-\u001f\u007f]/.test(v)],
    ['f_province','e_province',validCheckoutRegion],
    ['f_city','e_city',v=>validCheckoutRegion($('#f_province')?.value) && v.trim().length>=2 && v.trim().length<=100 && !/[\u0000-\u001f\u007f0-9<>]/.test(v)],
    ['f_postal','e_postal',v=>!v.trim() || /^[0-9]{5}$/.test(v.trim())],
    ['f_country','e_country',v=>v.trim()==='Pakistan']
  ];
  need.forEach(([f,e,fn]) => {
    const good = fn($('#'+f)?.value || '');
    if ($('#'+e)) $('#'+e).style.display = good ? 'none' : 'block';
    if ($('#'+f)) {
      const field=$('#'+f);
      field.setAttribute('aria-invalid',good?'false':'true');
      // Preserve helpful field instructions while associating the error with this input.
      const describedBy=(field.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean);
      if(!describedBy.includes(e))describedBy.push(e);
      field.setAttribute('aria-describedby',describedBy.join(' '));
    }
    if(!good) ok=false;
  });
  if (scope !== 'delivery' && isPrepaid()) {
    const refGood = ($('#f_reference')?.value || '').trim().length >= 4;
    if ($('#e_reference')) $('#e_reference').style.display = refGood ? 'none' : 'block';
    if ($('#f_reference')) $('#f_reference').setAttribute('aria-invalid',refGood?'false':'true');
    if (!refGood) ok = false;
  } else if (scope !== 'delivery' && $('#e_reference')) {
    $('#e_reference').style.display = 'none';
    $('#f_reference')?.setAttribute('aria-invalid','false');
  }
  return ok;
}


/* Guided checkout: step changes never submit an order or retain new personal data. */
function showCheckoutStep(step, moveFocus=true) {
  if (![1,2,3].includes(step)) return;
  checkoutStep = step;
  furthestCheckoutStep = Math.max(furthestCheckoutStep,step);
  const panels = {1:'checkoutDeliveryStep',2:'checkoutPaymentStep',3:'checkoutReviewStep'};
  for(const [number,id] of Object.entries(panels)){
    const panel=document.getElementById(id);
    if(panel) panel.hidden=Number(number)!==step;
  }
  for(const id of ['checkoutVerification','placeBtn','checkoutPolicy']){
    const node=document.getElementById(id);
    if(node) node.hidden=step!==3;
  }
  document.querySelectorAll('[data-checkout-nav]').forEach(button=>{
    const number=Number(button.dataset.checkoutNav);
    button.disabled=number>furthestCheckoutStep;
    button.classList.toggle('current',number===step);
    button.classList.toggle('complete',number<step);
    button.setAttribute('aria-current',number===step?'step':'false');
  });
  const labels={1:['Your delivery','Enter where we should send your snacks.','Delivery details'],2:['Choose payment','Select a payment method that works for you.','Payment method'],3:['Final review','Check your details and confirmed total.','Review and confirm']};
  const [heading,lead,label]=labels[step];
  const title=document.getElementById('checkoutTitle');
  if(title) title.textContent=heading+'.';
  const intro=document.getElementById('checkoutLead');
  if(intro) intro.textContent=lead;
  const header=document.getElementById('checkoutHeaderStep');
  if(header) header.textContent='Step '+step+' of 3';
  const announce=document.getElementById('checkoutStepAnnounce');
  if(announce) announce.textContent='Step '+step+' of 3: '+label;
  if(step===3){updateCheckoutReview();renderCheckoutBotCheck();}
  if(moveFocus){
    const headingNode=document.getElementById(step===1?'detailsTitle':step===2?'paymentTitle':'reviewTitle');
    if(headingNode){headingNode.setAttribute('tabindex','-1');headingNode.focus();}
    window.scrollTo({top:0,behavior:'auto'});
  }
}
function updateCheckoutReview(){
  const values={
    reviewName:[($('#f_fname')?.value||'').trim(),($('#f_lname')?.value||'').trim()].filter(Boolean).join(' '),
    reviewPhone:($('#f_phone')?.value||'').trim(),
    reviewEmail:($('#f_email')?.value||'').trim(),
    reviewAddress:[($('#f_addr')?.value||'').trim(),($('#f_city')?.value||'').trim(),($('#f_province')?.value||'').trim(),($('#f_postal')?.value||'').trim(), 'Pakistan'].filter(Boolean).join(', '),
    reviewWhatsapp: $('#f_whatsapp_optin')?.checked ? 'WhatsApp updates: Yes — for this order only' : 'WhatsApp updates: Not requested',
    reviewPayment:PAYMENT_LABELS[PAY]||'Payment method not selected',
    reviewPaymentStatus:isPrepaid()?'Payment reference provided. Awaiting verification after your order is placed.':'Pay when your order arrives.'
  };
  for(const [id,value] of Object.entries(values)){
    const node=document.getElementById(id);
    if(node) node.textContent=value;
  }
}
async function goToCheckoutStep(target){
  if(checkoutNavigating || placingOrder || ![1,2,3].includes(target) || target===checkoutStep) return;
  clearOrderError();
  if(target<checkoutStep){showCheckoutStep(target);return;}
  if(!Object.values(PAYMENT_ENABLED).some(Boolean)){
    showOrderError('Checkout is temporarily unavailable. Please contact ChaskaBox.');
    return;
  }
  if(!checkForm('delivery')){
    showCheckoutStep(1);
    document.querySelector('[aria-invalid="true"]')?.focus?.();
    return;
  }
  if(target===2){showCheckoutStep(2);return;}
  if(!checkForm('payment')){
    showCheckoutStep(2);
    document.querySelector('[aria-invalid="true"]')?.focus?.();
    return;
  }
  checkoutNavigating=true;
  const next=document.getElementById('toReviewBtn');
  if(next){next.disabled=true;next.textContent='Confirming total…';}
  try{
    await refreshQuote();
    showCheckoutStep(3);
  }catch(e){
    showOrderError(e.message||'Could not verify your order total. Please retry.');
  }finally{
    checkoutNavigating=false;
    if(next){next.disabled=false;next.textContent='Review my order →';}
  }
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
  el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
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
    if (res.ok && typeof data.order_id==='string' && data.order_id
      && typeof data.order_number==='string' && data.order_number
      && typeof data.total==='number' && Number.isFinite(data.total) && data.total>=0) return {ok:true,data};
    if (res.ok) return {ok:false,error:'The order response could not be confirmed. Retry with the same bag to recover your order safely.'};
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
    document.querySelector('[aria-invalid="true"]')?.focus?.();
    window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
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
  // Until shipping address has a dedicated postal-code column, carry verified
  // optional code in the persisted address string (not pricing metadata).
  const postalCode=($('#f_postal')?.value||'').trim();
  const region=($('#f_province')?.value||'').trim();
  const deliveryAddress=$('#f_addr').value.trim()+', Province / Region: '+region+(postalCode?', Postal code '+postalCode:'');
  const _ph = getFullPhone();
  let phone;
  if(_ph.ccode === '+92'){
    let d = phoneDigits($('#f_phone').value);
    // Normalize a 10-digit mobile number (missing its leading 0) to national format.
    if(d.length === 10 && d.startsWith('3')) d = '0' + d;
    phone = d;
  } else {
    phone = _ph.full;
  }
  const turnstileToken = (typeof turnstile !== 'undefined' && turnstile.getResponse) ? turnstile.getResponse(checkoutTurnstileWidgetId ?? undefined) : '';

  // Build server-authoritative API payload (contract §4).
  // Prices/totals are IGNORED by the server — it recalculates from the DB.
  const apiPayload = {
    items: itemRows.map(i => ({ product_id: i.id, qty: i.qty })),
    customer: {
      name: $('#f_name').value.trim(),
      phone: phone,
      email: $('#f_email').value.trim().toLowerCase() || undefined,
      address: deliveryAddress,
      city: $('#f_city').value.trim(),
      country: 'Pakistan'
    },
    coupon_code:($('#f_coupon')?.value||'').trim().toUpperCase()||undefined,
    payment_method: PAY === 'cod' ? 'cod' : (PAY === 'jazzcash' ? 'jazzcash' : 'bank_transfer'),
    transaction_reference: reference,
    turnstile_token: turnstileToken,
    whatsapp_opt_in: !!$('#f_whatsapp_optin')?.checked,
    customer_note: (wantVideo ? (note ? note + ' ' : '') + '[Packing video requested]' : note) || undefined
  };

  try {apiPayload.idempotency_key=await checkoutIdempotencyKey(apiPayload);}
  catch {
    showOrderError('We could not prepare a safe checkout. Please allow browser storage for ChaskaBox and reload. Your bag has not been submitted.');
    placingOrder=false; btn.disabled=false; btn.textContent='Place Order →'; return;
  }
  try {await refreshQuote();}catch(e){showOrderError(e.message,()=>placeOrder());placingOrder=false;btn.disabled=false;btn.textContent='Place Order →';return;}
  // Server-authoritative order creation. Cart is cleared ONLY on API success.
  const apiResult = await placeOrderViaAPI(apiPayload);

  if (!apiResult.ok) {
    resetCheckoutBotCheck();
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
    addr: deliveryAddress, city: $('#f_city').value.trim(),
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
    city: $('#f_city').value.trim(),
    province: ($('#f_province')?.value||'').trim()
  });
  CART = {};
  try {localStorage.removeItem('chaskabox-cart');localStorage.removeItem('chaskabox-cart-ts');}catch{}
  clearCheckoutIntent();
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
  trackCheckoutEvent('order_complete',{order_id:srv.order_id,total:finalTotal,payment:PAY});
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

/* ============ CUSTOMER DETAILS SAVE & AUTOFILL ============ */
async function saveCustomerDetails(d){
  // Only save if user checked "Save this information"
  const saveChecked = $('#f_saveinfo')?.checked === true;
  if(!saveChecked){try{localStorage.removeItem('cb_customer');}catch{}return;}
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
        if($('#f_city') && !$('#f_city').value){const city=addrs.city||'';setCheckoutRegion(regionForCheckoutCity(city),city);if(!$('#f_city').value)$('#f_city').value=city;}
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
    if(saved.city && $('#f_city') && !$('#f_city').value){const city=saved.city;setCheckoutRegion(validCheckoutRegion(saved.province)?saved.province:regionForCheckoutCity(city),city);if(!$('#f_city').value)$('#f_city').value=city;}
  } catch(e){}
}

// Auto-fill on page load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(autofillCustomerDetails, 500);
});

/* Pakistan is the currently supported checkout delivery region. */
function populateCountryCodes(){
  const sel=document.getElementById('f_ccode');if(!sel)return;
  sel.innerHTML='<option value="+92">🇵🇰 +92</option>';sel.value='+92';
}
function populateCountries(){
  const sel=document.getElementById('f_country');if(!sel)return;
  sel.innerHTML='<option value="Pakistan">Pakistan</option>';sel.value='Pakistan';
}
document.addEventListener('DOMContentLoaded',populateCountryCodes);
document.addEventListener('DOMContentLoaded',populateCountries);

// Select the compact challenge on extra narrow screens BEFORE the deferred
// Turnstile script scans the markup. Never bypass or mock server Siteverify.
const checkoutTurnstileElement=document.querySelector('.cf-turnstile');
if(checkoutTurnstileElement && typeof window.matchMedia==='function')
 checkoutTurnstileElement.dataset.size=window.matchMedia('(max-width: 360px)').matches?'compact':'flexible';
