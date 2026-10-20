// Inspect public Lighthouse artifacts; never reads private data or submits requests.
import {readFileSync} from 'node:fs';
for(const file of process.argv.slice(2)){
 const r=JSON.parse(readFileSync(file,'utf8')),a=r.audits||{};
 const short=u=>{try{const x=new URL(u);return x.origin+x.pathname;}catch{return String(u||'');}};
 const detail=key=>a[key]?.details||null;
 const requests=(a['network-requests']?.details?.items||[]).filter(x=>/chaskabox|supabase/.test(x.url||'')).map(x=>({url:short(x.url),priority:x.priority,transferSize:x.transferSize,resourceSize:x.resourceSize,networkRequestTime:x.networkRequestTime,networkEndTime:x.networkEndTime,protocol:x.protocol,mimeType:x.mimeType}));
 const output={file,url:r.finalDisplayedUrl||r.finalUrl,fetchTime:r.fetchTime,
  metrics:Object.fromEntries(['largest-contentful-paint','first-contentful-paint','cumulative-layout-shift','total-blocking-time'].map(k=>[k,a[k]?.numericValue])),
  lcpBreakdown:detail('lcp-breakdown-insight'),lcpElement:detail('largest-contentful-paint-element'),
  blocking:detail('render-blocking-insight'),lcpDiscovery:detail('lcp-discovery-insight'),
  requests,mainThread:detail('mainthread-work-breakdown'),longTasks:detail('long-tasks')};
 console.log('LCP_CLOSEOUT '+JSON.stringify(output));
}
