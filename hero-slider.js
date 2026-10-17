/* Homepage-only rotating messages; actual catalog photos are rendered by app.js. */
(() => {
  'use strict';
  const root = document.querySelector('#view-home .hero');
  if (!root) return;
  const title = root.querySelector('.herotxt h1');
  const desc = root.querySelector('.herotxt > p');
  const eyebrow = root.querySelector('.hero-eyebrow');
  const kick = root.querySelector('.kick');
  const primary = root.querySelector('.hero-actions .cta');
  const secondary = root.querySelector('.hero-actions .cta.ghost');
  const controls = root.querySelector('.hero-slider-controls');
  if (!title || !desc || !eyebrow || !kick || !primary || !secondary || !controls) return;
  const slides = [
    {kick:'Pakistan ka snack box, dil se', eyebrow:'PAKISTANI SNACKS • SOURCED AFTER ORDER',
     html:'Bachpan Ka Zaiqa, <span class="hl">Ab Ghar Baithe.</span>',
     copy:'Pakistan ke favourite snacks, order ke baad carefully source karke aapke darwaze tak. COD and prepaid options available nationwide.',
     primary:'Shop All Snacks', href:'/shop/', secondary:'Explore Chaska Boxes', secondHref:'/bundles/'},
    {kick:'Har mood ka Chaska Box', eyebrow:'CURATED SNACK BOXES • GIFTING & SHARING',
     html:'Har Box Mein <span class="hl">Bachpan Ki Yaadein.</span>',
     copy:'Apne favourite snacks aur curated Chaska Boxes discover karein. Original sealed packs, carefully sourced after your order.',
     primary:'Explore Chaska Boxes', href:'/bundles/', secondary:'Shop All Snacks', secondHref:'/shop/'},
    {kick:'Snacks jo dil khush kar dein', eyebrow:'CHASKA PICKS • SNACKS & TREATS',
     html:'Apni Cravings Ka <span class="hl">Chaska Chuno!</span>',
     copy:'Chatpatay, meethay aur crunchy Pakistani favourites ek jagah. Available offers aur snacks explore karein.',
     primary:'Shop Snacks', href:'/shop/', secondary:'Browse Chaska Boxes', secondHref:'/bundles/'}
  ];
  let current=0, timer=null;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const dots=Array.from(controls.querySelectorAll('[data-hero-dot]'));
  function show(i) {
    current=(i+slides.length)%slides.length;
    const s=slides[current];
    kick.lastChild.textContent=' '+s.kick;
    eyebrow.textContent=s.eyebrow;
    title.innerHTML=s.html;
    desc.textContent=s.copy;
    primary.textContent=s.primary+' ›';
    primary.href=s.href;
    secondary.textContent=s.secondary;
    secondary.href=s.secondHref;
    root.dataset.heroSlide=String(current+1);
    dots.forEach((dot,index)=>{dot.setAttribute('aria-current',index===current?'true':'false');dot.setAttribute('aria-label','Show hero '+(index+1)+': '+slides[index].kick);});
  }
  function stop(){if(timer){window.clearInterval(timer);timer=null;}}
  function start(){stop();if(reduced.matches || document.hidden)return;timer=window.setInterval(()=>show(current+1),7000);}
  controls.addEventListener('click',e=>{
    const target=e.target.closest('button');
    if(!target)return;
    if(target.dataset.heroDot!==undefined)show(Number(target.dataset.heroDot));
    else if(target.dataset.heroDirection==='next')show(current+1);
    else if(target.dataset.heroDirection==='previous')show(current-1);
    start();
  });
  root.addEventListener('mouseenter',stop);
  root.addEventListener('mouseleave',start);
  root.addEventListener('focusin',stop);
  root.addEventListener('focusout',e=>{if(!root.contains(e.relatedTarget))start();});
  document.addEventListener('visibilitychange',()=>document.hidden?stop():start());
  reduced.addEventListener?.('change',start);
  show(0); start();
})();