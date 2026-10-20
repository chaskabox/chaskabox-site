import test from 'node:test';
import assert from 'node:assert/strict';
import {access,readFile} from 'node:fs/promises';
import {imageAttributes} from '../functions/api/_lib/responsive-images.js';
import {IMAGE_VARIANTS} from '../functions/api/_lib/image-variants.js';
import {createHash} from 'node:crypto';
import {cataloguePhoto} from '../functions/api/_lib/catalogue-photos.js';
test('responsive product previews reference existing assets and preserve an unmapped owner image',async()=>{
 for(const sources of Object.values(IMAGE_VARIANTS)){
  let previous=0;
  for(const p of sources){assert.ok(p.width>previous&&p.width<=640);assert.ok(p.height>0);previous=p.width;await access(new URL('..'+p.src,import.meta.url));}
 }
 assert.match(imageAttributes('https://chaskabox.online/images/p5.webp'),/srcset=.*optimized-p5-320/);
 assert.equal(imageAttributes('https://owner.example.invalid/new-photo.webp'),'src="https://owner.example.invalid/new-photo.webp"');
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');assert.match(app,/data-zoom-src="\$\{esc\(assetUrl\(p.img\)\)\}/);
});
test('current first-card uploads use source-matched derivatives without replacing later owner photos',async()=>{
 const rows=JSON.parse(await readFile(new URL('../docs/PRODUCT_IMAGE_VARIANTS_20261020.json',import.meta.url),'utf8'));
 for(const row of rows){
  assert.equal(cataloguePhoto({id:row.id,image_url:row.source}),row.localOriginal);
  const original=await readFile(new URL('../'+row.localOriginal,import.meta.url));
  assert.equal(createHash('sha256').update(original).digest('hex'),row.sha256);
  assert.ok(row.variants[0].bytes<row.originalBytes*.3);
  const attrs=imageAttributes(cataloguePhoto({id:row.id,image_url:row.source}));
  assert.match(attrs,/srcset=/);assert.ok(attrs.includes(row.variants[0].src));
  const later=row.source.replace(/[^/]+$/, 'later-owner-upload.webp');
  assert.equal(cataloguePhoto({id:row.id,image_url:later}),later);
 }
});
