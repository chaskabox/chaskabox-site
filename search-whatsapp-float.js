/* Public storefront presentation only: float the existing WhatsApp link outside the
   sticky header so search has room. Reuses the original anchor + live href. */
(() => {
  'use strict';
  const move = () => {
    const old = document.querySelector('a.cbx-whatsapp-float');
    if(old)return;
    const link=document.querySelector('.hwrap a.cbx-header-whatsapp, .cb-subnav a.cb-contact');
    if(link && document.body.classList.contains('reference-storefront')){
      link.classList.add('cbx-whatsapp-float');
      link.setAttribute('aria-label','Order via WhatsApp');
      link.setAttribute('title','Order via WhatsApp');
      // Keep the original anchor/href so site settings can update support number.
      const text=document.createElement('span');
      text.className='cbx-wa-caption';
      text.textContent='WhatsApp';
      const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
      icon.setAttribute('viewBox','0 0 24 24');
      icon.setAttribute('aria-hidden','true');
      icon.setAttribute('focusable','false');
      icon.setAttribute('fill','none');
      icon.setAttribute('stroke','currentColor');
      icon.setAttribute('stroke-width','1.85');
      icon.setAttribute('stroke-linecap','round');
      icon.setAttribute('stroke-linejoin','round');
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d','M20.4 11.7a8.4 8.4 0 0 1-12.1 7.5L3 20.6l1.5-5.1A8.4 8.4 0 1 1 20.4 11.7ZM8.5 8.5c-.4.5-.5 1.4.1 2.5a11 11 0 0 0 4.5 4.5c1.1.6 2 .5 2.5.1l.9-.9-2.4-1.2-.8.8a7.1 7.1 0 0 1-3.2-3.2l.8-.8L9.4 7.5l-.9 1Z');
      icon.append(path);
      link.replaceChildren(icon,text);
      document.body.appendChild(link);
    }
    const search=document.querySelector('#headerSearch');
    if(search && /^(Search for your favourite snacks|Search snacks, brands or Chaska Boxes)/i.test(search.placeholder)){
      search.placeholder='Search snacks & brands…';
    }
    const mobile=document.querySelector('#cbMobileSearch');
    if(mobile && /^Search snacks, brands, Chaska Boxes/i.test(mobile.placeholder)){
      mobile.placeholder='Search snacks & brands…';
    }
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',move,{once:true});
  else move();
})();