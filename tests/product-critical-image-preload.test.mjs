import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {imageAttributes,imagePreloadAttributes} from '../functions/api/_lib/responsive-images.js';
const src=readFileSync(new URL('../functions/product/[[slug]].js',import.meta.url),'utf8');
const sizes='(max-width:700px) calc(100vw - 32px), 520px';
test('responsive product preload points at exactly the same browser-selected image as the PDP',()=>{
 for(const img of ['/images/p10.webp','/images/p39.webp','https://images.example.com/photo.jpg','/images/optimized-uploaded-p39-94eb65dba4-320.webp']){
  const attrs=imageAttributes(img,sizes);
  const pre=imagePreloadAttributes(img,sizes);
  assert.equal(pre,attrs.replace(/^src=/,'href=').replace(/ srcset=/g,' imagesrcset=').replace(/ sizes=/,' imagesizes='),img);
  assert.ok(pre.startsWith('href='));
  assert.doesNotMatch(pre,/(^| )srcset=|(^| )sizes=/);
 }
});
test('server-side product LCP preload uses existing photo, not a fallback, and keeps price/order code untouched',()=>{
 assert.match(src,/const criticalPhotoPreload=photo\?/);
 assert.match(src,/imagePreloadAttributes\(photo,"\(max-width:700px\) calc\(100vw - 32px\), 520px"\)/);
 assert.match(src,/\$\{criticalPhotoPreload\}<title>/);
 assert.match(src,/\$\{photo\?<img /);
 assert.match(src,/fetchpriority="high"/);
 assert.match(src,/photoUnderReview\(p\)\?'Photo under review'/);
});
