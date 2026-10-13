/* Read-only live mobile lab audit. Public pages only; no orders, sign-ins or provider sends. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import {chromium} from 'playwright-core';
const base=process.env.AUDIT_BASE_URL;
if(!base||!/^https:\/\//.test(base))throw Error('A public HTTPS audit base is required');
const expected=createHash('sha256').update(await readFile('app.js')).digest('hex');
let ready=false;
for(let i=0;i<12;i++){
 const r=await fetch(base+'/app.js?release='+expected,{cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(r.ok&&createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex')===expected){ready=true;break;}
 await new Promise(resolve=>setTimeout(resolve,3000));
}
if(!ready)throw Error('The audit URL is not serving the checked application source yet');
const out='test-results/live-mobile';await mkdir(out,{recursive:true});
const browser=await chromeLauncher.launch({chromePath:chromium.executablePath(),chromeFlags:['--headless','--no-sandbox','--disable-dev-shm-usage']});
const summaries=[];
try{
 for(const route of ['/','/shop/','/product/39/']){
  const result=await lighthouse(base+route,{port:browser.port,output:'json',logLevel:'error',onlyCategories:['performance','accessibility','best-practices','seo']});
  const lhr=result.lhr;if(lhr.runtimeError)throw Error(lhr.runtimeError.message);
  const name=route==='/'?'home':route.startsWith('/product/')?'product-39':'shop';
  await writeFile(out+'/'+name+'.json',JSON.stringify(lhr,null,2));
  const summary={route,requestedUrl:lhr.requestedUrl,finalUrl:lhr.finalDisplayedUrl||lhr.finalUrl,fetchTime:lhr.fetchTime,sourceSha256:expected,lighthouseVersion:lhr.lighthouseVersion,mode:'mobile lab; not field INP or ranking proof',scores:Object.fromEntries(Object.entries(lhr.categories).map(([k,v])=>[k,Math.round(v.score*100)])),metrics:Object.fromEntries(['largest-contentful-paint','cumulative-layout-shift','total-blocking-time'].map(k=>[k,lhr.audits[k]?.numericValue]))};
  summaries.push(summary);console.log(JSON.stringify(summary));
 }
}finally{await browser.kill();await writeFile(out+'/summary.json',JSON.stringify(summaries,null,2));}
