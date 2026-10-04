/* ChaskaBox checkout logic */
const DELIVERY_FEE = 300, FREE_ABOVE = 5000;
const ORDER_EMAIL = 'Chaskabox.mzg@gmail.com';
let PRODUCTS = [], CART = {}, PAY = 'cod';
const $ = s => document.querySelector(s);
const fmt = n => 'Rs. ' + Number(n).toLocaleString('en-PK');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function init() {
  try { CART = JSON.parse(localStorage.getItem('chaskabox-cart') || '{}'); } catch (e) { CART = {}; }
  const r = await fetch('products.json'); PRODUCTS = await r.json();
  try {
    const ov = JSON.parse(localStorage.getItem('cb_overrides') || '{}');
    PRODUCTS.forEach(p => { if (ov[p.id]) Object.assign(p, ov[p.id]); });
  } catch (e) {}
  if (!Object.keys(CART).length) { $('#coMain').innerHTML = '<div class="co-card"><div class="empty">Your bag is empty.<br><br><a class="cta" href="index.html">← Back to shop</a></div></div>'; return; }
  renderSummary();
  prefillFromAccount();
  // highlight the packing-video option when checked
  const fv = $('#f_video');
  if (fv) fv.addEventListener('change', () => $('#videoOpt').classList.toggle('sel', fv.checked));
}
/* Prefill name/phone/address from saved account data when logged in */
async function prefillFromAccount() {
  try {
    if (typeof initSupabase !== 'function' || !initSupabase() || !SB) return;
    const { data: sess } = await SB.auth.getSession();
    if (!sess || !sess.session || !sess.session.user) return;
    const uid = sess.session.user.id;
    const { data: addrs } = await SB.from('addresses').select('*').eq('user_id', uid).order('is_default', { ascending: false }).limit(1);
    if (addrs && addrs.length) {
      const a = addrs[0];
      if (a.full_name && !$('#f_name').value) $('#f_name').value = a.full_name;
      if (a.phone && !$('#f_phone').value) $('#f_phone').value = a.phone;
      if (a.address && !$('#f_addr').value) $('#f_addr').value = a.address;
      if (a.city && !$('#f_city').value) $('#f_city').value = a.city;
    } else {
      const { data: prof } = await SB.from('profiles').select('name,phone').eq('id', uid).single();
      if (prof) {
        if (prof.name && !$('#f_name').value) $('#f_name').value = prof.name;
        if (prof.phone && !$('#f_phone').value) $('#f_phone').value = prof.phone;
      }
    }
  } catch(e) { console.warn('prefill failed', e); }
}
function cartSubtotal() {
  return Object.entries(CART).reduce((s, [id, q]) => { const p = PRODUCTS.find(x => x.id == id); return s + (p ? p.price * q : 0); }, 0);
}
function deliveryFee(sub) {
  if (PAY === 'jazzcash' && sub >= FREE_ABOVE) return 0;
  return DELIVERY_FEE;
}
function setPay(m) {
  PAY = m;
  $('#pay_cod').classList.toggle('sel', m === 'cod');
  $('#pay_jazz').classList.toggle('sel', m === 'jazzcash');
  $('#jazzBox').style.display = m === 'jazzcash' ? '' : 'none';
  renderSummary();
}
function renderSummary() {
  const box = $('#coItems');
  box.innerHTML = Object.entries(CART).map(([id, q]) => {
    const p = PRODUCTS.find(x => x.id == id); if (!p) return '';
    const img = p.img ? `<img src="${p.img}" style="width:44px;height:44px;object-fit:contain">` : '🍪';
    return `<div class="sumrow"><span>${img} ${esc(p.name)} × ${q}</span><span>${fmt(p.price * q)}</span></div>`;
  }).join('');
  const sub = cartSubtotal(), del = deliveryFee(sub);
  $('#s_sub').textContent = fmt(sub);
  $('#s_del').innerHTML = del === 0 ? '<span class="free">FREE</span>' : fmt(del);
  $('#s_tot').textContent = fmt(sub + del);
  const hint = $('#freeHint');
  if (PAY === 'jazzcash' && sub < FREE_ABOVE) {
    hint.style.display = ''; hint.innerHTML = `💡 Add <b>${fmt(FREE_ABOVE - sub)}</b> more for <b>FREE delivery</b> (save Rs. 300)!`;
  } else if (PAY === 'jazzcash') { hint.style.display = ''; hint.innerHTML = `🎉 You've unlocked <b>FREE delivery</b>!`; }
  else hint.style.display = 'none';
}
function validPhone(v) { const d = v.replace(/\D/g, ''); return d.length === 11 && d.startsWith('03'); }
function checkForm() {
  let ok = true;
  const need = [['f_name','e_name',v=>v.trim().length>=3],['f_phone','e_phone',validPhone],['f_addr','e_addr',v=>v.trim().length>=8],['f_city','e_city',v=>v.trim().length>=2]];
  need.forEach(([f,e,fn]) => { const good = fn($('#'+f).value); $('#'+e).style.display = good?'none':''; if(!good) ok=false; });
  return ok;
}
function orderNo() {
  // CB-DDMMYY-XXXXX (Pakistan date)
  const now = new Date(Date.now() + (5*60+0)*60000 + new Date().getTimezoneOffset()*60000);
  const dd = String(now.getDate()).padStart(2,'0'), mm = String(now.getMonth()+1).padStart(2,'0'), yy = String(now.getFullYear()).slice(2);
  const rnd = String(Math.floor(10000 + Math.random()*90000));
  return `CB-${dd}${mm}${yy}-${rnd}`;
}
async function placeOrder() {
  if (!checkForm()) { window.scrollTo(0,0); return; }
  const btn = $('#placeBtn'); btn.disabled = true; btn.textContent = 'Placing order...';
  const sub = cartSubtotal(), del = deliveryFee(sub), total = sub + del;
  const ono = orderNo();
  const items = Object.entries(CART).map(([id,q]) => {
    const p = PRODUCTS.find(x=>x.id==id);
    return `${p.name} (${p.pack||''}) × ${q} = Rs. ${p.price*q}`;
  });
  const payLabel = PAY === 'cod' ? 'Cash on Delivery' : 'JazzCash (Advance)';
  const wantVideo = $('#f_video') && $('#f_video').checked;
  const videoNote = wantVideo
    ? `\n\n🎬🎬🎬 PACKING VIDEO REQUESTED! 🎬🎬🎬\nCustomer ne packing video MANGI HAI!\n→ Pack karte waqt 30-second video banao\n→ Customer ke WhatsApp (${$('#f_phone').value.trim()}) par bhejo\n→ Guide: PACKING-VIDEO-GUIDE.md`
    : '';
  const msg =
`NEW ORDER — ${ono}
Date: ${new Date().toLocaleString('en-PK',{timeZone:'Asia/Karachi'})}
${videoNote}

CUSTOMER
Name: ${$('#f_name').value.trim()}
Phone: ${$('#f_phone').value.trim()}
Address: ${$('#f_addr').value.trim()}
City: ${$('#f_city').value.trim()}
Packing video: ${wantVideo ? 'YES 🎬' : 'No'}

ITEMS
${items.join('\n')}

Subtotal: Rs. ${sub.toLocaleString('en-PK')}
Delivery: ${del===0?'FREE':'Rs. '+del.toLocaleString('en-PK')}
TOTAL: Rs. ${total.toLocaleString('en-PK')}
Payment: ${payLabel}`;

  // Send via FormSubmit (AJAX). NOTE: first-ever send needs one-time activation
  // by the store owner clicking the confirmation link emailed to ORDER_EMAIL.
  let sent = false;
  try {
    const res = await fetch('https://formsubmit.co/ajax/' + ORDER_EMAIL, {
      method: 'POST', headers: {'Content-Type':'application/json','Accept':'application/json'},
      body: JSON.stringify({ _subject: `New Order ${ono} — ChaskaBox`, _template: 'table', message: msg, name: $('#f_name').value.trim(), order: ono })
    });
    sent = res.ok;
  } catch(e) { sent = false; }

  // Always show confirmation on-site (order number is the source of truth).
  // Keep a local copy of the order for the owner's records.
  try {
    const orders = JSON.parse(localStorage.getItem('cb_orders')||'[]');
    orders.push({no:ono, date:new Date().toISOString(), name:$('#f_name').value.trim(), phone:$('#f_phone').value.trim(), addr:$('#f_addr').value.trim(), city:$('#f_city').value.trim(), items, sub, del, total, pay:payLabel, emailed:sent, video:wantVideo});
    localStorage.setItem('cb_orders', JSON.stringify(orders));
  } catch(e){}

  // Save to Supabase order history when the customer is logged in
  try {
    if (typeof initSupabase === 'function' && initSupabase() && SB) {
      const { data: sess } = await SB.auth.getSession();
      if (sess && sess.session && sess.session.user) {
        const itemRows = Object.entries(CART).map(([id, q]) => {
          const p = PRODUCTS.find(x => x.id == id) || {};
          return { id: Number(id), name: p.name || '', price: p.price || 0, qty: q, img: p.img || '' };
        });
        await SB.from('orders').insert({
          user_id: sess.session.user.id,
          items: itemRows,
          subtotal: sub,
          delivery_fee: del,
          total: total,
          pay_method: PAY === 'cod' ? 'COD' : 'JazzCash',
          name: $('#f_name').value.trim(),
          phone: $('#f_phone').value.trim(),
          address: $('#f_addr').value.trim(),
          city: $('#f_city').value.trim(),
          video_requested: wantVideo,
          status: 'pending'
        });
      }
    }
  } catch(e) { console.warn('supabase order save failed', e); }

  CART = {}; localStorage.removeItem('chaskabox-cart');
  $('#coMain').style.display = 'none'; $('#coDone').style.display = '';
  $('#doneNo').textContent = ono;
  $('#doneMsg').innerHTML = PAY === 'cod'
    ? `We'll call <b>${esc($('#f_phone').value.trim())}</b> to confirm, then ship in <b>4–7 days</b>. Keep <b>${fmt(total)}</b> ready (includes Rs. 300 delivery).`
    : (del === 0
      ? `Please pay <b>${fmt(total)}</b> via the JazzCash QR / Till ID <b>981716438</b>. We'll confirm and ship in <b>4–7 days</b>. Order email sent to store.`
      : `Please pay <b>${fmt(total)}</b> via the JazzCash QR / Till ID <b>981716438</b> (includes Rs. 300 delivery). We'll confirm and ship in <b>4–7 days</b>.`);
  if (!sent) $('#doneMsg').innerHTML += '<br><br><small style="color:#b45309">Note: email notification is being set up — please also WhatsApp your order number to 0332-0005381 to confirm.</small>';
  if (wantVideo) $('#doneMsg').innerHTML += '<br><br>🎬 <b>Packing video:</b> Rameez aapke order ki packing video banakar <b>WhatsApp</b> par bhejega! 📦';
  window.scrollTo(0,0);
}
document.addEventListener('DOMContentLoaded', init);
