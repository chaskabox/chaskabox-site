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
    if(!a)return;
    a.setAttribute('role','button');
    a.setAttribute('aria-label','Browse brands');
    a.setAttribute('aria-haspopup','true');
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
    popup.style.top=Math.max(8,a.bottom+8)+'px';
  }
  function close(restore=false){
    if(popup.hidden)return;
    popup.hidden=true;
    if(trigger){trigger.setAttribute('aria-expanded','false');}
    if(restore)trigger?.focus();
    trigger=null;
  }
  let currentRequest=0;
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
      if(typeof fetchBrands==='function')brands=await fetchBrands();
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
    if(!wa||!fab)return;
    const box=fab.getBoundingClientRect();
    if(box.width<20)return;
    // Right edge of WA is 10px to the left of Chaska AI's left edge.
    wa.style.setProperty('--cb-wa-right',Math.round(innerWidth-box.left+10)+'px');
    wa.style.setProperty('--cb-wa-bottom',Math.max(10,Math.round(innerHeight-box.bottom))+'px');
    wa.setAttribute('aria-label','Order via WhatsApp');
    wa.setAttribute('title','Order via WhatsApp');
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
      // Space activates the brand dropdown as it would a native button.
      if(e.key===' ' && e.target===brandLink()){
        e.preventDefault();
        const a=e.target;
        if(trigger===a&&!popup.hidden)close();else open(a);
      } else if(e.key==='Escape'&&!popup.hidden){e.preventDefault();close(true);}
      else if(e.key==='ArrowDown'&&e.target===trigger&&!popup.hidden){
        e.preventDefault();popup.querySelector('a')?.focus();
      }
    });
    window.addEventListener('resize',()=>{position();alignWhatsapp();},{passive:true});
    window.addEventListener('scroll',position,{passive:true});
    const nav=document.querySelector('header .cbx-header-links, .cb-subnav-links');
    if(nav)new MutationObserver(decorate).observe(nav,{childList:true,subtree:true});
    alignWhatsapp();
    requestAnimationFrame(alignWhatsapp);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();