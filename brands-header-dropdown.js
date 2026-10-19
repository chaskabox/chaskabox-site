/* Accessible brand navigation + compact WhatsApp beside Chaska AI.
 * Presentation only. Brands come from the existing public /api/brands cache.
 * No replacement of admin-managed header links or WhatsApp destination. */
(() => {
  'use strict';
  let trigger=null;
  const popup=document.createElement('div');
  popup.id='cbxBrandsDropdown';
  popup.className='cbx-brands-popover';
  popup.hidden=true;
  popup.setAttribute('role','region');
  popup.setAttribute('aria-label','Browse ChaskaBox brands');
  popup.setAttribute('aria-live','polite');
  const header=document.createElement('div');
  header.className='cbx-brands-heading';
  header.textContent='Shop by Brand';
  const links=document.createElement('div');
  links.className='cbx-brands-links';
  popup.append(header,links);
  const all=document.createElement('a');
  all.href='/brands/';
  all.className='cbx-brands-all';
  all.textContent='View all brands →';
  popup.append(all);
  function brandLink(){
    return [...document.querySelectorAll('header .cbx-header-links a[href], .cb-subnav-links a[href]')]
      .find(a=>{try{return new URL(a.href,location.href).pathname.replace(/\/+$/,'/')==='/brands/';}catch{return false;}});
  }
  function decorate(){
    const a=brandLink();
    if(trigger&&trigger!==a)close();
    if(!a)return;
    a.setAttribute('role','button');
    a.setAttribute('aria-label','Browse brands');
    // This is a disclosure of ordinary navigation links, not an ARIA menu.
    a.removeAttribute('aria-haspopup');
    a.setAttribute('aria-expanded',String(!popup.hidden&&trigger===a));
    a.setAttribute('aria-controls',popup.id);
    a.classList.add('cbx-brands-trigger');
  }
  function position(){
    if(!trigger||popup.hidden)return;
    const a=trigger.getBoundingClientRect();
    if(a.width<=0){close();return;}
    const width=Math.min(310,innerWidth-24);
    const left=Math.max(12,Math.min(a.left-16,innerWidth-width-12));
    popup.style.width=width+'px';
    popup.style.left=left+'px';
    const top=Math.max(8,a.bottom+8);
    popup.style.top=top+'px';
    popup.style.maxHeight=Math.max(0,Math.min(430,innerHeight-top-12))+'px';
  }
  function close(restore=false){
    if(popup.hidden)return;
    popup.hidden=true;
    if(trigger){trigger.setAttribute('aria-expanded','false');}
    if(restore)trigger?.focus();
    trigger=null;
  }
  let currentRequest=0;
  let publicBrands=null;
  function loadBrands(){
    if(typeof fetchBrands==='function')return fetchBrands();
    // Standalone information pages do not load the shopping application.
    // Reuse its public brand endpoint without account credentials or mutations.
    if(!publicBrands)publicBrands=fetch('/api/brands',{credentials:'omit',headers:{Accept:'application/json'}})
      .then(r=>{if(!r.ok)throw Error('Brand directory unavailable');return r.json();})
      .then(data=>Array.isArray(data.brands)?data.brands:[])
      .catch(()=>{publicBrands=null;return[];});
    return publicBrands;
  }
  async function open(a){
    close();
    trigger=a;
    a.setAttribute('aria-expanded','true');
    links.replaceChildren();
    const waiting=document.createElement('p');
    waiting.className='cbx-brands-status';
    waiting.textContent='Loading brands…';
    links.append(waiting);
    popup.hidden=false;
    position();
    const token=++currentRequest;
    let brands=[];
    try{
      brands=await loadBrands();
    }catch{brands=[];}
    if(token!==currentRequest||trigger!==a||popup.hidden)return;
    const unique=new Set();
    const shown=(Array.isArray(brands)?brands:[])
      .filter(b=>b&&typeof b.name==='string'&&b.name.trim()&&Number(b.productCount)>0&&typeof b.slug==='string'&&b.slug.trim())
      .filter(b=>{const key=b.slug.toLowerCase();if(unique.has(key))return false;unique.add(key);return true;})
      .sort((a,b)=>Number(b.productCount)-Number(a.productCount)||a.name.localeCompare(b.name))
      .slice(0,12);
    links.replaceChildren();
    if(!shown.length){
      const empty=document.createElement('p');
      empty.className='cbx-brands-status';
      empty.textContent='Browse our full brand directory.';
      links.append(empty);
    } else for(const brand of shown){
      const link=document.createElement('a');
      link.href='/brand/'+encodeURIComponent(brand.slug)+'/';
      const label=document.createElement('span');
      label.textContent=brand.name;
      const count=document.createElement('small');
      count.textContent=String(brand.productCount);
      count.setAttribute('aria-label',String(brand.productCount)+' products');
      link.append(label,count);
      links.append(link);
    }
    position();
  }
  function alignWhatsapp(){
    const wa=document.querySelector('body > a.cbx-whatsapp-float');
    const fab=document.querySelector('#helpFab');
    if(!wa)return;
    if(!fab){
      const dock=document.querySelector('.cb-mobile-dock');
      const visible=dock&&dock.getClientRects().length;
      wa.style.setProperty('--cb-wa-right','max(12px,env(safe-area-inset-right))');
      wa.style.setProperty('--cb-wa-bottom',(visible?innerHeight-dock.getBoundingClientRect().top+12:20)+'px');
      return;
    }
    const box=fab.getBoundingClientRect();
    if(box.width<20)return;
    // Right edge of WA is 10px to the left of Chaska AI's left edge.
    wa.style.setProperty('--cb-wa-right',Math.round(innerWidth-box.left+10)+'px');
    wa.style.setProperty('--cb-wa-bottom',Math.max(10,Math.round(innerHeight-box.bottom))+'px');
    wa.setAttribute('aria-label','Order via WhatsApp');
    wa.setAttribute('title','Order via WhatsApp');
  }
  function watchSupportClearance(){
    const fab=document.getElementById('helpFab');
    const wa=document.querySelector('body > a.cbx-whatsapp-float');
    if(!wa)return;
    const controls=[fab,wa].filter(Boolean);
    let frame=0,rescan=true,revealTimer=null,lastMovement=0;
    const near=new Set();
    const selector='main a[href]:not(.pimg):not(.cat),main button,main input,main select,main textarea,main .price,main .herotrust,main .cb-trust-rail,footer a[href]';
    const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
      entries.forEach(e=>{if(e.isIntersecting)near.add(e.target);else near.delete(e.target);});
      schedule();
    }):null;
    function schedule(refresh=false){
      if(refresh===true){rescan=true;lastMovement=performance.now();}
      if(refresh?.type==='scroll'||refresh?.type==='resize')lastMovement=performance.now();
      if(frame)return;
      frame=requestAnimationFrame(()=>{
        frame=0;
        if(rescan){
          rescan=false;observer?.disconnect();near.clear();
          document.querySelectorAll(selector).forEach(el=>{if(observer)observer.observe(el);else near.add(el);});
        }
        alignWhatsapp();
        // A focused help action must never disappear under the keyboard user.
        const retain=document.activeElement===fab||document.activeElement===wa||
          document.getElementById('aimodal')?.classList.contains('open');
        const boxes=controls.map(el=>el.getBoundingClientRect());
        const obscures=!retain&&[...near].some(el=>{
          if(!el.isConnected)return false;
          const r=el.getBoundingClientRect();
          return r.width>0&&r.height>0&&boxes.some(b=>r.left<b.right+4&&r.right>b.left-4&&r.top<b.bottom+4&&r.bottom>b.top-4);
        });
        clearTimeout(revealTimer);
        // Let intersection updates settle before revealing again. During a
        // scroll, a newly visible price/action can arrive one observer frame late.
        const remaining=180-(performance.now()-lastMovement);
        if(!obscures&&!retain&&remaining>0&&document.body.classList.contains('cbx-support-obscures-content')){
          revealTimer=setTimeout(()=>schedule(),remaining);
        }else document.body.classList.toggle('cbx-support-obscures-content',obscures);
      });
    }
    window.addEventListener('scroll',schedule,{passive:true});
    window.addEventListener('resize',schedule,{passive:true});
    window.visualViewport?.addEventListener('resize',schedule,{passive:true});
    document.addEventListener('focusin',schedule);
    if(typeof ResizeObserver==='function'){
      const sizes=new ResizeObserver(schedule);controls.forEach(el=>sizes.observe(el));
    }
    const changes=new MutationObserver(()=>schedule(true));
    for(const root of document.querySelectorAll('main,footer'))changes.observe(root,{childList:true,subtree:true});
    document.fonts?.ready.then(()=>schedule());
    schedule();
  }
  function init(){
    if(!document.body.classList.contains('reference-storefront'))return;
    document.body.append(popup);
    decorate();
    // Capture ahead of app.js's document bubble-phase SPA link router.
    // Without capture, its /brands/ navigation fires before our preventDefault().
    document.addEventListener('click',e=>{
      const a=e.target.closest?.('header .cbx-header-links a, .cb-subnav-links a');
      if(a && a===brandLink() && e.button===0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey){
        e.preventDefault();
        if(trigger===a&&!popup.hidden)close();
        else open(a);
        return;
      }
      if(!popup.hidden&&!popup.contains(e.target))close();
    },true);
    document.addEventListener('keydown',e=>{
      const brand=brandLink();
      const items=[...popup.querySelectorAll('a[href]')];
      // The fixed popover is portalled to body to escape nav clipping. Bridge
      // its Tab order to the original trigger instead of jumping to the footer.
      if(e.key==='Tab'&&!popup.hidden){
        if(e.target===trigger){
          if(e.shiftKey)close();
          else{e.preventDefault();items[0]?.focus();}
        }else if(e.shiftKey&&e.target===items[0]){
          e.preventDefault();trigger?.focus();
        }else if(!e.shiftKey&&e.target===items.at(-1)){
          const next=[...document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
            .filter(el=>!popup.contains(el)&&!el.closest('[inert]')&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
          const destination=next[next.indexOf(trigger)+1];
          e.preventDefault();close();destination?.focus();
        }
      }
      // Space activates the brand dropdown as it would a native button.
      if(e.key===' ' && e.target===brand){
        e.preventDefault();
        const a=e.target;
        if(trigger===a&&!popup.hidden)close();else open(a);
      } else if(e.key==='Escape'&&!popup.hidden){e.preventDefault();close(true);}
      else if(e.key==='ArrowDown'&&e.target===brand){
        e.preventDefault();
        if(popup.hidden)open(brand).then(()=>{
          if(trigger===brand&&!popup.hidden&&document.activeElement===brand)popup.querySelector('a')?.focus();
        });
        else popup.querySelector('a')?.focus();
      }
    });
    document.addEventListener('focusin',e=>{
      if(!popup.hidden&&e.target!==trigger&&!popup.contains(e.target))close();
    });
    window.addEventListener('resize',()=>{position();alignWhatsapp();},{passive:true});
    window.addEventListener('scroll',position,{passive:true});
    const nav=document.querySelector('header .cbx-header-links, .cb-subnav-links');
    if(nav)new MutationObserver(decorate).observe(nav,{childList:true,subtree:true});
    alignWhatsapp();
    requestAnimationFrame(alignWhatsapp);
    watchSupportClearance();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
