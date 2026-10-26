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
const inventories=[],inventory=[];
for(const [environment,base] of [['production',production],['preview',preview]]){
 const products=await (await get(base+'/api/products')).json();
 const {brands}=await (await get(base+'/api/brands')).json();
 const manifest=await (await get(base+'/api/storefront-config')).json();
 if(!Array.isArray(products)||!Array.isArray(brands)||!Array.isArray(manifest.categories))throw Error('Public catalogue unavailable');
 const unique=[...new Set([...routes,...products.map(p=>'/product/'+Number(p.id)+'/'),...brands.filter(b=>b.productCount>0).map(b=>'/brand/'+b.slug+'/'),...manifest.categories.map(c=>'/category/'+c.slug+'/')])];
 let cursor=0;const items=[];
 await Promise.all(Array.from({length:3},async()=>{
  while(cursor<unique.length){const route=unique[cursor++],start=Date.now();try{
   const response=await get(base+route),html=await response.text();
   items.push({route,status:response.status,seconds:(Date.now()-start)/1000,bytes:Buffer.byteLength(html),title:html.match(/<title>(.*?)<\/title>/s)?.[1],finalUrl:response.url});
  }catch(error){items.push({route,error:String(error.message)});}}
 }));
 const hidden=await get(base+'/product/269/');
 const item={environment,base,publicProducts:products.length,brands:brands.filter(b=>b.productCount>0).length,routes:items.length,failures:items.filter(r=>r.error||r.status!==200),hidden269Status:hidden.status};
 inventories.push(item);inventory.push({environment,items});console.log('REVIEW_ROUTES',JSON.stringify(item));
}
const inventorySummary={sourceSha256:expected,environments:inventories,failures:inventories.flatMap(i=>i.failures.map(r=>({environment:i.environment,...r})))};
await writeFile(out+'/routes.json',JSON.stringify({summary:inventorySummary,inventory},null,2));
// Both staging versions use the same isolated catalogue. Production has its
// own catalogue; do not attribute cross-environment differences to this patch.
const stagingBefore='https://6f04fe8f.chaskabox-site.pages.dev';
const beforeRows=await (await get(stagingBefore+'/api/products')).json(),afterRows=await (await get(preview+'/api/products')).json();
const fingerprint=rows=>JSON.stringify(rows.map(p=>[p.id,p.name,p.price,p.img]).sort((a,b)=>a[0]-b[0]));
const sameStagingCatalogue=fingerprint(beforeRows)===fingerprint(afterRows);
console.log('REVIEW_COMPARABILITY',JSON.stringify({sameStagingCatalogue,productionIsSeparate:true}));
const browser=await chromeLauncher.launch({chromePath:chromium.executablePath(),chromeFlags:['--headless','--no-sandbox','--disable-dev-shm-usage']});
const summaries=[];
try{
 for(const route of ['/','/shop/','/brands/','/brand/mayfair/','/product/39/','/contact/'])for(const [environment,base] of [['production',production],['staging-before',stagingBefore],['staging-after',preview]]){
  const result=await lighthouse(base+route,{port:browser.port,output:'json',logLevel:'error',onlyCategories:['performance','accessibility','best-practices','seo']});
  const r=result.lhr;if(r.runtimeError)throw Error(r.runtimeError.message);
  const name=route==='/'?'home':route.replace(/[^a-z0-9]+/g,'-');
  await writeFile(out+'/'+environment+'-'+name+'.json',JSON.stringify(r));
  const item={environment,sameStagingCatalogue,route,finalUrl:r.finalDisplayedUrl||r.finalUrl,fetchTime:r.fetchTime,lighthouseVersion:r.lighthouseVersion,mode:'single mobile lab run; not field INP',scores:Object.fromEntries(Object.entries(r.categories).map(([k,v])=>[k,Math.round(v.score*100)])),LCP:Math.round(r.audits['largest-contentful-paint'].numericValue),CLS:r.audits['cumulative-layout-shift'].numericValue,TBT:r.audits['total-blocking-time'].numericValue,bytes:r.audits['total-byte-weight']?.numericValue,largeAssets:(r.audits['network-requests']?.details?.items||[]).filter(i=>i.transferSize>100000).map(i=>({url:i.url,bytes:i.transferSize})).sort((a,b)=>b.bytes-a.bytes).slice(0,5)};
  summaries.push(item);console.log('REVIEW_MOBILE_LAB',JSON.stringify(item));
 }
}finally{await browser.kill();await writeFile(out+'/summary.json',JSON.stringify({inventory:inventorySummary,lab:summaries},null,2));}
if(inventorySummary.failures.length||inventories.some(i=>i.hidden269Status!==404))throw Error('Public route inventory has unresolved errors');
