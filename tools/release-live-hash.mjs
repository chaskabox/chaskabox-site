/* Read-only provenance check for the exact deployed public app.js. No secrets or writes. */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const source=await readFile('app.js');
const expected=createHash('sha256').update(source).digest('hex');
const urls=['https://chaskabox.online/app.js','https://94ccbbb8.chaskabox-site.pages.dev/app.js'];
for(const url of urls){
 try{
  const r=await fetch(url+'?release='+expected,{cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
  const bytes=Buffer.from(await r.arrayBuffer()),hash=createHash('sha256').update(bytes).digest('hex');
  const equal=bytes.equals(source);
  let firstDiff=-1;
  if(!equal)for(let i=0;i<Math.min(bytes.length,source.length);i++)if(bytes[i]!==source[i]){firstDiff=i;break;}
  console.log(JSON.stringify({url,status:r.status,liveSHA256:hash,expectedSHA256:expected,matching:equal,bytes:bytes.length,expectedBytes:source.length,firstDifferingByte:firstDiff,headers:{cacheControl:r.headers.get('cache-control'),age:r.headers.get('age'),cfCacheStatus:r.headers.get('cf-cache-status'),etag:r.headers.get('etag'),contentEncoding:r.headers.get('content-encoding'),contentType:r.headers.get('content-type')}}));
 }catch(e){console.log(JSON.stringify({url,error:e.message}));}
}
