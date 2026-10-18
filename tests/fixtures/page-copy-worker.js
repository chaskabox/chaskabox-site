import {applyPublishedCopy} from '../../functions/api/_lib/page-copy.js';
export default {async fetch(request){
 const html='<!doctype html><html><head><title>Original title</title><meta name="description" content="Original description"><meta property="og:title" content="Original title"><meta property="og:description" content="Original description"><link rel="canonical" href="https://chaskabox.online/about/"><script type="application/ld+json">{"@type":"Product","offers":{"price":499}}</script></head><body><h1 data-cb-copy="t_deadbeef">Original heading</h1><input data-cb-placeholder="t_cafebabe" placeholder="Original placeholder"><p class="price">Rs. 499</p></body></html>';
 const content={fields:{t_deadbeef:'Reviewed copy <script>alert(1)</script>',t_cafebabe:'Find your snacks'},seo_title:'Owner SEO title',seo_description:'Owner SEO description'};
 return applyPublishedCopy({request,env:{}},new Response(html,{headers:{'Content-Type':'text/html','ETag':'original','Content-Length':String(html.length)}}),content);
}};
