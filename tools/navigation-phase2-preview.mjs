// Real staging UI, read-only. Never submit orders, payments or help messages.
import {chromium} from 'playwright-core';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=(process.env.HERO_PREVIEW_URL||'').replace(/\/$/,'');
if(!/^https:\/\/[a-z0-9-]+\.chaskabox-site\.pages\.dev$/.test(base))throw Error('A Cloudflare branch preview is required');
const out='test-results/navigation-phase2';
await mkdir(out,{recursive:true});
const versions={
 'header-one-line.css':'20261019-line7',
 'header-discovery-preview.css':'20261019-header4',
 'sticky-motion-polish.css':'20261019-sticky4',
 'brands-header-dropdown.css':'20261019-brand3',
 'brands-header-dropdown.js':'20261019-brand7',
 'header-discovery-preview.js':'20261019-header7'
};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const expected=Object.fromEntries(await Promise.all(Object.keys(versions).map(async p=>[p,digest(await readFile(p))])));
let ready=false;
for(let attempt=0;attempt<24;attempt++){
 try{
  const matches=await Promise.all(Object.entries(versions).map(async([p,v])=>{
   const r=await fetch(base+'/'+p+'?v='+v);
   return r.ok&&digest(await r.text())===expected[p];
  }));
  if(matches.every(Boolean)){ready=true;break;}
 }catch{}
 await new Promise(resolve=>setTimeout(resolve,5000));
}
if(!ready)throw Error('The branch preview does not serve this commit’s navigation sources');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const results=[],blockedMutations=[];
const readOnly=context=>context.route('**/*',route=>{
 const request=route.request();
 if(['GET','HEAD','OPTIONS'].includes(request.method()))return route.continue();
 blockedMutations.push({method:request.method(),path:new URL(request.url()).pathname});
 return route.abort();
});
const viewports=[[320,740],[360,800],[390,844],[430,932],[768,1024],[1024,768],[1200,700],[1280,720],[1366,768],[1440,900],[1920,1080]];
try{
 for(const [width,height] of viewports){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'no-preference',serviceWorkers:'block'});
  await readOnly(context);
  const page=await context.newPage();
  try{
   const response=await page.goto(base+'/',{waitUntil:'domcontentloaded'});
   if(response?.status()!==200)throw Error('Homepage did not return 200');
   await page.evaluate(()=>document.fonts.ready);
   await page.waitForFunction(()=>document.body.classList.contains('cbx-header-ready')&&document.querySelector('body > .cbx-whatsapp-float'));
   await page.locator('#view-home .addcart').first().waitFor({state:'attached'});
   await page.waitForLoadState('networkidle');
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const header=await page.evaluate(()=>{
    const wrap=document.querySelector('header .hwrap'),nav=wrap.querySelector('.cbx-header-links');
    const nodes=[...wrap.children].filter(el=>el.getClientRects().length&&getComputedStyle(el).display!=='none');
    const boxes=nodes.map(el=>el.getBoundingClientRect()).sort((a,b)=>a.left-b.left);
    const actions=[wrap.querySelector('.account-btn'),wrap.querySelector('a[aria-label="My wishlist"]'),wrap.querySelector('.hbtn')];
    return {height:document.querySelector('header').getBoundingClientRect().height,
     centers:boxes.map(b=>b.top+b.height/2),
     noOverlap:boxes.every((b,i)=>!i||boxes[i-1].right<=b.left+2),
     overflow:document.documentElement.scrollWidth>innerWidth+2,
     navVisible:!!nav.getClientRects().length,
     navUnclipped:nav.scrollWidth<=nav.clientWidth+3,
     navClientWidth:nav.clientWidth,navScrollWidth:nav.scrollWidth,
     navFonts:[...nav.querySelectorAll('a')].map(a=>parseFloat(getComputedStyle(a).fontSize)),
     icons:actions.filter(el=>el&&el.getClientRects().length).map(el=>{const r=el.querySelector('svg').getBoundingClientRect();return {w:r.width,h:r.height};}),
     controls:[...document.querySelectorAll('#view-home .hero-slider-controls button')].map(el=>{const r=el.getBoundingClientRect();return {w:r.width,h:r.height};})};
   });
   if(header.overflow||!header.noOverlap||Math.max(...header.centers)-Math.min(...header.centers)>12)
    throw Error('Header alignment or page overflow '+JSON.stringify({width,...header}));
   if(width>=1200&&(!header.navVisible||!header.navUnclipped||header.navFonts.some(n=>n<13)))
    throw Error('Desktop navigation is clipped or too small '+JSON.stringify({width,...header}));
   if(header.controls.length!==6||header.controls.some(b=>b.w<43.5||b.h<43.5))
    throw Error('Merged header CSS shrinks hero controls '+JSON.stringify({width,...header}));
   if(header.icons.length<2||header.icons.some(b=>Math.abs(b.w-21)>1||Math.abs(b.h-21)>1))
    throw Error('Header action icons no longer share normal dimensions');
   await page.evaluate(()=>scrollTo({top:350,behavior:'instant'}));
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const sticky=await page.locator('body > header').evaluate(el=>{const b=el.getBoundingClientRect();return {y:b.top,h:b.height};});
   if(Math.abs(sticky.y)>2||Math.abs(sticky.h-header.height)>1)throw Error('Header changes height or leaves the viewport during scroll '+JSON.stringify({width,before:header.height,scrollY:await page.evaluate(()=>scrollY),...sticky}));
   await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
   results.push({case:'Readable, unclipped single-line header, stable sticky position and 44px hero controls',width,height,pass:true,header});
   const pair=await page.evaluate(()=>{
    const a=document.getElementById('helpFab').getBoundingClientRect(),w=document.querySelector('body > .cbx-whatsapp-float').getBoundingClientRect();
    const dock=document.querySelector('.cb-mobile-dock'),d=dock?.getBoundingClientRect();
    return {left:w.left,right:a.right,bottom:Math.max(a.bottom,w.bottom),gap:a.left-w.right,
     centerOffset:Math.abs((a.top+a.height/2)-(w.top+w.height/2)),waWidth:w.width,
     dockTop:d&&dock.getClientRects().length?d.top:innerHeight,
     extraGlyph:getComputedStyle(document.getElementById('helpFab'),'::after').content};
   });
   if(pair.left<0||pair.right>width||pair.bottom>pair.dockTop-7||pair.gap<8||pair.gap>12||pair.centerOffset>2||pair.waWidth<44||pair.waWidth>47||!['none','normal'].includes(pair.extraGlyph))
    throw Error('Support pair overlaps itself, mobile dock or viewport '+JSON.stringify({width,...pair}));
   await page.screenshot({path:out+'/phase2-home-'+width+'.png',fullPage:false});
   if(width<1200){
    const menu=page.locator('header .mnav-btn');
    await menu.click();
    await page.waitForFunction(()=>document.querySelector('#mnav.open')?.getAttribute('aria-hidden')==='false');
    const hidden=await page.evaluate(()=>['#helpFab','body > .cbx-whatsapp-float'].every(s=>getComputedStyle(document.querySelector(s)).visibility==='hidden'));
    if(!hidden)throw Error('Help buttons overlap the open navigation drawer');
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.querySelector('#mnav.open'));
    if(!await menu.evaluate(el=>el===document.activeElement))throw Error('Menu Escape does not return keyboard focus');
    results.push({case:'Compact menu opens, clears help controls and returns focus on Escape',width,pass:true});
   }else{
    const trigger=page.locator('header .cbx-brands-trigger'),dropdown=page.locator('#cbxBrandsDropdown');
    const start=page.url();
    await trigger.focus();
    await page.keyboard.press('Enter');
    await dropdown.locator('.cbx-brands-links a').first().waitFor({state:'visible'});
    if(page.url()!==start)throw Error('Brands activation navigates instead of opening its disclosure');
    const bounds=await dropdown.evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};});
    if(bounds.top<8||bounds.bottom>height-10||bounds.left<0||bounds.right>width)throw Error('Brands dropdown leaves the viewport '+JSON.stringify(bounds));
    await page.screenshot({path:out+'/phase2-brands-'+width+'.png',fullPage:false});
    const first=dropdown.locator('a[href]').first(),last=dropdown.locator('a[href]').last();
    await page.keyboard.press('Tab');
    if(!await first.evaluate(el=>el===document.activeElement))throw Error('Tab skips the first brand');
    await page.keyboard.press('Shift+Tab');
    if(!await trigger.evaluate(el=>el===document.activeElement))throw Error('Shift+Tab does not return to Brands');
    await last.focus();
    await page.keyboard.press('Tab');
    if(await dropdown.isVisible()||!await page.locator('header .cbx-header-links').evaluate(el=>el.contains(document.activeElement)))
     throw Error('Leaving the last brand jumps out of header navigation');
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(()=>document.querySelector('#cbxBrandsDropdown')?.contains(document.activeElement));
    await page.keyboard.press('Escape');
    if(await dropdown.isVisible()||!await trigger.evaluate(el=>el===document.activeElement))throw Error('Brands Escape loses focus');
    await trigger.click();
    await page.locator('#headerSearch').focus();
    if(await dropdown.isVisible())throw Error('Brands stays open after focus leaves');
    results.push({case:'Brands Enter/Tab/Shift+Tab/ArrowDown/Escape and viewport fit',width,pass:true,bounds});
   }
   // Open the category shortcut near the viewport bottom, where a fixed 54vh
   // panel would otherwise extend offscreen. This does not activate any link.
   await page.locator('.cbx-cat-trigger').evaluate(el=>{
    const r=el.getBoundingClientRect();scrollTo({top:scrollY+r.top-innerHeight+100,behavior:'instant'});
   });
   await page.locator('.cbx-cat-trigger').click();
   const categories=await page.locator('#cbxCatPanel').evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,scrollable:el.scrollHeight>el.clientHeight};});
   const headerBottom=await page.locator('body > header').evaluate(el=>el.getBoundingClientRect().bottom);
   if(categories.top<headerBottom-1||categories.bottom>height-10||categories.left<0||categories.right>width)
    throw Error('Category shortcut leaves the available viewport '+JSON.stringify({width,categories,headerBottom}));
   if(width===390||width===1200)await page.screenshot({path:out+'/phase2-categories-'+width+'.png',fullPage:false});
   await page.keyboard.press('Escape');
   if(await page.locator('#cbxCatPanel').isVisible()||!await page.locator('.cbx-cat-trigger').evaluate(el=>el===document.activeElement))throw Error('Category shortcut loses focus on Escape');
   results.push({case:'Category shortcut fits above or below its trigger and returns focus',width,pass:true,categories});
   // Scroll a real Add to Bag target beneath the support pair without activating it.
   await page.locator('#view-home .addcart').first().waitFor({state:'attached'});
   const target=await page.evaluate(()=>{
    const f=document.getElementById('helpFab').getBoundingClientRect(),w=document.querySelector('body > .cbx-whatsapp-float').getBoundingClientRect();
    return [...document.querySelectorAll('#view-home .addcart')].map((el,index)=>{
      const r=el.getBoundingClientRect(),rail=el.closest('.hscroll')?.getBoundingClientRect();
      const x=Math.max(r.left,rail?.left??0),right=Math.min(r.right,rail?.right??innerWidth);
      return {index,x,right,w:Math.max(0,right-x),y:r.top+scrollY+r.height/2};
     })
     .find(r=>r.w>0&&r.right>w.left&&r.x<f.right);
   });
   if(target){
    await page.evaluate(y=>{
     const f=document.getElementById('helpFab').getBoundingClientRect();
     const scroll=y-(f.top+f.height/2);scrollTo({top:scroll,behavior:'instant'});
    },target.y);
    await page.waitForFunction(()=>document.body.classList.contains('cbx-support-obscures-content')&&getComputedStyle(document.getElementById('helpFab')).visibility==='hidden');
    if(width===390||width===1366)await page.screenshot({path:out+'/phase2-clear-buy-button-'+width+'.png',fullPage:false});
   }
   // Dense card rows can correctly remain protected for several scroll offsets.
   // Restore over a real supporting-content area with no shopping controls.
   await page.locator('#view-home .why-section').evaluate(el=>{
    const r=el.getBoundingClientRect(),f=document.getElementById('helpFab').getBoundingClientRect();
    scrollTo({top:scrollY+r.top+r.height/2-f.top-f.height/2,behavior:'instant'});
   });
   await page.waitForFunction(()=>getComputedStyle(document.getElementById('helpFab')).visibility==='visible');
   await page.waitForTimeout(220);
   if(!await page.locator('#helpFab').isVisible())throw Error('Support controls do not remain available in clear supporting content');
   await page.locator('#helpFab').click();
   await page.waitForFunction(()=>document.querySelector('#aimodal.open')&&document.activeElement?.id==='aiq');
   const ai=await page.locator('#aimodal').evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};});
   if(ai.top<0||ai.left<0||ai.right>width||ai.bottom>height-50)throw Error('AI help panel leaves the usable viewport '+JSON.stringify(ai));
   if(await page.locator('body > .cbx-whatsapp-float').isVisible())throw Error('WhatsApp remains interactive outside the open help dialog');
   if(width===390||width===1366)await page.screenshot({path:out+'/phase2-help-open-'+width+'.png',fullPage:false});
   await page.keyboard.press('Escape');
   await page.waitForFunction(()=>!document.querySelector('#aimodal.open')&&document.activeElement?.id==='helpFab');
   results.push({case:'Help pair clears Add to Bag, restores, and opens/closes AI without sending a message',width,pass:true,buyClearance:target?'yields to painted shopping action':'support is outside the painted shopping columns',pair,ai});
  }catch(error){
   await page.screenshot({path:out+'/phase2-failure-'+width+'.png',fullPage:false}).catch(()=>{});
   results.push({pass:false,width,error:String(error?.stack||error)});process.exitCode=1;
  }finally{await context.close();}
 }
 // The navigation/support layer must not reintroduce motion under this preference.
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 await readOnly(context);
 const page=await context.newPage();
 try{
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  const trigger=page.locator('header .cbx-brands-trigger');
  await trigger.click();
  const motion=await page.evaluate(()=>{
   const p=getComputedStyle(document.querySelector('#cbxBrandsDropdown')),h=getComputedStyle(document.getElementById('helpFab')),n=getComputedStyle(document.querySelector('header .cbx-brands-trigger'));
   return {popup:p.animationName,help:h.animationName,helpTransition:h.transitionDuration,navTransition:n.transitionDuration};
  });
  if(motion.popup!=='none'||motion.help!=='none'||motion.helpTransition!=='0s'||motion.navTransition!=='0s')throw Error('Reduced motion is not respected '+JSON.stringify(motion));
  results.push({case:'Navigation and help controls honor reduced motion',pass:true,motion});
 }finally{await context.close();}
 for(const width of [390,1366]){
  const routeContext=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  await readOnly(routeContext);
  const routePage=await routeContext.newPage();
  try{
   for(const path of ['/shop/','/product/5/','/faq/','/about/','/contact/']){
    try{
    const response=await routePage.goto(base+path,{waitUntil:'domcontentloaded'});
    if(response?.status()!==200)throw Error('Navigation route failed '+path);
    await routePage.waitForFunction(()=>document.body.classList.contains('cbx-header-ready')&&document.querySelector('body > .cbx-whatsapp-float'));
    await routePage.evaluate(()=>document.fonts.ready);
    const geometry=await routePage.evaluate(()=>{
     const nav=document.querySelector('header .cbx-header-links'),wa=document.querySelector('body > .cbx-whatsapp-float').getBoundingClientRect();
     const dock=document.querySelector('.cb-mobile-dock'),d=dock?.getBoundingClientRect();
     return {overflow:document.documentElement.scrollWidth>innerWidth+2,
      navVisible:!!nav?.getClientRects().length,navUnclipped:nav.scrollWidth<=nav.clientWidth+3,
      fonts:[...nav.querySelectorAll('a')].map(a=>parseFloat(getComputedStyle(a).fontSize)),
      wa:{left:wa.left,right:wa.right,bottom:wa.bottom},dockTop:d&&dock.getClientRects().length?d.top:innerHeight};
    });
    if(geometry.overflow||geometry.wa.left<0||geometry.wa.right>width||geometry.wa.bottom>geometry.dockTop-7||
      width>=1200&&(!geometry.navVisible||!geometry.navUnclipped||geometry.fonts.some(n=>n<13)))
     throw Error('Shared header/support route regression '+JSON.stringify({width,path,...geometry}));
    if(width>=1200){
     const trigger=routePage.locator('header .cbx-brands-trigger');
     await trigger.click();
     await routePage.locator('#cbxBrandsDropdown .cbx-brands-links a').first().waitFor({state:'visible'});
     await routePage.keyboard.press('Escape');
     if(!await trigger.evaluate(el=>el===document.activeElement))throw Error('Shared Brands focus return failed '+path);
    }else if(path==='/about/'||path==='/contact/'){
     const summary=routePage.locator('.cb-static-menu summary');
     await summary.click();
     if(!await routePage.locator('.cb-static-menu').evaluate(el=>el.open))throw Error('Information-page menu did not open');
     if(await routePage.locator('body > .cbx-whatsapp-float').isVisible())throw Error('WhatsApp overlaps the static information menu');
     await routePage.keyboard.press('Escape');
     if(await routePage.locator('.cb-static-menu').evaluate(el=>el.open)||!await summary.evaluate(el=>el===document.activeElement))throw Error('Information-page menu Escape loses focus');
    }
    if(path==='/about/'||path==='/contact/')await routePage.screenshot({path:out+'/phase2-'+path.slice(1,-1)+'-'+width+'.png',fullPage:false});
    results.push({case:'Shared shopping/information header, public Brands data and safe support position',width,path,pass:true});
    }catch(error){
     await routePage.screenshot({path:out+'/phase2-route-failure-'+path.replace(/\W/g,'-')+'-'+width+'.png',fullPage:false}).catch(()=>{});
     results.push({pass:false,width,path,error:String(error?.stack||error)});process.exitCode=1;
    }
   }
  }finally{await routeContext.close();}
 }
}catch(error){results.push({pass:false,error:String(error?.stack||error)});process.exitCode=1;}
finally{
 await writeFile(out+'/results.json',JSON.stringify({base,sourceHashes:expected,blockedMutations,results},null,2));
 await browser.close();
}
console.log(JSON.stringify({base,checks:results.map(({header,pair,ai,...entry})=>entry),blockedMutations},null,2));
