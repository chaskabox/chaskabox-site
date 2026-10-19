// Read-only UI acceptance on the exact Cloudflare branch preview.
// No cart, checkout, account, payment or messaging action is performed.
import {chromium} from 'playwright-core';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=(process.env.HERO_PREVIEW_URL||'').replace(/\/$/,'');
if(!/^https:\/\/[a-z0-9-]+\.chaskabox-site\.pages\.dev$/.test(base))throw Error('A Cloudflare branch preview is required');
const out='test-results/hero-phase1';
await mkdir(out,{recursive:true});
const hash=s=>createHash('sha256').update(s).digest('hex');
const expected=hash(await readFile('home-hero-carousel.js'));
let ready=false;
for(let attempt=0;attempt<24;attempt++){
 try{const r=await fetch(base+'/home-hero-carousel.js?v=20261019-hero1');
  if(r.ok&&hash(await r.text())===expected){ready=true;break;}
 }catch{}
 await new Promise(resolve=>setTimeout(resolve,5000));
}
if(!ready)throw Error('Branch preview does not serve this commit’s carousel source');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const results=[];
try{
 for(const [width,height] of [[320,740],[360,800],[390,844],[430,932],[768,1024],[1024,768],[1366,768],[1440,900]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'no-preference'});
  try{
   const response=await page.goto(base+'/',{waitUntil:'domcontentloaded'});
   if(response?.status()!==200)throw Error('Preview homepage did not return 200');
   await page.evaluate(()=>document.fonts.ready);
   const hero=page.locator('#view-home .hero');
   const dots=hero.locator('[data-hero-dot]');
   if(await dots.count()!==3)throw Error('Approved three-slide navigation missing');
   const slides=[];
   for(let index=0;index<3;index++){
    await dots.nth(index).click();
    await hero.locator('.hero-scene').evaluate(async img=>{await img.decode();});
    // Measure settled layout, not the independent category reveal transition
    // that may begin when the homepage first intersects its observer margin.
    await page.locator('.discover').evaluate(async section=>{
     await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
     await Promise.all(section.getAnimations().map(animation=>animation.finished.catch(()=>{})));
    });
    const geometry=await hero.evaluate(root=>{
     const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom,right:r.right};};
     const controls=root.querySelector('.hero-slider-controls');
     const copy=root.querySelector('.herotxt');
     return {slide:root.dataset.heroSlide,root:rect(root),frame:rect(root.querySelector('.herowrap')),
      categoryY:document.getElementById('shopByTitle').getBoundingClientRect().top,
      controls:rect(controls),copy:rect(copy),actions:rect(root.querySelector('.hero-actions')),
      copyContainsControls:copy.contains(controls),heading:rect(root.querySelector('h1')),
      buttons:[...controls.querySelectorAll('button')].map(rect),
      overflow:document.documentElement.scrollWidth>innerWidth+2,
      src:root.querySelector('.hero-scene').getAttribute('src'),
      trust:root.querySelector('.herotrust').innerText.replace(/\s+/g,' ').trim(),
      ctas:[...root.querySelectorAll('.hero-actions a')].map(a=>({href:new URL(a.href).pathname,...rect(a)}))};
    });
    if(geometry.overflow)throw Error('Horizontal overflow '+JSON.stringify(geometry));
    if(!geometry.copyContainsControls||geometry.controls.y<geometry.actions.bottom-1||
      geometry.controls.bottom>geometry.copy.bottom+1||geometry.controls.right>geometry.copy.right+1)
      throw Error('Controls overlap shopping content or leave the text column '+JSON.stringify(geometry));
    if(geometry.buttons.length!==6||geometry.buttons.some(r=>r.w<43.5||r.h<43.5))
      throw Error('Carousel targets must be at least 44px '+JSON.stringify(geometry));
    if(geometry.ctas.length!==2||geometry.ctas.some(a=>a.h<43.5||!['/shop/','/bundles/'].includes(a.href)))
      throw Error('Shopping destinations or accessible CTA size changed');
    if(!geometry.src.includes('hero-0'+(index+1)+'-20261018.avif'))throw Error('Approved artwork changed');
    if(geometry.heading.y<geometry.copy.y-1||geometry.heading.bottom>geometry.copy.bottom+1)
      throw Error('Hero headline does not fit');
    slides.push(geometry);
    await page.screenshot({path:out+'/hero-'+width+'-'+(index+1)+'.png',fullPage:false});
   }
   const spread=key=>Math.max(...slides.map(key))-Math.min(...slides.map(key));
   if(spread(s=>s.root.h)>1||spread(s=>s.frame.h)>1||spread(s=>s.categoryY)>1)
    throw Error('Slide change shifts the frame or category section '+JSON.stringify(slides));
   if(new Set(slides.map(s=>s.trust)).size!==1)throw Error('Trust information changes between slides');
   if(width>=1024&&height<=800&&slides.some(s=>s.categoryY>height-40))
    throw Error('Category heading remains outside the short desktop first fold');
   results.push({case:'Stable three-slide layout, visible copy, 44px controls and unchanged destinations',width,height,pass:true,slides});
  }finally{await page.close();}
 }
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
 try{
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  const hero=page.locator('#view-home .hero');
  const selected=()=>hero.getAttribute('data-hero-slide');
  const playback=hero.locator('[data-hero-autoplay]');
  const moveAway=async()=>{await page.locator('#headerSearch').focus();await page.mouse.move(2,2);};
  await hero.locator('[data-hero-dot="1"]').click();
  await moveAway();
  await page.waitForTimeout(5300);
  if(await selected()!=='2'||await playback.getAttribute('aria-label')!=='Play automatic banner rotation')
   throw Error('Manual selection did not persist after hover/focus ended');
  await playback.click();
  await moveAway();
  await page.waitForTimeout(5300);
  if(await selected()!=='3')throw Error('Explicit Play did not resume the five-second timer');
  await playback.click();
  await moveAway();
  await page.waitForTimeout(5300);
  if(await selected()!=='3')throw Error('Explicit Pause did not persist');
  results.push({case:'Manual selection, Play and Pause across real five-second intervals',pass:true});
 }finally{await page.close();}
 const reduced=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 try{
  await reduced.goto(base+'/',{waitUntil:'domcontentloaded'});
  const control=reduced.locator('[data-hero-autoplay]');
  if(!await control.isDisabled())throw Error('Reduced motion should disable autoplay');
  await reduced.locator('[data-hero-dot="2"]').click();
  await reduced.locator('#cbMobileSearch').focus();
  await reduced.mouse.move(2,2);
  await reduced.waitForTimeout(5300);
  if(await reduced.locator('#view-home .hero').getAttribute('data-hero-slide')!=='3')
   throw Error('Reduced motion permits an automatic advance');
  results.push({case:'Reduced-motion users retain manual navigation without autoplay',pass:true});
 }finally{await reduced.close();}
}catch(error){
 results.push({pass:false,error:String(error?.stack||error)});
 process.exitCode=1;
}finally{
 await writeFile(out+'/results.json',JSON.stringify({base,sourceHash:expected,results},null,2));
 await browser.close();
}
console.log(JSON.stringify({base,checks:results.map(({slides,...entry})=>entry)},null,2));
