// Real Cloudflare Pages branch preview. Only read HTTP; no checkout/payment/messages.
import {chromium} from 'playwright-core';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=(process.env.HERO_PREVIEW_URL||'').replace(/\/$/,'');
if(!/^https:\/\/[a-z0-9-]+\.chaskabox-site\.pages\.dev$/.test(base))throw Error('Expected real Cloudflare branch preview');
const hash=s=>createHash('sha256').update(s).digest('hex');
const css=await readFile('header-discovery-preview.css','utf8'),expected=hash(css);
let ready=false;
for(let i=0;i<20;i++){
 try{const r=await fetch(base+'/header-discovery-preview.css?v=20261019-header4',{cache:'no-store'});if(r.ok&&hash(await r.text())===expected){ready=true;break}}catch{}
 await new Promise(r=>setTimeout(r,5000));
}
if(!ready)throw Error('Preview is not exact candidate stylesheet');
await mkdir('test-results/video-ux-final',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const results=[];
for(const [path,width] of [['/',320],['/',390],['/',1440],['/shop/',390],['/brands/',390],['/about/',390]]){
 const page=await browser.newPage({viewport:{width,height:850},reducedMotion:'reduce'});
 await page.route('**/*',r=>['GET','HEAD','OPTIONS'].includes(r.request().method())?r.continue():r.abort('blockedbyclient'));
 const entry={path,width};
 try{
  const r=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:30000});
  if(r?.status()!==200)throw Error('Unexpected HTTP '+r?.status());
  await page.waitForTimeout(1400);
  entry.bagCount=await page.locator('header .cb-bag-icon-v2').count();
  if(entry.bagCount!==1)throw Error('Missing unique approved branded Cart/Bag icon');
  entry.bagWidth=await page.locator('header .cb-bag-icon-v2').evaluate(el=>Math.round(el.getBoundingClientRect().width));
  if(entry.bagWidth!==21)throw Error('Bag icon too large/small: '+entry.bagWidth);
  entry.canonical=await page.locator('link[rel=canonical]').first().getAttribute('href');
  entry.overflow=await page.evaluate(()=>Math.ceil(document.documentElement.scrollWidth-document.documentElement.clientWidth));
  if(entry.overflow>2)throw Error('Horizontal overflow '+entry.overflow);
  if(path==='/'||path==='/shop/'){
   const sel=path==='/'?'#view-home .hscroll .card':'#view-shop .grid .card';
   entry.cards=await page.locator(sel).count();
   if(entry.cards<1)throw Error('Product cards not visible');
   const p=page.locator(sel).first();
   entry.cardStyle=await p.evaluate(el=>{const name=el.querySelector('.pname'),body=el.querySelector('.pbody'),photo=el.querySelector('.pimg');return {column:getComputedStyle(el).flexDirection,body:getComputedStyle(body).display,name:name?getComputedStyle(name).maxHeight:'none',photo:photo?getComputedStyle(photo).aspectRatio:'none'}});
   if(entry.cardStyle.column!=='column'||!['grid','flex'].includes(entry.cardStyle.body))throw Error('Product card layout not aligned');
  }
  if(path==='/')entry.hero=await page.locator('#view-home [data-hero-dot]').count();
  if(path==='/'&&entry.hero!==3)throw Error('Original three hero slides missing');
  entry.pass=true;
 }catch(err){entry.pass=false;entry.error=String(err?.message||err);}
 try{await page.screenshot({path:'test-results/video-ux-final/'+path.replace(/[^a-z0-9]/gi,'-')+'-'+width+'.png',fullPage:false})}catch{}
 await page.close();
 results.push(entry);console.log(JSON.stringify(entry));
}
await browser.close();
await writeFile('test-results/video-ux-final/results.json',JSON.stringify({base,results},null,2));
if(results.some(r=>!r.pass))process.exitCode=1;
