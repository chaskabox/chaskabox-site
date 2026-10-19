// Read-only Cloudflare Pages release candidate browser checks.
// No checkout, login, product editing, payments, notifications or other mutable API calls.
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const base=(process.env.RANKING_PREVIEW_URL||'').replace(/\/$/,'');
if(!/^https:\/\/[a-z0-9-]+\.chaskabox-site\.pages\.dev$/.test(base))throw Error('Only real Cloudflare Pages branch preview allowed');
const out='test-results/ranking-phase6';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const results=[];
async function visit(path,width,fn){
 const item={path,width};
 const page=await browser.newPage({viewport:{width,height:840},reducedMotion:'reduce'});
 await page.route('**/*',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort('blockedbyclient'));
 try{
  const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:30000});
  item.http=response?.status();
  if(item.http!==200)throw Error('Expected HTTP 200, got '+item.http);
  await page.waitForTimeout(850);
  await fn(page,item);
  item.pass=true;
 }catch(error){item.pass=false;item.error=String(error.message||error).slice(0,450);}
 try{await page.screenshot({path:out+'/'+path.replace(/[^a-z0-9]+/gi,'-')+'-'+width+'.png',fullPage:false})}catch{}
 await page.close();results.push(item);console.log(JSON.stringify(item));
}
async function noOverflow(page){
 return page.evaluate(()=>Math.ceil(document.documentElement.scrollWidth)<=Math.ceil(document.documentElement.clientWidth)+2);
}
await visit('/',390,async(page,x)=>{
 x.hero=await page.locator('#view-home [data-hero-dot]').count();
 x.title=await page.title();
 if(x.hero!==3||x.title!=='Pakistani Snacks Online | ChaskaBox Pakistan')throw Error('Approved hero count or home SEO changed');
 if(!(await noOverflow(page)))throw Error('Homepage mobile overflow');
});
await visit('/',1440,async(page,x)=>{
 x.hero=await page.locator('#view-home [data-hero-dot]').count();
 if(x.hero!==3)throw Error('Desktop hero count changed');
 if(!(await noOverflow(page)))throw Error('Homepage desktop overflow');
});
await visit('/shop/',390,async(page,x)=>{
 x.links=await page.locator('nav.catalogue-related a[href^="/category/"]').count();
 x.products=await page.locator('#shopGrid a.pname[href^="/product/"]').count();
 if(x.links<1||x.products<1)throw Error('Shop SSR discovery or products unavailable');
 if(!(await noOverflow(page)))throw Error('Shop mobile overflow');
});
await visit('/category/biscuits-and-wafers/',390,async(page,x)=>{
 x.siblings=await page.locator('nav.catalogue-related a[href^="/category/"]').count();
 x.self=await page.locator('nav.catalogue-related a[href="/category/biscuits-and-wafers/"]').count();
 if(x.siblings<1||x.self!==0)throw Error('Current category linked to itself or sibling categories missing');
});
await visit('/product/233/',390,async(page,x)=>{
 x.canonical=await page.locator('link[rel=canonical]').getAttribute('href');
 const ld=await page.locator('script#product-schema').textContent();
 const data=JSON.parse(ld||'{}');
 if(x.canonical!=='https://chaskabox.online/product/233/'||data['@type']!=='Product')throw Error('Product canonical/schema failed');
 if(data.offers?.availability==='https://schema.org/InStock'&&/sourced.after.order/i.test(await page.locator('body').innerText()))throw Error('Invented warehouse inventory');
 if(!data.offers?.priceCurrency||data.offers.priceCurrency!=='PKR')throw Error('No factual PKR offer');
});
for(const guide of ['guides/','guides/bachpan-snacks-pakistan/','guides/choosing-a-snack-box/','guides/how-chaskabox-orders-work/']){
 await visit('/'+guide,390,async(page,x)=>{
  x.section=await page.locator('.guide-decision-help').count();
  x.helpLink=await page.locator('.guide-decision-help a[href="/shipping-policy/"]').count();
  if(x.section!==1||x.helpLink!==1)throw Error('Phase 4 guide section or policy reference missing');
  if(!(await noOverflow(page)))throw Error('Guide mobile overflow');
 });
}
await visit('/admin.html',390,async(page,x)=>{
 x.noindex=(await page.locator('meta[name="robots"]').getAttribute('content'))||'';
 x.panel=await page.locator('#view-seo').count();
 x.boot=await page.locator('#adminBoot').count();
 if(!/noindex/.test(x.noindex)||x.panel!==1||x.boot!==1)throw Error('Admin SEO panel missing or exposed for indexing');
});
const access={path:'/api/admin/products',width:0};
try{
 const response=await fetch(base+'/api/admin/products?per_page=1000',{headers:{Accept:'application/json'}});
 access.http=response.status;
 access.pass=response.status===401||response.status===403;
 if(!access.pass)access.error='Protected product audit endpoint accessible without bearer token: '+response.status;
}catch(error){access.pass=false;access.error=String(error);}
results.push(access);console.log(JSON.stringify(access));
await browser.close();
await writeFile(out+'/results.json',JSON.stringify({base,results},null,2));
if(results.some(x=>!x.pass))process.exitCode=1;
