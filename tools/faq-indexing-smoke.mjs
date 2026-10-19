// Read-only Cloudflare Pages FAQ discovery smoke. NEVER make orders or provider calls.
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.FAQ_PREVIEW_URL||'https://fix-faq-indexing-discovery-2.chaskabox-site.pages.dev';
if(!/^https:\/\/[a-z0-9-]+\.chaskabox-site\.pages\.dev$/.test(base))throw Error('Pages preview only');
const output='test-results/faq-indexing';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const checks=[];
async function run(path,assertFn){
 const page=await browser.newPage({viewport:{width:390,height:820},reducedMotion:'reduce'});
 const x={path};
 await page.route('**/*',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort('blockedbyclient'));
 try{const res=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:30000});x.http=res?.status();
  if(x.http!==200)throw Error('HTTP '+x.http);
  await page.waitForTimeout(1200);
  await assertFn(page,x);x.pass=true;
 }catch(e){x.pass=false;x.error=String(e?.message||e).slice(0,500)}
 try{await page.screenshot({path:output+'/'+path.replace(/[^a-z0-9]/gi,'-')+'.png',fullPage:false})}catch{}
 checks.push(x);await page.close();
}
await run('/faq/',async(page,x)=>{
 x.title=await page.title();
 x.h1=await page.locator('h1:visible').count();
 x.questions=await page.locator('main details>summary').count();
 x.canonical=await page.locator('link[rel="canonical"]').getAttribute('href');
 x.robots=await page.locator('meta[name="robots"]').getAttribute('content');
 x.answers=await page.locator('main details>p').count();
 if(x.h1!==1||x.questions<5||x.answers!==x.questions||x.canonical!=='https://chaskabox.online/faq/'||/noindex/i.test(x.robots||''))throw Error('FAQ not indexable or accessible');
});
await run('/',async(page,x)=>{
 x.hero=await page.locator('#view-home .hero [data-hero-dot]').count();
 x.footerFAQ=await page.locator('footer a[href="/faq/"]').count();
 if(x.hero!==3||x.footerFAQ!==1)throw Error('Home hero or FAQ discovery link missing');
});
await run('/shop/',async(page,x)=>{
 x.footerFAQ=await page.locator('footer a[href="/faq/"]').count();
 if(x.footerFAQ!==1)throw Error('Shop missing FAQ link');
});
await run('/guides/',async(page,x)=>{
 x.footerFAQ=await page.locator('footer a[href="/faq/"]').count();
 x.contextualFAQ=await page.locator('main a[href="/faq/"]').count();
 if(x.footerFAQ!==1||x.contextualFAQ!==1)throw Error('Guide hub missing contextual FAQ link');
});
await run('/about/',async(page,x)=>{
 x.footerFAQ=await page.locator('footer a[href="/faq/"]').count();
 if(x.footerFAQ!==1)throw Error('About missing crawlable FAQ footer link');
});
const context=await browser.newContext();
try{const r=await context.request.get(base+'/sitemap.xml');
 const body=await r.text();checks.push({path:'/sitemap.xml',http:r.status(),faqPresent:body.includes('<loc>https://chaskabox.online/faq/</loc>'),pass:r.status()===200&&body.includes('<loc>https://chaskabox.online/faq/</loc>')});
}catch(e){checks.push({path:'/sitemap.xml',pass:false,error:String(e).slice(0,400)})}
await context.close();await browser.close();
await writeFile(output+'/results.json',JSON.stringify({base,checks},null,2));
for(const x of checks)console.log(JSON.stringify(x));
if(checks.some(x=>!x.pass))process.exitCode=1;
