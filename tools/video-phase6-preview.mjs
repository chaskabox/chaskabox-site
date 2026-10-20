// Read-only acceptance for video-audit Phases 3–6 on this commit's branch preview.
import {chromium} from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=(process.env.HERO_PREVIEW_URL||'').replace(/\/$/,'');
if(!/^https:\/\/[a-z0-9-]+\.chaskabox-site\.pages\.dev$/.test(base))throw Error('A Cloudflare staging preview is required');
const out='test-results/video-phase6';await mkdir(out,{recursive:true});
const hash=s=>createHash('sha256').update(s).digest('hex');
const sources=['app.js','storefront-bundle.css','sticky-motion-polish.css'];
const expected=Object.fromEntries(await Promise.all(sources.map(async p=>[p,hash(await readFile(p))])));
let ready=false;
for(let attempt=0;attempt<30;attempt++){
 try{if((await Promise.all(sources.map(async p=>{const r=await fetch(base+'/'+p+'?v=20261020-close1');return r.ok&&hash(await r.text())===expected[p];}))).every(Boolean)){ready=true;break;}}catch{}
 await new Promise(resolve=>setTimeout(resolve,5000));
}
if(!ready)throw Error('Staging does not serve this commit’s exact UI sources');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const results=[],blocked=[],errors=[];
const readOnly=context=>context.route('**/*',route=>{
 const req=route.request();if(['GET','HEAD','OPTIONS'].includes(req.method()))return route.continue();
 blocked.push({method:req.method(),path:new URL(req.url()).pathname});return route.abort();
});
const frame=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function start(width,height,options={}){
 const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',...options});await readOnly(context);
 const page=await context.newPage();page.on('pageerror',e=>errors.push({width,message:e.message}));return {context,page};
}
async function cardGeometry(page,selector){return page.locator(selector).evaluateAll(cards=>cards.map(card=>{
 const rect=s=>{const e=card.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
 const r=card.getBoundingClientRect(),img=card.querySelector('.pimg>img'),pack=card.querySelector('.packmeta'),name=card.querySelector('.pname');
 return {x:r.x,y:r.y,w:r.width,h:r.height,image:rect('.pimg'),title:rect('.pname'),pack:rect('.packmeta'),price:rect('.prow'),button:rect('.addcart'),
  packOverflow:pack?pack.scrollHeight>parseFloat(getComputedStyle(card.querySelector('.pbody')).gridTemplateRows.split(' ')[1])+.5:false,titleOverflow:name?name.scrollWidth>name.clientWidth+1:false,
  fit:img?getComputedStyle(img).objectFit:'placeholder',transform:getComputedStyle(card).transform,
  titleText:name?.textContent,packText:card.querySelector('.ppack')?.textContent,priceText:card.querySelector('.price')?.textContent,
  href:card.querySelector('.pimg')?.getAttribute('href')};
}));}
function verifyCards(cards,width,path){
 if(!cards.length)throw Error('No real catalogue cards '+path);
 for(const c of cards){
  if(Math.abs(c.image.w-c.image.h)>1||c.fit!=='contain'&&c.fit!=='placeholder')throw Error('Unequal/cropped image frame '+JSON.stringify({width,path,c}));
  if(c.packOverflow||c.titleOverflow||c.button?.h<43.5)throw Error('Clipped card text or small button '+JSON.stringify({width,path,c}));
 }
 const rows=new Map();for(const c of cards){const key=Math.round(c.y);if(!rows.has(key))rows.set(key,[]);rows.get(key).push(c);}
 for(const row of rows.values())for(const name of ['image','title','pack','price','button']){
  const values=row.filter(c=>c[name]).map(c=>c[name].y-c.y);
  if(values.length>1&&Math.max(...values)-Math.min(...values)>1)throw Error('Inconsistent '+name+' baseline '+JSON.stringify({width,path,row}));
 }
 return {cards:cards.length,first:cards[0]};
}
try{
 for(const [width,height] of [[320,740],[360,800],[390,844],[430,932],[768,1024],[1024,768],[1200,700],[1280,720],[1366,768],[1440,900],[1920,1080]]){
  const {context,page}=await start(width,height,{reducedMotion:'no-preference'});
  try{
   await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.locator('#view-home .card .packmeta').first().waitFor();await page.waitForLoadState('networkidle');await frame(page);
   const immediate=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+2,
    hidden:[...document.querySelectorAll('#view-home .reveal')].filter(e=>e.getClientRects().length&&Number(getComputedStyle(e).opacity)<1).map(e=>e.className),
    why:document.querySelectorAll('.why-grid article').length,steps:document.querySelectorAll('.freshlist li').length,
    sections:[...document.querySelectorAll('#view-home>.box-spotlight,#view-home>#market-fresh,#view-home>.why-section')].map(e=>({name:e.id||e.className,height:e.getBoundingClientRect().height})),
    price269:!!document.querySelector('#view-home a[href="/product/269/"]'),
    policy:document.querySelector('.herotrust')?.innerText,
    footerLinks:[...document.querySelectorAll('footer a')].map(e=>({text:e.textContent.trim(),size:parseFloat(getComputedStyle(e).fontSize)}))}));
   if(immediate.overflow||immediate.hidden.length||immediate.why!==3||immediate.steps!==4||immediate.price269)throw Error('Content/overflow regression '+JSON.stringify(immediate));
   if(width>=1200&&immediate.sections.some(s=>s.height>(s.name.includes('box-spotlight')?300:s.name==='market-fresh'?400:360)))throw Error('Lower sections are still too tall '+JSON.stringify(immediate.sections));
   if(immediate.footerLinks.some(l=>l.size<13))throw Error('Footer text remains too small');
   const shelves=await page.locator('#view-home .hscroll').all();
   const measurements=[];for(const shelf of shelves)measurements.push(verifyCards(await cardGeometry(page,'#'+await shelf.getAttribute('id')+' .card'),width,'home shelf'));
   results.push({case:'Immediate content, square images, aligned pack/price/CTA, compact sections and readable footer',width,height,pass:true,measurements,immediate});
   const card=page.locator('#view-home [data-home-section="chaska_picks"] .card').first();await card.scrollIntoViewIfNeeded?.();
   // Semantic focus scrolls without submitting any shopping action.
   await card.locator('.pname').focus?.();
   await page.locator('#view-home .shelfband h2').first().evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));await frame(page);
   await page.screenshot({path:out+'/cards-'+width+'.png'});
   if([390,1366].includes(width)){
    const announcement=await page.locator('.promo').textContent();await page.waitForTimeout(4600);
    if(await page.locator('.promo').textContent()!==announcement)throw Error('Announcement still rotates');
    results.push({case:'Static owner announcement',width,pass:true});
   }
   if([390,1366].includes(width)){
    await page.locator('#market-fresh').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));await frame(page);await page.screenshot({path:out+'/process-'+width+'.png'});
    const axe=await new AxeBuilder({page}).include('#view-home').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
    if(axe.violations.length)throw Error('Accessibility '+JSON.stringify(axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))));
    results.push({case:'Homepage automated accessibility',width,pass:true});
   }
  }catch(e){results.push({case:'Homepage phase acceptance',width,pass:false,error:String(e)});await page.screenshot({path:out+'/failed-'+width+'.png'}).catch(()=>{});}
  finally{await context.close();}
 }
 for(const width of [390,768,1366]){
  const {context,page}=await start(width,width===390?844:900);
  try{for(const path of ['/shop/','/bundles/','/category/snacks-and-nimco/','/brand/mayfair/']){
   const grid=path.startsWith('/brand/')?'#brandProductGrid':'#shopGrid';
   await page.goto(base+path,{waitUntil:'domcontentloaded'});await page.locator(grid+' .packmeta').first().waitFor();await page.waitForLoadState('networkidle');
   const geometry=verifyCards(await cardGeometry(page,grid+' .card'),width,path);
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))throw Error('Page overflow '+path);
   results.push({case:'Catalogue route card geometry',width,path,pass:true,...geometry});
  }}catch(e){results.push({case:'Catalogue route acceptance',width,pass:false,error:String(e)});}
  finally{await context.close();}
 }
 for(const reduced of [true,false]){
  const {context,page}=await start(390,844,{reducedMotion:reduced?'reduce':'no-preference',javaScriptEnabled:reduced});
  try{
   await page.goto(base+'/',{waitUntil:'networkidle'});
   const visible=await page.evaluate(()=>({hidden:[...document.querySelectorAll('#view-home .reveal')].filter(e=>e.getClientRects().length&&Number(getComputedStyle(e).opacity)<1).length,overflow:document.documentElement.scrollWidth>innerWidth+2,
    policy:document.querySelector('.herotrust')?.textContent,frames:[...document.querySelectorAll('#view-home .hscroll .pimg')].map(e=>{const r=e.getBoundingClientRect();return Math.abs(r.width-r.height);})}));
   if(visible.hidden||visible.overflow||visible.frames.some(n=>n>1))throw Error('Content fallback '+JSON.stringify(visible));
   results.push({case:reduced?'Reduced-motion content visibility':'JavaScript-disabled content visibility',width:390,pass:true});
  }catch(e){results.push({case:'Motion and script fallback',reduced,pass:false,error:String(e)});}
  finally{await context.close();}
 }
 {
  const {context,page}=await start(390,844);
  try{
   await page.goto(base+'/brands/',{waitUntil:'networkidle'});
   await page.locator('header a[href="/"]').first().click();await page.waitForLoadState('networkidle');
   const categoryBackground=await page.locator('#catTiles .cb-category-art').first().evaluate(e=>getComputedStyle(e).backgroundImage);
   if(await page.locator('#view-home .why-grid article').count()!==3||await page.locator('#view-home .cb-order-guide-copy').count()!==1||
    await page.locator('#view-home .cb-offers .cb-offer').count()!==2||await page.locator('#view-home [data-hero-dot]').count()!==3||
    !categoryBackground.includes('approved-category-sprite-hq-20261018.webp'))
    throw Error('Returning Home from a static entry restores old duplicate sections');
   await page.locator('#view-home [data-hero-dot="2"]').click();
   if(await page.locator('#view-home .hero').getAttribute('data-hero-slide')!=='3'||
    !((await page.locator('#view-home .hero-scene').getAttribute('src'))||'').includes('hero-03-'))
    throw Error('Hero controls were not initialized after the Home template mounted');
   results.push({case:'Home reached from Brands retains the compact shared sections',width:390,pass:true});
  }catch(e){results.push({case:'Static-entry Home navigation',pass:false,error:String(e)});}
  finally{await context.close();}
 }
}finally{await browser.close();await writeFile(out+'/results.json',JSON.stringify({base,sources:expected,results,blocked,errors},null,2));}
console.log('VIDEO_PHASE6 '+JSON.stringify({checks:results.length,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass),pageErrors:errors,blockedMutations:blocked.length}));
if(results.some(r=>!r.pass)||errors.length)process.exitCode=1;
