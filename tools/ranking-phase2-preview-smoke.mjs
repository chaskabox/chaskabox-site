import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const base=(process.env.RANKING_PREVIEW_URL||'https://improve-ranking-phase2-conte.chaskabox-site.pages.dev').replace(/\/$/,'');
if(!/^https:\/\/[a-z0-9-]+\.chaskabox-site\.pages\.dev$/.test(base))throw Error('Only Cloudflare Pages branch preview supported');
const out='test-results/ranking-phase2';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const checks=[];
async function inspect(path,fn){
 const page=await browser.newPage({viewport:{width:390,height:820},reducedMotion:'reduce'});
 const result={path};
 await page.route('**/*',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort('blockedbyclient'));
 try{const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:30000});result.status=response?.status();if(result.status!==200)throw Error('HTTP '+result.status);await page.waitForTimeout(1100);await fn(page,result);result.pass=true;}catch(e){result.pass=false;result.error=String(e?.message||e).slice(0,400)}
 checks.push(result);try{await page.screenshot({path:out+'/'+path.replace(/[^a-z0-9]/gi,'-')+'.png',fullPage:false});}catch{}await page.close();
}
await inspect('/',async(p,x)=>{
 x.hero=await p.locator('#view-home [data-hero-dot]').count();
 x.categories=await p.locator('#view-home #catTiles a[href^="/category/"]').count();
 x.guideRemoved=await p.locator('#pakistani-snacks-guide').count()===0;
 if(x.hero!==3||x.categories<3||!x.guideRemoved)throw Error('Approved hero or existing category discovery was changed');
});
await inspect('/shop/',async(p,x)=>{
 x.related=await p.locator('nav.catalogue-related a[href^="/category/"]').count();
 x.products=await p.locator('#shopGrid a.pname').count();
 if(x.related<2||x.products<1)throw Error('SSR related categories or products missing');
});
await inspect('/category/biscuits-and-wafers/',async(p,x)=>{
 x.related=await p.locator('nav.catalogue-related a[href^="/category/"]').count();
 x.self=await p.locator('nav.catalogue-related a[href="/category/biscuits-and-wafers/"]').count();
 if(x.related<1||x.self!==0)throw Error('Sibling category navigation incorrect');
});
await inspect('/product/233/',async(p,x)=>{
 x.canonical=await p.locator('link[rel="canonical"]').getAttribute('href');
 if(x.canonical!=='https://chaskabox.online/product/233/')throw Error('PDP canonical changed');
});
await browser.close();
await writeFile(out+'/results.json',JSON.stringify({base,checks},null,2));
for(const c of checks)console.log(JSON.stringify(c));
if(checks.some(c=>!c.pass))process.exitCode=1;
