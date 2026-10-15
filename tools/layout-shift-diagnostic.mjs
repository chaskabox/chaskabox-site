import { chromium } from 'playwright-core';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const targets=[{url:'https://chaskabox.online/',mode:'production'}];
if(process.env.PREVIEW_BASE_URL){
 const url=new URL('/',process.env.PREVIEW_BASE_URL).href;
 targets.push({url,mode:'preview'},{url,mode:'preview-with-live-public-data'});
}
for(const {url,mode} of targets){
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 await page.addInitScript(()=>{
  window.__seoShiftEntries=[];
  try{const obs=new PerformanceObserver(list=>{
   for(const e of list.getEntries()){
    if(e.hadRecentInput)continue;
    window.__seoShiftEntries.push({
     value:e.value,time:Math.round(e.startTime),
     elements:(e.sources||[]).map(s=>({
      node:s.node ? s.node.tagName.toLowerCase()+(s.node.id?'#'+s.node.id:'')+(s.node.className&&typeof s.node.className==='string'?'.'+s.node.className.trim().split(/\s+/).join('.').slice(0,95):''):'',
      old:s.previousRect?{x:s.previousRect.x,y:s.previousRect.y,w:s.previousRect.width,h:s.previousRect.height}:null,
      new:s.currentRect?{x:s.currentRect.x,y:s.currentRect.y,w:s.currentRect.width,h:s.currentRect.height}:null
     })).slice(0,8)
    });
   }
  });obs.observe({type:'layout-shift',buffered:true});}catch(e){}
 });
 if(mode==='preview-with-live-public-data'){
  // Browser-only, unauthenticated read-only stand-in; no Supabase credentials,
  // writes, sessions, or private backend access in preview.
  await page.route('**/api/**',async route=>{
   const u=new URL(route.request().url());
   if(!['/api/products','/api/storefront-config','/api/public-config'].includes(u.pathname))return route.continue();
   try{
    const publicResponse=await fetch('https://chaskabox.online'+u.pathname+u.search,{headers:{Accept:'application/json'}});
    await route.fulfill({status:publicResponse.status,contentType:'application/json',body:await publicResponse.text()});
   }catch{await route.fulfill({status:503,contentType:'application/json',body:'{}'});}
  });
 }
 const responses=[];
 page.on('response',r=>{if(/\/api\/(storefront-config|products)/.test(r.url()))responses.push({url:r.url(),status:r.status()});});
 try{
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:40000});
  await page.waitForTimeout(7500);
  const data=await page.evaluate(()=>({
   cmsSectionPositions:typeof STORE_CONFIG==='undefined'?[]:(STORE_CONFIG.sections||[]).map(x=>({key:x.section_key,position:x.position,enabled:x.enabled})),
   shifts:(window.__seoShiftEntries||[]).sort((a,b)=>b.value-a.value).slice(0,8),
   hero:document.querySelector('.hero')?.getBoundingClientRect().toJSON(),
   heroImages:document.querySelectorAll('#heroCollage img').length,
   shelves:document.querySelector('#shelves')?.children.length,
   categories:document.querySelector('#catTiles')?.children.length,
   homeVisible:!!document.querySelector('#view-home')?.getBoundingClientRect().height,
   header:document.querySelector('header')?.getBoundingClientRect().toJSON()
  }));
  console.log('SHIFT_DEBUG',JSON.stringify({url,mode,status:response.status(),responses, ...data}).slice(0,9000));
 }catch(e){console.log('SHIFT_DEBUG_ERROR',JSON.stringify({url,mode,error:String(e)}));}
 await page.close();
}
await browser.close();
