import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet} from '../functions/api/product-sitemap.js';
const context={env:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic'}};
test('product sitemap keeps public unavailable products, omits empty brands and avoids unverified photos',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async url=>new URL(url).pathname.endsWith('/brands')?Response.json([{name:'Listed',slug:'listed'},{name:'Empty',slug:'empty'}]):Response.json([{id:39,brand:'Listed',pack:'Fixture pack',updated_at:'2026-10-14T10:00:00Z',image_url:'images/p39.webp'},{id:269,brand:null,image_url:null},{id:186,brand:'Listed',pack:'Pack of 12',image_url:'https://jtvswuvnasqqzrjysgfd.supabase.co/storage/v1/object/public/product-media/products/2026/10/7ad390ca-1b87-4ef2-8086-34576726c0d7.png'}]);
 try{const r=await onRequestGet(context),xml=await r.text();assert.equal(r.status,200);assert.match(xml,/\/product\/269\//);assert.match(xml,/\/brand\/listed\//);assert.doesNotMatch(xml,/\/brand\/empty\//);assert.match(xml,/<lastmod>2026-10-14<\/lastmod>/);assert.equal((xml.match(/<image:image>/g)||[]).length,1);assert.equal(r.headers.get('Cache-Control'),'public,max-age=300');}finally{globalThis.fetch=original;}
});
test('sitemap traverses public catalogue pages instead of stopping at the API row cap',async()=>{
 const original=globalThis.fetch,offsets=[];
 globalThis.fetch=async url=>{const u=new URL(url);if(u.pathname.endsWith('/brands'))return Response.json([]);const n=Number(u.searchParams.get('offset'));offsets.push(n);return Response.json(Array.from({length:n===0?500:1},(_,i)=>({id:n+i+1,brand:'Listed'})));};
 try{const r=await onRequestGet(context),xml=await r.text();assert.equal(r.status,200);assert.deepEqual(offsets,[0,500]);assert.equal((xml.match(/\/product\//g)||[]).length,501);assert.match(xml,/\/product\/501\//);}finally{globalThis.fetch=original;}
});
test('catalogue failure returns an unavailable sitemap without caching an empty success',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response('Outage',{status:503});
 try{const r=await onRequestGet(context);assert.equal(r.status,503);assert.equal(r.headers.get('Cache-Control'),'no-store');}finally{globalThis.fetch=original;}
});
