/* ChaskaBox storefront: three-slide hero, with optional CMS-controlled copy.
 * Uses existing real catalog imagery; changes neither product artwork nor saved logo.
 */
(() => {
  'use strict';
  const root=document.querySelector('#view-home .hero');
  if(!root)return;
  const title=root.querySelector('.herotxt h1');
  const desc=root.querySelector('.herotxt > p');
  const eyebrow=root.querySelector('.hero-eyebrow');
  const kick=root.querySelector('.kick');
  const primary=root.querySelector('.hero-actions .cta');
  const secondary=root.querySelector('.hero-actions .cta.ghost');
  let controls=root.querySelector('.hero-slider-controls');
  // Entry pages for categories/brands can become Home via client-side navigation.
  if(!controls){
    controls=document.createElement('div');
    controls.className='hero-slider-controls';
    controls.setAttribute('role','group');
    controls.setAttribute('aria-label','Choose homepage banner');
    controls.innerHTML='<button type="button" data-hero-direction="previous" aria-label="Previous hero banner">‹</button>'+
      [0,1,2].map(i=>'<button type="button" data-hero-dot="'+i+'" aria-label="Show hero '+(i+1)+'" aria-pressed="'+(i===0)+'"></button>').join('')+
      '<button type="button" data-hero-direction="next" aria-label="Next hero banner">›</button>';
    root.querySelector('.herotrust')?.before(controls);
  }
  if(!title||!desc||!eyebrow||!kick||!primary||!secondary||!controls)return;
  const defaults=[
    {label:'Bachpan Ka Zaiqa',kick:'Pakistan ka snack box, dil se',
     eyebrow:'PAKISTANI SNACKS · SOURCED AFTER ORDER',
     heading:'Bachpan Ka Zaiqa, ',highlight:'Ab Ghar Baithe.',
     description:'Pakistani snacks & curated Chaska Boxes. Sourced after your order, delivered across Pakistan.',
     primary:'Shop Now',href:'/shop/',secondary:'Explore Chaska Boxes',secondHref:'/bundles/'},
    {label:'Curated Chaska Boxes',kick:'Har mood ka Chaska Box',
     eyebrow:'CURATED SNACK BOXES · GIFTING & SHARING',
     heading:'Har Box Mein ',highlight:'Bachpan Ki Yaadein.',
     description:'Apne favourite snacks aur Chaska Boxes discover karein. Original sealed packs, carefully sourced after your order.',
     primary:'Explore Chaska Boxes',href:'/bundles/',secondary:'Shop All Snacks',secondHref:'/shop/'},
    {label:'Snack Picks',kick:'Snacks jo dil khush kar dein',
     eyebrow:'CHASKA PICKS · SNACKS & TREATS',
     heading:'Apni Cravings Ka ',highlight:'Chaska Chuno!',
     description:'Chatpatay, meethay aur crunchy Pakistani favourites ek jagah. Available snacks aur deals explore karein.',
     primary:'Shop Snacks',href:'/shop/',secondary:'Browse Chaska Boxes',secondHref:'/bundles/'}
  ];
  const safeLink=s=>typeof s==='string'&&(/^(?:\/(?!\/)|https:\/\/)[^"'<>\s]*$/.test(s));
  const field=(value,fallback,max=180)=>typeof value==='string'&&value.trim()?value.trim().slice(0,max):fallback;
  let slides=defaults.map(s=>({...s}));
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const dots=Array.from(controls.querySelectorAll('[data-hero-dot]'));
  let current=0,timer=null;
  const stop=()=>{if(timer!==null){clearInterval(timer);timer=null;}};
  function show(index){
    current=(index+slides.length)%slides.length;
    const s=slides[current];
    kick.lastChild.textContent=' '+s.kick;
    eyebrow.textContent=s.eyebrow;
    title.replaceChildren(document.createTextNode(s.heading));
    const high=document.createElement('span');high.className='hl';high.textContent=s.highlight;title.append(high);
    desc.textContent=s.description;
    if(primary.firstChild?.nodeType===3)primary.firstChild.textContent=s.primary+' ';
    else primary.textContent=s.primary+' ›';
    primary.href=s.href;
    secondary.textContent=s.secondary;secondary.href=s.secondHref;
    const collage=root.querySelector('#heroCollage');
    const authenticImages=window.CHASKABOX_HERO_MARKUP?.[current];
    if(collage&&authenticImages&&collage.dataset.heroMarkupKey!==String(current)){
      collage.innerHTML=authenticImages;
      collage.dataset.heroMarkupKey=String(current);
    }
    root.dataset.heroSlide=String(current+1);
    dots.forEach((dot,i)=>{
      dot.setAttribute('aria-pressed',i===current?'true':'false');
      dot.setAttribute('aria-label','Show banner '+(i+1)+': '+slides[i].label);
    });
  }
  function start(){
    stop();
    if(media.matches||document.hidden||root.hidden||slides.length<2)return;
    // Banners advance only through the visible controls; no automatic rotation.
  }
  controls.addEventListener('click',event=>{
    const btn=event.target.closest('button');
    if(!btn||!controls.contains(btn))return;
    if(btn.dataset.heroDot!==undefined)show(Number(btn.dataset.heroDot));
    if(btn.dataset.heroDirection==='next')show(current+1);
    if(btn.dataset.heroDirection==='previous')show(current-1);
    start();
  });
  root.addEventListener('mouseenter',stop);
  root.addEventListener('mouseleave',start);
  root.addEventListener('focusin',stop);
  root.addEventListener('focusout',event=>{if(!root.contains(event.relatedTarget))start();});
  document.addEventListener('visibilitychange',()=>document.hidden?stop():start());
  if(media.addEventListener)media.addEventListener('change',start);
  window.addEventListener('chaskabox:home-config',event=>{
    const config=event.detail;
    if(!config||typeof config!=='object')return;
    const cmsSlides=Array.isArray(config.slides)?config.slides.slice(0,3):[];
    slides=defaults.map((base,i)=>{
      const item=cmsSlides[i]&&typeof cmsSlides[i]==='object'?cmsSlides[i]:{};
      const copy={...base};
      for(const key of ['label','kick','eyebrow','heading','highlight','description','primary','secondary']){
        copy[key]=field(item[key],copy[key],key==='description'?300:160);
      }
      for(const key of ['href','secondHref'])if(safeLink(item[key]))copy[key]=item[key];
      return copy;
    });
    if(!cmsSlides.length){
      if(typeof config.heading==='string'&&config.heading.trim()){
        slides[0].heading=field(config.heading,defaults[0].heading);
        slides[0].highlight=field(config.highlight,'');
      }
      slides[0].description=field(config.subheading,defaults[0].description,300);
      slides[0].primary=field(config.button_text,defaults[0].primary);
      if(safeLink(config.button_url))slides[0].href=config.button_url;
    }
    show(current);start();
  });
  root.addEventListener('hero-reveal',start);
  window.addEventListener('chaskabox:hero-imagery-ready',()=>{const node=root.querySelector('#heroCollage');if(node)delete node.dataset.heroMarkupKey;show(current);});
  show(0);start();
})();