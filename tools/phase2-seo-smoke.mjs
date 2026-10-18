// Phase 2 SEO inspection against Cloudflare branch-only PREVIEW, fixture-data only.
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.PHASE2_PREVIEW_URL||'https://improve-phase2-verified-tech.chaskabox-site.pages.dev';
if(!/^https:\/\/[a-z0-9-]+\.chaskabox-site\.pages\.dev$/.test(base))throw Error('Refusing non-preview origin');
const out='test-results/phase2-seo';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const findings=[];
async function check(path,width,verify){
 const page=await browser.newPage({viewport:{width,height:820},reducedMotion:'reduce'});
 const entry={path,width};
 try{
  const r=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:30000});await page.waitForTimeout(1700);
  entry.http=r.status();entry.title=await page.title();
  entry.visibleH1=await page.locator('h1:visible').allTextContents();
  if(entry.http!==200)throw Error('HTTP '+entry.http);
  if(entry.visibleH1.length!==1)throw Error('Expected exactly 1 visible H1');
  await verify(page,entry);entry.pass=true;
 }catch(e){entry.pass=false;entry.error=String(e?.message||e).slice(0,500)}
 try{await page.screenshot({path:out+'/'+path.replace(/[^a-z0-9]/gi,'-')+'-'+width+'.png',fullPage:false})}catch{}
 findings.push(entry);await page.close();
}
await check('/',390,async(page,e)=>{
 e.description=await page.locator('meta[name="description"]').getAttribute('content');
 if(/Kolson/i.test(e.description)||await page.locator('meta[name="keywords"]').count())throw Error('Unlisted brand or obsolete keywords in homepage head');
 if(await page.locator('#view-home .hero [data-hero-dot]').count()!==3)throw Error('Approved hero carousel changed');
});
await check('/shop/?badge=Sale',390,async(page,e)=>{
 e.heading=await page.locator('#catTitle').innerText();e.canonical=await page.locator('link[rel=canonical]').getAttribute('href');
 if(!e.heading.includes('Snack Deals')||e.canonical!=='https://chaskabox.online/shop/')throw Error('Sale heading/canonical');
});
await check('/brand/hilal/',1280,async(page,e)=>{
 e.canonical=await page.locator('link[rel=canonical]').getAttribute('href');
 e.products=await page.locator('#brandProductGrid .card').count();
 if(e.canonical!=='https://chaskabox.online/brand/hilal/'||!e.products)throw Error('Brand canonical or public products missing');
});
await check('/product/233/',390,async(page,e)=>{
 e.canonical=await page.locator('link[rel=canonical]').getAttribute('href');
 const schema=await page.locator('#product-schema').textContent();const json=JSON.parse(schema);
 e.jsonldType=json['@type'];e.price=json.offers?.price;e.availability=json.offers?.availability??null;
 if(e.canonical!=='https://chaskabox.online/product/233/'||json['@type']!=='Product'||Number(e.price)!==750||e.availability!==null)throw Error('Product schema price, identity or speculative availability');
});
try{
 const response=await browser.newPage();const sitemap=await response.request.get(base+'/api/product-sitemap',{timeout:30000});
 const body=await sitemap.text();const good=sitemap.status()===200&&body.includes('/product/233/')&&body.includes('/brand/hilal/')&&!body.includes('/product/269/');
 findings.push({path:'/api/product-sitemap',http:sitemap.status(),product233:body.includes('/product/233/'),brandHilal:body.includes('/brand/hilal/'),hidden269:body.includes('/product/269/'),pass:good});
 await response.close();
}catch(e){findings.push({path:'/api/product-sitemap',pass:false,error:String(e).slice(0,500)})}
await browser.close();await writeFile(out+'/results.json',JSON.stringify({base,findings},null,2));
for(const item of findings)console.log(JSON.stringify(item));
if(findings.some(x=>!x.pass))process.exitCode=1;
