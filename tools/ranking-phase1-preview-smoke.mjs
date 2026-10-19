// Phase-1 public SEO staging smoke. No orders, payments, login or mutable requests.
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const base=(process.env.RANKING_PREVIEW_URL||'https://improve-ranking-phase1-audit.chaskabox-site.pages.dev').replace(/\/$/,'');
if(!/^https:\/\/[a-z0-9-]+\.chaskabox-site\.pages\.dev$/.test(base))throw Error('Only Cloudflare Pages branch preview supported');
const out='test-results/ranking-phase1';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const checks=[];
async function check(path,width,fn){
 const page=await browser.newPage({viewport:{width,height:820},reducedMotion:'reduce'});
 const item={path,width};
 await page.route('**/*',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort('blockedbyclient'));
 try{
  const r=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:30000});
  item.status=r?.status();if(item.status!==200)throw Error('HTTP '+item.status);
  await page.waitForTimeout(1250);
  item.title=await page.title();
  item.description=await page.locator('meta[name="description"]').getAttribute('content');
  item.canonical=await page.locator('link[rel="canonical"]').getAttribute('href');
  await fn(page,item);item.pass=true;
 }catch(e){item.pass=false;item.error=String(e?.message||e).slice(0,520)}
 try{await page.screenshot({path:out+'/'+path.replace(/[^a-z0-9]/gi,'-')+'-'+width+'.png',fullPage:false})}catch{}
 checks.push(item);await page.close();
}
await check('/',390,async(page,x)=>{
 if(x.title!=='Pakistani Snacks Online | ChaskaBox Pakistan')throw Error('Home SEO title not current');
 if(!x.description?.includes('Pakistani childhood snacks'))throw Error('Home search intent missing');
 if(x.canonical!=='https://chaskabox.online/')throw Error('Home canonical');
 x.heroDots=await page.locator('#view-home [data-hero-dot]').count();
 if(x.heroDots!==3)throw Error('Approved hero count changed');
 if((await page.locator('#view-home h1:visible').first().innerText()).indexOf('Bachpan Ka Zaiqa')===-1)throw Error('Approved heading changed');
});
await check('/shop/',390,async(page,x)=>{
 if(x.title!=='Buy Pakistani Snacks Online | ChaskaBox Shop')throw Error('Shop SEO title reverted');
 if(!x.description?.includes('Browse packaged Pakistani snacks'))throw Error('Shop intent missing');
 if(x.canonical!=='https://chaskabox.online/shop/')throw Error('Shop canonical');
 x.productLinks=await page.locator('#shopGrid a.pname[href^="/product/"]').count();
 if(x.productLinks<1)throw Error('Crawlable shop product links missing');
});
await check('/brands/',1280,async(page,x)=>{
 if(!x.description?.includes('including Hilal, Mayfair, Candyland and Giggly'))throw Error('Brand description mismatch');
 if(/Kolson|online with COD across Pakistan/.test(x.description||''))throw Error('Unsupported brand/payment claim');
 if(x.canonical!=='https://chaskabox.online/brands/')throw Error('Brands canonical');
 x.brandLinks=await page.locator('#brandGrid a[href^="/brand/"]').count();
 if(x.brandLinks<1)throw Error('No public brands hydrated');
});
await check('/category/biscuits-and-wafers/',390,async(page,x)=>{
 if(x.canonical!=='https://chaskabox.online/category/biscuits-and-wafers/')throw Error('Category canonical');
 x.cards=await page.locator('#shopGrid a.pname[href^="/product/"]').count();
 if(!x.cards)throw Error('Category public list missing');
});
await check('/product/233/',390,async(page,x)=>{
 if(x.canonical!=='https://chaskabox.online/product/233/')throw Error('Known public product canonical');
 x.productSchema=await page.locator('script[type="application/ld+json"]').count();
 if(!x.productSchema)throw Error('Product structured data unavailable');
});
await browser.close();
await writeFile(out+'/results.json',JSON.stringify({base,checks},null,2));
for(const x of checks)console.log(JSON.stringify(x));
if(checks.some(x=>!x.pass))process.exitCode=1;
