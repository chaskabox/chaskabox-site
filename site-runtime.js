/* Public storefront runtime settings bridge. Common owner-editable contact/copy
 * values come from site_settings so normal operational changes need no code edit.
 *
 * Also: global broken-image fallback. If a product image 404s (missing file),
 * swap it for the styled "Photo coming soon" placeholder instead of a broken icon.
 */
(() => {
  'use strict';
  const safeUrl=v=>typeof v==='string'&&/^(\/[^/]|\/$|https:\/\/|mailto:|tel:|#)[^\s"'<>]*$/.test(v);
  // Share one public manifest read with app.js and use the server seed on
  // catalogue pages. A failed read can be retried without caching an outage.
  let manifestRead=null;
  window.loadStorefrontManifest=function(){
    if(manifestRead)return manifestRead;
    manifestRead=(async()=>{
      let seed=null;
      try{seed=JSON.parse(document.getElementById('current-storefront-config')?.textContent||'null');}catch{}
      if(seed&&typeof seed==='object'&&!Array.isArray(seed)&&Array.isArray(seed.categories))return seed;
      const response=await fetch('/api/storefront-config',{cache:'no-cache'});
      if(!response.ok)throw Error('Store settings unavailable');
      const data=await response.json();
      if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid store settings');
      return data;
    })().catch(error=>{manifestRead=null;throw error;});
    return manifestRead;
  };
  const logoSelector='.logo img,.logo-img', defaultLogo='/images/logo-approved-20261017.png';
  // Preserve the responsive child spans: replacing .promo textContent destroys them.
  function applyPromoCopy(raw){
    const text=String(raw||'').trim();
    if(!text)return;
    if(window.ChaskaPromo?.setText){window.ChaskaPromo.setText(text);return;}
    document.querySelectorAll('.promo').forEach(banner=>{
      for(const selector of ['.promo-desktop','.promo-mobile']){
        const child=banner.querySelector(selector);
        if(child)child.textContent=text;
      }
    });
  }
  function setLogo(img,src){
    // Older saved bundled-logo settings follow this approved branding release.
    if(src==='/images/logo-navy.png')src=defaultLogo;
    if(src===defaultLogo){img.srcset='/images/logo-approved-20261017-420.webp 420w, /images/logo-approved-20261017-840.webp 840w';img.sizes='210px';}
    else{img.removeAttribute('srcset');img.removeAttribute('sizes');}
    img.src=src;
  }
  window.applyStorefrontManifest=function(d){
    if(Array.isArray(d.navigation)){
      for(const [location,selector] of [['header','.hnav'],['header','.cb-managed-nav'],['mobile','#mnavList'],['footer','footer .fwrap > div:nth-child(2) > p']]){
        document.querySelectorAll(selector).forEach(el=>{
          el.replaceChildren();
          for(const row of d.navigation.filter(r=>r.location===location&&r.is_enabled).sort((a,b)=>a.position-b.position)){
            if(!safeUrl(row.url))continue;
            const a=document.createElement('a');a.textContent=row.label;a.href=row.url;
            if(row.is_external){a.target='_blank';a.rel='noopener noreferrer';}
            if(row.parent_id)a.style.paddingInlineStart='24px';
            if(location==='footer')a.style.display='block';el.append(a);
          }
        });
      }
    }
    document.querySelectorAll('footer .fwrap > div:nth-child(3)').forEach(el=>el.hidden=false);
    const t=d.theme||{},style=document.getElementById('storefrontTheme')||document.createElement('style');
    style.id='storefrontTheme';
    const map={primary_color:['--navy','--primary'],accent_color:['--gold','--accent'],background_color:['--bg'],text_color:['--ink','--text']};
    const tokens=[];
    for(const [key,vars] of Object.entries(map))if(/^#[0-9a-f]{6}$/i.test(t[key]||''))for(const name of vars)tokens.push(name+':'+t[key]);
    if(/^(?:[0-9]|1[0-9]|2[0-4])$/.test(t.border_radius||''))tokens.push('--radius:'+t.border_radius+'px');
    style.textContent=':root{'+tokens.join(';')+'}';
    if(['system-ui','Inter, system-ui','Georgia, serif',"'Segoe UI', system-ui"].includes(t.font_family))style.textContent+='body{font-family:'+t.font_family+'}';
    document.head.append(style);
    document.querySelectorAll(logoSelector).forEach(img=>{
      img.style.removeProperty('display');
      delete img.dataset.imgFallback;
      setLogo(img,safeUrl(t.logo_url)?t.logo_url:defaultLogo);
    });
    if(safeUrl(t.favicon_url)){const link=document.querySelector('link[rel="icon"]');if(link)link.href=t.favicon_url;}
    const section=(d.sections||[]).find(s=>s.section_key==='announcement_bar');
    document.querySelectorAll('.promo').forEach(el=>{el.hidden=t.announcement_enabled==='false'||section?.enabled===false;});
    if(t.announcement_text)applyPromoCopy(t.announcement_text);
  };
  // Broken product image -> placeholder (capture phase catches <img> errors)
  document.addEventListener('error', function (e) {
    const t = e.target;
    // A failed CMS logo must restore the bundled branding, never hide it.
    if(t && t.tagName==='IMG' && t.matches(logoSelector)){
      t.style.removeProperty('display');
      if(t.getAttribute('src')!==defaultLogo)setLogo(t,defaultLogo);
      return;
    }
    if (t && t.tagName === 'IMG' && !t.dataset.imgFallback) {
      t.dataset.imgFallback = '1';
      const wrap = t.closest('.pimg, .pd-img, .pickimg, .dynamic-pd-img');
      const cat = t.alt || '';
      if (wrap) {
        wrap.innerHTML = '<div class="noimg"><b>CHASKABOX</b><span>Photo<br>coming soon</span><small>' +
          cat.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) +
          '</small></div>';
      } else {
        t.style.display = 'none';
      }
    }
  }, true);
  const DEFAULT_PHONE='0332-0005381', DEFAULT_EMAIL='Chaskabox.mzg@gmail.com';
  const DEFAULT_ADDRESS='Near Ahmad Drink Corner, Railway Road, Bhatti Hussainabad, Muzaffargarh, Pakistan';
  const money=n=>`Rs. ${Number(n||0).toLocaleString('en-PK')}`;
  const phoneDigits=v=>{let d=String(v||'').replace(/\D/g,'');if(d.startsWith('0')&&d.length===11)d='92'+d.slice(1);return d;};
  function replaceText(oldValue,newValue){
    if(!oldValue||!newValue||oldValue===newValue||!document.body)return;
    const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode(n){const p=n.parentElement;if(!p||['SCRIPT','STYLE','NOSCRIPT'].includes(p.tagName))return NodeFilter.FILTER_REJECT;return n.nodeValue.includes(oldValue)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;}});
    const nodes=[];while(w.nextNode())nodes.push(w.currentNode);nodes.forEach(n=>{n.nodeValue=n.nodeValue.split(oldValue).join(newValue)});
  }
  function replaceCommerceText(s){
    const cod=Number(s.cod_delivery_fee_pkr??300), pre=Number(s.prepaid_delivery_fee_pkr??300), threshold=Number(s.prepaid_free_delivery_threshold_pkr??5000), estimate=String(s.delivery_estimate||'4-7 days');
    const pairs=[
      ['COD: Rs. 300 delivery',`COD: ${money(cod)} delivery`],
      ['COD delivery charge Rs. 300',`COD delivery charge ${money(cod)}`],
      ['current delivery charge Rs. 300',`current delivery charge ${money(cod)}`],
      ['Rs. 5,000+: FREE delivery',`${money(threshold)}+: FREE delivery`],
      ['Prepaid Rs. 5,000+',`Prepaid ${money(threshold)}+`],
      ['orders of Rs. 5,000 or more',`orders of ${money(threshold)} or more`],
      ['below that threshold the current delivery charge is Rs. 300',`below that threshold the current prepaid delivery charge is ${money(pre)}`],
      ['4–7 days',estimate.replace('-', '–')],
      ['4-7 days',estimate],
    ];
    pairs.forEach(([a,b])=>replaceText(a,b));
    document.querySelectorAll('[data-dynamic-delivery]').forEach(el=>el.textContent=money(cod));
    document.querySelectorAll('[data-dynamic-threshold]').forEach(el=>el.textContent=money(threshold));
    document.querySelectorAll('[data-delivery-estimate]').forEach(el=>el.textContent=estimate);
  }
  async function run(){
    try{
      const d=await window.loadStorefrontManifest();const s=d?.settings||{};window.applyStorefrontManifest(d);
      const phone=String(s.support_whatsapp||DEFAULT_PHONE).trim(), email=String(s.support_email||DEFAULT_EMAIL).trim(), address=String(s.store_address||DEFAULT_ADDRESS).trim(), promo=String(s.promo_text||'').trim();
      if(promo||d?.theme?.announcement_text)applyPromoCopy(d?.theme?.announcement_text||promo);
      replaceText(DEFAULT_PHONE,phone);replaceText(DEFAULT_EMAIL,email);replaceText(DEFAULT_ADDRESS,address);replaceCommerceText(s);
      document.querySelectorAll('a[href^="mailto:"]').forEach(a=>{if(/chaskabox\.mzg@gmail\.com/i.test(a.getAttribute('href')||''))a.href='mailto:'+email});
      document.querySelectorAll('a[href*="wa.me/923320005381"]').forEach(a=>a.href='https://wa.me/'+phoneDigits(phone));
    }catch(e){console.warn('[site-runtime] settings unavailable');}
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',run):run();
})();
