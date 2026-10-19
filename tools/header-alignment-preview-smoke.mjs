// Read-only responsive geometry acceptance on an isolated Cloudflare Pages preview.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
const base=process.env.ALIGNMENT_PREVIEW_URL;
if(!/^https:\/\/[a-z0-9-]+\.chaskabox-site\.pages\.dev$/.test(base||''))throw Error('Cloudflare Pages preview required');
const results=[];await mkdir('test-results/header-alignment',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
for(const width of [390,768,1024,1200,1366,1662,1920]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
  const entry={width};
  try{
    const response=await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:30000});
    assert.equal(response.status(),200);
    await page.waitForTimeout(450);
    const layout=await page.evaluate(()=>{
      const rect=s=>{const n=document.querySelector(s);return n?{x:n.getBoundingClientRect().left,w:n.getBoundingClientRect().width,y:n.getBoundingClientRect().top,h:n.getBoundingClientRect().height,visible:n.getClientRects().length>0}:null};
      const targets=['.reference-storefront > header .hwrap','#view-home > .hero','#view-home > .discover','.reference-storefront > header .hwrap .header-search','.reference-storefront > header .hwrap > .account-btn','.reference-storefront > header .hwrap > a[aria-label="My wishlist"]','.reference-storefront > header .hwrap > .hbtn'];
      return {items:targets.map(rect),overflow:document.documentElement.scrollWidth-window.innerWidth};
    });
    const [header,hero,categories,search,account,wishlist,cart]=layout.items;
    assert.ok(hero&&header&&categories,'Missing homepage frame');
    assert.ok(layout.overflow<=2,'Viewport overflow: '+layout.overflow+'px');
    assert.ok(Math.abs(hero.x-categories.x)<=1.5,'Hero/category frame left mismatch');
    if(width>760){
      const expected=Math.min(width-24,1380);
      assert.ok(Math.abs(header.x-hero.x)<=1.5,'Header left '+header.x+'px but hero '+hero.x+'px');
      assert.ok(Math.abs(header.w-hero.w)<=1.5,'Header width '+header.w+'px vs hero '+hero.w+'px');
      assert.ok(Math.abs(header.w-expected)<=1.5,'Expected common frame '+expected+'px');
      assert.ok([account,wishlist,cart].every(r=>r?.visible&&r.w>=40),'Header controls missing or too small');
      assert.ok(Math.abs(account.y-cart.y)<=3&&Math.abs(wishlist.y-cart.y)<=3,'Header actions not on one row');
      assert.ok(search.visible&&search.w>=140,'Desktop search inaccessible');
    } else {
      assert.ok(Math.abs(hero.x-10)<=2,'Mobile hero gutter changed');
      assert.ok(header.w===width,'Mobile header frame changed');
    }
    entry.result='pass';entry.left=Math.round(hero.x);entry.headerLeft=Math.round(header.x);entry.width=Math.round(hero.w);entry.overflow=layout.overflow;
  }catch(err){entry.result='fail';entry.error=String(err?.message||err).slice(0,600)}
  try{await page.screenshot({path:'test-results/header-alignment/home-'+width+'.png',fullPage:false})}catch{}
  results.push(entry);
  await page.close();
}
const page=await browser.newPage({viewport:{width:1662,height:900},reducedMotion:'reduce'});
for(const route of ['/shop/','/brands/','/product/39/']){
 const result={route};
 try{
 const resp=await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:30000});
 assert.equal(resp.status(),200);
 const l=await page.evaluate(()=>{const r=document.querySelector('header .hwrap')?.getBoundingClientRect();return {left:r?.left,width:r?.width,overflow:document.documentElement.scrollWidth-innerWidth}});
 assert.ok(Math.abs(l.left-141)<=1.5,'Route header not aligned with 1380px content frame');
 assert.ok(Math.abs(l.width-1380)<=1.5,'Route header frame width inconsistent');
 assert.ok(l.overflow<=2,'Route overflows horizontally');
 Object.assign(result,{result:'pass',left:l.left});
 }catch(err){result.result='fail';result.error=String(err?.message||err).slice(0,600)}
 results.push(result);
}
await page.close();await browser.close();
await writeFile('test-results/header-alignment/report.json',JSON.stringify({base,results},null,2));
for(const item of results)console.log(JSON.stringify(item));
if(results.some(x=>x.result!=='pass'))process.exitCode=1;
