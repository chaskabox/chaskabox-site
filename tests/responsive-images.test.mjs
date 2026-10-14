import test from 'node:test';
import assert from 'node:assert/strict';
import {access,readFile} from 'node:fs/promises';
import {imageAttributes} from '../functions/api/_lib/responsive-images.js';
import {IMAGE_VARIANTS} from '../functions/api/_lib/image-variants.js';
test('responsive product previews reference existing assets and preserve an unmapped owner image',async()=>{
 for(const sources of Object.values(IMAGE_VARIANTS)){
  let previous=0;
  for(const p of sources){assert.ok(p.width>previous&&p.width<=640);assert.ok(p.height>0);previous=p.width;await access(new URL('..'+p.src,import.meta.url));}
 }
 assert.match(imageAttributes('https://chaskabox.online/images/p5.webp'),/srcset=.*optimized-p5-320/);
 assert.equal(imageAttributes('https://owner.example.invalid/new-photo.webp'),'src="https://owner.example.invalid/new-photo.webp"');
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');assert.match(app,/data-zoom-src="\$\{esc\(assetUrl\(p.img\)\)\}/);
});
