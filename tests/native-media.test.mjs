// Offline Cloudflare Images implementation; no --remote session or account charges.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
export function mediaRuntime(){
 return new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',workers:[{
 modules:[{type:'ESModule',path:path.resolve('workers/media-transform.js')},{type:'ESModule',path:path.resolve('functions/api/_lib/media-bytes.js')}],
 modulesRoot:path.resolve('.'),compatibilityDate:'2026-10-11',images:{binding:'IMAGES'},bindings:{MEDIA_TRANSFORM_ENABLED:'true'}
 }]}));
}
test('offline native Images binding decodes real catalogue pixels and rejects a corrupt magic-only PNG',async()=>{
 const mf=mediaRuntime();
 try{
  const source=await readFile(new URL('../images/p27.webp',import.meta.url));
  const result=await mf.dispatchFetch('http://media.internal/normalize',{method:'POST',headers:{'Content-Type':'image/webp'},body:source});
  assert.equal(result.status,200,await result.clone().text());
  assert.equal(result.headers.get('Content-Type'),'image/webp');
  assert.ok(Number(result.headers.get('X-Image-Width'))<=1024&&Number(result.headers.get('X-Image-Height'))<=1024);
  const bytes=new Uint8Array(await result.arrayBuffer());assert.equal(String.fromCharCode(...bytes.slice(8,12)),'WEBP');assert.ok(bytes.length>20);
  const bad=await mf.dispatchFetch('http://media.internal/normalize',{method:'POST',headers:{'Content-Type':'image/png'},body:new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])});
  assert.equal(bad.status,415);
 }finally{await mf.dispose();}
});
test('QR normalization keeps original dimensions and emits lossless PNG',async()=>{
 const mf=mediaRuntime();try{
  const source=await readFile(new URL('../images/jazzcash-qr.webp',import.meta.url));
  const response=await mf.dispatchFetch('http://media.internal/normalize-qr',{method:'POST',headers:{'Content-Type':'image/webp'},body:source});
  assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/png');
  assert.equal(response.headers.get('X-Image-Width'),'500');assert.equal(response.headers.get('X-Image-Height'),'500');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer()).slice(0,8)],[137,80,78,71,13,10,26,10]);
 }finally{await mf.dispose();}
});
