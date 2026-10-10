/* ChaskaBox product-page runtime bridge.
 * Existing pre-rendered PDPs keep their SEO shell but refresh price/content from
 * the live public catalogue so Admin edits do not require regenerating files.
 */
(async function(){
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function fmt(n){return 'Rs. '+Number(n||0).toLocaleString('en-PK');}
  function imgSrc(src){const s=String(src||'');if(!s)return '';return /^(?:https?:|data:|blob:|\/)/i.test(s)?s:'/'+s.replace(/^\.\//,'');}
  async function getJson(url){const r=await fetch(url,{cache:'no-cache'});if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
  try{
    const [cfg, liveProducts] = await Promise.all([
      getJson('/api/storefront-config').catch(()=>null),
      getJson('/api/products').catch(()=>null),
    ]);
    const st=cfg?.settings||{};
    const settingNumber=(value,fallback)=>{const n=Number(value);return Number.isFinite(n)?n:fallback;};
    const cod=settingNumber(st.cod_delivery_fee_pkr,300);
    const threshold=settingNumber(st.prepaid_free_delivery_threshold_pkr,5000);
    document.querySelectorAll('.pd-meta span').forEach(function(el){
      const t=el.textContent||'';
      if(/COD:/i.test(t)) el.textContent='🚚 COD: '+fmt(cod)+' delivery';
      if(/Prepaid/i.test(t) && /FREE/i.test(t)) el.textContent='⚡ Prepaid '+fmt(threshold)+'+: FREE delivery';
    });

    if(!Array.isArray(liveProducts) || typeof window.PID==='undefined') return;
    // Refresh global lookup so drawer/related cards use current prices too.
    if(typeof window.LOOKUP==='object' && window.LOOKUP){
      liveProducts.forEach(function(p){
        window.LOOKUP[String(p.id)]={name:p.name,price:Number(p.price),img:(p.img&&!/^https?:/i.test(String(p.img)))?String(p.img).replace(/^\//,''):null,cat:p.category||'',brand:p.brand||p.name||''};
      });
    }
    const p=liveProducts.find(x=>Number(x.id)===Number(window.PID));
    if(!p){
      // Successful live catalogue response + missing PID means hidden/archived/deleted.
      const detail=document.querySelector('.pdetail');
      if(detail) detail.innerHTML='<div class="section" style="text-align:center;padding:48px 20px"><span class="eyebrow">CURRENTLY UNAVAILABLE</span><h1>This snack is not available right now.</h1><p>Please browse the current ChaskaBox catalogue.</p><a class="cta" href="/shop/">Shop available snacks →</a></div>';
      const rel=document.querySelector('.rel-sec'); if(rel) rel.hidden=true;
      return;
    }

    const info=document.querySelector('.pd-info');
    if(info){
      const set=(sel,val)=>{const e=info.querySelector(sel);if(e)e.textContent=val||'';};
      set('.pcat',p.category); set('h1',p.name); set('.pd-brand',p.brand||'');
      set('.pd-price .price',fmt(p.price)); set('.ppack',p.pack||''); set('.pd-desc',p.desc||'');
      const btn=info.querySelector('.pdbtn'); if(btn)btn.textContent='Add to Bag · '+fmt(p.price);
      const imgBox=document.querySelector('.pd-img');
      if(imgBox){
        if(p.img){imgBox.innerHTML='<img src="'+esc(imgSrc(p.img))+'" alt="'+esc(p.name)+'">';}
        else{imgBox.innerHTML='<div class="noimg"><b>CHASKABOX</b><span>Photo<br>coming soon</span><small>'+esc(p.category||'')+'</small></div>';}
      }
    }
    const crumb=document.querySelector('.crumb span');if(crumb)crumb.textContent=p.name;
    document.title=p.name+' | ChaskaBox';
    const meta=document.querySelector('meta[name="description"]');if(meta&&p.desc)meta.setAttribute('content',String(p.desc).slice(0,155));
    if(typeof window.CUR_CAT!=='undefined')window.CUR_CAT=p.category||'';
    if(typeof window.CUR_BRAND!=='undefined')window.CUR_BRAND=p.brand||p.name||'';
    try{if(typeof window.renderRelated==='function')window.renderRelated();}catch{}
  }catch(e){console.warn('[product-runtime] live refresh unavailable',e?.message||e);}
})();

/* ChaskaBox product reviews (P2-13): approved reviews + submission form. */
(function(){
  // Inject review styles (shared across all static PDPs)
  if(!document.querySelector('#review-styles')){
    const st=document.createElement('style'); st.id='review-styles';
    st.textContent='.reviews-sec{margin:34px 0 10px}.reviews-sec h2{font-size:20px;margin-bottom:12px;color:var(--navy)}'
      +'.reviews-avg{font-size:15px;margin-bottom:14px}.reviews-avg .muted{font-size:12px}'
      +'.review-card{border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px;background:var(--card)}'
      +'.review-stars{color:#f59e0b;font-size:16px;margin-bottom:6px}.review-card p{margin:6px 0;font-size:14px;line-height:1.5}'
      +'.verified-badge{display:inline-block;background:#ecfdf3;color:#166534;font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;margin-top:6px}'
      +'.admin-reply{margin-top:10px;padding:10px;background:#f8fafc;border-left:3px solid var(--navy);border-radius:0 8px 8px 0;font-size:13px}'
      +'.review-form-wrap{margin-top:16px;border:1px solid var(--border);border-radius:12px;padding:14px}'
      +'.review-form-wrap summary{cursor:pointer;font-weight:700;color:var(--navy);min-height:44px;display:flex;align-items:center}'
      +'.review-form{display:grid;gap:12px;margin-top:12px}.review-form label{display:grid;gap:6px;font-size:13px;font-weight:600}'
      +'.review-form select,.review-form textarea{padding:10px;border:1px solid var(--border);border-radius:8px;font-size:16px;max-width:100%}'
      +'.review-note{font-size:11px}.review-thanks{padding:16px;background:#ecfdf3;border-radius:10px;color:#166534}';
    document.head.appendChild(st);
  }
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function stars(n){n=Math.max(0,Math.min(5,Math.round(Number(n)||0)));return '★'.repeat(n)+'☆'.repeat(5-n);}
  async function initReviews(){
    if(typeof window.PID==='undefined') return;
    const pid=window.PID;
    // Find insertion point: after related section, before </main>
    const rel=document.querySelector('.rel-sec');
    if(!rel||document.querySelector('.reviews-sec')) return;
    const sec=document.createElement('section');
    sec.className='reviews-sec';
    sec.id='reviews';
    sec.innerHTML='<h2>Customer Reviews</h2><div class="reviews-list"><p class="muted">Loading reviews…</p></div>'
      +'<details class="review-form-wrap"><summary>Write a review</summary>'
      +'<form class="review-form"><label>Rating<select name="rating" required><option value="5">★★★★★ (5)</option><option value="4">★★★★ (4)</option><option value="3">★★★ (3)</option><option value="2">★★ (2)</option><option value="1">★ (1)</option></select></label>'
      +'<label>Your review<textarea name="text" rows="3" minlength="3" maxlength="1000" required placeholder="What did you think of this snack?"></textarea></label>'
      +'<button type="submit" class="btn primary">Submit review</button>'
      +'<p class="muted review-note">Reviews are moderated before appearing.</p></form></details>';
    rel.after(sec);
    // The section is injected ~800ms after load, so the browser's native
    // #reviews scroll (which fired before the section existed) misses it.
    if(location.hash==='#reviews'){try{sec.scrollIntoView({block:'start'});}catch(e){}}
    const list=sec.querySelector('.reviews-list');
    // Load approved reviews
    try{
      const r=await fetch('/api/reviews?product_id='+encodeURIComponent(pid),{cache:'no-store'});
      const d=r.ok?await r.json():null;
      const reviews=(d&&d.reviews)||[];
      if(!reviews.length){
        list.innerHTML='<p class="muted">No reviews yet — be the first to review this snack!</p>';
      }else{
        const avg=(reviews.reduce((a,x)=>a+Number(x.rating||0),0)/reviews.length);
        list.innerHTML='<p class="reviews-avg"><b>'+avg.toFixed(1)+'</b> '+stars(avg)+' <span class="muted">('+reviews.length+' review'+(reviews.length===1?'':'s')+')</span></p>'
          +reviews.map(x=>'<article class="review-card"><div class="review-stars">'+stars(x.rating)+'</div><p>'+esc(x.review_text)+'</p>'
          +(x.verified_purchase?'<span class="verified-badge">✓ Verified purchase</span>':'')
          +(x.admin_reply?'<div class="admin-reply"><b>ChaskaBox:</b> '+esc(x.admin_reply)+'</div>':'')
          +'</article>').join('');
      }
    }catch(e){ list.innerHTML='<p class="muted">Could not load reviews.</p>'; }
    // Handle submission
    const form=sec.querySelector('.review-form');
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const btn=form.querySelector('button[type="submit"]');
      btn.disabled=true; btn.textContent='Submitting…';
      try{
        const fd=new FormData(form);
        // Include auth token if user is logged in (links review to their account)
        const headers={'Content-Type':'application/json'};
        try{
          if(typeof initSupabase==='function' && await initSupabase() && typeof SB!=='undefined' && SB){
            const {data}=await SB.auth.getSession();
            const token=data?.session?.access_token;
            if(token) headers['Authorization']='Bearer '+token;
          }
        }catch{}
        const r=await fetch('/api/reviews',{method:'POST',headers,
          body:JSON.stringify({product_id:Number(pid),rating:Number(fd.get('rating')),text:String(fd.get('text')).trim()})});
        if(!r.ok) throw new Error('Submit failed');
        form.innerHTML='<p class="review-thanks">Thanks! Your review was submitted and will appear after moderation. 🙏</p>';
      }catch(err){
        btn.disabled=false; btn.textContent='Submit review';
        alert('Could not submit review. Please try again.');
      }
    });
  }
  // Run after main runtime (delay to avoid blocking)
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(initReviews,800));
  else setTimeout(initReviews,800);
})();
