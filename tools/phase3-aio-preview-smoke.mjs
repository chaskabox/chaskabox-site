// Read-only AIO/GEO/AEO source-correctness smoke for a Cloudflare Pages branch preview.
// Do NOT test orders/checkout/payments/WhatsApp mutations. This preview uses PUBLIC mock catalogue only.
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';

const base=(process.env.PHASE3_PREVIEW_URL||'https://release-phase3-trust-verifie.chaskabox-site.pages.dev').replace(/\/$/,'');
if(!/^https:\/\/[a-z0-9-]+\.chaskabox-site\.pages\.dev$/.test(base))throw Error('Only Cloudflare Pages preview is allowed');
const output='test-results/phase3-aio';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const checks=[];
async function check(path,verify,width=390){
 const page=await browser.newPage({viewport:{width,height:820},reducedMotion:'reduce'});
 const result={path,width};
 try{
  const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(1300);
  result.http=response?.status();
  result.h1=await page.locator('h1:visible').allTextContents();
  if(result.http!==200)throw Error('HTTP '+result.http);
  if(result.h1.length!==1)throw Error('Expected exactly one visible H1');
  await verify(page,result);
  result.pass=true;
 }catch(error){result.pass=false;result.error=String(error?.message||error).slice(0,450);}
 try{await page.screenshot({path:output+'/'+path.replace(/[^a-z0-9]/gi,'-')+'-'+width+'.png',fullPage:false});}catch{}
 checks.push(result);await page.close();
}
await check('/guides/',async(page,x)=>{
 const json=JSON.parse(await page.locator('#guide-navigation-schema').textContent());
 x.crumbCount=json['@graph'][1].itemListElement.length;
 if(x.crumbCount!==2)throw Error('Guide index breadcrumbs');
 if(await page.locator('a.hdrop-btn[href="/brands/"]').count()!==1)throw Error('Brands menu route');
});
for(const [path,n] of [['/guides/choosing-a-snack-box/',3],['/guides/bachpan-snacks-pakistan/',3],['/guides/how-chaskabox-orders-work/',3],['/snack-boxes/',2]]){
 await check(path,async(page,x)=>{
  const graph=JSON.parse(await page.locator('#guide-navigation-schema').textContent())['@graph'];
  x.crumbs=graph[1].itemListElement.map(y=>y.name);
  if(x.crumbs.length!==n||graph[0].url!=='https://chaskabox.online'+path)throw Error('Visible/schema breadcrumb mismatch');
  if(await page.locator('nav[aria-label="Breadcrumb"] [aria-current="page"]').count()!==1)throw Error('Visible breadcrumb missing');
  if(await page.locator('a[href="/shop/?badge=Sale"]').count()===0)throw Error('Deals route missing');
 });
}
await check('/faq/',async(page,x)=>{
 x.answerCount=await page.locator('main details').count();
 if(x.answerCount<5)throw Error('FAQ answers not rendered in HTML');
 const store=JSON.parse(await page.locator('#store-schema').textContent());
 if(store.hasMerchantReturnPolicy)throw Error('Unverified merchant return guarantee published');
 x.policyLink=await page.locator('main a[href="/refund-policy/"]').count();
 if(!x.policyLink)throw Error('Refund resolution source link missing');
});
await check('/snack-boxes/bachpan/',async(page,x)=>{
 x.products=await page.locator('.occasion-products .card').count();
 x.disabled=await page.locator('#addOccasion').isDisabled();
 if(x.products!==3||x.disabled)throw Error('Bachpan curated selection fixture incomplete');
});
try{
 const ctx=await browser.newContext();const r=await ctx.request.get(base+'/llms.txt',{timeout:30000});
 const body=await r.text();
 const result={path:'/llms.txt',http:r.status(),sourceLinks:body.includes('https://chaskabox.online/api/products')&&body.includes('https://chaskabox.online/refund-policy/'),hasUnsupportedName:/operated by Rameez|bakery in Bangalore/i.test(body)};
 result.pass=result.http===200&&result.sourceLinks&&!result.hasUnsupportedName;
 checks.push(result);await ctx.close();
}catch(e){checks.push({path:'/llms.txt',pass:false,error:String(e).slice(0,400)})}
await browser.close();
await writeFile(output+'/results.json',JSON.stringify({base,checks},null,2));
for(const x of checks)console.log(JSON.stringify(x));
if(checks.some(x=>!x.pass))process.exitCode=1;
