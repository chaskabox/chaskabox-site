/* Public GET-only route inventory and same-run mobile lab comparison. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import {chromium} from 'playwright-core';
const production='https://chaskabox.online',preview=process.env.AUDIT_PREVIEW_BASE;
if(!/^https:\/\/[a-z0-9-]+\.chaskabox-site\.pages\.dev$/.test(preview||''))throw Error('Expected the owned Pages preview');
const out='test-results/storefront-review';await mkdir(out,{recursive:true});
const expected=createHash('sha256').update(await readFile('app.js')).digest('hex');
async function get(url){return fetch(url,{signal:AbortSignal.timeout(30000),headers:{Accept:'text/html,application/json'}});}
let ready=false;for(let i=0;i<20;i++){
 try{const r=await get(preview+'/app.js?review='+expected);if(r.ok&&createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex')===expected){ready=true;break;}}catch{}
 await new Promise(r=>setTimeout(r,3000));
}if(!ready)throw Error('Preview must serve the checked source before audit');
const routes=['/','/shop/','/brands/','/bundles/','/cart/','/wishlist/','/checkout.html','/account/','/track-order.html','/about/','/contact/','/faq/','/guides/','/guides/choosing-a-snack-box/','/guides/bachpan-snacks-pakistan/','/guides/how-chaskabox-orders-work/','/snack-boxes/','/snack-boxes/bachpan/','/snack-boxes/movie-night/','/snack-boxes/office/','/shipping-policy/','/refund-policy/','/privacy-policy/','/terms/'];
const products=await (await get(production+'/api/products')).json();
const {brands}=await (await get(production+'/api/brands')).json();
const manifest=await (await get(production+'/api/storefront-config')).json();
if(!Array.isArray(products)||!Array.isArray(brands)||!Array.isArray(manifest.categories))throw Error('Public catalogue unavailable');
routes.push(...products.map(p=>'/product/'+Number(p.id)+'/'),...brands.filter(b=>b.productCount>0).map(b=>'/brand/'+b.slug+'/'),...manifest.categories.map(c=>'/category/'+c.slug+'/'));
const unique=[...new Set(routes)],inventory=[];let cursor=0;
await Promise.all(Array.from({length:3},async()=>{
 while(cursor<unique.length){const route=unique[cursor++],start=Date.now();try{
  const response=await get(preview+route),html=await response.text();
  const item={route,status:response.status,seconds:(Date.now()-start)/1000,bytes:Buffer.byteLength(html),title:html.match(/<title>(.*?)<\/title>/s)?.[1],finalUrl:response.url};inventory.push(item);
 }catch(error){inventory.push({route,error:String(error.message)});}}
}));
const hidden=await get(preview+'/product/269/');
const inventorySummary={sourceSha256:expected,base:preview,publicProducts:products.length,brands:brands.filter(b=>b.productCount>0).length,routes:inventory.length,failures:inventory.filter(r=>r.error||r.status!==200),hidden269Status:hidden.status};
await writeFile(out+'/routes.json',JSON.stringify({summary:inventorySummary,inventory},null,2));console.log('REVIEW_ROUTES',JSON.stringify(inventorySummary));
const browser=await chromeLauncher.launch({chromePath:chromium.executablePath(),chromeFlags:['--headless','--no-sandbox','--disable-dev-shm-usage']});
const summaries=[];
try{
 for(const route of ['/','/shop/','/brands/','/brand/mayfair/','/product/39/','/contact/'])for(const [environment,base] of [['production',production],['preview',preview]]){
  const result=await lighthouse(base+route,{port:browser.port,output:'json',logLevel:'error',onlyCategories:['performance','accessibility','best-practices','seo']});
  const r=result.lhr;if(r.runtimeError)throw Error(r.runtimeError.message);
  const name=route==='/'?'home':route.replace(/[^a-z0-9]+/g,'-');
  await writeFile(out+'/'+environment+'-'+name+'.json',JSON.stringify(r));
  const item={environment,route,finalUrl:r.finalDisplayedUrl||r.finalUrl,fetchTime:r.fetchTime,lighthouseVersion:r.lighthouseVersion,mode:'single mobile lab run; not field INP',scores:Object.fromEntries(Object.entries(r.categories).map(([k,v])=>[k,Math.round(v.score*100)])),LCP:Math.round(r.audits['largest-contentful-paint'].numericValue),CLS:r.audits['cumulative-layout-shift'].numericValue,TBT:r.audits['total-blocking-time'].numericValue,bytes:r.audits['total-byte-weight']?.numericValue,largeAssets:(r.audits['network-requests']?.details?.items||[]).filter(i=>i.transferSize>100000).map(i=>({url:i.url,bytes:i.transferSize})).sort((a,b)=>b.bytes-a.bytes).slice(0,5)};
  summaries.push(item);console.log('REVIEW_MOBILE_LAB',JSON.stringify(item));
 }
}finally{await browser.kill();await writeFile(out+'/summary.json',JSON.stringify({inventory:inventorySummary,lab:summaries},null,2));}
if(inventorySummary.failures.length||hidden.status!==404)throw Error('Public route inventory has unresolved errors');
