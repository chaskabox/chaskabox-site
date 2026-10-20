// Read-only deployed SSR/hydration diagnostics; never submits writes.
import {chromium} from 'playwright-core';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 for(const base of ['https://chaskabox.online','https://fix-full-closeout-20261020.chaskabox-site.pages.dev'])for(const route of ['/product/39/','/shop/']){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1.75,isMobile:true,hasTouch:true});
  await context.route('**/*',async r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.fulfill({status:204}));
  const page=await context.newPage();
  const selector=route.includes('product')?'#pdetail .pd-img > img':'#shopGrid article.card a.pimg > img';
  await page.addInitScript(selector=>{
   window.qaMedia={initial:null,changes:[],paints:[]};
   const info=n=>n?{src:n.getAttribute('src'),srcset:n.getAttribute('srcset'),sizes:n.getAttribute('sizes'),alt:n.alt,currentSrc:n.currentSrc}:null;
   const capture=new MutationObserver(records=>{
    const current=document.querySelector(selector);if(!current)return;
    if(!window.qaMedia.initial){window.qaInitialImage=current;window.qaMedia.initial=info(current);}
    for(const r of records)if(r.target===current||r.target===window.qaInitialImage)window.qaMedia.changes.push({time:performance.now(),attribute:r.attributeName,value:info(r.target)});
    if(current!==window.qaInitialImage&&!window.qaMedia.replacedAt)window.qaMedia.replacedAt=performance.now();
   });
   capture.observe(document,{childList:true,attributes:true,attributeFilter:['src','srcset','sizes'],subtree:true});
   try{new PerformanceObserver(list=>{for(const e of list.getEntries())window.qaMedia.paints.push({time:e.startTime,size:e.size,url:e.url,element:e.element?.tagName,src:e.element?.getAttribute('src')});}).observe({type:'largest-contentful-paint',buffered:true});}catch{}
  },selector);
  const response=await page.goto(base+route,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(6500);
  const result=await page.evaluate(selector=>({status:'loaded',...window.qaMedia,same:window.qaInitialImage===document.querySelector(selector),connected:window.qaInitialImage?.isConnected,current:document.querySelector(selector)?.outerHTML,apiRequests:performance.getEntriesByType('resource').filter(r=>r.name.includes('/api/')).map(r=>({path:new URL(r.name).pathname,start:r.startTime,end:r.responseEnd})),htmlLength:document.documentElement.outerHTML.length}),selector);
  console.log('DEPLOYED_MEDIA '+JSON.stringify({base,route,http:response.status(),...result}));
  await context.close();
 }
}finally{await browser.close();}
