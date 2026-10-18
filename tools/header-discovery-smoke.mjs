// Read-only, fixture-backed storefront acceptance for header discovery.
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.PHASE1_PREVIEW_URL;
if(!/^https:\/\/[a-z0-9-]+\.chaskabox-site\.pages\.dev$/.test(base||''))throw Error('A Cloudflare staging URL is required');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const findings=[];await mkdir('test-results/header-discovery',{recursive:true});
for(const width of [390,1280]){
 const page=await browser.newPage({viewport:{width,height:820},reducedMotion:'reduce'});
 const item={width};
 try{
  const response=await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:30000});
  if(response?.status()!==200)throw Error('Homepage HTTP '+response?.status());
  await page.waitForTimeout(900);
  const category=page.locator('.cbx-cat-trigger');
  await category.waitFor({state:'visible',timeout:10000});
  await category.click();
  item.opened=await category.getAttribute('aria-expanded');
  item.options=await page.locator('#cbxCatPanel a.cbx-cat-card').count();
  if(item.opened!=='true'||item.options<5)throw Error('Category menu not populated');
  await page.keyboard.press('Escape');
  item.closed=await category.getAttribute('aria-expanded');
  if(item.closed!=='false')throw Error('Escape must close menu');
  item.hqArt=await page.locator('.cbx-cat-photo').first().evaluate(n=>getComputedStyle(n).backgroundImage.includes('approved-category-sprite-hq-20261018.webp'));
  if(!item.hqArt)throw Error('High-quality category imagery missing');
  item.pass=true;
 }catch(e){item.pass=false;item.error=String(e?.message||e).slice(0,450)}
 try{await page.screenshot({path:'test-results/header-discovery/home-'+width+'.png',fullPage:false})}catch{}
 findings.push(item);await page.close();
}
await browser.close();
await writeFile('test-results/header-discovery/results.json',JSON.stringify(findings,null,2));
for(const f of findings)console.log(JSON.stringify(f));
if(findings.some(f=>!f.pass))process.exitCode=1;
