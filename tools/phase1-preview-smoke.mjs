// Read-only browser smoke checks against the Phase 1 Cloudflare Pages BRANCH ALIAS only.
// Never use the production chaskabox.online hostname; no checkout, notifications or payments.
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const base=(process.env.PHASE1_PREVIEW_URL||'https://improve-phase1-confirmed-sto.chaskabox-site.pages.dev').replace(/\/$/,'');
if(!base.endsWith('.chaskabox-site.pages.dev')||base.includes('chaskabox.online'))throw Error('Staging only: refusing non-branch Pages URL');
const out='test-results/phase1-staging';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const findings=[];
async function inspect(route,width,fn){
 const page=await browser.newPage({viewport:{width,height:820},reducedMotion:'reduce'});
 let entry={route,width};
 try{
  const response=await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(1800);
  entry.http=response?.status()??null;
  entry.title=await page.title();
  entry.visibleH1=await page.locator('h1:visible').allTextContents();
  if(entry.http!==200)throw Error('Non-200 staging route: '+entry.http);
  await fn(page,entry);
  entry.pass=true;
 }catch(error){entry.pass=false;entry.error=String(error?.message||error).slice(0,400);}
 try{await page.screenshot({path:out+'/'+route.replace(/[^a-z0-9]/gi,'-').replace(/^-+|-+$/g,'')+'-'+width+'.png',fullPage:false})}catch{}
 findings.push(entry);
 await page.close();
}
await inspect('/',390,async(page,entry)=>{
 const dots=await page.locator('#view-home .hero [data-hero-dot]').count();
 entry.approvedHeroDots=dots;
 if(dots!==3)throw Error('Three approved hero controls not found');
 if(entry.visibleH1.length!==1)throw Error('Expected one visible homepage H1');
});
await inspect('/shop/?badge=Sale',390,async(page,entry)=>{
 entry.heading=await page.locator('#catTitle').innerText();
 entry.resultCount=await page.locator('#catCount').innerText();
 entry.saleCards=await page.locator('#shopGrid .card').count();
 if(!/Snack Deals/i.test(entry.heading))throw Error('Sale heading not rendered');
 if(/1 products\b/.test(entry.resultCount))throw Error('Singular count mismatch');
 if(entry.visibleH1.length!==1)throw Error('Expected one visible sale page H1');
});
await inspect('/brands/',1280,async(page,entry)=>{
 entry.brandCards=await page.locator('#brandGrid a[href^="/brand/"]').count();
 if(!entry.brandCards)throw Error('Brand directory is empty in staging');
 if(entry.visibleH1.length!==1)throw Error('Expected one visible brand-directory H1');
});
await inspect('/product/233/',390,async(page,entry)=>{
 entry.button=await page.locator('#pdetail .pdbtn').first().innerText();
 entry.disabled=await page.locator('#pdetail .pdbtn').first().isDisabled();
 entry.price=await page.locator('#pdetail .pd-price').first().innerText();
 entry.breadcrumb=await page.locator('#pdCrumbCat').first().innerText();
 if(!/Add to Bag/.test(entry.button)||entry.disabled)throw Error('Product Add to Bag disabled/missing');
 if(!/Save \d+%/.test(entry.price))throw Error('Missing original price / Save percentage for fixture product');
 if(/^(Category|Product)$/.test(entry.breadcrumb))throw Error('Unresolved product breadcrumb');
 if(entry.visibleH1.length!==1)throw Error('Expected one visible product H1');
});
await inspect('/track-order.html',390,async(page,entry)=>{
 entry.noindex=await page.locator('meta[name="robots"]').getAttribute('content');
 entry.navBrands=await page.locator('nav[aria-label="Site"] a[href="/brands/"]').count();
 entry.trackForm=await page.locator('#track-form').count();
 entry.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
 if(!String(entry.noindex).includes('noindex')||!entry.navBrands||!entry.trackForm||entry.overflow)throw Error('Track-order noindex, nav, form or mobile layout failed');
});
await browser.close();
await writeFile(out+'/results.json',JSON.stringify({base,findings},null,2));
for(const f of findings)console.log(JSON.stringify(f));
if(findings.some(f=>!f.pass))process.exitCode=1;
