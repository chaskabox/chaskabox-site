// Release preflight: PUBLIC/READ-ONLY acceptance only. No orders, payments or messages.
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
const production='https://chaskabox.online';
const preview='https://release-phase3-trust-verifie.chaskabox-site.pages.dev';
const output='test-results/release-readonly';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const results=[];
async function audit(base,path,check,width=390){
 const page=await browser.newPage({viewport:{width,height:820},reducedMotion:'reduce'});
 const item={origin:base===production?'production':'preview',path,width};
 // Ensure accidental scripts/analytics cannot POST, PUT, PATCH, DELETE, etc.
 await page.route('**/*',async route=>{
  const method=route.request().method();
  if(!['GET','HEAD'].includes(method))return route.abort('blockedbyclient');
  return route.continue();
 });
 try{
  const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:35000});
  item.http=response?.status();item.title=await page.title();
  if(item.http!==200)throw Error('Expected HTTP 200, received '+item.http);
  await page.waitForTimeout(1700);
  if(check)await check(page,item);
  item.pass=true;
 }catch(e){item.pass=false;item.error=String(e?.message||e).slice(0,350);}
 results.push(item);await page.close();
}
await audit(production,'/',async(p,e)=>{
 e.heroControls=await p.locator('#view-home .hero [data-hero-dot]').count();
 if(e.heroControls!==3)throw Error('Approved three-slide hero missing');
});
await audit(production,'/shop/',async(p,e)=>{
 e.cards=await p.locator('#shopGrid .card').count();
 if(e.cards<1)throw Error('Public catalogue cards missing');
});
await audit(production,'/brands/',async(p,e)=>{
 e.brandLinks=await p.locator('a[href^="/brand/"]').count();
 if(e.brandLinks<1)throw Error('Brand directory empty');
});
await audit(production,'/product/233/',async(p,e)=>{
 e.heading=await p.locator('h1:visible').first().innerText();
 if(!e.heading.includes('Top Pops'))throw Error('Known public PDP did not render');
});
await audit(production,'/bundles/',async(p,e)=>{
 e.visibleH1=await p.locator('h1:visible').count();
 if(e.visibleH1!==1)throw Error('Bundles H1 mismatch');
});
await audit(production,'/track-order.html',async(p,e)=>{
 e.noindex=await p.locator('meta[name="robots"]').getAttribute('content');
 if(!e.noindex?.includes('noindex'))throw Error('Tracking utility page indexable');
});
await audit(production,'/checkout.html',async(p,e)=>{
 e.hasForms=await p.locator('form').count();
 if(!e.hasForms)throw Error('Checkout form missing');
});
await audit(production,'/admin.html',async(p,e)=>{
 e.noindex=await p.locator('meta[name="robots"]').getAttribute('content');
 e.headerRobots=await p.locator('meta[name="robots"]').count();
 // Login verification requires owner credentials and must not be automated against production.
});
await audit(preview,'/faq/',async(p,e)=>{
 e.questions=await p.locator('main details').count();
 if(e.questions<5)throw Error('Release-preview FAQ missing source answers');
});
await audit(preview,'/guides/how-chaskabox-orders-work/',async(p,e)=>{
 e.breadcrumb=await p.locator('[aria-label="Breadcrumb"]').count();
 if(e.breadcrumb!==1)throw Error('Release-preview guide breadcrumb absent');
});
await audit(preview,'/llms.txt',async(_p,e)=>{
 const text=await _p.locator('body').innerText();
 e.sourceLinks=text.includes('https://chaskabox.online/shop/')&&text.includes('https://chaskabox.online/refund-policy/');
 if(!e.sourceLinks)throw Error('AI directory source links missing');
});
await browser.close();
await writeFile(output+'/results.json',JSON.stringify({checks:results},null,2));
for(const item of results)console.log(JSON.stringify(item));
if(results.some(x=>!x.pass))process.exitCode=1;
