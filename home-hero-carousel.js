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
      '<button type="button" data-hero-direction="next" aria-label="Next hero banner">›</button>'+
      '<button type="button" data-hero-autoplay aria-label="Pause automatic banner rotation"><span data-hero-autoplay-icon aria-hidden="true">Ⅱ</span><span data-hero-autoplay-label>Pause</span></button>';
    const copy=root.querySelector('.herotxt');
    if(copy)copy.append(controls);
    else root.querySelector('.herotrust')?.before(controls);
  }
  if(!title||!desc||!eyebrow||!primary||!secondary||!controls)return;
  // Approved slider copy (2026-10-18). Art files must be separately approved and attached.
  // Shared trust/delivery strip is outside this carousel and NEVER changes with slide.
  const defaults=[
    {label:'Bachpan Ka Zaiqa',kick:'Pakistan ka snack box, dil se',
     eyebrow:'ORIGINAL PAKISTANI SNACKS',
     heading:'Bachpan Ka Zaiqa, ',highlight:'Ab Ghar Baithe!',
     description:'Woh bachpan ki pasandeeda candies, nimco, chips aur meethay snacks — ab phir se discover karein. Har bite ke saath purani yaadon ka maza, ChaskaBox ke saath!',
     primary:'Shop All Snacks',href:'/shop/',secondary:'Explore Chaska Boxes',secondHref:'/bundles/'},
    {label:'Gift Nahi, Ek Pyari Si Yaad',kick:'A little box of happiness',
     eyebrow:'A LITTLE BOX OF HAPPINESS',
     heading:'Sirf Gift Nahi, ',highlight:'Ek Pyari Si Yaad!',
     description:'Kuch tohfay sirf diye nahi jaate, yaad bhi rakhe jaate hain. Apno ko unke favourite snacks ka surprise dein, ChaskaBox ke saath.',
     primary:'Explore Gift Boxes',href:'/bundles/',secondary:'Shop All Snacks',secondHref:'/shop/'},
    {label:'Favourite Snacks',kick:'Original Pakistani snacks',
     eyebrow:'ORIGINAL PAKISTANI SNACKS',
     heading:'Pakistan Ke Favourite Snacks, ',highlight:'Ab Ghar Baithe!',
     description:'Chips, chocolates, nimco, candies aur bachpan ke favourites — original branded snacks, carefully sourced after your order aur Pakistan bhar mein delivered.',
     primary:'Shop All Snacks',href:'/shop/',secondary:'Explore Chaska Boxes',secondHref:'/bundles/'}
  ];
  const safeLink=s=>typeof s==='string'&&(/^(?:\/(?!\/)|https:\/\/)[^"'<>\s]*$/.test(s));
  const field=(value,fallback,max=180)=>typeof value==='string'&&value.trim()?value.trim().slice(0,max):fallback;
  let slides=defaults.map(s=>({...s}));
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const dots=Array.from(controls.querySelectorAll('[data-hero-dot]'));
  const autoplay=controls.querySelector('[data-hero-autoplay]');
  // Five-second rotation within the owner's requested 4–6 second window.
  // Respect reduced motion, hidden tabs, hover and keyboard focus.
  const AUTO_ADVANCE_MS=5000;
  let current=0,timer=null,userPaused=false;
  const stop=()=>{if(timer!==null){clearInterval(timer);timer=null;}};
  function updatePlayback(){
    if(!autoplay)return;
    const reduced=media.matches;
    const paused=reduced||userPaused;
    const label=reduced?'Automatic rotation disabled by reduced motion':
      paused?'Play automatic banner rotation':'Pause automatic banner rotation';
    autoplay.disabled=reduced;
    autoplay.setAttribute('aria-label',label);
    autoplay.setAttribute('title',label);
    autoplay.querySelector('[data-hero-autoplay-label]').textContent=reduced?'Paused':paused?'Play':'Pause';
    autoplay.querySelector('[data-hero-autoplay-icon]').textContent=paused?'▶':'Ⅱ';
  }
  function show(index){
    current=(index+slides.length)%slides.length;
    const s=slides[current];
    if(kick)kick.lastChild.textContent=' '+s.kick;
    eyebrow.textContent=s.eyebrow;
    title.replaceChildren(document.createTextNode(s.heading));
    const high=document.createElement('span');high.className='hl';high.textContent=s.highlight;title.append(high);
    desc.textContent=s.description;
    if(primary.firstChild?.nodeType===3)primary.firstChild.textContent=s.primary+' ';
    else primary.textContent=s.primary+' ›';
    primary.href=s.href;
    secondary.textContent=s.secondary;secondary.href=s.secondHref;
    // These three artworks are the owner's approved reference banners, not
    // interchangeable backgrounds. Keep original framing; CSS adapts mobile crop.
    const artworks=[
      ['/images/chaskabox-approved-hero-01-20261018.avif',1600,550,'ChaskaBox nostalgic snack-box banner (illustrative artwork)'],
      ['/images/chaskabox-approved-hero-02-20261018.avif',1600,550,'ChaskaBox gifting banner (illustrative artwork)'],
      ['/images/chaskabox-approved-hero-03-20261018.avif',1411,554,'ChaskaBox favourite snacks banner, original approved crop']
    ];
    const art=root.querySelector('.hero-scene');
    const selected=artworks[current];
    if(art&&selected){
      if(art.getAttribute('src')!==selected[0])art.setAttribute('src',selected[0]);
      art.width=selected[1];art.height=selected[2];art.alt=selected[3];
    }
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
    updatePlayback();
    if(userPaused||media.matches||document.hidden||root.hidden||!root.getClientRects().length||slides.length<2)return;
    if(root.matches(':hover')||root.contains(document.activeElement))return;
    timer=setInterval(()=>{
      if(media.matches||document.hidden||root.hidden||!root.getClientRects().length){
        stop();
        return;
      }
      show(current+1);
    },AUTO_ADVANCE_MS);
  }
  controls.addEventListener('click',event=>{
    const btn=event.target.closest('button');
    if(!btn||!controls.contains(btn))return;
    if(btn===autoplay){userPaused=!userPaused;start();return;}
    // A manual selection is deliberate. Keep it until the user chooses Play,
    // including after hover/focus changes, route revisits and CMS refreshes.
    userPaused=true;
    stop();
    if(btn.dataset.heroDot!==undefined)show(Number(btn.dataset.heroDot));
    if(btn.dataset.heroDirection==='next')show(current+1);
    if(btn.dataset.heroDirection==='previous')show(current-1);
    updatePlayback();
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
