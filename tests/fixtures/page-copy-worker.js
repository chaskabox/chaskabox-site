import {applyPublishedCopy} from '../../functions/api/_lib/page-copy.js';
import {onRequest as middleware} from '../../functions/_middleware.js';
let releaseCopy,copyReady=false;
export default {async fetch(request){
 if(new URL(request.url).pathname==='/release'){releaseCopy?.();return new Response('released');}
 if(new URL(request.url).pathname==='/copy-state')return Response.json({ready:copyReady});
 if(new URL(request.url).pathname==='/head-hints')return middleware({request:new Request('https://chaskabox.online/'),env:{},next:async()=>new Response('<html><head></head><body>Public home</body></html>',{headers:{'Content-Type':'text/html'}})});
 const html='<!doctype html><html><head><link rel="stylesheet" href="/critical.css"><title>Original title</title><meta name="description" content="Original description"><meta property="og:title" content="Original title"><meta property="og:description" content="Original description"><link rel="canonical" href="https://chaskabox.online/about/"><script type="application/ld+json">{"@type":"Product","offers":{"price":499}}</script></head><body><h1 data-cb-copy="t_deadbeef">Original heading</h1><input data-cb-placeholder="t_cafebabe" placeholder="Original placeholder"><p class="price">Rs. 499</p></body></html>';
 const content={fields:{t_deadbeef:'Reviewed copy <script>alert(1)</script>',t_cafebabe:'Find your snacks'},seo_title:'Owner SEO title',seo_description:'Owner SEO description'};
 const copy=new URL(request.url).searchParams.has('delayed')?new Promise(resolve=>{copyReady=false;const done=()=>{copyReady=true;resolve(content);};const timer=setTimeout(done,5000);releaseCopy=()=>{clearTimeout(timer);done();};}):content;
 return applyPublishedCopy({request,env:{}},new Response(html,{headers:{'Content-Type':'text/html','ETag':'original','Content-Length':String(html.length)}}),copy);
}};
