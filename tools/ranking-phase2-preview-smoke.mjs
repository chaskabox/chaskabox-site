// Phase 2 SEO: read-only Cloudflare Pages branch preview; no mutations or customer data.
import {chromium} from 'playwright-core';
import {mkdir,writeFile} from 'node:fs/promises';
const base=(process.env.PHASE2_RANKING_PREVIEW_URL||'https://improve-ranking-phase2-disco.chaskabox-site.pages.dev').replace(/\/$/,'');
if(!/^https:\/\/[a-z0-9-]+\.chaskabox-site\.pages\.dev$/.test(base))throw Error('Only Cloudflare preview may be tested');
const output='test-results/ranking-phase2';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const results=[];
async function check(path,width,fn){
 const page=await browser.newPage({viewport:{width,height:850},reducedMotion:'reduce'}),row={path,width};
 await page.route('**/*',route=>['GET','HEAD'].includes(route.request().method())?route.continue():route.abort('blockedbyclient'));
 try{
  const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:30000});
  row.http=response?.status();if(row.http!==200)throw Error('HTTP '+row.http);
  await page.waitForTimeout(1400);
  row.h1=await page.locator('h1:visible').allTextContents();
  if(row.h1.length!==1)throw Error('Page must have exactly one visible H1');
  await fn(page,row);
  row.viewportOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  if(row.viewportOverflow>2)throw Error('Horizontal overflow '+row.viewportOverflow);
  row.pass=true;
 }catch(error){row.pass=false;row.error=String(error?.message||error).slice(0,490)}
 try{await page.screenshot({path:output+'/'+path.replace(/[^a-z0-9]/gi,'-')+'-'+width+'.png',fullPage:false});}catch{}
 results.push(row);await page.close();
}
await check('/',390,async(page,x)=>{
 x.hero=await page.locator('#view-home [data-hero-dot]').count();
 x.discoveryLinks=await page.locator('#view-home nav[aria-label="Explore ChaskaBox shopping options"] a').count();
 if(x.hero!==3||x.discoveryLinks<6)throw Error('Home hero/discovery missing');
 if(!await page.locator('#homeShopDiscovery').isVisible())throw Error('Home guide heading absent');
});
await check('/shop/',390,async(page,x)=>{
 const html=await(await page.request.get(base+'/shop/')).text();
 x.sourceHasIntro=/id="categorySeoIntro"[^>]*>Explore the ChaskaBox catalogue/.test(html);
 x.sourceHasNav=/id="shopCategoryRail"[^>]*>[\s\S]*?href="\/category\/biscuits-and-wafers\//.test(html);
 x.sourceHasHelp=html.includes('id="shopHelpPathways"');
 x.categoryLinks=await page.locator('#shopCategoryRail a[href^="/category/"]').count();
 if(!x.sourceHasIntro||!x.sourceHasNav||!x.sourceHasHelp||!x.categoryLinks)throw Error('SSR shop text/nav missing');
 if(await page.locator('#shopGrid a[href^="/product/"]').count()<1)throw Error('Products missing');
});
await check('/category/biscuits-and-wafers/',390,async(page,x)=>{
 const html=await(await page.request.get(base+'/category/biscuits-and-wafers/')).text();
 x.sourceIntro=html.includes('Browse biscuits, wafer packs and tea-time treats');
 x.navSelected=/<a href="\/category\/biscuits-and-wafers\/" class="active" aria-current="page">/.test(html);
 x.hasProductLinks=/href="\/product\/\d+\//.test(html);
 if(!x.sourceIntro||!x.navSelected||!x.hasProductLinks)throw Error('Category SSR intro/current/links missing');
});
await check('/category/snacks-and-nimco/',1280,async(page,x)=>{
 const html=await(await page.request.get(base+'/category/snacks-and-nimco/')).text();
 x.sourceIntro=html.includes('Find salty, spicy and crunchy Pakistani snacks');
 x.selected=/href="\/category\/snacks-and-nimco\/" class="active" aria-current="page"/.test(html);
 if(!x.sourceIntro||!x.selected)throw Error('Nimco SSR intro or selected nav absent');
});
await check('/bundles/',390,async(page,x)=>{
 const html=await(await page.request.get(base+'/bundles/')).text();
 x.sourceIntro=html.includes('Browse Chaska Boxes for gifting');
 x.sourceNav=html.includes('href="/category/snacks-and-nimco/"');
 if(!x.sourceIntro||!x.sourceNav)throw Error('Bundle discovery missing');
});
await check('/category/betel-nuts-and-pan-masala/',390,async(page,x)=>{
 const robots=await page.locator('meta[name="robots"]').getAttribute('content');
 x.robots=robots;
 const links=await page.locator('#shopCategoryRail a[href="/category/betel-nuts-and-pan-masala/"]').count();
 x.emptyCategoryNavLinks=links;
 if(links!==0)throw Error('Empty category advertised in navigation');
 // Empty catalogue route should not be indexable.
 if(!robots?.includes('noindex'))throw Error('Empty category was indexable');
});
await browser.close();
await writeFile(output+'/results.json',JSON.stringify({base,results},null,2));
for(const x of results)console.log(JSON.stringify(x));
if(results.some(x=>!x.pass))process.exitCode=1;
