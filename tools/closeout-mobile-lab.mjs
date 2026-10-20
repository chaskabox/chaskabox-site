// Public, read-only mobile lab comparison. No orders, account writes or messages.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
const candidate=process.env.HERO_PREVIEW_URL,baseSha=process.env.CLOSEOUT_BASE_SHA;
if(!/^https:\/\/[a-z0-9-]+\.chaskabox-site\.pages\.dev$/.test(candidate||'')||! /^[0-9a-f]{40}$/.test(baseSha||''))throw Error('Exact preview and immutable production baseline required');
const hash=s=>createHash('sha256').update(s).digest('hex');
const path='storefront-bundle.css',production='https://chaskabox.online';
const expected={production:hash(execFileSync('git',['show',baseSha+':'+path])),candidate:hash(await readFile(path))};
const guarded=['app.js','photo-manifest.js','admin-agents.js'];
const assetGuards={};
for(const file of guarded)assetGuards[file]={production:hash(execFileSync('git',['show',baseSha+':'+file])),candidate:hash(await readFile(file))};
async function verifySources(){for(const [name,url] of [['production',production],['candidate',candidate]]){
 const r=await fetch(url+'/'+path+'?closeout='+expected[name],{cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!r.ok||hash(Buffer.from(await r.arrayBuffer()))!==expected[name])throw Error(name+' source changed; measurements would compare different revisions');
 for(const file of guarded){const h=assetGuards[file][name],a=await fetch(url+'/'+file+'?closeout='+h,{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!a.ok||hash(Buffer.from(await a.arrayBuffer()))!==h)throw Error(name+' '+file+' source mismatch');}
}}
await verifySources();
const out='test-results/closeout-mobile';await mkdir(out,{recursive:true});const summaries=[];
for(const sample of [1,2])for(const [route,name] of [['/','home'],['/shop/','shop'],['/product/39/','product-39']])for(const [environment,url] of [['production',production],['candidate',candidate]]){
 const file=out+'/'+environment+'-'+name+'-'+sample+'.json';
 execFileSync(process.execPath,['node_modules/lighthouse/cli/index.js',url+route,'--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage --disable-gpu --no-first-run','--only-categories=performance,accessibility,seo','--output=json','--output-path='+file,'--quiet'],{env:{...process.env,CHROME_PATH:chromium.executablePath()},stdio:'inherit',timeout:150000});
 const r=JSON.parse(await readFile(file,'utf8'));if(r.runtimeError)throw Error(r.runtimeError.message);
 const a=r.audits,summary={environment,route,sample,fetchTime:r.fetchTime,source:expected[environment],performance:Math.round(r.categories.performance.score*100),accessibility:Math.round(r.categories.accessibility.score*100),LCP:a['largest-contentful-paint'].numericValue,CLS:a['cumulative-layout-shift'].numericValue,TBT:a['total-blocking-time'].numericValue,blocking:(a['render-blocking-resources']?.details?.items||[]).map(x=>({url:x.url,wastedMs:x.wastedMs}))};
 summaries.push(summary);console.log('CLOSEOUT_LAB '+JSON.stringify(summary));
}
await verifySources();await writeFile(out+'/summary.json',JSON.stringify({baseSha,expected,assetGuards,summaries},null,2));
console.log('Lab measurements are not field INP or guaranteed ranking/performance results. Preview noindex is intentional.');
