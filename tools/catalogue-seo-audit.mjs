// Read-only public production audit. Writes local evidence; never submits orders or signs in.
import {mkdir,writeFile} from 'node:fs/promises';
const base='https://chaskabox.online';
const out='seo-audit';await mkdir(out,{recursive:true});
const result={checkedAt:new Date().toISOString(),base,mode:'Current public production; not pending PR source or Google indexing',publicCount:0,products:[],sitemap:[],negativeRoutes:[],errors:[],warnings:[]};
async function read(path){const r=await fetch(base+path,{redirect:'follow',signal:AbortSignal.timeout(20000)});if(new URL(r.url).origin!==base)throw Error('Unexpected off-site redirect');return {status:r.status,url:r.url,text:await r.text()};}
const decode=s=>String(s||'').replace(/&(?:amp|lt|gt|quot|#39);/g,m=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[m]));
async function mapLimit(items,fn){
 let next=0;const rows=Array(items.length);
 await Promise.all(Array.from({length:Math.min(4,items.length)},async()=>{
  while(next<items.length){
   const i=next++;
   try{rows[i]=await fn(items[i]);}catch(e){rows[i]={target:items[i]?.id??items[i],error:e.message};}
  }
 }));return rows;
}
try{
 const catalogue=await read('/api/products?fresh=1');if(catalogue.status!==200)throw Error('Public catalogue unavailable');
 const products=JSON.parse(catalogue.text);if(!Array.isArray(products))throw Error('Invalid public catalogue');result.publicCount=products.length;
 const sm=await read('/api/product-sitemap');if(sm.status!==200)throw Error('Product sitemap unavailable');
 const staticSm=await read('/sitemap.xml');if(staticSm.status!==200)throw Error('Static sitemap unavailable');
 const urls=[...new Set([...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g),...staticSm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>decode(m[1])))];
 if(urls.some(u=>new URL(u).origin!==base))throw Error('Unexpected off-site sitemap URL');
 const inSitemap=new Set(urls);
 result.products=await mapLimit(products,async p=>{
  const expected=base+'/product/'+p.id+'/',page=await read('/product/'+p.id+'/'),issues=[],notes=[];
  if(page.status!==200)issues.push('HTTP '+page.status);
  const canonical=page.text.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1];
  if(canonical!==expected)issues.push('Canonical mismatch');
  if(!inSitemap.has(expected))issues.push('Missing from product sitemap');
  const schemas=[...page.text.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m=>{try{return JSON.parse(m[1]);}catch{return null;}});
  const typed=schemas.filter(s=>s?.['@type']==='Product');if(typed.length!==1)issues.push('Product schema count '+typed.length);
  const schema=typed[0];if(schema&&Number(schema.offers?.price)!==Number(p.price))issues.push('Schema price mismatch');
  if(p.stockState==='unavailable'&&schema?.offers?.availability!=='https://schema.org/OutOfStock')issues.push('Unavailable stock schema mismatch');
  if(/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(page.text))issues.push('Public product noindex');
  if(!p.img)notes.push('Original product photo required');
  return {id:p.id,status:page.status,canonical,price:p.price,issues,notes};
 });
 result.sitemap=await mapLimit(urls.filter(u=>!new URL(u).pathname.startsWith('/product/')),async url=>{const p=await read(new URL(url).pathname);return {url,status:p.status};});
 result.negativeRoutes=await mapLimit(['/product/179/','/product/999999999/'],async path=>{const p=await read(path);return {path,status:p.status};});
 for(const p of result.products){if(p.error)result.errors.push({target:p.target,error:p.error});for(const issue of p.issues||[])result.errors.push({id:p.id,issue});for(const note of p.notes||[])result.warnings.push({id:p.id,note});}
 for(const u of result.sitemap)if(u.error||u.status!==200)result.errors.push({url:u.url||u.target,issue:u.error||'Sitemap URL HTTP '+u.status});
 for(const u of result.negativeRoutes)if(u.error||u.status!==404)result.errors.push({path:u.path||u.target,issue:u.error||'Expected 404'});
}catch(e){result.errors.push({issue:e.message});process.exitCode=1;}
await writeFile(out+'/catalogue-validation.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({checkedAt:result.checkedAt,mode:result.mode,publicCount:result.publicCount,productsChecked:result.products.length,sitemapRoutesChecked:result.sitemap.length,negativeRoutes:result.negativeRoutes,errors:result.errors,warnings:result.warnings}));
// Findings are evidence about the current release, which may differ from pending PR source.
