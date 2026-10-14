import { readFileSync } from 'node:fs';
const names=process.argv.slice(2);
for(const name of names){
  let r;try{r=JSON.parse(readFileSync(name,'utf8'));}catch(e){console.log(JSON.stringify({file:name,error:String(e)}));continue;}
  const a=r.audits||{};
  const shifts=(a['layout-shifts']?.details?.items||[]).map(x=>({score:x.score??x.cumulativeShiftScore,when:x.startTime??x.time,nodes:(x.affectedNodes||x.nodes||[]).slice(0,5).map(n=>({selector:n.node?.selector||n.selector,snippet:n.node?.snippet||n.snippet}))}));
  const lcp=(a['largest-contentful-paint-element']?.details?.items||[]).slice(0,4).map(x=>({node:x.node?.selector,snippet:x.node?.snippet,bytes:x.url?undefined:x.totalBytes,url:x.url}));
  const blocking=(a['render-blocking-resources']?.details?.items||[]).slice(0,10).map(x=>({url:x.url,wastedMs:x.wastedMs}));
  const requests=(a['network-requests']?.details?.items||[]).filter(x=>x.transferSize>40000).sort((x,y)=>y.transferSize-x.transferSize).slice(0,15).map(x=>({url:String(x.url).slice(0,170),size:x.transferSize,start:x.startTime,end:x.endTime,mime:x.mimeType}));
  const metrics={performance:Math.round((r.categories?.performance?.score??0)*100),seo:Math.round((r.categories?.seo?.score??0)*100),FCP:a['first-contentful-paint']?.numericValue,LCP:a['largest-contentful-paint']?.numericValue,CLS:a['cumulative-layout-shift']?.numericValue,TBT:a['total-blocking-time']?.numericValue,SI:a['speed-index']?.numericValue};
  const mainThread=(a['mainthread-work-breakdown']?.details?.items||[]).map(x=>({group:x.groupLabel||x.group,duration:x.duration}));
  const scripts=(a['bootup-time']?.details?.items||[]).sort((x,y)=>(y.total||0)-(x.total||0)).slice(0,10).map(x=>({url:x.url,total:x.total,scripting:x.scripting,parseCompile:x.scriptParseCompile}));
  const longTasks=(a['long-tasks']?.details?.items||[]).sort((x,y)=>(y.duration||0)-(x.duration||0)).slice(0,10).map(x=>({url:x.url,startTime:x.startTime,duration:x.duration}));
  console.log('PERF_DIAGNOSTIC',JSON.stringify({file:name,url:r.finalDisplayedUrl,fetchTime:r.fetchTime,lighthouseVersion:r.lighthouseVersion,metrics,lcp,shifts,blocking,requests,mainThread,scripts,longTasks}));
}
