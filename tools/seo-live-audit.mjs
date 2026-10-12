#!/usr/bin/env node
// Public, unauthenticated production/preview SEO baseline; never mutates the website.
import fs from 'node:fs';
const preview=process.env.PREVIEW_BASE_URL||'https://seo-organic-search-foundatio.chaskabox-site.pages.dev';
const production='https://chaskabox.online';
const paths=['/','/shop/','/product/5/','/product/27/','/product/999999999/','/robots.txt','/api/product-sitemap'];
const escaped=s=>String(s||'').replace(/[\n\r]/g,' ').slice(0,190);
const errMessage=e=>String(e?.message||e).slice(0,180);
const results={checkedAt:new Date().toISOString(),production,preview,checks:[],pageSpeed:[]};
function readMeta(html,re){return html.match(re)?.[1]||null;}
function schemas(html){
 const out=[];
 const re=/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
 for(const match of html.matchAll(re)){try{out.push(JSON.parse(match[1]));}catch{out.push({invalidJson:true});}}
 return out;
}
async function fetchUrl(url, timeout=25000){
 const c=new AbortController();const t=setTimeout(()=>c.abort(),timeout);
 try{const r=await fetch(url,{redirect:'follow',signal:c.signal,headers:{'User-Agent':'ChaskaBoxSEOAudit/1.0'}});const body=await r.text();return {status:r.status,finalUrl:r.url,contentType:r.headers.get('content-type')||'',body};}
 finally{clearTimeout(t);}
}
for(const [environment,baseUrl] of [['production',production],['preview',preview]]){
 for(const path of paths){
  const url=baseUrl+path,entry={environment,url};
  try {
   const x=await fetchUrl(url);entry.status=x.status;entry.finalUrl=x.finalUrl;entry.contentType=x.contentType;
   if(x.contentType.includes('html')){
    entry.title=readMeta(x.body,/<title[^>]*>([\s\S]*?)<\/title>/i);
    entry.canonical=readMeta(x.body,/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i);
    entry.robots=readMeta(x.body,/<meta\b[^>]*name=["']robots["'][^>]*content=["']([^"']+)/i);
    entry.h1Count=(x.body.match(/<h1(?:\s|>)/gi)||[]).length;
    const all=schemas(x.body);entry.productSchemaCount=all.filter(y=>y['@type']==='Product').length;
    entry.breadcrumbSchemaCount=all.filter(y=>y['@type']==='BreadcrumbList').length;
    entry.invalidSchemaCount=all.filter(y=>y.invalidJson).length;
    entry.productPrice=all.find(y=>y['@type']==='Product')?.offers?.price??null;
    entry.hasVisibleProductName=/class=["']pd-info["'][\s\S]*?<h1>/i.test(x.body);
   }else if(path.endsWith('product-sitemap')){entry.productUrls=(x.body.match(/<loc>[^<]*\/product\//g)||[]).length;entry.hasXmlUrlset=x.body.includes('<urlset');}
   else if(path.endsWith('robots.txt')){entry.hasSitemap=x.body.includes('Sitemap:');}
  }catch(e){entry.error=errMessage(e);}
  results.checks.push(entry);
  console.log('LIVE',environment,path,JSON.stringify(entry));
 }
}
if(process.env.CHECK_PAGESPEED==='1'){
 for(const url of [production+'/',production+'/product/5/']){
  for(const strategy of ['mobile','desktop']){
   const result={url,strategy};
   try{
    const psi=new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    psi.searchParams.set('url',url);psi.searchParams.set('strategy',strategy.toUpperCase());psi.searchParams.append('category','PERFORMANCE');
    const x=await fetchUrl(psi.toString(),75000),data=JSON.parse(x.body);
    result.status=x.status;
    if(x.status!==200){result.error=escaped(data.error?.message||x.body); }
    else{
     result.lighthouseScore=Math.round(100*(data.lighthouseResult?.categories?.performance?.score??0));
     const metrics=data.loadingExperience?.metrics||data.originLoadingExperience?.metrics||{};
     result.fieldScope=data.loadingExperience?.metrics?'url':data.originLoadingExperience?.metrics?'origin':'unavailable';
     result.field={
      LCP_ms:metrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile??null,
      INP_ms:metrics.INTERACTION_TO_NEXT_PAINT?.percentile??null,
      CLS:metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile!=null?metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile/100:null,
     };
     result.lab={
       LCP_ms:data.lighthouseResult?.audits?.['largest-contentful-paint']?.numericValue??null,
       CLS:data.lighthouseResult?.audits?.['cumulative-layout-shift']?.numericValue??null,
       TBT_ms:data.lighthouseResult?.audits?.['total-blocking-time']?.numericValue??null
     };
    }
   }catch(e){result.error=errMessage(e);}
   results.pageSpeed.push(result);console.log('PAGESPEED',JSON.stringify(result));
  }
 }
}
fs.mkdirSync('seo-audit',{recursive:true});
fs.writeFileSync('seo-audit/live-validation.json',JSON.stringify(results,null,2)+'\n');
console.log('Wrote seo-audit/live-validation.json');
